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
}
