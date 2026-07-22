use crate::types::{ResolvedTarget, BUILD_TARGETS};
use crate::utils::version::infer_target_type;

pub struct TargetResolver;

impl TargetResolver {
    /// Resolve a generic target name (e.g. "Editor") to a project-specific
    /// target name (e.g. "MyProjectEditor") using the available targets list.
    pub fn resolve_from_list(target: &str, available: &[ResolvedTarget]) -> String {
        if available.is_empty() {
            return target.to_string();
        }

        if Self::is_generic(target) {
            // Find a target whose type matches the generic name
            if let Some(matched) = available.iter().find(|t| t.target_type == target) {
                return matched.name.clone();
            }
            // Fallback: find target whose name contains the generic name
            let lower = target.to_lowercase();
            if let Some(matched) = available
                .iter()
                .find(|t| t.name.to_lowercase().contains(&lower))
            {
                return matched.name.clone();
            }
        } else {
            // Check if the specific name exists
            if available.iter().any(|t| t.name == target) {
                return target.to_string();
            }
        }

        target.to_string()
    }

    pub fn is_generic(target: &str) -> bool {
        BUILD_TARGETS.contains(&target)
    }

    /// Find available targets from .Target.cs files in the project source.
    pub fn find_available_targets(project_path: &std::path::Path) -> Vec<ResolvedTarget> {
        let project_dir = if project_path.extension().is_some_and(|e| e == "uproject") {
            project_path.parent().unwrap_or(project_path).to_path_buf()
        } else {
            project_path.to_path_buf()
        };

        let source_dir = project_dir.join("Source");
        if !source_dir.is_dir() {
            return Vec::new();
        }

        let pattern = format!("{}/*.Target.cs", source_dir.display());
        glob::glob(&pattern)
            .into_iter()
            .flatten()
            .filter_map(Result::ok)
            .filter_map(|p| {
                let stem = p.file_stem()?.to_string_lossy().to_string();
                let name = stem.strip_suffix(".Target")?;
                let target_type = std::fs::read_to_string(&p)
                    .ok()
                    .and_then(|content| Self::target_type_from_source(&content))
                    .unwrap_or_else(|| infer_target_type(name).to_string());
                Some(ResolvedTarget {
                    name: name.to_string(),
                    target_type,
                })
            })
            .collect()
    }

    fn target_type_from_source(source: &str) -> Option<String> {
        source.lines().find_map(|line| {
            let code = line.split_once("//").map_or(line, |(code, _)| code);
            let (left, right) = code.split_once('=')?;
            if left.trim() != "Type" {
                return None;
            }
            let target_type = right.trim().strip_prefix("TargetType.")?;
            let target_type =
                target_type.trim_end_matches(|character: char| !character.is_ascii_alphanumeric());
            matches!(target_type, "Game" | "Editor" | "Client" | "Server")
                .then(|| target_type.to_string())
        })
    }
}

#[cfg(test)]
mod tests {
    use super::TargetResolver;

    #[test]
    fn reads_explicit_target_type_from_source() {
        let source = "Type = TargetType.Game;";
        assert_eq!(
            TargetResolver::target_type_from_source(source).as_deref(),
            Some("Game")
        );
    }

    #[test]
    fn does_not_infer_missing_target_type_from_unrelated_text() {
        assert_eq!(TargetResolver::target_type_from_source("TargetRules"), None);
    }

    #[test]
    fn ignores_target_types_in_line_comments() {
        let source = "Type = TargetType.Editor; // TargetType.Game";
        assert_eq!(
            TargetResolver::target_type_from_source(source).as_deref(),
            Some("Editor")
        );
    }
}
