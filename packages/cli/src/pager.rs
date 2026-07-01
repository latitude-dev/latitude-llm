// SPDX-License-Identifier: Apache-2.0

//! External pager support for paginated CLI output.
//!
//! When `--page-all` is used on an interactive terminal, output is piped
//! through an external pager (`$PAGER`, defaulting to `less`). This gives
//! users scrollable, searchable output instead of a wall of text.
//!
//! The pager is **never** spawned when stdout is not a TTY (piped or
//! redirected) or when `--no-pager` is passed.

use std::io::{self, IsTerminal, Write};
use std::process::{Child, Command, Stdio};

/// Resolved pager configuration.
///
/// Built once per command invocation from CLI flags and environment.
#[derive(Debug)]
pub struct PagerConfig {
    /// The pager program to run (resolved from env vars).
    pub program: String,
    /// Whether the pager is disabled via `--no-pager`.
    pub disabled: bool,
}

impl PagerConfig {
    /// Resolve pager configuration from the environment.
    ///
    /// Precedence: `$<BINARY>_PAGER` → `$PAGER` → platform default.
    /// The platform default is `less` on Unix, `more` on Windows.
    pub fn from_env(binary_name: &str) -> Self {
        let prefix = binary_name.to_uppercase().replace('-', "_");
        let binary_pager_var = format!("{prefix}_PAGER");

        let program = std::env::var(&binary_pager_var)
            .ok()
            .filter(|v| !v.is_empty())
            .or_else(|| {
                std::env::var("PAGER")
                    .ok()
                    .filter(|v| !v.is_empty())
            })
            .unwrap_or_else(default_pager_program);

        Self {
            program,
            disabled: false,
        }
    }
}

/// Platform default pager program.
fn default_pager_program() -> String {
    if cfg!(windows) {
        "more".to_string()
    } else {
        "less".to_string()
    }
}

/// A handle to a running pager child process.
///
/// Implements `Write` — data written here is piped to the pager's stdin.
/// On drop, closes the pipe and waits for the pager to exit.
pub struct PagerHandle {
    child: Child,
    stdin: Option<std::process::ChildStdin>,
}

impl PagerHandle {
    /// Wait for the pager to exit. Called on drop, but can be called
    /// explicitly to capture the exit status.
    pub fn wait(mut self) -> io::Result<()> {
        drop(self.stdin.take());
        let _ = self.child.wait();
        Ok(())
    }
}

impl Write for PagerHandle {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        match &mut self.stdin {
            Some(stdin) => match stdin.write(buf) {
                Err(e) if is_broken_pipe(&e) => Ok(buf.len()),
                other => other,
            },
            None => Ok(buf.len()),
        }
    }

    fn flush(&mut self) -> io::Result<()> {
        match &mut self.stdin {
            Some(stdin) => match stdin.flush() {
                Err(e) if is_broken_pipe(&e) => Ok(()),
                other => other,
            },
            None => Ok(()),
        }
    }
}

impl Drop for PagerHandle {
    fn drop(&mut self) {
        drop(self.stdin.take());
        let _ = self.child.wait();
    }
}

/// Returns `true` if the error is a broken-pipe (`EPIPE`).
fn is_broken_pipe(e: &io::Error) -> bool {
    e.kind() == io::ErrorKind::BrokenPipe
}

/// Attempt to spawn a pager process. Returns `None` if the pager should
/// be skipped (non-TTY, disabled, or program not found).
///
/// When `Some`, the caller writes output to the returned `PagerHandle`
/// instead of stdout. The pager is killed when the handle is dropped.
pub fn spawn_pager(config: &PagerConfig, label: &str) -> Option<PagerHandle> {
    if config.disabled {
        return None;
    }

    if !std::io::stdout().is_terminal() {
        return None;
    }

    // Split $PAGER on whitespace so values like "less -R" work.
    let parts: Vec<&str> = config.program.split_whitespace().collect();
    let (program, extra_args) = match parts.split_first() {
        Some((prog, args)) => (*prog, args),
        None => return None,
    };

    let mut cmd = Command::new(program);
    cmd.args(extra_args)
        .stdin(Stdio::piped())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());

    // Set LESS defaults on the child process only (thread-safe).
    // F = quit-if-one-screen, R = ANSI color only, X = no init/deinit.
    if std::env::var("LESS").is_err() {
        cmd.env("LESS", "FRX");
    }

    if is_less_compatible(program) && !extra_args.iter().any(|a| a.starts_with("-P")) {
        cmd.arg(format!("-P{label}"));
    }

    match cmd.spawn() {
        Ok(mut child) => {
            let stdin = child.stdin.take();
            Some(PagerHandle { child, stdin })
        }
        Err(e) => {
            tracing::debug!(
                pager = %config.program,
                error = %e,
                "pager not available, falling back to stdout"
            );
            None
        }
    }
}

