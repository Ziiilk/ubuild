use std::collections::VecDeque;
use std::io::{self, IsTerminal, Write};
use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};
use std::sync::OnceLock;
use std::time::{Duration, Instant};

use anyhow::{Context, Result};
use crossterm::cursor::{Hide, MoveToColumn, Show};
use crossterm::event::{
    self, DisableMouseCapture, EnableMouseCapture, Event, KeyCode, KeyEvent, KeyEventKind,
    KeyModifiers, MouseButton, MouseEvent, MouseEventKind,
};
use crossterm::terminal::{self, Clear, ClearType, EnterAlternateScreen, LeaveAlternateScreen};
use crossterm::{execute, queue};
use ratatui::{
    backend::CrosstermBackend,
    style::{Color, Style},
    text::{Line, Span},
    widgets::Paragraph,
    Terminal,
};

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
    follow: bool,
    viewport_body_height: usize,
    header_height: usize,
    completion: Option<Completion>,
    top_index: usize,
    search: SearchState,
}

#[derive(Clone)]
struct SearchState {
    active: bool,
    input: String,
    matches: Vec<usize>,
    current: usize,
}

impl SearchState {
    fn new() -> Self {
        Self {
            active: false,
            input: String::new(),
            matches: Vec::new(),
            current: 0,
        }
    }
}

#[derive(Clone, Copy)]
enum Completion {
    Completed,
    Failed(i32),
    Interrupted,
}

struct Layout {
    header: Vec<String>,
    footer: String,
    body_start: usize,
    body_end: usize,
    body_height: usize,
}

impl LogMonitorState {
    pub fn new(title: &str) -> Self {
        Self {
            title: title.to_string(),
            lines: VecDeque::new(),
            total_lines: 0,
            expanded: false,
            follow: true,
            viewport_body_height: 1,
            header_height: 1,
            completion: None,
            top_index: 0,
            search: SearchState::new(),
        }
    }

    pub fn push_line(&mut self, line: impl Into<String>) {
        let was_full = self.lines.len() == MAX_RETAINED_LINES;
        if was_full {
            self.lines.pop_front();
        }
        self.lines.push_back(line.into());
        self.total_lines += 1;
        if !self.follow && was_full && self.top_index > 0 {
            self.top_index = self.top_index.saturating_sub(1);
        }
        if self.search.active {
            self.refresh_search();
        }
    }

    pub fn toggle(&mut self) {
        self.expanded = !self.expanded;
        if self.expanded {
            self.follow = true;
        }
    }

    pub fn collapse(&mut self) {
        self.expanded = false;
    }

    pub fn complete(&mut self, exit_code: i32, termination: Option<TerminationSignal>) {
        self.expanded = false;
        self.follow = true;
        self.completion = Some(if termination.is_some() {
            Completion::Interrupted
        } else if exit_code == 0 {
            Completion::Completed
        } else {
            Completion::Failed(exit_code)
        });
    }

    pub fn scroll_up(&mut self, lines: usize) {
        let base = if self.follow {
            self.last_top_index()
        } else {
            self.top_index
        };
        self.follow = false;
        self.top_index = base.saturating_sub(lines);
    }

    pub fn scroll_down(&mut self, lines: usize) {
        let base = if self.follow {
            self.last_top_index()
        } else {
            self.top_index
        };
        let last = self.last_top_index();
        self.top_index = base.saturating_add(lines).min(last);
        self.follow = self.top_index >= last;
    }

    pub fn scroll_to_bottom(&mut self) {
        self.follow = true;
    }

    pub fn scroll_to_top(&mut self) {
        self.follow = false;
        self.top_index = 0;
    }

    pub fn begin_search(&mut self) {
        let mut state = SearchState::new();
        state.active = true;
        self.search = state;
    }

    pub fn cancel_search(&mut self) {
        self.search = SearchState::new();
    }

    pub fn finalize_search(&mut self) {
        if self.search.input.is_empty() {
            self.search.matches.clear();
            self.search.current = 0;
        } else {
            self.refresh_search();
        }
        self.search.active = false;
        if let Some(&first) = self.search.matches.first() {
            self.center_on(first);
        }
    }

    pub fn search_next(&mut self) {
        if self.search.matches.is_empty() {
            return;
        }
        self.search.current = (self.search.current + 1) % self.search.matches.len();
        if let Some(&t) = self.search.matches.get(self.search.current) {
            self.center_on(t);
        }
    }

