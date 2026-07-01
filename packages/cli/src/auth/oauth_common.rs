//! OAuth2 primitives shared by `OAuth2TokenProvider` (oauth2.rs) and the
//! login-flow providers (oauth_login.rs).
//!
//! Both providers parse OAuth2 token-endpoint responses, persist token
//! bundles, and resolve config paths the same way. Earlier each carried
//! its own copies of the helpers — the signatures had already diverged
//! (`parse_oauth_error_json -> Option<String>` vs
//! `parse_oauth_error -> Option<TokenErrorBody>`,
//! `now_epoch_secs` vs `now_epoch`, timeouts present in one and not the
//! other). This module is the single source of truth.

use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::error::CliError;

// ---------------------------------------------------------------------------
// Token endpoint response shapes
// ---------------------------------------------------------------------------

/// Successful OAuth2 token-endpoint response (RFC 6749 §5.1, §6, §8).
#[derive(Deserialize, Debug)]
pub(crate) struct TokenSuccessBody {
    pub access_token: String,
    #[serde(default)]
    pub refresh_token: Option<String>,
    #[serde(default)]
    pub expires_in: Option<u64>,
}

/// Error envelope returned by an OAuth2 token endpoint (RFC 6749 §5.2).
#[derive(Deserialize, Debug)]
pub(crate) struct TokenErrorBody {
    pub error: Option<String>,
    #[serde(rename = "error_description", default)]
    pub error_description: Option<String>,
}

/// Parse an OAuth2 error envelope into its structured form. Returns `None`
/// if the body isn't a JSON object matching the OAuth2 error shape.
pub(crate) fn parse_oauth_error_body(body: &str) -> Option<TokenErrorBody> {
    serde_json::from_str(body).ok()
}

/// Format an OAuth2 error envelope as `"<error>: <description>"`, falling
/// back to one or the other when only one field is present. Returns `None`
/// when the body doesn't parse or carries no field.
pub(crate) fn parse_oauth_error_message(body: &str) -> Option<String> {
    let err = parse_oauth_error_body(body)?;
    match (err.error, err.error_description) {
        (Some(e), Some(d)) => Some(format!("{e}: {d}")),
        (Some(e), None) => Some(e),
        (None, Some(d)) => Some(d),
        (None, None) => None,
    }
}

/// Truncate a response body for inclusion in an error message, preserving
/// UTF-8 boundaries.
pub(crate) fn truncate_body(body: &str) -> String {
    const MAX: usize = 512;
    if body.chars().count() <= MAX {
        body.to_string()
    } else {
        let s: String = body.chars().take(MAX).collect();
        format!("{s}…")
    }
}

/// Build the HTTP client used for token-endpoint requests across all
/// OAuth flows. Bounded timeouts so a hung endpoint surfaces an error
/// rather than freezing the CLI — 10s connect, 30s overall (enough for
/// slow providers like Microsoft identity, tight enough to detect a
/// misconfiguration before the user assumes a hang).
pub(crate) fn token_http_client() -> Result<reqwest::Client, CliError> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| CliError::Auth(format!("build OAuth HTTP client: {e}")))
}

/// Current epoch seconds.
pub(crate) fn now_epoch() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

/// Buffer subtracted from `expires_in` before computing `expires_at`, so
/// we refresh before the token actually expires. Matches the TS SDK's
/// `BUFFER_IN_MINUTES` constant.
pub(crate) const EXPIRY_BUFFER_SECS: u64 = 120;

// ---------------------------------------------------------------------------
// TokenBundle — the JSON shape persisted in storage
// ---------------------------------------------------------------------------

/// Cached OAuth2 access + refresh token state.
///
/// Same shape regardless of where it's persisted (the legacy `TokenCache`
/// file map, the new `KeyringStore`). Both providers serialise this
/// directly; the storage layer just sees the resulting JSON string.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenBundle {
    pub access_token: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub refresh_token: Option<String>,
    /// Epoch seconds when the access token expires. `None` = no expiry known.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub expires_at: Option<u64>,
}

impl TokenBundle {
    pub fn from_token_response(
        access: &str,
        refresh: Option<&str>,
        expires_in: Option<u64>,
    ) -> Self {
        let expires_at = expires_in.map(|s| now_epoch() + s.saturating_sub(EXPIRY_BUFFER_SECS));
        Self {
            access_token: access.to_string(),
            refresh_token: refresh.map(str::to_string),
            expires_at,
        }
    }

    pub fn is_expired(&self) -> bool {
        match self.expires_at {
            Some(t) => now_epoch() >= t,
            None => false,
        }
    }

