use std::collections::VecDeque;
use std::io::{self, IsTerminal, Write};
use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};
use std::sync::OnceLock;
use std::time::{Duration, Instant};

use anyhow::{Context, Result};
use crossterm::cursor::{Hide, MoveTo, MoveToColumn, Show};
use crossterm::event::{
    self, DisableMouseCapture, EnableMouseCapture, Event, KeyCode, KeyEvent, KeyEventKind,
    KeyModifiers, MouseButton, MouseEvent, MouseEventKind,
};
use crossterm::terminal::{self, Clear, ClearType, EnterAlternateScreen, LeaveAlternateScreen};
use crossterm::{execute, queue};

use crate::types::TerminationSignal;

const MAX_RETAINED_LINES: usize = 10_000;
const INPUT_POLL_INTERVAL: Duration = Duration::from_millis(50);
static TERMINAL_MONITOR_ACTIVE: AtomicBool = AtomicBool::new(false);
static TERMINATION_SIGNAL: AtomicI32 = AtomicI32::new(0);
static SIGNAL_HANDLER: OnceLock<std::result::Result<(), String>> = OnceLock::new();

pub fn restore_terminal_before_exit() {
    if !TERMINAL_MONITOR_ACTIVE.swap(false, Ordering::AcqRel) {
        return;
    }
    let _ = execute!(
        io::stdout(),
        LeaveAlternateScreen,
        DisableMouseCapture,
        Show,
        MoveToColumn(0),
        Clear(ClearType::CurrentLine),
        crossterm::style::Print("\r\n")
    );
    let _ = terminal::disable_raw_mode();
}

pub enum MonitorAction {
    Continue,
    Terminate(TerminationSignal),
}

pub struct LogMonitorState {
    title: String,
    lines: VecDeque<String>,
    total_lines: usize,
    expanded: bool,
    completion: Option<Completion>,
    scroll_from_bottom: usize,
}

#[derive(Clone, Copy)]
enum Completion {
    Completed,
    Failed(i32),
    Interrupted,
}

impl LogMonitorState {
    pub fn new(title: &str) -> Self {
        Self {
            title: title.to_string(),
            lines: VecDeque::new(),
            total_lines: 0,
            expanded: false,
            completion: None,
            scroll_from_bottom: 0,
        }
    }

    pub fn push_line(&mut self, line: impl Into<String>) {
        let was_full = self.lines.len() == MAX_RETAINED_LINES;
        if was_full {
            self.lines.pop_front();
        }
        self.lines.push_back(line.into());
        self.total_lines += 1;
        if self.scroll_from_bottom > 0 {
            self.scroll_from_bottom = self
                .scroll_from_bottom
                .saturating_add(1)
                .min(self.lines.len().saturating_sub(1));
        }
    }

    pub fn toggle(&mut self) {
        self.expanded = !self.expanded;
        if self.expanded {
            self.scroll_from_bottom = 0;
        }
    }

    pub fn collapse(&mut self) {
        self.expanded = false;
    }

    pub fn complete(&mut self, exit_code: i32, termination: Option<TerminationSignal>) {
        self.expanded = false;
        self.completion = Some(if termination.is_some() {
            Completion::Interrupted
        } else if exit_code == 0 {
            Completion::Completed
        } else {
            Completion::Failed(exit_code)
        });
    }

    pub fn scroll_up(&mut self, lines: usize) {
        self.scroll_from_bottom = self
            .scroll_from_bottom
            .saturating_add(lines)
            .min(self.lines.len().saturating_sub(1));
    }

    pub fn scroll_down(&mut self, lines: usize) {
        self.scroll_from_bottom = self.scroll_from_bottom.saturating_sub(lines);
    }

    pub fn scroll_to_bottom(&mut self) {
        self.scroll_from_bottom = 0;
    }

    pub fn is_expanded(&self) -> bool {
        self.expanded
    }

    pub fn render(&self, width: u16, height: u16, elapsed: Duration) -> String {
        let header = self.render_header(elapsed);
        if !self.expanded {
            return truncate(&header, usize::from(width));
        }

        let body_height = usize::from(height.saturating_sub(2));
        let end = self
            .lines
            .len()
            .saturating_sub(self.scroll_from_bottom.min(self.lines.len()));
        let start = end.saturating_sub(body_height);
        let width = usize::from(width);
        let mut rendered = Vec::with_capacity(body_height.saturating_add(2));
        rendered.push(truncate(&header, width));
        rendered.push("─".repeat(width));
        rendered.extend(
            self.lines
                .range(start..end)
                .map(|line| truncate(line, width)),
        );
        rendered.join("\r\n")
    }