    pub fn search_prev(&mut self) {
        if self.search.matches.is_empty() {
            return;
        }
        if self.search.current == 0 {
            self.search.current = self.search.matches.len() - 1;
        } else {
            self.search.current -= 1;
        }
        if let Some(&t) = self.search.matches.get(self.search.current) {
            self.center_on(t);
        }
    }

    pub fn is_expanded(&self) -> bool {
        self.expanded
    }

    pub fn header_height(&self) -> usize {
        self.header_height
    }

    pub fn search_active(&self) -> bool {
        self.search.active
    }

    pub fn search_input_push(&mut self, ch: char) {
        self.search.input.push(ch);
        self.refresh_search();
    }

    pub fn search_input_pop(&mut self) {
        self.search.input.pop();
        self.refresh_search();
    }

    fn refresh_search(&mut self) {
        if self.search.input.trim().is_empty() {
            self.search.matches.clear();
            self.search.current = 0;
            return;
        }
        let needle = self.search.input.trim().to_ascii_lowercase();
        let matches: Vec<usize> = self
            .lines
            .iter()
            .enumerate()
            .filter(|(_, line)| line.to_ascii_lowercase().contains(&needle))
            .map(|(i, _)| i)
            .collect();
        let preserved = self.search.current.min(matches.len().saturating_sub(1));
        self.search.matches = matches;
        self.search.current = preserved;
    }

    fn center_on(&mut self, target: usize) {
        self.follow = false;
        let half = self.viewport_body_height / 2;
        self.top_index = target.saturating_sub(half).min(self.last_top_index());
    }

    fn last_top_index(&self) -> usize {
        self.lines
            .len()
            .saturating_sub(self.viewport_body_height.max(1))
    }

    pub fn render(&mut self, width: u16, height: u16, elapsed: Duration) -> String {
        let width = usize::from(width);
        let height = usize::from(height);
        if !self.expanded {
            return truncate(&self.render_header(elapsed), width);
        }
        self.render_styled(width, height, elapsed)
            .into_iter()
            .map(|line| line.to_string())
            .collect::<Vec<_>>()
            .join("\r\n")
    }

