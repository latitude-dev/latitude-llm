//! Structured Logging
//!
//! Provides opt-in, PII-free logging for HTTP requests and CLI operations.
//! All output goes to stderr or a log file — stdout remains clean for
//! machine-consumable JSON output.
//!
//! ## Environment Variables
//!
//! - `<NAME>_LOG`: Filter directive for stderr logging
//!   (e.g., `fern=debug`). `<NAME>` is the CLI binary name uppercased
//!   with hyphens replaced by underscores. If unset, no stderr logging.
//!
//! - `<NAME>_LOG_FILE`: Directory path for JSON-line log
//!   files with daily rotation. If unset, no file logging.

use tracing_subscriber::prelude::*;

/// Compute the env-var prefix from a CLI binary name: uppercase, hyphens → underscores.
fn env_prefix(cli_name: &str) -> String {
    cli_name.to_uppercase().replace('-', "_")
}

/// Initialize the tracing subscriber based on environment variables.
///
/// `cli_name` is the binary name (e.g. `"my-cli"`). The function reads
/// `<PREFIX>_LOG` and `<PREFIX>_LOG_FILE` where `<PREFIX>` is
/// `cli_name` uppercased with hyphens replaced by underscores.
///
/// If neither variable is set, this is a no-op and logging adds zero
/// overhead.
pub fn init_logging(cli_name: &str) {
    let prefix = env_prefix(cli_name);
    let env_log = format!("{prefix}_LOG");
    let env_log_file = format!("{prefix}_LOG_FILE");

    let stderr_filter = std::env::var(&env_log).ok();
    let log_file_dir = std::env::var(&env_log_file).ok();

    if stderr_filter.is_none() && log_file_dir.is_none() {
        return;
    }

    let registry = tracing_subscriber::registry();

    let stderr_layer = stderr_filter.map(|filter| {
        let env_filter = tracing_subscriber::EnvFilter::new(filter);
        tracing_subscriber::fmt::layer()
            .with_writer(std::io::stderr)
            .with_target(false)
            .compact()
            .with_filter(env_filter)
    });

    let (file_layer, _guard) = if let Some(ref dir) = log_file_dir {
        let log_filename = format!("{cli_name}.log");
        let file_appender = tracing_appender::rolling::daily(dir, log_filename);
        let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);
        let layer = tracing_subscriber::fmt::layer()
            .json()
            .with_writer(non_blocking)
            .with_target(true)
            .with_filter(tracing_subscriber::EnvFilter::new("debug"));
        (Some(layer), Some(guard))
    } else {
        (None, None)
    };

    let subscriber = registry.with(stderr_layer).with(file_layer);
    if tracing::subscriber::set_global_default(subscriber).is_ok() {
        if let Some(guard) = _guard {
            std::mem::forget(guard);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;

    #[test]
    fn test_env_prefix() {
        assert_eq!(env_prefix("test-cli"), "TEST_CLI");
        assert_eq!(env_prefix("box"), "BOX");
        assert_eq!(env_prefix("my-long-name"), "MY_LONG_NAME");
    }

    #[test]
    fn test_env_var_names_derived() {
        let prefix = env_prefix("test-cli");
        assert_eq!(format!("{prefix}_LOG"), "TEST_CLI_LOG");
        assert_eq!(format!("{prefix}_LOG_FILE"), "TEST_CLI_LOG_FILE");
    }

    #[test]
    #[serial]
    fn test_init_logging_default_no_panic() {
        std::env::remove_var("TEST_CLI_LOG");
        std::env::remove_var("TEST_CLI_LOG_FILE");
        init_logging("test-cli");
    }

    #[test]
    #[serial]
    fn test_init_logging_with_stderr_filter_no_panic() {
        // set_global_default may fail if another test already set it — that's fine,
        // we still exercise the branch up to and including that call.
        std::env::set_var("TEST_CLI_LOG", "fern=debug");
        std::env::remove_var("TEST_CLI_LOG_FILE");
        init_logging("test-cli");
        std::env::remove_var("TEST_CLI_LOG");
    }

    #[test]
    #[serial]
    fn test_init_logging_with_file_dir_no_panic() {
        let dir = tempfile::tempdir().unwrap();
        std::env::remove_var("TEST_CLI_LOG");
        std::env::set_var("TEST_CLI_LOG_FILE", dir.path().to_str().unwrap());
        init_logging("test-cli");
        std::env::remove_var("TEST_CLI_LOG_FILE");
    }
}
