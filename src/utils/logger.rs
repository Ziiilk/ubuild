use console::style;

pub struct Logger;

impl Logger {
    pub fn info(msg: &str) {
        println!("  {} {msg}", style("ℹ").cyan());
    }

    pub fn success(msg: &str) {
        println!("  {} {msg}", style("✔").green());
    }

    pub fn warning(msg: &str) {
        println!("  {} {msg}", style("⚠").yellow());
    }

    pub fn error(msg: &str) {
        eprintln!("  {} {msg}", style("✖").red());
    }

    pub fn title(msg: &str) {
        println!();
        println!("  {}", style(msg).bold().underlined());
        println!();
    }

    pub fn subtitle(msg: &str) {
        println!("  {}", style(msg).bold());
    }

    pub fn divider() {
        println!("  {}", style("─".repeat(60)).dim());
    }

    pub fn write(msg: &str) {
        print!("{msg}");
    }

    pub fn writeln(msg: &str) {
        println!("{msg}");
    }

    pub fn writeln_stderr(msg: &str) {
        eprintln!("{msg}");
    }

    pub fn plain_line(msg: &str) {
        println!("  {msg}");
    }

    /// Print the normalized header: the exact `ubuild` invocation the user ran
    /// (echoed from `std::env::args`), then Project / Engine / Platform.
    pub fn operation_header(
        invocation: &str,
        project: &std::path::Path,
        engine_display: &str,
        platform: &str,
        config: &str,
    ) {
        Self::plain_line(invocation);
        Self::plain_line(&format!("Project: {}", project.display()));
        Self::plain_line(&format!("Engine: {engine_display}"));
        Self::plain_line(&format!("Platform: {platform} | {config}"));
    }

    /// Print the full command that will be executed (plain text, not folded).
    pub fn executed_command(command: &str) {
        Self::plain_line(command);
    }

    pub fn json<T: serde::Serialize>(value: &T) -> anyhow::Result<()> {
        let json = serde_json::to_string_pretty(value)?;
        println!("{json}");
        Ok(())
    }

    pub fn debug(msg: &str) {
        if std::env::var("UBUILD_DEBUG").is_ok() {
            eprintln!("  {} {msg}", style("⊙").dim());
        }
    }

    /// Print up to 10 build error lines (error/failed/fatal) from captured output.
    pub fn print_error_summary(stdout: &str, stderr: &str) {
        let error_lines: Vec<&str> = stderr
            .lines()
            .chain(stdout.lines())
            .filter(|l| {
                let lower = l.to_lowercase();
                lower.contains("error") || lower.contains("failed") || lower.contains("fatal")
            })
            .take(10)
            .collect();

        if error_lines.is_empty() {
            return;
        }

        Self::subtitle("Error Summary:");
        for line in &error_lines {
            Self::writeln(&format!("  {}", style(line).red()));
        }
    }
}
