//! Shell completion generation.
//!
//! Shared infrastructure for emitting shell completion scripts. Sits above
//! both protocol paths (`openapi/` and `graphql/`) and has no
//! protocol-specific dependencies.

use clap::Command;
use clap_complete::{generate, Shell};

/// Returns `true` when `args` contains `"completion"` as the first
/// positional token (i.e. the subcommand position). This allows early
/// interception before normal API dispatch — avoiding collision with an
/// API resource that might also be named `completion`.
///
/// Skips `--flag value` pairs so `box --base-url completion files` is
/// not mistaken for a completion request (`completion` there is the
/// value of `--base-url`, not a subcommand). Boolean flags like
/// `--dry-run` are recognised and do NOT consume the next token.
pub fn wants_completion(args: &[String]) -> bool {
    crate::early_intercept::first_positional_is(args, "completion")
}

/// Generate a shell completion script for `cmd` and write it to `writer`.
///
/// `bin_name` is the name the user types to invoke the CLI (e.g. `"box"`).
/// The caller is responsible for building a `Command` that mirrors the full
/// CLI surface (subcommands, flags, etc.) so the generated script is complete.
///
/// Returns an IO error if writing fails.
pub fn generate_completion_to(shell: Shell, cmd: &mut Command, bin_name: &str, writer: &mut dyn std::io::Write) -> std::io::Result<()> {
    let mut buf = Vec::new();
    generate(shell, cmd, bin_name, &mut buf);
    writer.write_all(&buf)
}

/// Generate a shell completion script for `cmd` and write it to stdout.
///
/// Thin wrapper around [`generate_completion_to`] that targets `stdout`.
pub fn generate_completion(shell: Shell, cmd: &mut Command, bin_name: &str) -> std::io::Result<()> {
    generate_completion_to(shell, cmd, bin_name, &mut std::io::stdout())
}

/// Parse a shell name string into a [`Shell`] enum variant.
///
/// Matching is case-sensitive, consistent with `clap_complete::Shell`'s
/// `FromStr` implementation and the `value_parser` on
/// [`completion_command`]. Returns `None` for unrecognized values
/// (including case mismatches like `"BASH"`).
pub fn parse_shell(s: &str) -> Option<Shell> {
    match s {
        "bash" => Some(Shell::Bash),
        "zsh" => Some(Shell::Zsh),
        "fish" => Some(Shell::Fish),
        "powershell" => Some(Shell::PowerShell),
        "elvish" => Some(Shell::Elvish),
        _ => None,
    }
}

/// Build the `completion` subcommand definition. Registered at the root
/// of the command tree so `<cli> completion <shell>` works.
pub fn completion_command() -> Command {
    Command::new("completion")
        .about("Generate shell completion scripts")
        .arg_required_else_help(true)
        .after_help(
            "EXAMPLES:\n    \
             # bash\n    \
             <CLI> completion bash > /etc/bash_completion.d/<CLI>\n    \
             # zsh\n    \
             <CLI> completion zsh > \"${fpath[1]}/_<CLI>\"\n    \
             # fish\n    \
             <CLI> completion fish > ~/.config/fish/completions/<CLI>.fish",
        )
        .arg(
            clap::Arg::new("shell")
                .required(true)
                .value_parser(["bash", "zsh", "fish", "powershell", "elvish"])
                .help("Target shell (bash, zsh, fish, powershell, elvish)"),
        )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(slice: &[&str]) -> Vec<String> {
        slice.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn wants_completion_detects_subcommand() {
        assert!(wants_completion(&args(&["box", "completion", "bash"])));
        assert!(wants_completion(&args(&["box", "completion", "zsh"])));
    }

    #[test]
    fn wants_completion_false_for_normal_commands() {
        assert!(!wants_completion(&args(&["box", "files", "get"])));
        assert!(!wants_completion(&args(&["box", "--help"])));
    }

    #[test]
    fn wants_completion_false_when_nested() {
        assert!(!wants_completion(&args(&[
            "box", "files", "completion", "bash"
        ])));
    }

    #[test]
    fn wants_completion_false_when_flag_value() {
        assert!(!wants_completion(&args(&[
            "box",
            "--base-url",
            "completion",
            "files",
        ])));
    }

    #[test]
    fn wants_completion_true_after_eq_flag() {
        assert!(wants_completion(&args(&[
            "box",
            "--base-url=http://localhost",
            "completion",
            "bash",
        ])));
    }

    #[test]
    fn wants_completion_with_boolean_flag() {
        // --dry-run is a boolean flag (SetTrue) and must NOT consume the
        // next token; "completion" is the subcommand, not the flag's value.
        assert!(wants_completion(&args(&[
            "box",
            "--dry-run",
            "completion",
            "bash",
        ])));
    }

    #[test]
    fn wants_completion_with_multiple_boolean_flags() {
        assert!(wants_completion(&args(&[
            "box",
            "--dry-run",
            "--no-retry",
            "completion",
            "zsh",
        ])));
    }

    #[test]
    fn parse_shell_valid() {
        assert_eq!(parse_shell("bash"), Some(Shell::Bash));
        assert_eq!(parse_shell("zsh"), Some(Shell::Zsh));
        assert_eq!(parse_shell("fish"), Some(Shell::Fish));
        assert_eq!(parse_shell("powershell"), Some(Shell::PowerShell));
        assert_eq!(parse_shell("elvish"), Some(Shell::Elvish));
    }

    #[test]
    fn parse_shell_rejects_uppercase() {
        // parse_shell must be case-sensitive, matching clap's value_parser.
        assert_eq!(parse_shell("BASH"), None);
        assert_eq!(parse_shell("Zsh"), None);
        assert_eq!(parse_shell("FISH"), None);
    }

    #[test]
    fn parse_shell_invalid() {
        assert_eq!(parse_shell("nushell"), None);
        assert_eq!(parse_shell(""), None);
    }
}