    fn render_styled(
        &mut self,
        width: usize,
        height: usize,
        elapsed: Duration,
    ) -> Vec<Line<'static>> {
        let needle = self.search_needle();
        let current_line = self.search.matches.get(self.search.current).copied();
        let layout = self.frame(width, height, elapsed);
        self.sync_layout(layout.body_height, layout.header.len());
        let gap = layout
            .body_height
            .saturating_sub(layout.body_end - layout.body_start);
        let mut out: Vec<Line<'static>> = Vec::with_capacity(height);
        for head in &layout.header {
            out.push(Line::raw(head.clone()));
        }
        out.push(Line::raw(divider(width)));
        for (offset, line) in self
            .lines
            .range(layout.body_start..layout.body_end)
            .enumerate()
        {
            let idx = layout.body_start + offset;
            let is_current = current_line == Some(idx);
            out.push(Line::from(highlight_spans(
                &clip(line, width),
                needle.as_deref(),
                is_current,
            )));
        }
        for _ in 0..gap {
            out.push(Line::raw(String::new()));
        }
        out.push(Line::raw(divider(width)));
        out.push(Line::raw(layout.footer));
        out
    }

    fn frame(&self, width: usize, height: usize, elapsed: Duration) -> Layout {
        let header = wrap_text(&self.render_header(elapsed), width);
        let body_height = height.saturating_sub(header.len() + 3).max(1);
        let last = self.lines.len().saturating_sub(body_height);
        let start = if self.follow {
            last
        } else {
            self.top_index.min(last)
        };
        let end = (start + body_height).min(self.lines.len());
        let footer = truncate(&self.render_status_at(start), width);
        Layout {
            header,
            footer,
            body_start: start,
            body_end: end,
            body_height,
        }
    }

    fn search_needle(&self) -> Option<String> {
        let needle = self.search.input.trim();
        if needle.is_empty() {
            None
        } else {
            Some(needle.to_ascii_lowercase())
        }
    }

    fn sync_layout(&mut self, body_height: usize, header_height: usize) {
        self.viewport_body_height = body_height;
        self.header_height = header_height.max(1);
    }

    fn render_status_at(&self, top: usize) -> String {
        let mut parts: Vec<String> = Vec::with_capacity(3);
        parts.push((if self.follow { "FOLLOW" } else { "PAUSED" }).to_string());
        let total = self.lines.len();
        if total == 0 {
            parts.push("0 lines".to_string());
        } else {
            parts.push(format!("{} / {total}", top + 1));
        }
        let needle = self.search.input.trim();
        if !self.search.matches.is_empty() {
            parts.push(format!(
                "/{needle} [{}/{}]",
                self.search.current + 1,
                self.search.matches.len()
            ));
        } else if !needle.is_empty() {
            parts.push(format!("/{needle} [no matches]"));
        }
        format!("  {}", parts.join("  │  "))
    }

    fn render_header(&self, elapsed: Duration) -> String {
        if self.search.active {
            return format!("  /{}  (Enter to find · Esc to cancel)", self.search.input);
        }
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
            "Space/click to collapse · ↑↓/PgUp/Dn/Home/End · Ctrl+F search · N/P next/prev"
        } else {
            "Space/click to expand"
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
    terminal: Terminal<CrosstermBackend<io::Stdout>>,
    in_alternate: bool,
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
        let backend = CrosstermBackend::new(io::stdout());
        let terminal =
            Terminal::new(backend).context("Failed to create ratatui terminal backend")?;
        terminal::enable_raw_mode().context("Failed to enable terminal log monitor input")?;
        let mut monitor = Self {
            state: LogMonitorState::new(title),
            started_at: Instant::now(),
            header_row,
            terminal,
            in_alternate: false,
            raw_mode: true,
            mouse_capture: false,
            cursor_hidden: true,
            finished: false,
        };

        TERMINAL_MONITOR_ACTIVE.store(true, Ordering::Release);
        execute!(io::stdout(), Hide, EnableMouseCapture)
            .context("Failed to initialize terminal log monitor")?;
        monitor.mouse_capture = true;
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

        if self.state.search_active() {
            match key.code {
                KeyCode::Esc => self.state.cancel_search(),
                KeyCode::Enter => self.state.finalize_search(),
                KeyCode::Backspace => self.state.search_input_pop(),
                KeyCode::Char(ch) => self.state.search_input_push(ch),
                _ => {}
            }
            return Ok(MonitorAction::Continue);
        }

        match key.code {
            KeyCode::Char(' ') => self.toggle()?,
            KeyCode::Char('f' | 'F') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                self.state.begin_search();
            }
            KeyCode::Char('n' | 'N') if self.state.is_expanded() => self.state.search_next(),
            KeyCode::Char('p' | 'P') if self.state.is_expanded() => self.state.search_prev(),
            KeyCode::Up if self.state.is_expanded() => self.state.scroll_up(1),
            KeyCode::Down if self.state.is_expanded() => self.state.scroll_down(1),
            KeyCode::PageUp if self.state.is_expanded() => self.state.scroll_up(10),
            KeyCode::PageDown if self.state.is_expanded() => self.state.scroll_down(10),
            KeyCode::End if self.state.is_expanded() => self.state.scroll_to_bottom(),
            KeyCode::Home if self.state.is_expanded() => self.state.scroll_to_top(),
            _ => {}
        }
        Ok(MonitorAction::Continue)
    }

    fn handle_mouse(&mut self, mouse: MouseEvent) -> Result<MonitorAction> {
        let (_, height) = terminal::size().unwrap_or((80, 24));
        let scroll_step = (usize::from(height) / 3).max(1);
        match mouse.kind {
            MouseEventKind::Up(MouseButton::Left) => {
                let on_header = if self.state.is_expanded() {
                    usize::from(mouse.row) < self.state.header_height()
                } else {
                    mouse.row == self.header_row
                };
                if on_header {
                    self.toggle()?;
                }
            }
            MouseEventKind::ScrollUp if self.state.is_expanded() => {
                self.state.scroll_up(scroll_step);
            }
            MouseEventKind::ScrollDown if self.state.is_expanded() => {
                self.state.scroll_down(scroll_step);
            }
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
        self.in_alternate = true;
        execute!(io::stdout(), EnterAlternateScreen)
            .context("Failed to expand Unreal log monitor")?;
        self.terminal
            .clear()
            .context("Failed to clear ratatui buffer for Unreal log monitor")?;
        self.draw()
    }

    fn collapse(&mut self) -> Result<()> {
        self.state.collapse();
        if self.in_alternate {
            execute!(io::stdout(), LeaveAlternateScreen)
                .context("Failed to collapse Unreal log monitor")?;
            self.in_alternate = false;
        }
        self.draw()
    }

    fn draw(&mut self) -> Result<()> {
        if self.state.is_expanded() {
            self.draw_expanded()
        } else {
            self.draw_collapsed()
        }
    }

    fn draw_collapsed(&mut self) -> Result<()> {
        let (width, _) =
            terminal::size().context("Failed to read terminal size for Unreal log monitor")?;
        let header = self.state.render(width, 1, self.started_at.elapsed());
        let mut stdout = io::stdout();
        queue_collapsed_line(&mut stdout, &header)?;
        stdout
            .flush()
            .context("Failed to draw Unreal log monitor")?;
        let (_, row) = crossterm::cursor::position()
            .context("Failed to locate collapsed Unreal log monitor")?;
        self.header_row = row;
        Ok(())
    }

    fn draw_expanded(&mut self) -> Result<()> {
        let area = self
            .terminal
            .size()
            .context("Failed to read terminal size for Unreal log monitor")?;
        let lines = self.state.render_styled(
            area.width.into(),
            area.height.into(),
            self.started_at.elapsed(),
        );
        self.terminal
            .draw(|frame| frame.render_widget(Paragraph::new(lines), area.into()))
            .context("Failed to render expanded Unreal log monitor")?;
        Ok(())
    }

    fn restore_terminal(&mut self, print_summary: bool) -> Result<()> {
        let mut first_error = None;
        let mut stdout = io::stdout();

        if self.in_alternate {
            if let Err(error) = execute!(stdout, LeaveAlternateScreen) {
                first_error = Some(error);
            }
            self.in_alternate = false;
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

fn queue_collapsed_line(output: &mut impl Write, header: &str) -> Result<()> {
    queue!(
        output,
        MoveToColumn(0),
        Clear(ClearType::CurrentLine),
        crossterm::style::Print(header),
        MoveToColumn(0)
    )?;
    Ok(())
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

fn clip(text: &str, width: usize) -> String {
    if width == 0 {
        return String::new();
    }
    if text.chars().count() <= width {
        return text.to_string();
    }
    text.chars().take(width).collect()
}

fn divider(width: usize) -> String {
    "─".repeat(width)
}

fn wrap_text(text: &str, width: usize) -> Vec<String> {
    if width == 0 {
        return vec![text.to_string()];
    }
    let mut lines = Vec::new();
    let mut current = String::new();
    for word in text.split(' ') {
        if word.is_empty() {
            continue;
        }
        let needs_separator = !current.is_empty();
        let current_len = current.chars().count();
        let word_len = word.chars().count();
        if current_len + usize::from(needs_separator) + word_len <= width {
            if needs_separator {
                current.push(' ');
            }
            current.push_str(word);
        } else {
            if !current.is_empty() {
                lines.push(std::mem::take(&mut current));
            }
            let mut rest: String = word.to_string();
            while rest.chars().count() > width {
                let head: String = rest.chars().take(width).collect();
                lines.push(head);
                rest = rest.chars().skip(width).collect();
            }
            current.push_str(&rest);
        }
    }
    lines.push(current);
    lines
}

fn highlight_spans(text: &str, needle: Option<&str>, is_current: bool) -> Vec<Span<'static>> {
    let Some(needle) = needle else {
        return vec![Span::raw(text.to_string())];
    };
    if needle.is_empty() {
        return vec![Span::raw(text.to_string())];
    }
    let style = if is_current {
        Style::default().fg(Color::Black).bg(Color::Yellow)
    } else {
        Style::default().fg(Color::Yellow)
    };
    let lower = text.to_ascii_lowercase();
    let needle_len = needle.len();
    let mut spans: Vec<Span<'static>> = Vec::new();
    let mut cursor = 0usize;
    for (start, _) in lower.match_indices(needle) {
        let end = start + needle_len;
        if start > cursor {
            spans.push(Span::raw(text[cursor..start].to_string()));
        }
        spans.push(Span::styled(text[start..end].to_string(), style));
        cursor = end;
    }
    if cursor < text.len() {
        spans.push(Span::raw(text[cursor..].to_string()));
    }
    if spans.is_empty() {
        spans.push(Span::raw(text.to_string()));
    }
    spans
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::{queue_collapsed_line, LogMonitorState, TerminalLogMonitor, MAX_RETAINED_LINES};

    #[test]
    fn collapsed_redraw_uses_only_current_line_positioning() -> anyhow::Result<()> {
        let mut output = Vec::new();

        queue_collapsed_line(&mut output, "Unreal log")?;

        let rendered = String::from_utf8(output)?;
        assert_eq!(rendered, "\u{1b}[1G\u{1b}[2KUnreal log\u{1b}[1G");
        Ok(())
    }

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

    #[test]
    fn expanded_view_always_reserves_a_footer_row() {
        let mut state = LogMonitorState::new("Unreal log");
        state.toggle();
        state.push_line("LogInit: Display: Running engine");

        let rendered = state.render(80, 24, Duration::from_secs(1));
        let rows: Vec<&str> = rendered.split("\r\n").collect();

        assert_eq!(rows.len(), 24);
        assert!(rows[rows.len() - 1].contains("FOLLOW"));
    }

    #[test]
    fn following_pins_newest_line_at_the_bottom() {
        let mut state = LogMonitorState::new("Unreal log");
        state.toggle();
        for index in 0..30 {
            state.push_line(format!("line {index}"));
        }

        let rendered = state.render(80, 24, Duration::from_secs(1));
        let rows: Vec<&str> = rendered.split("\r\n").collect();
        assert_eq!(rows.len(), 24);
        assert!(rows[rows.len() - 1].contains("FOLLOW"));
        assert_eq!(rows[rows.len() - 3], "line 29");

        // A new line while following fills the bottom and shifts the previous newest up.
        state.push_line("line 30");
        let rendered_after = state.render(80, 24, Duration::from_secs(1));
        let rows_after: Vec<&str> = rendered_after.split("\r\n").collect();
        assert_eq!(rows_after[rows_after.len() - 3], "line 30");
        assert_eq!(rows_after[rows_after.len() - 4], "line 29");
    }

    #[test]
    fn paused_view_does_not_follow_new_lines() {
        let mut state = LogMonitorState::new("Unreal log");
        state.toggle();
        for index in 0..30 {
            state.push_line(format!("line {index}"));
        }
        // The expanded view draws once before the user scrolls, fixing the viewport height.
        let _ = state.render(80, 24, Duration::from_secs(1));
        state.scroll_up(5);

        let before = state.render(80, 24, Duration::from_secs(1));
        state.push_line("line 30");
        let after = state.render(80, 24, Duration::from_secs(1));

        assert!(before.contains("PAUSED"));
        assert!(after.contains("PAUSED"));
        assert!(!after.contains("line 30"));
    }

    #[test]
    fn narrow_header_wraps_instead_of_truncating() {
        let mut state = LogMonitorState::new("Unreal log");
        state.toggle();
        state.push_line("LogInit: Display: Running engine");

        let rendered = state.render(20, 24, Duration::from_secs(1));

        assert!(rendered.contains("LogInit: Display:"));
        assert!(rendered.contains("next/prev"));
    }

    #[test]
    fn search_reports_match_counts_in_status() {
        let mut state = LogMonitorState::new("Unreal log");
        state.push_line("LogInit: Display: Running engine");
        state.push_line("LogCore: Warning: something");
        state.push_line("LogInit: Error: boom");
        state.toggle();
        for ch in "loginit".chars() {
            state.search_input_push(ch);
        }
        state.finalize_search();

        let rendered = state.render(80, 24, Duration::from_secs(1));
        assert!(rendered.contains("[1/2]"));

        state.search_next();
        let rendered_after = state.render(80, 24, Duration::from_secs(1));
        assert!(rendered_after.contains("[2/2]"));
    }

    #[test]
    fn search_isolates_the_matched_substring() {
        let spans = super::highlight_spans("LogInit: Error: boom", Some("error"), false);

        assert!(spans.len() >= 2);
        assert!(spans.iter().any(|span| span.content.as_ref() == "Error"));
    }

    #[test]
    fn wrapped_header_reports_its_full_row_count() {
        // At a default-ish width the expanded header wraps to several rows; every
        // header row must remain clickable, not just row 0.
        let mut state = LogMonitorState::new("Unreal log");
        state.toggle();
        state.push_line("LogInit: Display: Running engine");
        let _ = state.render(80, 24, Duration::from_secs(1));

        assert!(
            state.header_height() >= 2,
            "header should wrap across multiple rows at width 80"
        );
    }
}
