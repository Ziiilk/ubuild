use serde::de::DeserializeOwned;

/// Parse JSON with Unreal Engine's descriptor leniency.
///
/// Unreal tolerates trailing commas in `.uplugin` and `.uproject` files even
/// though they are forbidden by the JSON spec, and several shipping engine
/// descriptors contain them. This helper strips trailing commas (string-aware)
/// before delegating to the strict parser, so descriptors that the editor
/// accepts also parse here.
pub fn from_str_lenient<T>(content: &str) -> serde_json::Result<T>
where
    T: DeserializeOwned,
{
    serde_json::from_str(&strip_trailing_commas(content))
}

fn strip_trailing_commas(input: &str) -> String {
    let chars: Vec<char> = input.chars().collect();
    let mut result = String::with_capacity(input.len());
    let mut in_string = false;
    let mut escaped = false;

    for (index, &ch) in chars.iter().enumerate() {
        if in_string {
            result.push(ch);
            if escaped {
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == '"' {
                in_string = false;
            }
            continue;
        }
        if ch == '"' {
            in_string = true;
            result.push(ch);
            continue;
        }
        if ch == ',' && next_non_whitespace_is_closure(&chars, index + 1) {
            continue;
        }
        result.push(ch);
    }
    result
}

fn next_non_whitespace_is_closure(chars: &[char], start: usize) -> bool {
    chars.get(start..).is_some_and(|rest| {
        rest.iter()
            .find(|ch| !ch.is_whitespace())
            .is_some_and(|ch| *ch == '}' || *ch == ']')
    })
}

#[cfg(test)]
mod tests {
    use serde::Deserialize;

    use super::from_str_lenient;

    #[derive(Debug, Deserialize, PartialEq)]
    struct Sample {
        name: String,
        items: Vec<String>,
        nested: Nested,
    }

    #[derive(Debug, Deserialize, PartialEq)]
    struct Nested {
        value: i32,
    }

    #[test]
    fn parses_valid_json_unchanged() {
        let input = r#"{"name":"a","items":["x","y"],"nested":{"value":7}}"#;
        let parsed: Sample = from_str_lenient(input).expect("valid json parses");
        assert_eq!(parsed.items, vec!["x".to_string(), "y".to_string()]);
    }

    #[test]
    fn tolerates_trailing_comma_in_object() {
        let input = "{\n  \"name\": \"a\",\n  \"items\": [],\n  \"nested\": {\"value\": 7,}\n}";
        let parsed: Sample = from_str_lenient(input).expect("trailing comma tolerated");
        assert_eq!(parsed.nested.value, 7);
    }

    #[test]
    fn tolerates_trailing_comma_in_array() {
        let input = r#"{"name":"a","items":["x","y",],"nested":{"value":1}}"#;
        let parsed: Sample = from_str_lenient(input).expect("array trailing comma tolerated");
        assert_eq!(parsed.items, vec!["x".to_string(), "y".to_string()]);
    }

    #[test]
    fn preserves_commas_inside_strings() {
        let input = r#"{"name":"a,b,]","items":[],"nested":{"value":1}}"#;
        let parsed: Sample = from_str_lenient(input).expect("string commas preserved");
        assert_eq!(parsed.name, "a,b,]");
    }

    #[test]
    fn handles_escaped_quotes_inside_strings() {
        let input = r#"{"name":"he said \"hi\",","items":[],"nested":{"value":1}}"#;
        let parsed: Sample = from_str_lenient(input).expect("escaped quotes handled");
        assert_eq!(parsed.name, r#"he said "hi","#);
    }
}