/// Check if the pager program is `less` or a less-compatible program.
/// Accepts a bare program name (already split from arguments).
fn is_less_compatible(program: &str) -> bool {
    let basename = program.rsplit('/').next().unwrap_or(program);
    let basename = basename.rsplit('\\').next().unwrap_or(basename);
    basename == "less" || basename == "less.exe"
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_pager_program() {
        let prog = default_pager_program();
        if cfg!(windows) {
            assert_eq!(prog, "more");
        } else {
            assert_eq!(prog, "less");
        }
    }

    #[test]
    fn test_is_less_compatible() {
        assert!(is_less_compatible("less"));
        assert!(is_less_compatible("/usr/bin/less"));
        assert!(is_less_compatible("less.exe"));
        assert!(is_less_compatible("C:\\Program Files\\Git\\usr\\bin\\less.exe"));
        assert!(!is_less_compatible("more"));
        assert!(!is_less_compatible("bat"));
        assert!(!is_less_compatible("cat"));
    }

    #[test]
    fn test_pager_with_arguments_is_split() {
        // Verify the config stores the full string including args
        let saved = std::env::var("PAGER").ok();
        let saved_bin = std::env::var("SPLIT_TEST_PAGER").ok();
        std::env::set_var("PAGER", "less -R");
        std::env::remove_var("SPLIT_TEST_PAGER");

        let config = PagerConfig::from_env("split-test");
        assert_eq!(config.program, "less -R");

        // Verify splitting logic extracts program and args correctly
        let parts: Vec<&str> = config.program.split_whitespace().collect();
        assert_eq!(parts[0], "less");
        assert_eq!(&parts[1..], &["-R"]);

        // Restore
        match saved {
            Some(p) => std::env::set_var("PAGER", p),
            None => std::env::remove_var("PAGER"),
        }
        match saved_bin {
            Some(p) => std::env::set_var("SPLIT_TEST_PAGER", p),
            None => std::env::remove_var("SPLIT_TEST_PAGER"),
        }
    }

    #[test]
    fn test_is_broken_pipe() {
        let e = io::Error::new(io::ErrorKind::BrokenPipe, "broken pipe");
        assert!(is_broken_pipe(&e));

        let e = io::Error::other("other");
        assert!(!is_broken_pipe(&e));
    }

    #[test]
    fn test_pager_config_disabled_skips_spawn() {
        let config = PagerConfig {
            program: "less".to_string(),
            disabled: true,
        };
        assert!(spawn_pager(&config, "test").is_none());
    }

    #[test]
    fn test_pager_config_from_env_defaults() {
        // Clear env vars to test defaults
        let key = "TEST_PAGER_CLI_PAGER";
        std::env::remove_var(key);
        let saved_pager = std::env::var("PAGER").ok();
        std::env::remove_var("PAGER");

        let config = PagerConfig::from_env("test-pager-cli");
        assert_eq!(config.program, default_pager_program());
        assert!(!config.disabled);

        // Restore
        if let Some(p) = saved_pager {
            std::env::set_var("PAGER", p);
        }
    }

    #[test]
    fn test_pager_config_from_env_pager_var() {
        let saved = std::env::var("PAGER").ok();
        std::env::set_var("PAGER", "bat");
        // Clear binary-specific var
        std::env::remove_var("MY_CLI_PAGER");

        let config = PagerConfig::from_env("my-cli");
        assert_eq!(config.program, "bat");

        // Restore
        match saved {
            Some(p) => std::env::set_var("PAGER", p),
            None => std::env::remove_var("PAGER"),
        }
    }

    #[test]
    fn test_pager_config_from_env_binary_var_takes_precedence() {
        let saved_pager = std::env::var("PAGER").ok();
        let saved_bin = std::env::var("MY_CLI_PAGER").ok();
        std::env::set_var("PAGER", "less");
        std::env::set_var("MY_CLI_PAGER", "bat");

        let config = PagerConfig::from_env("my-cli");
        assert_eq!(config.program, "bat");

        // Restore
        match saved_pager {
            Some(p) => std::env::set_var("PAGER", p),
            None => std::env::remove_var("PAGER"),
        }
        match saved_bin {
            Some(p) => std::env::set_var("MY_CLI_PAGER", p),
            None => std::env::remove_var("MY_CLI_PAGER"),
        }
    }

    #[test]
    fn test_pager_config_empty_env_falls_through() {
        let saved_pager = std::env::var("PAGER").ok();
        let saved_bin = std::env::var("EMPTY_CLI_PAGER").ok();
        std::env::set_var("EMPTY_CLI_PAGER", "");
        std::env::set_var("PAGER", "");

        let config = PagerConfig::from_env("empty-cli");
        assert_eq!(config.program, default_pager_program());

        // Restore
        match saved_pager {
            Some(p) => std::env::set_var("PAGER", p),
            None => std::env::remove_var("PAGER"),
        }
        match saved_bin {
            Some(p) => std::env::set_var("EMPTY_CLI_PAGER", p),
            None => std::env::remove_var("EMPTY_CLI_PAGER"),
        }
    }
}
