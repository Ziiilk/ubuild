use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result};
use serde::Deserialize;

use crate::platform;
use crate::utils::command::{display_args, uat_arg_key};
use crate::utils::logger::Logger;
use crate::utils::unreal_paths::resolve_runuat_path;

use super::build_executor::BuildExecutor;
use super::engine_resolver::EngineResolver;

const EXCLUDED_SEARCH_DIRS: &[&str] = &[
    "Binaries",
    "Intermediate",
    "Saved",
    "DerivedDataCache",
    "Dist",
    "target",
    "build",
    "node_modules",
    ".venv",
    "venv",
    "out",
    ".git",
    ".codex",
    ".ubuild",
];

#[derive(Debug, Deserialize)]
struct PluginDescriptor {
    #[serde(rename = "Modules", default)]
    modules: Vec<serde_json::Value>,
    #[serde(rename = "Plugins", default)]
    plugins: Vec<PluginReference>,
}

#[derive(Debug, Deserialize)]
struct PluginReference {
    #[serde(rename = "Name")]
    name: String,
    #[serde(rename = "Enabled", default = "default_true")]
    enabled: bool,
    #[serde(rename = "Optional", default)]
    optional: bool,
    #[serde(rename = "PlatformAllowList", alias = "WhitelistPlatforms", default)]
    platform_allow_list: Vec<String>,
    #[serde(rename = "PlatformDenyList", alias = "BlacklistPlatforms", default)]
    platform_deny_list: Vec<String>,
    #[serde(rename = "TargetAllowList", alias = "WhitelistTargets", default)]
    target_allow_list: Vec<String>,
    #[serde(rename = "TargetDenyList", alias = "BlacklistTargets", default)]
    target_deny_list: Vec<String>,
}

const fn default_true() -> bool {
    true
}

pub struct PluginBuilder;

impl PluginBuilder {
    pub fn run(
        plugin: Option<&str>,
        output: Option<&str>,
        engine_path: Option<&str>,
        requested_platforms: &[String],
        dry_run: bool,
        uat_args: &[String],
    ) -> Result<()> {
        Logger::title("Unreal Engine Plugin Build");
        Self::validate_uat_args(uat_args)?;

        let plugin_file = Self::resolve_plugin(plugin)?;
        let plugin_name = Self::plugin_name(&plugin_file)?;
        let project_file = Self::find_owning_project(&plugin_file)?;
        let engine = Self::resolve_engine(&plugin_file, project_file.as_deref(), engine_path)?;
        let runuat = resolve_runuat_path(&engine)?;
        let platforms = Self::normalize_platforms(requested_platforms)?;
        let output = Self::resolve_output(&plugin_file, &plugin_name, output)?;
        Self::validate_output_path(
            &output,
            &plugin_file,
            project_file.as_deref(),
            &engine,
            &plugin_name,
        )?;

        let explicit_dependencies = Self::explicit_dependencies(uat_args)?;
        let dependencies = Self::resolve_dependencies(
            &plugin_file,
            project_file.as_deref(),
            &engine,
            &platforms,
            &explicit_dependencies,
        )?;

        let package_path = if dry_run {
            output.clone()
        } else {
            Self::staging_path(&output)?
        };
        let args = Self::build_args(
            &plugin_file,
            &package_path,
            &platforms,
            &dependencies,
            &engine,
            uat_args,
        );

        Logger::info(&format!("Plugin: {}", plugin_file.display()));
        Logger::info(&format!("Engine: {}", engine.display()));
        Logger::info(&format!("Platforms: {}", platforms.join(", ")));
        Logger::info(&format!("Output: {}", output.display()));
        if dependencies.is_empty() {
            Logger::info("External dependencies: none");
        } else {
            Logger::info(&format!("External dependencies: {}", dependencies.len()));
            for dependency in &dependencies {
                Logger::writeln(&format!("  {}", dependency.display()));
            }
        }

        if dry_run {
            Logger::subtitle("Dry Run - RunUAT Command");
            Logger::writeln(&format!("  {} {}", runuat.display(), display_args(&args)));
            Logger::info("This is a dry run - no plugin package will be created");
            return Ok(());
        }

        fs::create_dir_all(&package_path).with_context(|| {
            format!(
                "Failed to create staging directory {}",
                package_path.display()
            )
        })?;
        Logger::divider();
        let start = Instant::now();
        let execution = BuildExecutor::execute_streaming(&runuat, &args);
        let duration = start.elapsed().as_secs_f64();
        Logger::divider();

        let (stdout, stderr, exit_code) = match execution {
            Ok(result) => result,
            Err(error) => {
                Self::remove_staging(&package_path);
                return Err(error);
            }
        };
        if exit_code != 0 {
            Self::remove_staging(&package_path);
            Logger::print_error_summary(&stdout, &stderr);
            anyhow::bail!("Plugin build failed with exit code {exit_code}");
        }

        if let Err(error) = Self::validate_package(&package_path, &plugin_name) {
            Self::remove_staging(&package_path);
            return Err(error);
        }
        Self::validate_existing_output(&output, &plugin_name)?;
        Self::replace_output(&package_path, &output)?;
        Logger::success(&format!("Plugin build completed in {duration:.1}s"));
        Logger::info(&format!("Package: {}", output.display()));
        Ok(())
    }