    fn render_header(&self, elapsed: Duration) -> String {
        if let Some(completion) = self.completion {
            let (icon, status) = match completion {
                Completion::Completed => ("✔", "Completed".to_string()),
                Completion::Failed(exit_code) => ("✖", format!("Exited with code {exit_code}")),
                Completion::Interrupted => ("■", "Interrupted".to_string()),
            };
            return format!(
                "  {icon} {}  {status} after {}  {} lines",
                self.title,
                format_duration(elapsed),
                self.total_lines
            );
        }

        let chevron = if self.expanded { "⌄" } else { "›" };
        let action = if self.expanded {
            "Enter/click to collapse · ↑↓ to scroll"
        } else {
            "Enter/Space to expand"
        };
        format!(
            "  {chevron} {}  Worked for {}  {} lines  {action}",
            self.title,
            format_duration(elapsed),
            self.total_lines
        )
    }
}

pub struct TerminalLogMonitor {
    state: LogMonitorState,
    started_at: Instant,
    header_row: u16,
    alternate_screen: bool,
    raw_mode: bool,
    mouse_capture: bool,
    cursor_hidden: bool,
    finished: bool,
}

impl TerminalLogMonitor {
    pub fn is_supported() -> bool {
        Self::streams_support_monitor(
            io::stdin().is_terminal(),
            io::stdout().is_terminal(),
            io::stderr().is_terminal(),
        )
    }

    pub fn start(title: &str) -> Result<Self> {
        TERMINATION_SIGNAL.store(0, Ordering::Release);
        let (_, header_row) = crossterm::cursor::position()
            .context("Failed to locate terminal cursor for Unreal log monitor")?;
        let mut monitor = Self {
            state: LogMonitorState::new(title),
            started_at: Instant::now(),
            header_row,
            alternate_screen: false,
            raw_mode: false,
            mouse_capture: false,
            cursor_hidden: false,
            finished: false,
        };

        TERMINAL_MONITOR_ACTIVE.store(true, Ordering::Release);
        terminal::enable_raw_mode().context("Failed to enable terminal log monitor input")?;
        monitor.raw_mode = true;
        monitor.cursor_hidden = true;
        execute!(io::stdout(), Hide).context("Failed to initialize terminal log monitor")?;
        monitor.draw()?;
        Self::install_signal_handler()?;
        Ok(monitor)
    }

    pub fn push_line(&mut self, line: impl Into<String>) {
        self.state.push_line(line);
    }

    pub fn update(&mut self) -> Result<MonitorAction> {
        if let Some(signal) = take_termination_signal() {
            return Ok(MonitorAction::Terminate(signal));
        }
        while event::poll(Duration::ZERO).context("Failed to poll terminal log monitor input")? {
            let action = match event::read().context("Failed to read terminal log monitor input")? {
                Event::Key(key) => self.handle_key(key)?,
                Event::Mouse(mouse) => self.handle_mouse(mouse)?,
                Event::Resize(_, _) => {
                    self.draw()?;
                    MonitorAction::Continue
                }
                _ => MonitorAction::Continue,
            };
            if matches!(action, MonitorAction::Terminate(_)) {
                return Ok(action);
            }
        }
        self.draw()?;
        Ok(MonitorAction::Continue)
    }

    pub fn poll_interval() -> Duration {
        INPUT_POLL_INTERVAL
    }

    pub fn finish(mut self, exit_code: i32, termination: Option<TerminationSignal>) -> Result<()> {
        self.state.complete(exit_code, termination);
        self.restore_terminal(true)?;
        self.finished = true;
        Ok(())
    }

    fn handle_key(&mut self, key: KeyEvent) -> Result<MonitorAction> {
        if !matches!(key.kind, KeyEventKind::Press | KeyEventKind::Repeat) {
            return Ok(MonitorAction::Continue);
        }
        if key.modifiers.contains(KeyModifiers::CONTROL)
            && matches!(key.code, KeyCode::Char('c' | 'C'))
        {
            return Ok(MonitorAction::Terminate(TerminationSignal::Interrupt));
        }

        match key.code {
            KeyCode::Enter | KeyCode::Char(' ') => self.toggle()?,
            KeyCode::Esc if self.state.is_expanded() => self.collapse()?,
            KeyCode::Up if self.state.is_expanded() => self.state.scroll_up(1),
            KeyCode::Down if self.state.is_expanded() => self.state.scroll_down(1),
            KeyCode::PageUp if self.state.is_expanded() => self.state.scroll_up(10),
            KeyCode::PageDown if self.state.is_expanded() => self.state.scroll_down(10),
            KeyCode::End if self.state.is_expanded() => self.state.scroll_to_bottom(),
            _ => {}
        }
        Ok(MonitorAction::Continue)
    }

