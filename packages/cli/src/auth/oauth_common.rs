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

/// Read an environment variable used by an OAuth2 token exchange.
///
/// Whitespace-only values are treated as unset. When `required`, an absent
/// or empty variable is an error; otherwise it yields `Ok(None)`. `context`
/// describes the caller for the error message (e.g. `"client_id"`,
/// `"token request"`).
pub(crate) fn read_oauth_env(
    name: &str,
    required: bool,
    context: &str,
) -> Result<Option<String>, CliError> {
    let value = match std::env::var(name) {
        Ok(value) => value,
        Err(std::env::VarError::NotPresent) if !required => return Ok(None),
        Err(_) => {
            return Err(CliError::Auth(format!(
                "Missing environment variable {name} (OAuth2 {context})"
            )));
        }
    };
    if value.trim().is_empty() {
        if !required {
            return Ok(None);
        }
        return Err(CliError::Auth(format!(
            "Environment variable {name} (OAuth2 {context}) must be non-empty"
        )));
    }
    Ok(Some(value))
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
    /// Digest of the client credentials this token was minted for (see
    /// `client_fingerprint`). `None` for tokens from login flows or older
    /// cache files, which are honoured regardless of the configured client.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub client_fingerprint: Option<String>,
}

/// Truncated SHA-256 over the configured credential inputs (`client_id`,
/// `client_secret` and, for the refresh-token grant, the refresh token). Stored next to a
/// cached token so a token minted for one client is never served once the
/// configured credentials change; the secret itself never reaches disk.
pub fn client_fingerprint(
    client_id: &str,
    client_secret: &str,
    refresh_token: Option<&str>,
) -> String {
    use sha2::Digest;
    let mut hasher = sha2::Sha256::new();
    hasher.update(client_id.as_bytes());
    hasher.update([0u8]);
    hasher.update(client_secret.as_bytes());
    if let Some(refresh_token) = refresh_token {
        hasher.update([0u8]);
        hasher.update(refresh_token.as_bytes());
    }
    hasher
        .finalize()
        .iter()
        .take(16)
        .map(|byte| format!("{byte:02x}"))
        .collect()
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
            client_fingerprint: None,
        }
    }

    /// Whether this bundle may be served to a caller configured with the
    /// given client fingerprint. Untagged bundles (login flows, legacy cache
    /// files) always match; a tagged bundle is only served to the client it
    /// was minted for, so partially configured credentials never fall back
    /// to a stale token.
    pub fn matches_client(&self, fingerprint: Option<&str>) -> bool {
        match &self.client_fingerprint {
            Some(cached) => fingerprint == Some(cached.as_str()),
            None => true,
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
                client_fingerprint: None,
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

/// Unlinks a temp file on drop unless [`TempFileGuard::disarm`]ed. Covers
/// every early return *and* a panic between creating the temp file and
/// renaming it into place.
///
/// This exists because the temp name is unique per writer. The old shared
/// `auth-keyring.tmp` was self-limiting — a failed write left one stale file
/// that the next write reused — whereas unique names would leak a distinct
/// credential-bearing file on every failure, in a directory nothing prunes. A
/// `SIGKILL` still leaks, since no in-process guard can cover that.
struct TempFileGuard {
    path: PathBuf,
    armed: bool,
}

impl TempFileGuard {
    fn new(path: PathBuf) -> Self {
        Self { path, armed: true }
    }

    /// Relinquish the file — call once `rename` has moved it into place.
    fn disarm(&mut self) {
        self.armed = false;
    }
}

impl Drop for TempFileGuard {
    fn drop(&mut self) {
        if self.armed {
            let _ = std::fs::remove_file(&self.path);
        }
    }
}

/// Write `data` to `path` atomically: sibling temp file → owner-only
/// permissions (0600 on Unix) → rename into place.
///
/// The temp file name is unique per writer — pid plus a process-local
/// counter. Deriving it from the target alone meant every concurrent writer
/// used the *same* sibling (`auth-keyring.tmp`): whichever one renamed first
/// moved it away, and the rest failed with `ENOENT` from `rename`. That
/// surfaced as intermittent `auth login --with-token` failures across a
/// wire-test suite large enough to run many CLI processes at once, killing a
/// different subset of cases on each run.
///
/// The pid covers the case that actually bit us (separate CLI processes); the
/// counter covers two writers inside one process, and is what makes the
/// behavior unit-testable without spawning subprocesses.
///
/// A [`TempFileGuard`] unlinks the temp file if anything between creating it
/// and renaming it fails, so unique names cannot accumulate as orphans.
///
/// `rename` is still atomic for readers, which is what keeps a partially
/// written credential file unobservable. This only fixes writer-vs-writer
/// collisions on the temp path. `FileKeyringStore::set` remains a
/// read-modify-write of the whole map with no lock, so simultaneous writers
/// can still clobber one another's *entries*; making that safe needs file
/// locking, which is a larger change.
pub(crate) fn atomic_write(path: &Path, data: &[u8]) -> Result<(), CliError> {
    static TMP_SEQ: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
    let seq = TMP_SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let tmp = path.with_extension(format!("tmp.{}.{}", std::process::id(), seq));
    let mut guard = TempFileGuard::new(tmp.clone());
    std::fs::write(&tmp, data)
        .map_err(|e| CliError::Auth(format!("Failed to write {}: {e}", tmp.display())))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o600);
        let _ = std::fs::set_permissions(&tmp, perms);
    }
    std::fs::rename(&tmp, path)
        .map_err(|e| CliError::Auth(format!("Failed to rename {}: {e}", tmp.display())))?;
    guard.disarm();
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// Regression test for the temp-file collision that made
    /// `auth login --with-token` fail intermittently: every writer derived the
    /// same sibling path from the target, so the first `rename` moved it away
    /// and the rest got `ENOENT`.
    ///
    /// Reverting `atomic_write` to a target-derived temp name fails this with
    /// "Failed to rename ...: No such file or directory".
    #[test]
    fn atomic_write_tolerates_concurrent_writers() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("auth-keyring.json");

        let results: Vec<Result<(), CliError>> = std::thread::scope(|scope| {
            let handles: Vec<_> = (0..16)
                .map(|i| {
                    let target = target.clone();
                    scope.spawn(move || {
                        atomic_write(&target, format!(r#"{{"writer":{i}}}"#).as_bytes())
                    })
                })
                .collect();
            handles.into_iter().map(|h| h.join().unwrap()).collect()
        });

        let failed: Vec<String> = results
            .iter()
            .filter_map(|r| r.as_ref().err().map(|e| e.to_string()))
            .collect();
        assert!(failed.is_empty(), "concurrent writers failed: {failed:?}");

        // Last writer wins, but the file must always be one writer's complete
        // payload — never a mix, and never absent.
        let contents = std::fs::read_to_string(&target).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&contents).unwrap_or_else(|e| {
            panic!("target is not valid JSON after concurrent writes: {e} in {contents:?}")
        });
        assert!(
            parsed.get("writer").is_some(),
            "unexpected payload: {contents}"
        );

        // No temp files orphaned in the directory.
        let leftovers: Vec<String> = std::fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|n| n.contains(".tmp"))
            .collect();
        assert!(
            leftovers.is_empty(),
            "temp files left behind: {leftovers:?}"
        );
    }

    /// A failed write must not leave its temp file behind. Renaming a file onto
    /// an existing directory fails on every platform, which drives the error
    /// path without mocking the filesystem.
    ///
    /// The pre-`TempFileGuard` code already cleaned up on a `rename` error, so
    /// this pins an invariant rather than catching a regression — see
    /// `temp_file_guard_unlinks_unless_disarmed` for the guard's own coverage.
    #[test]
    fn atomic_write_cleans_up_temp_file_on_failure() {
        let dir = tempfile::tempdir().unwrap();

        // The target is a *directory*, so `rename` cannot replace it.
        let target = dir.path().join("auth-keyring.json");
        std::fs::create_dir(&target).unwrap();
        std::fs::write(target.join("occupant"), b"x").unwrap();

        let result = atomic_write(&target, br#"{"writer":0}"#);
        assert!(result.is_err(), "expected rename onto a directory to fail");

        let leftovers: Vec<String> = std::fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|n| n.contains(".tmp"))
            .collect();
        assert!(
            leftovers.is_empty(),
            "temp file leaked after a failed write: {leftovers:?}"
        );
    }

    /// Pins [`TempFileGuard`]: armed drops unlink, disarmed drops don't. Drop
    /// running on an armed guard is what covers early returns and unwinding
    /// panics between `write` and `rename` — paths the old `rename`-only
    /// cleanup missed. Deleting the guard or the `disarm()` call fails this.
    #[test]
    fn temp_file_guard_unlinks_unless_disarmed() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("auth-keyring.tmp.0.0");

        std::fs::write(&path, b"x").unwrap();
        drop(TempFileGuard::new(path.clone()));
        assert!(!path.exists(), "armed guard must unlink on drop");

        // The post-`rename` case: the file has been moved away, so the guard
        // must not touch whatever now sits at that path.
        std::fs::write(&path, b"x").unwrap();
        let mut guard = TempFileGuard::new(path.clone());
        guard.disarm();
        drop(guard);
        assert!(path.exists(), "disarmed guard must not unlink");
    }

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
        assert_eq!(
            parse_oauth_error_message(body).as_deref(),
            Some("some detail")
        );
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