    pub fn to_keyring_value(&self) -> Result<String, CliError> {
        serde_json::to_string(self)
            .map_err(|e| CliError::Auth(format!("serialise token bundle: {e}")))
    }

    /// Parse a keyring value into a bundle. Falls back to "treat as raw
    /// bearer token" if JSON-decode fails — so `--with-token` paste
    /// strings coexist with OAuth bundles under the same key.
    pub fn parse_or_raw(value: &str) -> Self {
        match serde_json::from_str::<Self>(value) {
            Ok(b) => b,
            Err(_) => Self {
                access_token: value.to_string(),
                refresh_token: None,
                expires_at: None,
            },
        }
    }
}

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

/// Cross-platform home directory lookup: `$HOME` first (set on Unix and
/// honored on Windows under WSL/MSYS shells), then `%USERPROFILE%` as the
/// native Windows fallback.
pub(crate) fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .filter(|p| !p.as_os_str().is_empty())
}

/// Platform-appropriate user config directory.
/// - macOS: `~/Library/Application Support`
/// - Windows: `%APPDATA%` (with `~/AppData/Roaming` fallback)
/// - Linux/other: `$XDG_CONFIG_HOME` (with `~/.config` fallback)
pub(crate) fn config_dir() -> Option<PathBuf> {
    let home = home_dir()?;
    #[cfg(target_os = "macos")]
    {
        Some(home.join("Library").join("Application Support"))
    }
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .or(Some(home.join("AppData").join("Roaming")))
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .or(Some(home.join(".config")))
    }
}

/// Write `data` to `path` atomically: sibling temp file → owner-only
/// permissions (0600 on Unix) → rename into place.
pub(crate) fn atomic_write(path: &Path, data: &[u8]) -> Result<(), CliError> {
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, data).map_err(|e| {
        CliError::Auth(format!("Failed to write {}: {e}", tmp.display()))
    })?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o600);
        let _ = std::fs::set_permissions(&tmp, perms);
    }
    std::fs::rename(&tmp, path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        CliError::Auth(format!("Failed to rename {}: {e}", tmp.display()))
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_bundle_roundtrip() {
        let b = TokenBundle::from_token_response("a", Some("r"), Some(3600));
        let s = b.to_keyring_value().unwrap();
        let parsed = TokenBundle::parse_or_raw(&s);
        assert_eq!(parsed.access_token, "a");
        assert_eq!(parsed.refresh_token.as_deref(), Some("r"));
        assert!(parsed.expires_at.is_some());
    }

    #[test]
    fn token_bundle_raw_fallback() {
        let b = TokenBundle::parse_or_raw("plain-token");
        assert_eq!(b.access_token, "plain-token");
        assert!(b.refresh_token.is_none());
        assert!(b.expires_at.is_none());
        assert!(!b.is_expired());
    }

    #[test]
    fn token_bundle_expired_when_past_deadline() {
        let mut b = TokenBundle::parse_or_raw("x");
        b.expires_at = Some(0);
        assert!(b.is_expired());
    }

    #[test]
    fn token_bundle_no_expires_at_never_expired() {
        let b = TokenBundle::parse_or_raw("x");
        assert!(!b.is_expired());
    }

    #[test]
    fn parse_oauth_error_message_prefers_error_and_description() {
        let body = r#"{"error":"invalid_client","error_description":"bad secret"}"#;
        assert_eq!(
            parse_oauth_error_message(body).as_deref(),
            Some("invalid_client: bad secret")
        );
    }

    #[test]
    fn parse_oauth_error_message_falls_back_to_description_only() {
        let body = r#"{"error_description":"some detail"}"#;
        assert_eq!(parse_oauth_error_message(body).as_deref(), Some("some detail"));
    }

    #[test]
    fn parse_oauth_error_message_none_on_non_json() {
        assert!(parse_oauth_error_message("not-json").is_none());
    }

    #[test]
    fn truncate_body_short_passes_through() {
        assert_eq!(truncate_body("short"), "short");
    }

    #[test]
    fn truncate_body_long_gets_ellipsis() {
        let s = "x".repeat(600);
        let t = truncate_body(&s);
        assert!(t.len() < s.len());
        assert!(t.ends_with('…'));
    }

    #[test]
    fn truncate_body_multibyte_utf8_no_panic() {
        let s = "é".repeat(600);
        let t = truncate_body(&s);
        assert!(t.chars().count() <= 513);
        assert!(t.ends_with('…'));
    }
}
