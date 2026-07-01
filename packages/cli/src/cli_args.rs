//! CLI argument helpers shared across protocol modules.
//!
//! Pure functions that operate on raw `&[String]` args or `clap::ArgMatches`
//! and have no protocol-specific dependencies.

use std::io::{IsTerminal, Read};

use crate::error::CliError;

/// True for `--version`, `-V`, or the bare `version` subcommand.
pub fn is_version_flag(arg: &str) -> bool {
    matches!(arg, "--version" | "-V" | "version")
}

/// Resolve the API base URL override from the `--base-url` flag and the
/// `{NAME}_BASE_URL` env var (flag wins). Validates the flag value for
/// dangerous characters; the env var is treated as trusted.
pub fn resolve_base_url_override(
    matches: &clap::ArgMatches,
    app_name: &str,
) -> Result<Option<String>, CliError> {
    let base_url_flag = matches.get_one::<String>("base-url").cloned();
    if let Some(ref url) = base_url_flag {
        crate::output::reject_dangerous_chars(url, "--base-url")?;
    }
    let env_var_name = format!("{}_BASE_URL", app_name.to_uppercase().replace('-', "_"));
    let base_url_env_var = std::env::var(env_var_name).ok();
    Ok(base_url_flag.or(base_url_env_var))
}

/// True when raw args contain the `--schema` flag.
///
/// `--schema` is the agent-facing machine-readable counterpart to `--help`:
/// wherever a user could type `--help` for prose, they can type `--schema` for
/// the same scope rendered as JSON. The flag is sniffed pre-clap because
/// clap would otherwise demand required args for the matched leaf
/// subcommand before our intercept runs.
pub fn wants_schema(args: &[String]) -> bool {
    args.iter().any(|a| a == "--schema")
}

/// True when raw args contain the `--spec` flag.
///
/// `--spec` emits the effective OpenAPI spec (source + overlays + overrides
/// merged) to stdout. Sniffed pre-clap like `--schema` so that required-arg
/// validation does not block root-only flags.
pub fn wants_spec(args: &[String]) -> bool {
    args.iter().any(|a| a == "--spec")
}

/// True when raw args contain the `--spec-raw` flag.
///
/// `--spec-raw` emits the byte-exact embedded source spec(s) to stdout,
/// before any overlay or override processing. Sniffed pre-clap like
/// `--schema`.
pub fn wants_spec_raw(args: &[String]) -> bool {
    args.iter().any(|a| a == "--spec-raw")
}

/// Extracts the subcommand path from raw args — non-flag tokens after the
/// binary name, skipping over global flag+value pairs wherever they appear.
///
/// `["box", "users", "get", "--schema"]` → `["users", "get"]`
/// `["box", "--schema"]` → `[]`
/// `["box", "--base-url", "http://...", "users", "get"]` → `["users", "get"]`
/// `["box", "users", "get", "--user-id", "X", "--schema"]` → `["users", "get"]`
pub fn extract_subcommand_path(args: &[String]) -> Vec<String> {
    // Boolean (no-value) global flags. The token immediately after one of
    // these is NOT consumed as a value — it may be a subcommand name.
    const BOOL_FLAGS: &[&str] = &["--schema", "--spec", "--spec-raw", "--debug", "--version", "-V", "--help", "-h"];

    let mut path = Vec::new();
    let mut iter = args.iter().skip(1).peekable(); // skip binary name

    while let Some(arg) = iter.next() {
        if !arg.starts_with('-') {
            path.push(arg.clone());
        } else if arg.contains('=') {
            // --flag=value: value is embedded, nothing extra to consume.
        } else if !BOOL_FLAGS.contains(&arg.as_str()) {
            // Value-taking flag: skip the immediately following token if it
            // doesn't look like a flag itself (it's the flag's value).
            if iter.peek().map(|a| !a.starts_with('-')).unwrap_or(false) {
                iter.next();
            }
        }
        // Boolean flags: consumed above; the next token is NOT their value.
    }

    path
}

