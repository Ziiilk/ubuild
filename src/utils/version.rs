use std::cmp::Ordering;

/// Compare two version strings like "5.3.2" numerically.
pub fn compare_versions(a: &str, b: &str) -> Ordering {
    let parse = |s: &str| -> Vec<u32> {
        s.split(['.', '-'])
            .filter_map(|p| p.parse().ok())
            .collect()
    };
    let va = parse(a);
    let vb = parse(b);

    let max_len = va.len().max(vb.len());
    for i in 0..max_len {
        let pa = va.get(i).copied().unwrap_or(0);
        let pb = vb.get(i).copied().unwrap_or(0);
        match pa.cmp(&pb) {
            Ordering::Equal => {},
            other => return other,
        }
    }
    Ordering::Equal
}

pub fn format_engine_version(major: u32, minor: u32, patch: u32) -> String {
    format!("{major}.{minor}.{patch}")
}

/// Infer the generic target type from a target name.
pub fn infer_target_type(name: &str) -> &'static str {
    let lower = name.to_lowercase();
    if lower.contains("editor") {
        "Editor"
    } else if lower.contains("client") {
        "Client"
    } else if lower.contains("server") {
        "Server"
    } else {
        "Game"
    }
}

pub fn is_generic_target(target: &str) -> bool {
    matches!(target, "Editor" | "Game" | "Client" | "Server")
}

pub fn is_valid_project_name(name: &str) -> bool {
    !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}