    fn handle_mouse(&mut self, mouse: MouseEvent) -> Result<MonitorAction> {
        match mouse.kind {
            MouseEventKind::Down(MouseButton::Left)
                if self.state.is_expanded() && mouse.row == 0 =>
            {
                self.collapse()?;
            }
            MouseEventKind::ScrollUp if self.state.is_expanded() => self.state.scroll_up(3),
            MouseEventKind::ScrollDown if self.state.is_expanded() => self.state.scroll_down(3),
            _ => {}
        }
        Ok(MonitorAction::Continue)
    }

    fn toggle(&mut self) -> Result<()> {
        if self.state.is_expanded() {
            self.collapse()
        } else {
            self.expand()
        }
    }

    fn expand(&mut self) -> Result<()> {
        self.state.toggle();
        self.alternate_screen = true;
        self.mouse_capture = true;
        execute!(io::stdout(), EnterAlternateScreen, EnableMouseCapture)
            .context("Failed to expand Unreal log monitor")?;
        self.draw()
    }

    fn collapse(&mut self) -> Result<()> {
        self.state.collapse();
        if self.mouse_capture {
            execute!(io::stdout(), DisableMouseCapture)
                .context("Failed to release expanded Unreal log mouse capture")?;
            self.mouse_capture = false;
        }
        if self.alternate_screen {
            execute!(io::stdout(), LeaveAlternateScreen)
                .context("Failed to collapse Unreal log monitor")?;
            self.alternate_screen = false;
        }
        self.draw()
    }

    fn draw(&mut self) -> Result<()> {
        let (width, height) =
            terminal::size().context("Failed to read terminal size for Unreal log monitor")?;
        if !self.state.is_expanded() {
            let (_, row) = crossterm::cursor::position()
                .context("Failed to locate collapsed Unreal log monitor")?;
            self.header_row = row;
        }
        let rendered = self.state.render(width, height, self.started_at.elapsed());
        let mut stdout = io::stdout();
        if self.state.is_expanded() {
            queue!(
                stdout,
                MoveTo(0, 0),
                Clear(ClearType::All),
                crossterm::style::Print(rendered)
            )?;
        } else {
            queue!(
                stdout,
                MoveToColumn(0),
                Clear(ClearType::CurrentLine),
                crossterm::style::Print(rendered)
            )?;
        }
        stdout.flush().context("Failed to draw Unreal log monitor")
    }

    fn restore_terminal(&mut self, print_summary: bool) -> Result<()> {
        let mut first_error = None;
        let mut stdout = io::stdout();

        if self.alternate_screen {
            if let Err(error) = execute!(stdout, LeaveAlternateScreen) {
                first_error = Some(error);
            }
            self.alternate_screen = false;
            self.state.collapse();
        }
        if self.mouse_capture {
            if let Err(error) = execute!(stdout, DisableMouseCapture) {
                first_error.get_or_insert(error);
            }
            self.mouse_capture = false;
        }
        if self.cursor_hidden {
            if let Err(error) = execute!(stdout, Show) {
                first_error.get_or_insert(error);
            }
            self.cursor_hidden = false;
        }
        if self.raw_mode {
            if let Err(error) = terminal::disable_raw_mode() {
                first_error.get_or_insert(error);
            }
            self.raw_mode = false;
        }
        if print_summary {
            let (width, _) = terminal::size().unwrap_or((80, 24));
            let rendered = self.state.render(width, 1, self.started_at.elapsed());
            if let Err(error) = execute!(
                stdout,
                MoveToColumn(0),
                Clear(ClearType::CurrentLine),
                crossterm::style::Print(rendered),
                crossterm::style::Print("\r\n")
            ) {
                first_error.get_or_insert(error);
            }
        } else if let Err(error) = execute!(
            stdout,
            MoveToColumn(0),
            Clear(ClearType::CurrentLine),
            crossterm::style::Print("\r\n")
        ) {
            first_error.get_or_insert(error);
        }

        TERMINAL_MONITOR_ACTIVE.store(false, Ordering::Release);
        if let Some(error) = first_error {
            return Err(error).context("Failed to restore terminal after Unreal log monitor");
        }
        Ok(())
    }

    fn install_signal_handler() -> Result<()> {
        let result = SIGNAL_HANDLER.get_or_init(install_platform_signal_handler);
        match result {
            Ok(()) => Ok(()),
            Err(error) => anyhow::bail!("Failed to install terminal signal handler: {error}"),
        }
    }

    fn streams_support_monitor(stdin: bool, stdout: bool, stderr: bool) -> bool {
        stdin && stdout && stderr
    }
}

#[cfg(windows)]
fn install_platform_signal_handler() -> std::result::Result<(), String> {
    ctrlc::set_handler(|| {
        TERMINATION_SIGNAL.store(1, Ordering::Release);
    })
    .map_err(|error| error.to_string())
}

