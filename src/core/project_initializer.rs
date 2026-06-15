use std::fs;
use std::path::{Path, PathBuf};

use anyhow::Result;

use crate::error::UbuildError;
use crate::types::InitResult;
use crate::utils::logger::Logger;
use crate::utils::version::is_valid_project_name;

use super::engine_resolver::EngineResolver;

pub struct ProjectInitializer;

impl ProjectInitializer {
    pub fn initialize(
        name: &str,
        project_type: &str,
        template: &str,
        directory: Option<&str>,
        engine_path: Option<&str>,
        force: bool,
    ) -> Result<InitResult> {
        // Validate name
        if name.is_empty() {
            return Err(UbuildError::ProjectNameRequired.into());
        }
        if !is_valid_project_name(name) {
            return Err(UbuildError::InvalidProjectName.into());
        }

        let dir = directory.map_or_else(
            || std::env::current_dir().unwrap_or_default().join(name),
            PathBuf::from,
        );

        // Resolve engine
        let engine = Self::resolve_engine(engine_path)?;

        // Safety check
        if dir.exists() && !force {
            let has_uproject = glob::glob(&format!("{}/*.uproject", dir.display()))
                .into_iter()
                .flatten()
                .any(|r| r.is_ok());
            if has_uproject {
                return Err(
                    UbuildError::UnsafeInitDirectory("directory contains a .uproject file".into())
                        .into(),
                );
            }
        }

        Logger::title(&format!("Initializing {name}"));

        fs::create_dir_all(&dir)?;
        let mut created_files = Vec::new();

        Logger::info(&format!("Project directory: {}", dir.display()));
        Logger::info(&format!("Project type: {project_type}"));
        Logger::info(&format!("Engine: {}", engine.display()));

        // Create source structure for C++ projects
        if project_type == "cpp" {
            Self::create_cpp_structure(name, &dir)?;
        }

        // Engine association
        let engine_assoc = Self::get_engine_association_id(&engine);

        // Create .uproject
        let uproject_path = Self::create_uproject(name, &dir, &engine_assoc, project_type)?;
        created_files.push(uproject_path.clone());

        // Create source files for C++
        if project_type == "cpp" {
            let source_files = Self::create_source_files(name, &dir, &engine, template)?;
            created_files.extend(source_files);
        }

        // Create Content/ for blueprint/blank
        if project_type == "blueprint" || project_type == "blank" {
            let content_dir = dir.join("Content");
            fs::create_dir_all(&content_dir)?;
            created_files.push(content_dir);
        }

        // Create Config/
        let config_dir = dir.join("Config");
        fs::create_dir_all(&config_dir)?;
        created_files.push(config_dir.clone());

        let config_files = Self::create_config_files(&dir)?;
        created_files.extend(config_files);

        Logger::success(&format!("Project {name} initialized successfully"));

        Ok(InitResult {
            project_path: dir,
            uproject_path,
            engine_association: engine_assoc,
            created_files,
        })
    }

    fn resolve_engine(engine_path: Option<&str>) -> Result<PathBuf> {
        if let Some(ep) = engine_path {
            let p = PathBuf::from(ep);
            if !p.exists() {
                return Err(UbuildError::EngineNotFound(p).into());
            }
            return Ok(p);
        }

        let installations = EngineResolver::find_engine_installations();
        match installations.len() {
            0 => Err(UbuildError::NoEngineInstallations.into()),
            1 => {
                Logger::info(&format!(
                    "Using engine: {}",
                    installations[0].display_name
                ));
                Ok(installations[0].path.clone())
            }
            _ => {
                let items: Vec<String> = installations
                    .iter()
                    .map(|i| format!("{} ({})", i.display_name, i.path.display()))
                    .collect();
                let selection = dialoguer::Select::new()
                    .with_prompt("Select engine")
                    .items(&items)
                    .default(0)
                    .interact()?;
                Ok(installations[selection].path.clone())
            }
        }
    }