/// True when the user invoked the bare `errors` subcommand.
///
/// Matches only the exact two-argument form (`<binary> errors`) plus a
/// trailing `--format`/`-h`/`--help` global flag — keeping the surface
/// narrow so future user specs that define an `errors` group with
/// nested operations (e.g. `cli errors list`) are not silently
/// hijacked. The check happens before clap parses, so spec-driven
/// subcommands continue to dispatch normally.
///
/// Format values (`json`, `yaml`, `table`, `csv`) are recognized only
/// immediately after `--format` (space-separated) or in the
/// `--format=<value>` equals form. A bare `cli errors json` is NOT
/// intercepted — it falls through to clap so a user resource named
/// `json` remains reachable.
pub fn is_errors_subcommand(args: &[String]) -> bool {
    if args.get(1).map(|s| s.as_str()) != Some("errors") {
        return false;
    }
    // Allow only globally-recognized flags after the `errors` token so
    // an `errors`-named API resource with positional subcommands like
    // `errors list` is not hijacked. `--format`/`-h`/`--help` are the
    // only flags this command honors (see `print_errors_table`); any
    // other token defers to clap, which will return an "unrecognized
    // subcommand" error or dispatch the user's resource as expected.
    //
    // Format values (json/yaml/table/csv) are accepted only when the
    // previous token was `--format`; bare positional tokens like
    // `cli errors json` fall through to clap.
    let tail: Vec<&str> = args.iter().skip(2).map(|s| s.as_str()).collect();
    let mut i = 0;
    while i < tail.len() {
        let tok = tail[i];
        if tok == "--help" || tok == "-h" {
            i += 1;
        } else if tok == "--format" {
            // Consume `--format` and its value (if present).
            if let Some(next) = tail.get(i + 1) {
                if is_format_value(next) {
                    i += 2;
                } else {
                    // `--format` followed by an unrecognized value —
                    // not the errors subcommand.
                    return false;
                }
            } else {
                // Trailing `--format` with no value — still recognized
                // (print_errors falls back to the table format).
                i += 1;
            }
        } else if let Some(rest) = tok.strip_prefix("--format=") {
            if rest.is_empty() || is_format_value(rest) {
                i += 1;
            } else {
                // `--format=banana` — unrecognized value; not the errors
                // subcommand.
                return false;
            }
        } else {
            // Unknown positional or flag → user resource; defer to clap.
            return false;
        }
    }
    true
}

/// Returns true for known `--format` values recognized by the `errors`
/// subcommand.
fn is_format_value(s: &str) -> bool {
    s.eq_ignore_ascii_case("json")
        || s.eq_ignore_ascii_case("yaml")
        || s.eq_ignore_ascii_case("table")
        || s.eq_ignore_ascii_case("csv")
        || s.eq_ignore_ascii_case("raw")
        || s.eq_ignore_ascii_case("jsonl")
        || s.eq_ignore_ascii_case("ndjson")
}

/// Read stdin to a string. Returns `Err` if stdin is a TTY or empty.
pub fn read_stdin_to_string() -> Result<String, CliError> {
    if std::io::stdin().is_terminal() {
        return Err(CliError::Validation(
            "stdin is a terminal; pipe data or redirect a file \
             (e.g. `cat data.json | cli cmd --json -`)"
                .to_string(),
        ));
    }
    let mut buf = String::new();
    std::io::stdin()
        .read_to_string(&mut buf)
        .map_err(|e| CliError::Validation(format!("failed to read stdin: {e}")))?;
    if buf.trim().is_empty() {
        return Err(CliError::Validation(
            "stdin was empty; `--json -` expects a JSON body to be piped on stdin"
                .to_string(),
        ));
    }
    Ok(buf)
}

