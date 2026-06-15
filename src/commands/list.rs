use anyhow::Result;

use crate::cli::ListArgs;
use crate::core::project_detector::ProjectDetector;
use crate::utils::logger::Logger;

pub fn execute(args: ListArgs) -> Result<()> {
    Logger::title("Project Detection");

    let result = ProjectDetector::detect(args.project.as_deref(), args.recursive)?;

    if args.json {
        if let Some(ref project) = result.project {
            let json = serde_json::json!({
                "name": project.name,
                "path": project.path,
                "engineAssociation": project.uproject.engine_association,
                "modules": project.uproject.modules,
                "plugins": project.uproject.plugins,
                "targets": project.targets.iter().map(|t| {
                    serde_json::json!({"name": t.name, "type": t.target_type})
                }).collect::<Vec<_>>(),
            });
            println!("{}", serde_json::to_string_pretty(&json)?);
            return Ok(());
        }
        anyhow::bail!("No project found");
    }

    let Some(project) = result.project else {
        Logger::error("No .uproject file found");
        anyhow::bail!("No project found in current directory");
    };

    Logger::success(&format!("Found project: {}", project.name));
    println!();

    Logger::subtitle("Basic Information");
    Logger::info(&format!("Path: {}", project.path.display()));
    if let Some(ref sd) = project.source_dir {
        Logger::info(&format!("Source Directory: {}", sd.display()));
    }
    Logger::info(&format!(
        "Engine Association: {}",
        project.uproject.engine_association
    ));
    println!();

    if !project.uproject.modules.is_empty() {
        Logger::subtitle("Modules");
        for m in &project.uproject.modules {
            Logger::writeln(&format!(
                "  • {} ({}) - Loading: {}",
                m.name, m.module_type, m.loading_phase
            ));
        }
        println!();
    }

    if !project.targets.is_empty() {
        Logger::subtitle("Build Targets");
        for t in &project.targets {
            Logger::writeln(&format!("  • {} ({})", t.name, t.target_type));
        }
        println!();
    }

    if !project.modules.is_empty() {
        Logger::subtitle("Source Modules");
        for m in &project.modules {
            Logger::writeln(&format!("  • {}", m.name));
        }
        println!();
    }

    if !project.uproject.plugins.is_empty() {
        Logger::subtitle("Plugins");
        for p in &project.uproject.plugins {
            let status = if p.enabled { "Enabled" } else { "Disabled" };
            Logger::writeln(&format!("  • {} - {status}", p.name));
        }
        println!();
    }

    if !result.warnings.is_empty() {
        Logger::subtitle("Warnings");
        for w in &result.warnings {
            Logger::warning(w);
        }
    }

    Ok(())
}