    fn get_engine_association_id(engine_path: &Path) -> String {
        if let Some(vp) = crate::utils::unreal_paths::resolve_engine_version_path(engine_path) {
            if let Ok(content) = fs::read_to_string(vp) {
                if let Ok(info) =
                    serde_json::from_str::<crate::types::EngineVersionInfo>(&content)
                {
                    return format!("{}.{}", info.major, info.minor);
                }
            }
        }
        "5.1".to_string() // fallback
    }

    fn create_cpp_structure(name: &str, dir: &Path) -> Result<()> {
        fs::create_dir_all(dir.join("Source").join(name).join("Public"))?;
        fs::create_dir_all(dir.join("Source").join(name).join("Private"))?;
        Ok(())
    }

    fn create_uproject(
        name: &str,
        dir: &Path,
        engine_assoc: &str,
        project_type: &str,
    ) -> Result<PathBuf> {
        let modules = if project_type == "cpp" {
            serde_json::json!([{
                "Name": name,
                "Type": "Runtime",
                "LoadingPhase": "Default"
            }])
        } else {
            serde_json::json!([])
        };

        let uproject = serde_json::json!({
            "FileVersion": 3,
            "EngineAssociation": engine_assoc,
            "Modules": modules,
            "Plugins": [],
            "TargetPlatforms": []
        });

        let path = dir.join(format!("{name}.uproject"));
        fs::write(&path, serde_json::to_string_pretty(&uproject)?)?;
        Ok(path)
    }

    fn create_source_files(
        name: &str,
        dir: &Path,
        _engine: &Path,
        _template: &str,
    ) -> Result<Vec<PathBuf>> {
        let source = dir.join("Source");
        let mut created = Vec::new();

        // Game target
        let game_target = source.join(format!("{name}.Target.cs"));
        fs::write(
            &game_target,
            Self::target_cs_content(name, "Game"),
        )?;
        created.push(game_target);

        // Editor target
        let editor_target = source.join(format!("{name}Editor.Target.cs"));
        fs::write(
            &editor_target,
            Self::target_cs_content(name, "Editor"),
        )?;
        created.push(editor_target);

        // Build.cs
        let build_cs = source.join(name).join(format!("{name}.Build.cs"));
        fs::write(&build_cs, Self::build_cs_content(name))?;
        created.push(build_cs);

        // Module header
        let module_h = source.join(name).join("Public").join(format!("{name}.h"));
        fs::write(&module_h, Self::module_h_content(name))?;
        created.push(module_h);

        // Module source
        let module_cpp = source
            .join(name)
            .join("Private")
            .join(format!("{name}.cpp"));
        fs::write(&module_cpp, Self::module_cpp_content(name))?;
        created.push(module_cpp);

        // GameModeBase header
        let gm_h = source
            .join(name)
            .join("Public")
            .join(format!("{name}GameModeBase.h"));
        fs::write(&gm_h, Self::gamemode_h_content(name))?;
        created.push(gm_h);

        // GameModeBase source
        let gm_cpp = source
            .join(name)
            .join("Private")
            .join(format!("{name}GameModeBase.cpp"));
        fs::write(&gm_cpp, Self::gamemode_cpp_content(name))?;
        created.push(gm_cpp);

        Ok(created)
    }

