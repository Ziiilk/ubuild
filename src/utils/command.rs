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

pub fn uat_arg_key(arg: &str) -> String {
    arg.trim_start_matches('-')
        .split_once('=')
        .map_or(arg.trim_start_matches('-'), |(key, _)| key)
        .to_ascii_lowercase()
}