    fn resolve_plugin(input: Option<&str>) -> Result<PathBuf> {
        let input = input.map_or(std::env::current_dir()?, PathBuf::from);
        let candidate = if input.is_file() {
            if !Self::has_extension(&input, "uplugin") {
                anyhow::bail!(
                    "Plugin descriptor must have a .uplugin extension: {}",
                    input.display()
                );
            }
            input
        } else if input.is_dir() {
            let files = Self::direct_descriptors(&input, "uplugin")?;
            match files.as_slice() {
                [only] => only.clone(),
                [] => anyhow::bail!("No .uplugin file found directly in {}", input.display()),
                _ => anyhow::bail!(
                    "Multiple .uplugin files found in {}: {}",
                    input.display(),
                    files
                        .iter()
                        .map(|path| path.display().to_string())
                        .collect::<Vec<_>>()
                        .join(", ")
                ),
            }
        } else {
            anyhow::bail!("Plugin path does not exist: {}", input.display());
        };
        let canonical = candidate
            .canonicalize()
            .with_context(|| format!("Failed to resolve {}", candidate.display()))?;
        Ok(Self::without_verbatim_prefix(canonical))
    }

    fn resolve_engine(
        plugin: &Path,
        project: Option<&Path>,
        explicit: Option<&str>,
    ) -> Result<PathBuf> {
        if let Some(explicit) = explicit {
            let canonical = EngineResolver::resolve_engine_path(None, Some(explicit))?
                .canonicalize()
                .context("Failed to resolve engine path")?;
            return Ok(Self::without_verbatim_prefix(canonical));
        }
        if let Some(engine) = Self::find_owning_engine(plugin) {
            return Ok(engine);
        }
        if let Some(project) = project {
            return EngineResolver::resolve_engine_path(Some(project), None);
        }
        let installations = EngineResolver::find_engine_installations();
        match installations.as_slice() {
            [only] => Ok(only.path.clone()),
            [] => anyhow::bail!("Could not determine engine path. Specify --engine-path"),
            _ => anyhow::bail!(
                "Multiple Unreal Engine installations found; specify --engine-path: {}",
                installations
                    .iter()
                    .map(|item| item.path.display().to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
        }
    }

    fn normalize_platforms(requested: &[String]) -> Result<Vec<String>> {
        let raw = if requested.is_empty() {
            vec![platform::host_target_platform().to_string()]
        } else {
            requested.to_vec()
        };
        let mut result = Vec::new();
        for value in raw {
            for platform in value.split(',') {
                let platform = platform.trim();
                if platform.is_empty() || platform.contains('+') {
                    anyhow::bail!("Invalid target platform value: {value}");
                }
                if !result
                    .iter()
                    .any(|item: &String| item.eq_ignore_ascii_case(platform))
                {
                    result.push(platform.to_string());
                }
            }
        }
        Ok(result)
    }

    fn resolve_output(
        plugin: &Path,
        plugin_name: &str,
        requested: Option<&str>,
    ) -> Result<PathBuf> {
        let raw = if let Some(requested) = requested {
            PathBuf::from(requested)
        } else {
            plugin
                .parent()
                .and_then(Path::parent)
                .context("Plugin directory has no parent")?
                .join("Dist")
                .join(plugin_name)
        };
        Self::normalized_absolute(&raw)
    }

    fn validate_output_path(
        output: &Path,
        plugin: &Path,
        project: Option<&Path>,
        engine: &Path,
        plugin_name: &str,
    ) -> Result<()> {
        if output.is_file() {
            anyhow::bail!("Plugin output path is a file: {}", output.display());
        }
        let plugin_dir = plugin.parent().context("Plugin descriptor has no parent")?;
        let cwd = Self::normalized_absolute(&std::env::current_dir()?)?;
        let workspace = Self::find_workspace_root(&cwd);
        let project_dir = project.and_then(Path::parent);
        let unsafe_path = output == cwd
            || workspace.as_deref().is_some_and(|root| output == root)
            || output.parent().is_none()
            || plugin.starts_with(output)
            || output.starts_with(plugin_dir)
            || engine.starts_with(output)
            || output.starts_with(engine)
            || project_dir.is_some_and(|dir| dir.starts_with(output));
        if unsafe_path {
            anyhow::bail!("Unsafe plugin output directory: {}", output.display());
        }
        Self::validate_existing_output(output, plugin_name)
    }

    fn resolve_dependencies(
        plugin: &Path,
        project: Option<&Path>,
        engine: &Path,
        platforms: &[String],
        explicit: &[PathBuf],
    ) -> Result<Vec<PathBuf>> {
        let engine_plugins = engine.join("Engine").join("Plugins");
        let descriptor = Self::read_descriptor(plugin)?;
        let has_declared_dependencies = descriptor
            .plugins
            .iter()
            .any(|reference| reference.applies_to(platforms));
        if !has_declared_dependencies && explicit.is_empty() {
            return Ok(Vec::new());
        }
        let mut roots = Vec::new();
        if let Some(parent) = plugin.parent().and_then(Path::parent) {
            roots.push(parent.to_path_buf());
        }
        if let Some(project_dir) = project.and_then(Path::parent) {
            let root = project_dir.join("Plugins");
            if !roots.contains(&root) {
                roots.push(root);
            }
        }
        if !roots.contains(&engine_plugins) {
            roots.push(engine_plugins.clone());
        }

        let mut indexes = Vec::new();
        for root in &roots {
            indexes.push(Self::index_plugins(root)?);
        }
        let explicit_index = Self::index_explicit_dependencies(explicit)?;
        let mut resolved = Vec::new();
        let mut visited = HashSet::new();
        let mut stack = Vec::new();
        Self::visit_dependencies(
            plugin,
            platforms,
            &indexes,
            &explicit_index,
            &engine_plugins,
            &mut visited,
            &mut stack,
            &mut resolved,
        )?;
        for path in explicit {
            if !path.starts_with(&engine_plugins) && !resolved.contains(path) {
                resolved.push(path.clone());
            }
        }
        Ok(resolved)
    }

    fn visit_dependencies(
        plugin: &Path,
        platforms: &[String],
        indexes: &[HashMap<String, Vec<PathBuf>>],
        explicit: &HashMap<String, PathBuf>,
        engine_plugins: &Path,
        visited: &mut HashSet<PathBuf>,
        stack: &mut Vec<(String, PathBuf)>,
        resolved: &mut Vec<PathBuf>,
    ) -> Result<()> {
        let plugin = Self::without_verbatim_prefix(plugin.canonicalize()?);
        let name = Self::plugin_name(&plugin)?;
        if let Some(position) = stack.iter().position(|(_, path)| path == &plugin) {
            let mut chain = stack[position..]
                .iter()
                .map(|(name, _)| name.clone())
                .collect::<Vec<_>>();
            chain.push(name);
            anyhow::bail!(
                "Circular plugin dependency detected: {}",
                chain.join(" -> ")
            );
        }
        if !visited.insert(plugin.clone()) {
            return Ok(());
        }
        stack.push((name, plugin.clone()));
        let descriptor = Self::read_descriptor(&plugin)?;
        for reference in descriptor
            .plugins
            .iter()
            .filter(|reference| reference.applies_to(platforms))
        {
            let dependency = Self::find_dependency(&reference.name, indexes, explicit)?;
            let Some(dependency) = dependency else {
                if reference.optional {
                    Logger::warning(&format!(
                        "Optional plugin dependency not found: {}",
                        reference.name
                    ));
                    continue;
                }
                let chain = stack
                    .iter()
                    .map(|(name, _)| name.clone())
                    .chain(std::iter::once(reference.name.clone()))
                    .collect::<Vec<_>>();
                anyhow::bail!(
                    "Required plugin dependency not found: {}",
                    chain.join(" -> ")
                );
            };
            Self::visit_dependencies(
                &dependency,
                platforms,
                indexes,
                explicit,
                engine_plugins,
                visited,
                stack,
                resolved,
            )?;
            if !dependency.starts_with(engine_plugins) && !resolved.contains(&dependency) {
                resolved.push(dependency);
            }
        }
        stack.pop();
        Ok(())
    }

    fn find_dependency(
        name: &str,
        indexes: &[HashMap<String, Vec<PathBuf>>],
        explicit: &HashMap<String, PathBuf>,
    ) -> Result<Option<PathBuf>> {
        for index in indexes {
            if let Some(matches) = index.get(&name.to_ascii_lowercase()) {
                return match matches.as_slice() {
                    [only] => Ok(Some(only.clone())),
                    _ => anyhow::bail!(
                        "Ambiguous plugin dependency {name}: {}",
                        matches
                            .iter()
                            .map(|path| path.display().to_string())
                            .collect::<Vec<_>>()
                            .join(", ")
                    ),
                };
            }
        }
        Ok(explicit.get(&name.to_ascii_lowercase()).cloned())
    }

    fn index_plugins(root: &Path) -> Result<HashMap<String, Vec<PathBuf>>> {
        let mut index = HashMap::new();
        if root.is_dir() {
            Self::scan_plugins(root, &mut index)?;
        }
        Ok(index)
    }

    fn scan_plugins(dir: &Path, index: &mut HashMap<String, Vec<PathBuf>>) -> Result<()> {
        let entries = fs::read_dir(dir)
            .with_context(|| format!("Failed to scan {}", dir.display()))?
            .collect::<std::io::Result<Vec<_>>>()?;
        let mut found_descriptor = false;
        for entry in &entries {
            let path = entry.path();
            if entry.file_type()?.is_file() && Self::has_extension(&path, "uplugin") {
                found_descriptor = true;
                let name = Self::plugin_name(&path)?.to_ascii_lowercase();
                index
                    .entry(name)
                    .or_default()
                    .push(Self::without_verbatim_prefix(path.canonicalize()?));
            }
        }
        if found_descriptor {
            return Ok(());
        }
        for entry in entries {
            if entry.file_type()?.is_dir() {
                let path = entry.path();
                let excluded =
                    path.file_name()
                        .and_then(|name| name.to_str())
                        .is_some_and(|name| {
                            EXCLUDED_SEARCH_DIRS
                                .iter()
                                .any(|excluded| name.eq_ignore_ascii_case(excluded))
                        });
                if !excluded {
                    Self::scan_plugins(&path, index)?;
                }
            }
        }
        Ok(())
    }

    fn validate_uat_args(args: &[String]) -> Result<()> {
        for arg in args {
            let key = uat_arg_key(arg);
            if matches!(
                key.as_str(),
                "plugin" | "package" | "enginedir" | "targetplatforms"
            ) {
                anyhow::bail!("UAT argument conflicts with ubuild plugin: {arg}");
            }
        }
        Ok(())
    }

    fn explicit_dependencies(args: &[String]) -> Result<Vec<PathBuf>> {
        args.iter()
            .filter(|arg| uat_arg_key(arg) == "dependencies")
            .map(|arg| {
                let (_, value) = arg
                    .split_once('=')
                    .context("-Dependencies requires a path value")?;
                let path = PathBuf::from(value);
                if !path.is_file() || !Self::has_extension(&path, "uplugin") {
                    anyhow::bail!("Dependency plugin not found: {}", path.display());
                }
                let canonical = path
                    .canonicalize()
                    .with_context(|| format!("Failed to resolve {}", path.display()))?;
                Ok(Self::without_verbatim_prefix(canonical))
            })
            .collect()
    }

    fn index_explicit_dependencies(paths: &[PathBuf]) -> Result<HashMap<String, PathBuf>> {
        let mut index: HashMap<String, PathBuf> = HashMap::new();
        for path in paths {
            let name = Self::plugin_name(path)?.to_ascii_lowercase();
            if let Some(existing) = index.get(&name) {
                if existing != path {
                    anyhow::bail!(
                        "Ambiguous explicit plugin dependency {name}: {}, {}",
                        existing.display(),
                        path.display()
                    );
                }
            } else {
                index.insert(name, path.clone());
            }
        }
        Ok(index)
    }

    fn build_args(
        plugin: &Path,
        package: &Path,
        platforms: &[String],
        dependencies: &[PathBuf],
        engine: &Path,
        uat_args: &[String],
    ) -> Vec<String> {
        let mut args = vec![
            "BuildPlugin".to_string(),
            format!("-Plugin={}", plugin.display()),
            format!("-Package={}", package.display()),
            format!("-TargetPlatforms={}", platforms.join("+")),
            format!("-EngineDir={}", engine.display()),
        ];
        args.extend(
            dependencies
                .iter()
                .map(|path| format!("-Dependencies={}", path.display())),
        );
        args.extend(
            uat_args
                .iter()
                .filter(|arg| uat_arg_key(arg) != "dependencies")
                .cloned(),
        );
        args
    }

    fn validate_package(package: &Path, plugin_name: &str) -> Result<()> {
        if !package.is_dir() {
            anyhow::bail!(
                "UAT succeeded, but plugin package was not created: {}",
                package.display()
            );
        }
        let descriptors = Self::direct_descriptors(package, "uplugin")?;
        if descriptors.len() != 1 || Self::plugin_name(&descriptors[0])? != plugin_name {
            anyhow::bail!("Packaged plugin descriptor does not match {plugin_name}");
        }
        let descriptor = Self::read_descriptor(&descriptors[0])?;
        if !descriptor.modules.is_empty() && !package.join("Binaries").is_dir() {
            anyhow::bail!("Packaged code plugin has no Binaries directory");
        }
        Ok(())
    }

    fn validate_existing_output(output: &Path, plugin_name: &str) -> Result<()> {
        if !output.is_dir() {
            return Ok(());
        }
        let mut entries = fs::read_dir(output)
            .with_context(|| format!("Failed to inspect {}", output.display()))?;
        if entries.next().transpose()?.is_none() {
            return Ok(());
        }
        let descriptors = Self::direct_descriptors(output, "uplugin")?;
        if descriptors.len() != 1 || Self::plugin_name(&descriptors[0])? != plugin_name {
            anyhow::bail!(
                "Existing output is not a package for {plugin_name}; refusing to clear {}",
                output.display()
            );
        }
        Ok(())
    }

    fn replace_output(staging: &Path, output: &Path) -> Result<()> {
        let parent = output.parent().context("Output directory has no parent")?;
        fs::create_dir_all(parent)?;
        let name = output
            .file_name()
            .and_then(|name| name.to_str())
            .context("Invalid output directory name")?;
        let nonce = Self::nonce()?;
        let backup = parent.join(format!(
            ".{name}.ubuild-backup-{}-{nonce}",
            std::process::id()
        ));
        if output.exists() {
            fs::rename(output, &backup)
                .with_context(|| format!("Failed to preserve old package {}", output.display()))?;
        }
        if let Err(error) = fs::rename(staging, output) {
            if backup.exists() {
                if let Err(rollback_error) = fs::rename(&backup, output) {
                    anyhow::bail!(
                        "Failed to install staged package: {error}. Rollback also failed: \
                         {rollback_error}. Previous package remains at {} and staging remains at {}",
                        backup.display(),
                        staging.display()
                    );
                }
            }
            return Err(error).context("Failed to move staged plugin package into place");
        }
        if backup.exists() {
            if let Err(error) = fs::remove_dir_all(&backup) {
                Logger::warning(&format!(
                    "Plugin was packaged, but the old package backup could not be removed at {}: {error}",
                    backup.display()
                ));
            }
        }
        Ok(())
    }

    fn staging_path(output: &Path) -> Result<PathBuf> {
        let parent = output.parent().context("Output directory has no parent")?;
        let name = output
            .file_name()
            .and_then(|name| name.to_str())
            .context("Invalid output directory name")?;
        let nonce = Self::nonce()?;
        Ok(parent.join(format!(
            ".{name}.ubuild-staging-{}-{nonce}",
            std::process::id()
        )))
    }

    fn remove_staging(path: &Path) {
        if path.is_dir() {
            if let Err(error) = fs::remove_dir_all(path) {
                Logger::warning(&format!(
                    "Failed to remove staging directory {}: {error}",
                    path.display()
                ));
            }
        }
    }

    fn nonce() -> Result<u128> {
        Ok(SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis())
    }

    fn find_owning_engine(plugin: &Path) -> Option<PathBuf> {
        for ancestor in plugin.ancestors() {
            if ancestor
                .file_name()
                .is_some_and(|name| name.eq_ignore_ascii_case("Plugins"))
            {
                let engine_dir = ancestor.parent()?;
                if engine_dir
                    .file_name()
                    .is_some_and(|name| name.eq_ignore_ascii_case("Engine"))
                {
                    return engine_dir.parent().map(Path::to_path_buf);
                }
            }
        }
        None
    }

    fn find_owning_project(plugin: &Path) -> Result<Option<PathBuf>> {
        for plugins_dir in plugin.ancestors().skip(1).filter(|ancestor| {
            ancestor
                .file_name()
                .is_some_and(|name| name.eq_ignore_ascii_case("Plugins"))
        }) {
            let Some(project_dir) = plugins_dir.parent() else {
                continue;
            };
            let files = Self::direct_descriptors(project_dir, "uproject")?;
            match files.as_slice() {
                [] => {}
                [only] => return Ok(Some(only.clone())),
                _ => anyhow::bail!(
                    "Multiple .uproject files found in {}",
                    project_dir.display()
                ),
            }
        }
        Ok(None)
    }

    fn direct_descriptors(dir: &Path, extension: &str) -> Result<Vec<PathBuf>> {
        let mut result = fs::read_dir(dir)?
            .collect::<std::io::Result<Vec<_>>>()?
            .into_iter()
            .map(|entry| entry.path())
            .filter(|path| path.is_file() && Self::has_extension(path, extension))
            .collect::<Vec<_>>();
        result.sort();
        Ok(result)
    }

    fn read_descriptor(path: &Path) -> Result<PluginDescriptor> {
        let content = fs::read_to_string(path)
            .with_context(|| format!("Failed to read {}", path.display()))?;
        serde_json::from_str(&content)
            .with_context(|| format!("Failed to parse {}", path.display()))
    }

    fn plugin_name(path: &Path) -> Result<String> {
        path.file_stem()
            .and_then(|name| name.to_str())
            .map(str::to_string)
            .context("Invalid plugin descriptor filename")
    }

    fn has_extension(path: &Path, extension: &str) -> bool {
        path.extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case(extension))
    }

    fn normalized_absolute(path: &Path) -> Result<PathBuf> {
        let absolute = if path.is_absolute() {
            path.to_path_buf()
        } else {
            std::env::current_dir()?.join(path)
        };
        let mut normalized = PathBuf::new();
        for component in absolute.components() {
            match component {
                std::path::Component::CurDir => {}
                std::path::Component::ParentDir => {
                    normalized.pop();
                }
                _ => normalized.push(component.as_os_str()),
            }
        }
        for ancestor in normalized.ancestors() {
            if ancestor.exists() {
                let canonical = Self::without_verbatim_prefix(ancestor.canonicalize()?);
                let suffix = normalized.strip_prefix(ancestor)?;
                return Ok(canonical.join(suffix));
            }
        }
        Ok(normalized)
    }

    fn find_workspace_root(start: &Path) -> Option<PathBuf> {
        start
            .ancestors()
            .find(|path| path.join(".git").exists())
            .map(Path::to_path_buf)
    }

    fn without_verbatim_prefix(path: PathBuf) -> PathBuf {
        if !platform::is_windows() {
            return path;
        }
        let value = path.to_string_lossy();
        if let Some(rest) = value.strip_prefix(r"\\?\UNC\") {
            return PathBuf::from(format!(r"\\{rest}"));
        }
        value
            .strip_prefix(r"\\?\")
            .map_or_else(|| path.clone(), PathBuf::from)
    }
}

impl PluginReference {
    fn applies_to(&self, platforms: &[String]) -> bool {
        if !self.enabled {
            return false;
        }
        let platform_allowed = self.platform_allow_list.is_empty()
            || platforms
                .iter()
                .any(|platform| Self::contains(&self.platform_allow_list, platform));
        let platform_denied = platforms
            .iter()
            .all(|platform| Self::contains(&self.platform_deny_list, platform));
        let relevant_targets = ["Editor", "Game", "Client", "Server"];
        let target_allowed = self.target_allow_list.is_empty()
            || relevant_targets
                .iter()
                .any(|target| Self::contains(&self.target_allow_list, target));
        let target_denied = relevant_targets
            .iter()
            .all(|target| Self::contains(&self.target_deny_list, target));
        platform_allowed && !platform_denied && target_allowed && !target_denied
    }

    fn contains(values: &[String], expected: &str) -> bool {
        values
            .iter()
            .any(|value| value.eq_ignore_ascii_case(expected))
    }
}

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};

