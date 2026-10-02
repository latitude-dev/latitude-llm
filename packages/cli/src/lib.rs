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
pub mod profiles;
pub mod stability;
pub mod user_agent;
pub mod validate;
pub mod sdk_executor;
pub mod websocket;

// Convenience re-exports for auth types
pub use auth::{ApiKeyAuth, BasicAuth, BearerAuth, OAuth2Auth, OAuth2Grant, OAuth2TokenProvider, TokenCache};

// Re-exported for the generated wire-test harness so it derives multipart
// field flag names (`--<kebab>`) with the exact same rule the CLI registers
// them under, rather than reproducing the kebab-casing logic and risking drift.
pub use text::to_kebab_flag;

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

/// Unscoped env vars a `.env` file may not set, because each one redirects
/// traffic, weakens transport security, or names a program to execute.
const DOTENV_DENIED_BARE: &[&str] = &[
    // Names a program the CLI executes when paging output.
    "PAGER",
    // Route traffic through an attacker-chosen intermediary.
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "NO_PROXY",
    // Replace the trust store, enabling transparent interception.
    "SSL_CERT_FILE",
    "CURL_CA_BUNDLE",
    "REQUESTS_CA_BUNDLE",
];

/// Suffixes of `<PREFIX>_…` env vars a `.env` file may not set. Same
/// reasoning as [`DOTENV_DENIED_BARE`], plus the two cross-host guards — a
/// `.env` that could disable them would undo the redirect and pagination
/// protections.
const DOTENV_DENIED_SUFFIXES: &[&str] = &[
    "_BASE_URL",
    "_PAGER",
    "_PROXY",
    "_NO_PROXY",
    "_INSECURE",
    "_INSECURE_SKIP_VERIFY",
    "_CA_BUNDLE",
    "_EXTRA_CA_CERTS",
    "_ALLOW_CROSS_HOST_REDIRECTS",
    "_ALLOW_CROSS_HOST_PAGINATION",
];

/// True when `key` is one a `.env` file must not be able to set.
pub(crate) fn dotenv_key_is_denied(key: &str, prefix: &str) -> bool {
    if DOTENV_DENIED_BARE.contains(&key) {
        return true;
    }
    key.strip_prefix(prefix)
        .is_some_and(|rest| DOTENV_DENIED_SUFFIXES.contains(&rest))
}

/// Load `.env`, ignoring keys that control transport or execution.
///
/// A generated CLI is routinely run inside repositories the operator did not
/// write, and `dotenvy::dotenv()` searches the working directory and its
/// ancestors — so an attacker-authored `.env` would otherwise be able to point
/// the CLI at another host, disable certificate verification, route requests
/// through a proxy, turn off the cross-host redirect and pagination guards, or
/// name an arbitrary program for the CLI to execute as its pager. The last is
/// the sharpest: `<PREFIX>_PAGER` is run as a command.
///
/// The legitimate use of `.env` — credentials and output preferences — is
/// unaffected; only the keys in [`DOTENV_DENIED_BARE`] and
/// [`DOTENV_DENIED_SUFFIXES`] are dropped. Real process environment always
/// wins, matching `dotenvy::dotenv()`'s own precedence, so anything genuinely
/// exported by the operator's shell still applies.
/// Returns the keys that were ignored, in file order, so the caller can report
/// them *after* logging is initialized. Warning from inside this function would
/// be silently dropped: it runs before `init_logging`, so no subscriber exists
/// yet and a legitimate `<PREFIX>_BASE_URL` in `.env` would appear to be
/// ignored for no reason.
pub fn load_dotenv_filtered(cli_name: &str) -> Vec<String> {
    let prefix = cli_name.to_uppercase().replace('-', "_");
    let mut ignored = Vec::new();
    let Ok(entries) = dotenvy::dotenv_iter() else {
        // No `.env` (the common case) or it is unreadable — nothing to do.
        return ignored;
    };
    for entry in entries.flatten() {
        let (key, value) = entry;
        if dotenv_key_is_denied(&key, &prefix) {
            ignored.push(key);
            continue;
        }
        // Real environment wins, as with `dotenvy::dotenv()`.
        if std::env::var_os(&key).is_none() {
            std::env::set_var(&key, &value);
        }
    }
    ignored
}

