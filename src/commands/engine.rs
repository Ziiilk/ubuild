use anyhow::Result;

use crate::cli::EngineArgs;
use crate::core::engine_resolver::EngineResolver;
use crate::core::project_path_resolver::ProjectPathResolver;
use crate::utils::logger::Logger;

pub fn execute(args: EngineArgs) -> Result<()> {
    Logger::title("Engine Information");

    let project_path = ProjectPathResolver::resolve_or_throw(args.project.as_deref()).ok();
    let result = EngineResolver::resolve_engine(project_path.as_deref());

    if args.json {
        let json = serde_json::json!({
            "engine": result.engine.as_ref().map(|e| serde_json::json!({
                "path": e.path,
                "associationId": e.association_id,
                "displayName": e.display_name,
                "version": e.version.as_ref().map(std::string::ToString::to_string),
                "source": e.source.to_string(),
            })),
            "uprojectEngine": result.uproject_engine.as_ref().map(|a| serde_json::json!({
                "id": a.id,
            })),
            "warnings": result.warnings,
        });
        println!("{}", serde_json::to_string_pretty(&json)?);
        return Ok(());
    }

    if let Some(ref engine) = result.engine {
        Logger::subtitle("Engine Details");
        Logger::info(&format!("Path: {}", engine.path.display()));
        if let Some(ref v) = engine.version {
            Logger::info(&format!("Version: {v}"));
            if !v.build_id.is_empty() {
                Logger::info(&format!("Build ID: {}", v.build_id));
            }
            if !v.branch_name.is_empty() {
                Logger::info(&format!("Branch: {}", v.branch_name));
            }
            Logger::info(&format!("Changelist: {}", v.changelist));
            Logger::info(&format!(
                "Promoted Build: {}",
                if v.is_promoted_build != 0 { "Yes" } else { "No" }
            ));
        }
        Logger::info(&format!("Association ID: {}", engine.association_id));
        if let Some(ref date) = engine.installed_date {
            Logger::info(&format!("Installed: {date}"));
        }
        println!();
    } else {
        Logger::warning("No engine installation detected");
    }

    if let Some(ref assoc) = result.uproject_engine {
        Logger::subtitle("Project Engine Association");
        Logger::info(&format!("ID: {}", assoc.id));
        println!();
    }

    if args.verbose {
        let installations = EngineResolver::find_engine_installations();
        if !installations.is_empty() {
            Logger::subtitle("Engine Detection Details");
            Logger::info(&format!("Total engines detected: {}", installations.len()));
            for (i, inst) in installations.iter().enumerate() {
                Logger::writeln(&format!("  Engine {}:", i + 1));
                Logger::writeln(&format!("    Path: {}", inst.path.display()));
                Logger::writeln(&format!("    Source: {}", inst.source));
                Logger::writeln(&format!("    Association ID: {}", inst.association_id));
                Logger::writeln(&format!("    Display Name: {}", inst.display_name));
                if let Some(ref v) = inst.version {
                    Logger::writeln(&format!("    Version: {v}"));
                }
                if let Some(ref d) = inst.installed_date {
                    Logger::writeln(&format!("    Installed: {d}"));
                }
            }
        }
    }

    for w in &result.warnings {
        Logger::warning(w);
    }

    Ok(())
}