    use super::{PluginBuilder, PluginReference};

    #[test]
    fn defaults_to_host_platform() {
        assert_eq!(
            PluginBuilder::normalize_platforms(&[]).expect("platforms should resolve"),
            vec![crate::platform::host_target_platform().to_string()]
        );
    }

    #[test]
    fn rejects_core_uat_argument_conflicts() {
        let error = PluginBuilder::validate_uat_args(&["-Package=out".to_string()])
            .expect_err("Package must conflict");
        assert!(error.to_string().contains("conflicts"));
    }

    #[test]
    fn filters_platform_specific_dependency() {
        let reference = PluginReference {
            name: "AndroidOnly".to_string(),
            enabled: true,
            optional: false,
            platform_allow_list: vec!["Android".to_string()],
            platform_deny_list: Vec::new(),
            target_allow_list: Vec::new(),
            target_deny_list: Vec::new(),
        };
        assert!(!reference.applies_to(&["Win64".to_string()]));
        assert!(reference.applies_to(&["Android".to_string()]));
    }

    #[test]
    fn normalizes_parent_components_in_output_paths() {
        let cwd = std::env::current_dir().expect("cwd should resolve");
        let normalized = PluginBuilder::normalized_absolute(Path::new("one/../two"))
            .expect("path should normalize");
        assert_eq!(normalized, cwd.join("two"));
    }

    #[test]
    fn rejects_ambiguous_explicit_dependencies() {
        let paths = [
            PathBuf::from("first/Common.uplugin"),
            PathBuf::from("second/Common.uplugin"),
        ];
        let error = PluginBuilder::index_explicit_dependencies(&paths)
            .expect_err("duplicate names should be ambiguous");
        assert!(error.to_string().contains("Ambiguous"));
    }
}
