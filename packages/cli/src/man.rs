//! Man page generation.
//!
//! Shared infrastructure for emitting roff-formatted man pages. Sits above
//! both protocol paths (`openapi/` and `graphql/`) and has no
//! protocol-specific dependencies. Mirrors the shape of `completions.rs`.

use clap::Command;

/// Returns `true` when `args` contains `"man"` as the first positional
/// token (i.e. the subcommand position). This allows early interception
/// before normal API dispatch — avoiding collision with an API resource
/// that might also be named `man`.
///
/// Delegates to the shared [`crate::early_intercept::first_positional_is`]
/// helper which handles `--flag value` skip logic and boolean-flag awareness.
pub fn wants_man(args: &[String]) -> bool {
    crate::early_intercept::first_positional_is(args, "man")
}

/// Generate a roff-formatted man page for `cmd` and write it to `writer`.
///
/// `bin_name` is the name the user types to invoke the CLI (e.g. `"box"`).
/// The caller is responsible for building a `Command` that mirrors the full
/// CLI surface (subcommands, flags, etc.) so the generated page is complete.
///
/// Returns an IO error if writing fails.
pub fn generate_man_to(cmd: Command, bin_name: &str, writer: &mut dyn std::io::Write) -> std::io::Result<()> {
    let cmd = cmd.name(bin_name.to_owned());
    let man = clap_mangen::Man::new(cmd);
    let mut buf = Vec::new();
    man.render(&mut buf)?;
    writer.write_all(&buf)
}

/// Generate a roff-formatted man page for `cmd` and write it to stdout.
///
/// Thin wrapper around [`generate_man_to`] that targets `stdout`.
pub fn generate_man(cmd: Command, bin_name: &str) -> std::io::Result<()> {
    generate_man_to(cmd, bin_name, &mut std::io::stdout())
}

/// Build the `man` subcommand definition. Registered at the root of the
/// command tree so `<cli> man` works.
pub fn man_command() -> Command {
    Command::new("man")
        .about("Generate a man page (roff format)")
        .after_help(
            "EXAMPLES:\n    \
             # macOS / Linux (user-local)\n    \
             <CLI> man > ~/.local/share/man/man1/<CLI>.1\n    \
             # System-wide (Linux)\n    \
             <CLI> man | sudo tee /usr/local/share/man/man1/<CLI>.1\n    \
             # View directly without installing\n    \
             <CLI> man | groff -Tutf8 -man | less",
        )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(slice: &[&str]) -> Vec<String> {
        slice.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn wants_man_basic() {
        assert!(wants_man(&args(&["box", "man"])));
    }

    #[test]
    fn wants_man_false_when_flag_value() {
        assert!(!wants_man(&args(&["box", "--base-url", "man"])));
    }

    #[test]
    fn wants_man_with_boolean_flag() {
        assert!(wants_man(&args(&["box", "--dry-run", "man"])));
    }

    #[test]
    fn generate_man_produces_roff() {
        let cmd = Command::new("box").about("test");
        let mut buf = Vec::new();
        generate_man_to(cmd, "box", &mut buf).expect("generate_man_to should succeed");
        let output = String::from_utf8(buf).expect("man page should be valid UTF-8");
        assert!(
            output.contains(".TH"),
            "man page should contain a .TH title-header macro, got:\n{}",
            &output[..output.len().min(200)]
        );
        assert!(
            output.contains("box"),
            "man page should contain the binary name"
        );
        assert!(
            output.contains("test"),
            "man page should contain the about text"
        );
    }
}