/// Resolve `--json` flag: `-` reads from stdin, else returns the literal.
pub fn resolve_body_json(
    matched_args: &clap::ArgMatches,
) -> Result<Option<String>, CliError> {
    let raw = matched_args
        .try_get_one::<String>("json")
        .ok()
        .flatten();
    match raw {
        Some(s) if s == "-" => read_stdin_to_string().map(Some),
        Some(s) => Ok(Some(s.clone())),
        None => Ok(None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(slice: &[&str]) -> Vec<String> {
        slice.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn test_is_version_flag() {
        assert!(is_version_flag("--version"));
        assert!(is_version_flag("-V"));
        assert!(is_version_flag("version"));
        assert!(!is_version_flag("--ver"));
    }

    #[test]
    fn test_wants_schema_present() {
        assert!(wants_schema(&args(&["cli", "--schema"])));
        assert!(wants_schema(&args(&["cli", "users", "--schema"])));
        assert!(wants_schema(&args(&["cli", "users", "get", "--user-id", "X", "--schema"])));
    }

    #[test]
    fn test_wants_schema_absent() {
        assert!(!wants_schema(&args(&["cli"])));
        assert!(!wants_schema(&args(&["cli", "users", "--help"])));
        assert!(!wants_schema(&args(&["cli", "--specification"])));
    }

    #[test]
    fn test_wants_spec_present() {
        assert!(wants_spec(&args(&["cli", "--spec"])));
        assert!(wants_spec(&args(&["cli", "users", "--spec"])));
        assert!(wants_spec(&args(&["cli", "users", "get", "--user-id", "X", "--spec"])));
    }

    #[test]
    fn test_wants_spec_absent() {
        assert!(!wants_spec(&args(&["cli"])));
        assert!(!wants_spec(&args(&["cli", "users", "--help"])));
        assert!(!wants_spec(&args(&["cli", "--specification"])));
        assert!(!wants_spec(&args(&["cli", "--spec-raw"])));
    }

    #[test]
    fn test_wants_spec_raw_present() {
        assert!(wants_spec_raw(&args(&["cli", "--spec-raw"])));
        assert!(wants_spec_raw(&args(&["cli", "users", "--spec-raw"])));
        assert!(wants_spec_raw(&args(&["cli", "users", "get", "--user-id", "X", "--spec-raw"])));
    }

    #[test]
    fn test_wants_spec_raw_absent() {
        assert!(!wants_spec_raw(&args(&["cli"])));
        assert!(!wants_spec_raw(&args(&["cli", "users", "--help"])));
        assert!(!wants_spec_raw(&args(&["cli", "--spec"])));
    }

    #[test]
    fn test_extract_subcommand_path_root() {
        assert_eq!(
            extract_subcommand_path(&args(&["cli", "--schema"])),
            Vec::<String>::new(),
        );
    }

    #[test]
    fn test_extract_subcommand_path_one_segment() {
        assert_eq!(
            extract_subcommand_path(&args(&["cli", "users", "--schema"])),
            vec!["users"],
        );
    }

    #[test]
    fn test_extract_subcommand_path_multi_segment() {
        assert_eq!(
            extract_subcommand_path(&args(&["cli", "users", "get", "--schema"])),
            vec!["users", "get"],
        );
    }

    #[test]
    fn test_extract_subcommand_path_stops_at_first_flag() {
        // Flags that appear after the subcommand tokens do not end up in the
        // path. Value-taking flags consume their following argument too.
        assert_eq!(
            extract_subcommand_path(&args(&["cli", "users", "get", "--user-id", "X", "--schema"])),
            vec!["users", "get"],
        );
    }

    #[test]
    fn test_extract_subcommand_path_skips_global_value_flag_before_subcommand() {
        // A value-taking global flag (--base-url <url>) before the subcommand
        // names must not swallow them.
        assert_eq!(
            extract_subcommand_path(&args(&["cli", "--base-url", "http://mock:9999", "users", "get"])),
            vec!["users", "get"],
        );
    }

    #[test]
    fn test_extract_subcommand_path_skips_bool_flag_before_subcommand() {
        // Boolean global flags (--debug) before the subcommand names must not
        // consume the following subcommand token as their value.
        assert_eq!(
            extract_subcommand_path(&args(&["cli", "--debug", "users", "get"])),
            vec!["users", "get"],
        );
    }

    #[test]
    fn test_extract_subcommand_path_embedded_value_flag() {
        // --flag=value form: the `=` embeds the value; nothing extra consumed.
        assert_eq!(
            extract_subcommand_path(&args(&["cli", "--base-url=http://mock:9999", "users", "get"])),
            vec!["users", "get"],
        );
    }

    #[test]
    fn test_is_errors_subcommand_positive() {
        assert!(is_errors_subcommand(&args(&["cli", "errors"])));
    }

    #[test]
    fn test_is_errors_subcommand_negative() {
        assert!(!is_errors_subcommand(&args(&["cli", "get"])));
        assert!(!is_errors_subcommand(&args(&["cli"])));
    }

    #[test]
    fn test_is_errors_subcommand_does_not_hijack_nested_resource() {
        // If a user spec defines an `errors` resource with operations,
        // `cli errors list` must defer to clap rather than print the
        // exit codes table.
        assert!(!is_errors_subcommand(&args(&["cli", "errors", "list"])));
        assert!(!is_errors_subcommand(&args(&["cli", "errors", "get", "123"])));
    }

    #[test]
    fn test_is_errors_subcommand_allows_help_and_format_flags() {
        assert!(is_errors_subcommand(&args(&["cli", "errors", "--help"])));
        assert!(is_errors_subcommand(&args(&["cli", "errors", "-h"])));
        assert!(is_errors_subcommand(&args(&["cli", "errors", "--format", "json"])));
        assert!(is_errors_subcommand(&args(&["cli", "errors", "--format=json"])));
    }

    #[test]
    fn test_is_errors_subcommand_rejects_unknown_flags() {
        // Unknown flags after `errors` mean the user is targeting a
        // spec-defined `errors` resource — defer to clap.
        assert!(!is_errors_subcommand(&args(&["cli", "errors", "--json", "{}"])));
        assert!(!is_errors_subcommand(&args(&["cli", "errors", "--page-all"])));
    }

    #[test]
    fn test_is_errors_subcommand_empty_args() {
        assert!(!is_errors_subcommand(&args(&[])));
    }

    #[test]
    fn test_is_errors_subcommand_bare_format_name_not_hijacked() {
        // A bare `cli errors json` must NOT be intercepted — it should
        // fall through to clap so a user resource named `json` is
        // reachable.
        assert!(!is_errors_subcommand(&args(&["cli", "errors", "json"])));
        assert!(!is_errors_subcommand(&args(&["cli", "errors", "yaml"])));
        assert!(!is_errors_subcommand(&args(&["cli", "errors", "table"])));
        assert!(!is_errors_subcommand(&args(&["cli", "errors", "csv"])));
    }

    #[test]
    fn test_is_errors_subcommand_format_space_separated() {
        // `--format json` (space-separated) must be recognized.
        assert!(is_errors_subcommand(&args(&["cli", "errors", "--format", "json"])));
        assert!(is_errors_subcommand(&args(&["cli", "errors", "--format", "yaml"])));
        assert!(is_errors_subcommand(&args(&["cli", "errors", "--format", "table"])));
        assert!(is_errors_subcommand(&args(&["cli", "errors", "--format", "csv"])));
    }

    #[test]
    fn test_is_errors_subcommand_format_equals() {
        // `--format=json` (equals form) must be recognized.
        assert!(is_errors_subcommand(&args(&["cli", "errors", "--format=json"])));
        assert!(is_errors_subcommand(&args(&["cli", "errors", "--format=yaml"])));
    }

    #[test]
    fn test_is_errors_subcommand_default_no_format() {
        // Plain `cli errors` with no format flag is still recognized.
        assert!(is_errors_subcommand(&args(&["cli", "errors"])));
    }
}
