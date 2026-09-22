//! Configuration for the consumer `User-Agent` suffix flag/env name.
//!
//! A generated CLI always identifies itself as `<binary>-cli/<version>`.
//! A tool built on top of it can *append* its own product token either
//! with a global flag or a scoped env var, so the backend sees both
//! identities (e.g. `elevenlabs-cli/1.4.0 partner-app/3.1`).
//!
//! The flag's long name — and, by derivation, the env-var name — is
//! configurable at generation time via the CLI generator's
//! `userAgentSuffixFlag` custom config. When a customer does not set it,
//! the CLI defaults to `--user-agent-suffix` / `<NAME>_USER_AGENT_SUFFIX`.
//!
//! The configured name is a single process-wide value set once at
//! startup from the generated `main.rs` (via
//! [`crate::app::CliApp::user_agent_suffix_flag`]). Every consumer — the
//! clap flag registration, the `--help`/`--schema` text, the env-var
//! lookup, and the parameter-collision guard — reads it back through
//! [`suffix_flag`] so they stay in agreement.

use std::sync::OnceLock;

/// Default long flag name when `userAgentSuffixFlag` is not configured.
/// Kept self-documenting (rather than an opaque brand) so most CLIs ship
/// with a clear knob.
pub const DEFAULT_SUFFIX_FLAG: &str = "user-agent-suffix";

/// Process-wide configured suffix flag name. Written at most once at
/// startup by [`set_suffix_flag`]; unset means [`DEFAULT_SUFFIX_FLAG`].
static SUFFIX_FLAG: OnceLock<String> = OnceLock::new();

/// Record the configured suffix flag name. Called once from the generated
/// `main.rs` builder chain. Blank / whitespace-only names are ignored so
/// the default still applies. Subsequent calls are no-ops (the value is
/// fixed for the process); this keeps behavior deterministic if a builder
/// is constructed more than once.
pub fn set_suffix_flag(name: &str) {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return;
    }
    let _ = SUFFIX_FLAG.set(trimmed.to_string());
}

/// The configured suffix flag's long name (without the leading `--`),
/// or [`DEFAULT_SUFFIX_FLAG`] when unset.
pub fn suffix_flag() -> &'static str {
    SUFFIX_FLAG.get().map_or(DEFAULT_SUFFIX_FLAG, String::as_str)
}

/// The env-var segment for the current suffix flag: an underscore prefix
/// plus the flag name uppercased with hyphens converted to underscores.
/// Combined with the CLI's `<NAME>` prefix it yields the full env var,
/// e.g. flag `via` → `_VIA` → `<NAME>_VIA`; the default `user-agent-suffix`
/// → `_USER_AGENT_SUFFIX` → `<NAME>_USER_AGENT_SUFFIX`.
pub fn suffix_env_segment() -> String {
    env_segment_for(suffix_flag())
}

/// Pure derivation of the env-var segment from a flag name. Extracted so
/// it can be unit-tested without touching the process-wide flag.
pub(crate) fn env_segment_for(flag: &str) -> String {
    format!("_{}", flag.to_uppercase().replace('-', "_"))
}

/// Whether a parameter-derived flag name would collide with the configured
/// suffix flag (and therefore must be mangled to avoid a clap conflict).
/// The default name is already covered by the built-in flag list, so this
/// only matters when a customer configures a custom name.
pub fn collides_with_suffix_flag(flag_name: &str) -> bool {
    collides_with(flag_name, suffix_flag())
}

/// Pure collision check, extracted for unit testing. A parameter only
/// needs mangling when a *custom* suffix flag matches it — the default is
/// handled by the built-in reserved list.
pub(crate) fn collides_with(flag_name: &str, suffix_flag: &str) -> bool {
    suffix_flag != DEFAULT_SUFFIX_FLAG && flag_name == suffix_flag
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn env_segment_default_matches_legacy_name() {
        assert_eq!(env_segment_for(DEFAULT_SUFFIX_FLAG), "_USER_AGENT_SUFFIX");
    }

    #[test]
    fn env_segment_uppercases_and_translates_dashes() {
        assert_eq!(env_segment_for("via"), "_VIA");
        assert_eq!(env_segment_for("partner-tag"), "_PARTNER_TAG");
    }

    #[test]
    fn collision_only_for_custom_flag() {
        // Default name never reports a collision (built-ins handle it).
        assert!(!collides_with("user-agent-suffix", DEFAULT_SUFFIX_FLAG));
        // A custom name collides only with an identically-named param.
        assert!(collides_with("via", "via"));
        assert!(!collides_with("other", "via"));
    }
}