    fn create_config_files(dir: &Path) -> Result<Vec<PathBuf>> {
        let config = dir.join("Config");
        let mut created = Vec::new();

        let engine_ini = config.join("DefaultEngine.ini");
        fs::write(
            &engine_ini,
            "[/Script/EngineSettings.GameMapsSettings]\n\
             EditorStartupMap=\n\
             GameDefaultMap=\n\n\
             [/Script/HardwareTargeting.HardwareTargetingSettings]\n\
             TargetedHardwareClass=Desktop\n\
             AppliedTargetedHardwareClass=Desktop\n\
             DefaultGraphicsPerformance=Maximum\n\
             AppliedDefaultGraphicsPerformance=Maximum\n",
        )?;
        created.push(engine_ini);

        let game_ini = config.join("DefaultGame.ini");
        fs::write(
            &game_ini,
            "[/Script/EngineSettings.GeneralProjectSettings]\n\
             ProjectID=\n\
             ProjectName=\n",
        )?;
        created.push(game_ini);

        let editor_ini = config.join("DefaultEditor.ini");
        fs::write(&editor_ini, "")?;
        created.push(editor_ini);

        Ok(created)
    }

    // ── C++ template content ──

    fn target_cs_content(name: &str, target_type: &str) -> String {
        let class_name = if target_type == "Editor" {
            format!("{name}EditorTarget")
        } else {
            format!("{name}Target")
        };
        let extra = if target_type == "Editor" {
            format!(
                "\n\t\tIncludeOrderVersion = EngineIncludeOrderVersion.Latest;\
                 \n\t\tExtraModuleNames.AddRange(new string[] {{ \"{name}\" }});"
            )
        } else {
            String::new()
        };

        format!(
            "using UnrealBuildTool;\n\
             using System.Collections.Generic;\n\n\
             public class {class_name} : TargetRules\n\
             {{\n\
             \tpublic {class_name}(TargetInfo Target) : base(Target)\n\
             \t{{\n\
             \t\tType = TargetType.{target_type};\n\
             \t\tDefaultBuildSettings = BuildSettingsVersion.Latest;{extra}\n\
             \t}}\n\
             }}\n"
        )
    }

    fn build_cs_content(name: &str) -> String {
        format!(
            "using UnrealBuildTool;\n\n\
             public class {name} : ModuleRules\n\
             {{\n\
             \tpublic {name}(ReadOnlyTargetRules Target) : base(Target)\n\
             \t{{\n\
             \t\tPCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;\n\n\
             \t\tPublicDependencyModuleNames.AddRange(new string[] {{ \"Core\", \"CoreUObject\", \"Engine\", \"InputCore\" }});\n\
             \t}}\n\
             }}\n"
        )
    }

    fn module_h_content(name: &str) -> String {
        format!(
            "#pragma once\n\n\
             #include \"CoreMinimal.h\"\n\n\
             class F{name}Module : public IModuleInterface\n\
             {{\n\
             public:\n\
             \tvirtual void StartupModule() override;\n\
             \tvirtual void ShutdownModule() override;\n\
             }};\n"
        )
    }

    fn module_cpp_content(name: &str) -> String {
        format!(
            "#include \"{name}.h\"\n\
             #include \"Modules/ModuleManager.h\"\n\n\
             void F{name}Module::StartupModule()\n\
             {{\n\
             }}\n\n\
             void F{name}Module::ShutdownModule()\n\
             {{\n\
             }}\n\n\
             IMPLEMENT_PRIMARY_GAME_MODULE(FDefaultGameModuleImpl, {name}, \"{name}\");\n"
        )
    }

    fn gamemode_h_content(name: &str) -> String {
        format!(
            "#pragma once\n\n\
             #include \"CoreMinimal.h\"\n\
             #include \"GameFramework/GameModeBase.h\"\n\
             #include \"{name}GameModeBase.generated.h\"\n\n\
             UCLASS()\n\
             class {upper}_API A{name}GameModeBase : public AGameModeBase\n\
             {{\n\
             \tGENERATED_BODY()\n\n\
             public:\n\
             \tA{name}GameModeBase();\n\
             }};\n",
            upper = name.to_uppercase()
        )
    }

    fn gamemode_cpp_content(name: &str) -> String {
        format!(
            "#include \"{name}GameModeBase.h\"\n\n\
             A{name}GameModeBase::A{name}GameModeBase()\n\
             {{\n\
             }}\n"
        )
    }
}