#[cfg(unix)]
fn install_platform_signal_handler() -> std::result::Result<(), String> {
    use signal_hook::consts::signal::{SIGHUP, SIGINT, SIGTERM};
    use signal_hook::iterator::Signals;

    let mut signals = Signals::new([SIGINT, SIGTERM, SIGHUP]).map_err(|error| error.to_string())?;
    std::thread::spawn(move || {
        for signal in signals.forever() {
            TERMINATION_SIGNAL.store(signal, Ordering::Release);
        }
    });
    Ok(())
}

#[cfg(not(any(unix, windows)))]
fn install_platform_signal_handler() -> std::result::Result<(), String> {
    Ok(())
}

fn take_termination_signal() -> Option<TerminationSignal> {
    let signal = TERMINATION_SIGNAL.swap(0, Ordering::AcqRel);

    #[cfg(windows)]
    {
        (signal != 0).then_some(TerminationSignal::Interrupt)
    }

    #[cfg(unix)]
    {
        use signal_hook::consts::signal::{SIGHUP, SIGINT, SIGTERM};

        match signal {
            SIGINT => Some(TerminationSignal::Interrupt),
            SIGTERM => Some(TerminationSignal::Terminate),
            SIGHUP => Some(TerminationSignal::Hangup),
            _ => None,
        }
    }

    #[cfg(not(any(unix, windows)))]
    {
        let _ = signal;
        None
    }
}

impl Drop for TerminalLogMonitor {
    fn drop(&mut self) {
        if !self.finished {
            let _ = self.restore_terminal(false);
        }
    }
}

fn truncate(text: &str, width: usize) -> String {
    console::truncate_str(text, width, "…").into_owned()
}

fn format_duration(duration: Duration) -> String {
    let total_seconds = duration.as_secs();
    let hours = total_seconds / 3_600;
    let minutes = (total_seconds % 3_600) / 60;
    let seconds = total_seconds % 60;

    if hours > 0 {
        format!("{hours}h {minutes}m {seconds}s")
    } else if minutes > 0 {
        format!("{minutes}m {seconds}s")
    } else {
        format!("{seconds}s")
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::{LogMonitorState, TerminalLogMonitor, MAX_RETAINED_LINES};

    #[test]
    fn collapsed_view_does_not_include_unreal_log_lines() {
        let mut state = LogMonitorState::new("Unreal log");
        state.push_line("LogInit: Display: Running engine");

        let rendered = state.render(80, 24, Duration::from_secs(260));

        assert!(rendered.contains("Unreal log"));
        assert!(rendered.contains("4m 20s"));
        assert!(!rendered.contains("LogInit"));
    }

    #[test]
    fn expanded_view_includes_recent_unreal_log_lines() {
        let mut state = LogMonitorState::new("Unreal log");
        state.push_line("LogInit: Display: Running engine");
        state.toggle();

        let rendered = state.render(80, 24, Duration::from_secs(1));

        assert!(rendered.contains("LogInit: Display: Running engine"));
    }

    #[test]
    fn completed_view_does_not_claim_it_can_still_expand() {
        let mut state = LogMonitorState::new("Unreal log");
        state.push_line("LogInit: Display: Running engine");
        state.complete(0, None);

        let rendered = state.render(80, 24, Duration::from_secs(1));

        assert!(rendered.starts_with("  ✔ Unreal log"));
        assert!(!rendered.contains("click"));
        assert!(!rendered.contains("LogInit"));
    }

    #[test]
    fn failed_view_reports_the_process_exit_code() {
        let mut state = LogMonitorState::new("Unreal log");
        state.complete(7, None);

        let rendered = state.render(80, 24, Duration::from_secs(1));

        assert!(rendered.starts_with("  ✖ Unreal log"));
        assert!(rendered.contains("Exited with code 7"));
    }

    #[test]
    fn retained_log_eviction_keeps_scrolled_view_nonempty() {
        let mut state = LogMonitorState::new("Unreal log");
        for index in 0..MAX_RETAINED_LINES {
            state.push_line(&format!("line {index}"));
        }
        state.toggle();
        state.scroll_up(MAX_RETAINED_LINES);

        state.push_line("newest line");
        let rendered = state.render(80, 24, Duration::from_secs(1));

        assert!(rendered.lines().count() > 2);
    }

    #[test]
    fn monitor_requires_all_standard_streams_to_be_terminals() {
        assert!(TerminalLogMonitor::streams_support_monitor(
            true, true, true
        ));
        assert!(!TerminalLogMonitor::streams_support_monitor(
            true, true, false
        ));
    }
}