/// Report the keys [`load_dotenv_filtered`] dropped. Call after
/// `init_logging`, or the messages go nowhere.
pub fn warn_ignored_dotenv_keys(ignored: &[String]) {
    for key in ignored {
        tracing::warn!(
            key = %key,
            "ignoring {key} from .env: it controls transport or process execution, and a \
             .env file is not a trusted source for it. Export it from your shell instead."
        );
    }
}

#[cfg(test)]
mod dotenv_filter_tests {
    use super::dotenv_key_is_denied;

    #[test]
    fn credentials_and_preferences_are_allowed_from_dotenv() {
        // The legitimate use of `.env`: secrets and output preferences.
        for key in [
            "ELEVENLABS_API_KEY",
            "ELEVENLABS_TOKEN",
            "ELEVENLABS_CLIENT_ID",
            "ELEVENLABS_CLIENT_SECRET",
            "ELEVENLABS_OUTPUT",
            "ELEVENLABS_VIA",
            "ELEVENLABS_TIMEOUT_SECS",
            "ELEVENLABS_CONNECT_TIMEOUT_SECS",
            "SOME_UNRELATED_APP_KEY",
        ] {
            assert!(
                !dotenv_key_is_denied(key, "ELEVENLABS"),
                "{key} should be loadable from .env"
            );
        }
    }

    #[test]
    fn transport_and_execution_keys_are_denied_from_dotenv() {
        // Each of these lets an attacker-authored `.env` redirect traffic,
        // weaken TLS, or run a program of their choosing.
        for key in [
            "ELEVENLABS_BASE_URL",
            "ELEVENLABS_PAGER",
            "ELEVENLABS_PROXY",
            "ELEVENLABS_NO_PROXY",
            "ELEVENLABS_INSECURE",
            "ELEVENLABS_INSECURE_SKIP_VERIFY",
            "ELEVENLABS_CA_BUNDLE",
            "ELEVENLABS_EXTRA_CA_CERTS",
            "PAGER",
            "HTTP_PROXY",
            "HTTPS_PROXY",
            "ALL_PROXY",
            "NO_PROXY",
            "SSL_CERT_FILE",
            "CURL_CA_BUNDLE",
            "REQUESTS_CA_BUNDLE",
        ] {
            assert!(
                dotenv_key_is_denied(key, "ELEVENLABS"),
                "{key} must not be settable from .env"
            );
        }
    }

    #[test]
    fn dotenv_cannot_disable_the_cross_host_guards() {
        // Otherwise a `.env` could undo the redirect and pagination
        // protections, which is the whole point of having them.
        assert!(dotenv_key_is_denied(
            "ELEVENLABS_ALLOW_CROSS_HOST_REDIRECTS",
            "ELEVENLABS"
        ));
        assert!(dotenv_key_is_denied(
            "ELEVENLABS_ALLOW_CROSS_HOST_PAGINATION",
            "ELEVENLABS"
        ));
    }

    #[test]
    fn the_deny_list_is_scoped_to_this_binary_s_prefix() {
        // A denied suffix under *another* CLI's prefix is not ours to police,
        // and must not be dropped from the environment we hand on.
        assert!(!dotenv_key_is_denied("OTHERCLI_BASE_URL", "ELEVENLABS"));
        assert!(!dotenv_key_is_denied("BASE_URL", "ELEVENLABS"));
        // Kebab-cased binary names map to underscored prefixes.
        assert!(dotenv_key_is_denied("MY_CLI_BASE_URL", "MY_CLI"));
    }
}
