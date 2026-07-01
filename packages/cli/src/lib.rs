//! Fern CLI SDK
//!
//! A library for building CLIs from OpenAPI or GraphQL SDL schemas.
//! Uses `x-fern-sdk-group-name` and `x-fern-sdk-method-name` extensions
//! to build the command hierarchy.

// Public API — building blocks
pub mod app;
pub mod arg_source;
pub mod asyncapi;
pub mod auth;
pub mod binding;
pub mod cli_args;
pub mod completions;
pub(crate) mod custom_commands;
pub mod http;
pub mod error;
pub mod formatter;
pub mod graphql;
pub mod hooks;
pub mod man;
pub mod openapi;
pub mod pager;
pub mod stability;
pub mod validate;
pub mod sdk_executor;
pub mod websocket;

// Convenience re-exports for auth types
pub use auth::{ApiKeyAuth, BasicAuth, BearerAuth, OAuth2Auth, OAuth2Grant, OAuth2TokenProvider, TokenCache};

// Internal modules
pub(crate) mod debug;
pub(crate) mod early_intercept;
pub(crate) mod logging;
pub(crate) mod output;
pub(crate) mod text;

/// Initialize logging from environment variables. Call once at startup.
///
/// `cli_name` is the binary name (e.g. `"my-cli"`). The function reads
/// `<PREFIX>_LOG` and `<PREFIX>_LOG_FILE` where `<PREFIX>` is
/// `cli_name` uppercased with hyphens replaced by underscores.
pub fn init_logging(cli_name: &str) {
    logging::init_logging(cli_name);
}

/// Reset the `SIGPIPE` signal handler to its default disposition (`SIG_DFL`).
///
/// Rust's runtime sets `SIGPIPE` to `SIG_IGN`, which causes writes to a
/// broken pipe (e.g. `<cli> completion bash | head -5`) to return
/// `EPIPE` errors instead of terminating the process. For CLI tools that
/// produce large output this surfaces as a panic in `println!` or
/// `write_all`. Resetting to `SIG_DFL` lets the OS deliver the signal
/// and terminate the process cleanly — the standard behavior expected by
/// Unix pipelines.
///
/// This is the idiomatic fix used by `bat`, `ripgrep`, `fd`, `eza`, and
/// most other Rust CLI tools. Called at the very top of each binary's
/// `run()` method before any I/O.
///
/// On non-Unix platforms this is a no-op.
#[cfg(unix)]
pub fn reset_sigpipe() {
    unsafe {
        libc::signal(libc::SIGPIPE, libc::SIG_DFL);
    }
}

/// No-op on non-Unix platforms.
#[cfg(not(unix))]
pub fn reset_sigpipe() {}
