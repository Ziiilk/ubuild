use std::path::Path;

pub fn display_args(args: &[String]) -> String {
    args.iter()
        .map(|arg| {
            if arg.contains(' ') {
                format!("\"{arg}\"")
            } else {
                arg.clone()
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Join an executable path and its args with single spaces, exactly as the
/// process will be executed (no quoting) — used for the normalized header line.
pub fn join_command_line(executable: &Path, args: &[String]) -> String {
    let mut parts = vec![executable.display().to_string()];
    parts.extend(args.iter().cloned());
    parts.join(" ")
}

pub fn uat_arg_key(arg: &str) -> String {
    arg.trim_start_matches('-')
        .split_once('=')
        .map_or(arg.trim_start_matches('-'), |(key, _)| key)
        .to_ascii_lowercase()
}

pub fn append_ubt_target_selection(args: &mut Vec<String>, ubt_args: &[String]) {
    if !ubt_args.iter().any(|arg| {
        let arg = arg.trim();
        if arg.is_empty() {
            return false;
        }
        if !arg.starts_with('-') {
            return true;
        }
        matches!(
            uat_arg_key(arg).as_str(),
            "target" | "targetlist" | "targettype"
        )
    }) {
        args.push("-TargetType=Editor".to_string());
    }
    args.extend(ubt_args.iter().cloned());
}

#[cfg(test)]
mod tests {
    use super::append_ubt_target_selection;

    #[test]
    fn adds_editor_target_type_by_default() {
        let mut args = Vec::new();

        append_ubt_target_selection(&mut args, &[]);

        assert_eq!(args, ["-TargetType=Editor"]);
    }

    #[test]
    fn preserves_explicit_target_type() {
        let mut args = Vec::new();
        let ubt_args = vec!["-targettype=Server".to_string()];

        append_ubt_target_selection(&mut args, &ubt_args);

        assert_eq!(args, ubt_args);
    }

    #[test]
    fn preserves_explicit_target_name() {
        let mut args = Vec::new();
        let ubt_args = vec!["-Target=MyProjectServer".to_string()];

        append_ubt_target_selection(&mut args, &ubt_args);

        assert_eq!(args, ubt_args);
    }

    #[test]
    fn treats_positional_argument_as_target_selection() {
        let mut args = Vec::new();
        let ubt_args = vec!["MyProjectServer".to_string()];

        append_ubt_target_selection(&mut args, &ubt_args);

        assert_eq!(args, ubt_args);
    }
}
