//! On-disk / OS-keyring credential storage for `auth login` flows.
//!
//! Two backends behind a single [`KeyringStore`] trait:
//! - [`OsKeyringStore`] — wraps [`keyring`] (macOS Keychain, Windows
//!   Credential Manager, Linux secret-service). Compiled out on musl
//!   targets, whose static binaries cannot link libdbus; those builds always
//!   use the file backend.
//! - [`FileKeyringStore`] — writes to `~/.config/<cli>/auth-keyring.json`
//!   (0600) when the platform's keyring isn't available. Sibling-file
//!   coexists with the pre-existing `TokenCache` from
//!   [`crate::auth::oauth2`] (which uses `credentials.json` in the same
//!   directory) — backward-compatible for binaries already on
//!   `OAuth2TokenProvider::with_cache(...)`.
//!
//! [`auto_store`] tries the OS keyring first and falls back to file
//! silently — matches `gh`'s posture (ADR-0008). The active store is
//! installed process-globally by `CliApp::run` before bindings finalize;
//! [`AuthCredentialSource::Keyring`](crate::auth::AuthCredentialSource)
//! reads through it at resolve time.
//!
//! The OS backend is wrapped in [`ChunkedKeyringStore`], which splits
//! oversized values across multiple entries. Windows Credential Manager
//! caps a credential blob at `CRED_MAX_CREDENTIAL_BLOB_SIZE` (2560 bytes,
//! i.e. 1280 UTF-16 code units), which an OAuth token bundle for an API
//! with many scopes easily exceeds. VS Code and the Azure CLI chunk the
//! same way for the same reason.
//!
//! Only Windows *writes* chunks. macOS Keychain and secret-service have no
//! comparable limit, so chunking there would change the on-disk shape of a
//! credential that already worked — and an older binary, which knows
//! nothing of markers, would read the marker back and send it as the
//! token. Reads stay marker-aware on every platform, so a chunked entry is
//! always reassembled correctly wherever it is encountered.
//!
//! ## Entry shape
//!
//! Keyed by `(service=<cli_name>, account=<scheme_name>)`. The value is an
//! opaque string the *caller* controls — for OAuth tokens the caller
//! serialises a JSON token bundle; for `--with-token` the caller stores
//! the raw token. This module is storage; it does not parse what it stores.

use std::path::PathBuf;
use std::sync::{Arc, OnceLock, RwLock};

use crate::auth::oauth_common::{atomic_write, config_dir};
use crate::error::CliError;

/// Abstract credential store. Implementations either hit the OS keyring or
/// a fallback file on disk.
pub trait KeyringStore: Send + Sync + std::fmt::Debug {
    /// Retrieve a stored value, if any.
    fn get(&self, service: &str, account: &str) -> Result<Option<String>, CliError>;
    /// Store / replace a value.
    fn set(&self, service: &str, account: &str, value: &str) -> Result<(), CliError>;
    /// Remove a stored value. Idempotent — a missing entry is `Ok(())`.
    fn delete(&self, service: &str, account: &str) -> Result<(), CliError>;
    /// Short human-readable name of this backend for `auth status` output.
    /// e.g. `"macOS Keychain"`, `"~/.config/elevenlabs/auth-keyring.json"`.
    fn backend_label(&self) -> String;
}

// ---------------------------------------------------------------------------
// OS keyring backend (keyring-rs)
// ---------------------------------------------------------------------------

/// OS-native credential store backed by [`keyring`].
#[cfg(not(target_env = "musl"))]
#[derive(Debug)]
pub struct OsKeyringStore;

#[cfg(not(target_env = "musl"))]
impl OsKeyringStore {
    /// Probe whether the platform's keyring is reachable by attempting a
    /// no-op read on a sentinel entry. Returns `Ok(())` if the keyring
    /// daemon / API is available, `Err` otherwise.
    pub fn probe() -> Result<(), CliError> {
        // Try to open an entry handle. On Linux without secret-service this
        // fails at the entry constructor; on macOS / Windows it succeeds
        // even if the credential doesn't yet exist.
        let entry = keyring::Entry::new("fern-cli-sdk-probe", "probe")
            .map_err(|e| CliError::Auth(format!("keyring probe failed: {e}")))?;
        // `get_password` returns `NoEntry` on missing — which is fine for
        // a probe — but a backend error here means the daemon is down.
        match entry.get_password() {
            Ok(_) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(CliError::Auth(format!("keyring probe failed: {e}"))),
        }
    }
}

#[cfg(not(target_env = "musl"))]
impl KeyringStore for OsKeyringStore {
    fn get(&self, service: &str, account: &str) -> Result<Option<String>, CliError> {
        let entry = keyring::Entry::new(service, account)
            .map_err(|e| CliError::Auth(format!("keyring open failed: {e}")))?;
        match entry.get_password() {
            Ok(v) => Ok(Some(v)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(CliError::Auth(format!("keyring get failed: {e}"))),
        }
    }

    fn set(&self, service: &str, account: &str, value: &str) -> Result<(), CliError> {
        let entry = keyring::Entry::new(service, account)
            .map_err(|e| CliError::Auth(format!("keyring open failed: {e}")))?;
        entry
            .set_password(value)
            .map_err(|e| CliError::Auth(format!("keyring set failed: {e}")))
    }

    fn delete(&self, service: &str, account: &str) -> Result<(), CliError> {
        let entry = keyring::Entry::new(service, account)
            .map_err(|e| CliError::Auth(format!("keyring open failed: {e}")))?;
        match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(CliError::Auth(format!("keyring delete failed: {e}"))),
        }
    }

    fn backend_label(&self) -> String {
        #[cfg(target_os = "macos")]
        return "macOS Keychain".to_string();
        #[cfg(target_os = "windows")]
        return "Windows Credential Manager".to_string();
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        return "secret-service (Linux)".to_string();
    }
}

// ---------------------------------------------------------------------------
// File backend (fallback)
// ---------------------------------------------------------------------------

/// File-backed credential store at `~/.config/<service>/auth-keyring.json`
/// (0600 on Unix).
///
/// The file is a JSON object keyed by `account`. Multiple services live in
/// separate directories. Atomic writes via temp-file-then-rename.
#[derive(Debug, Clone)]
pub struct FileKeyringStore {
    /// Root config directory — usually `~/.config` (Linux), `~/Library/Application Support` (macOS),
    /// `%APPDATA%` (Windows). Per-service subdir is created on demand.
    root: PathBuf,
}

impl FileKeyringStore {
    /// Build a store rooted at the platform's user config directory.
    /// Returns `None` if no home directory could be determined.
    pub fn user_default() -> Option<Self> {
        config_dir().map(|root| Self { root })
    }

    /// Build a store rooted at an arbitrary path (for testing).
    pub fn at_root(root: PathBuf) -> Self {
        Self { root }
    }

    fn path_for(&self, service: &str) -> PathBuf {
        // Distinct filename from the pre-existing `TokenCache`
        // (`oauth2.rs::TokenCache::for_cli`) which uses the same
        // `<root>/<service>/credentials.json` path. The two cohabit a
        // directory but write to separate files — preserves backward
        // compatibility for any binary already using `OAuth2TokenProvider`
        // with `.with_cache(<service>)` (e.g. `xero`).
        self.root.join(service).join("auth-keyring.json")
    }

    fn read_map(&self, service: &str) -> std::collections::HashMap<String, String> {
        let data = match std::fs::read_to_string(self.path_for(service)) {
            Ok(d) => d,
            Err(_) => return std::collections::HashMap::new(),
        };
        serde_json::from_str(&data).unwrap_or_default()
    }

    fn write_map(
        &self,
        service: &str,
        map: &std::collections::HashMap<String, String>,
    ) -> Result<(), CliError> {
        let path = self.path_for(service);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                CliError::Auth(format!(
                    "Failed to create credential dir {}: {e}",
                    parent.display()
                ))
            })?;
        }
        let json = serde_json::to_string_pretty(map)
            .map_err(|e| CliError::Auth(format!("Failed to serialize credentials: {e}")))?;
        atomic_write(&path, json.as_bytes())
    }
}

impl KeyringStore for FileKeyringStore {
    fn get(&self, service: &str, account: &str) -> Result<Option<String>, CliError> {
        Ok(self.read_map(service).get(account).cloned())
    }

    fn set(&self, service: &str, account: &str, value: &str) -> Result<(), CliError> {
        let mut map = self.read_map(service);
        map.insert(account.to_string(), value.to_string());
        self.write_map(service, &map)
    }

    fn delete(&self, service: &str, account: &str) -> Result<(), CliError> {
        let mut map = self.read_map(service);
        if map.remove(account).is_some() {
            self.write_map(service, &map)?;
        }
        Ok(())
    }

    fn backend_label(&self) -> String {
        format!("file ({})", self.root.display())
    }
}

// `atomic_write`, `home_dir`, and `config_dir` are shared with the
// existing `TokenCache` (oauth2.rs); see [`crate::auth::oauth_common`].

// ---------------------------------------------------------------------------
// Chunking wrapper (Windows Credential Manager blob-size limit)
// ---------------------------------------------------------------------------

/// Prefix of the marker written to the primary entry when a value is
/// split across multiple keyring entries. The full marker is
/// `<prefix><chunk count>:<total UTF-16 code units>`.
/// Deliberately not valid JSON and not a plausible token prefix, so a
/// plain value stored by an older binary can never be misread as chunked.
const CHUNK_MARKER_PREFIX: &str = "__fern-cli-chunked-v1__:";

/// Maximum UTF-16 code units stored in a single entry. Windows Credential
/// Manager rejects blobs over `CRED_MAX_CREDENTIAL_BLOB_SIZE` (2560 bytes
/// = 1280 UTF-16 code units, enforced by the `keyring` crate); stay under
/// it with margin. macOS Keychain and secret-service have no such limit,
/// so chunking there is harmless.
const MAX_ENTRY_UTF16_UNITS: usize = 1024;

/// Contents of a chunk marker: how many chunks the value was split into
/// and the total UTF-16 length of the reassembled value.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct ChunkMarker {
    count: usize,
    utf16_len: usize,
}

/// Wraps a [`KeyringStore`] and transparently splits values that exceed
/// [`MAX_ENTRY_UTF16_UNITS`] across sibling entries.
///
/// Layout for a value split into `n` chunks under `(service, account)`:
/// - `(service, account)`        → `__fern-cli-chunked-v1__:<n>:<utf16_len>`
/// - `(service, account#1..=n)`  → the chunks, in order
///
/// The marker carries the reassembled value's UTF-16 length so that a
/// torn write — the process dying between chunk writes, leaving a stale
/// marker describing a mix of old and new chunks — is detected on read
/// instead of yielding a corrupt value. See [`ChunkedKeyringStore::get`].
///
/// Values that fit in one entry are stored as-is, so existing plain
/// credentials written by older binaries read back unchanged.
///
/// Writing chunks is opt-in per platform (see
/// [`for_platform`](Self::for_platform)); reading them never is.
#[derive(Debug)]
pub struct ChunkedKeyringStore<S: KeyringStore> {
    inner: S,
    /// Whether oversized values are split on write. Reads reassemble
    /// chunked entries regardless of this flag.
    chunk_writes: bool,
}

impl<S: KeyringStore> ChunkedKeyringStore<S> {
    /// Wrap `inner`, splitting oversized values on write.
    pub fn new(inner: S) -> Self {
        Self::with_chunk_writes(inner, true)
    }

    /// Wrap `inner`, splitting on write only where the platform requires
    /// it — today, Windows alone. Elsewhere values are written plain, byte
    /// for byte as a pre-chunking binary would, so downgrading the CLI
    /// cannot strand a credential behind a marker the old build can't read.
    /// Reads stay marker-aware either way.
    pub fn for_platform(inner: S) -> Self {
        Self::with_chunk_writes(inner, cfg!(target_os = "windows"))
    }

    fn with_chunk_writes(inner: S, chunk_writes: bool) -> Self {
        Self {
            inner,
            chunk_writes,
        }
    }

    fn chunk_account(account: &str, index: usize) -> String {
        format!("{account}#{index}")
    }

    /// Parse a primary entry as a chunk marker. `None` means the value is
    /// a plain (unchunked) credential and should be returned as-is.
    fn parse_marker(value: &str) -> Option<ChunkMarker> {
        let (count, utf16_len) = value.strip_prefix(CHUNK_MARKER_PREFIX)?.split_once(':')?;
        Some(ChunkMarker {
            count: count.parse().ok()?,
            utf16_len: utf16_len.parse().ok()?,
        })
    }

    fn format_marker(marker: ChunkMarker) -> String {
        format!("{CHUNK_MARKER_PREFIX}{}:{}", marker.count, marker.utf16_len)
    }

    /// Chunk count recorded in the primary entry, or 0 if it is absent or
    /// holds a plain value. Used to reap chunks the new value doesn't use.
    fn stored_chunk_count(&self, service: &str, account: &str) -> Result<usize, CliError> {
        Ok(self
            .inner
            .get(service, account)?
            .as_deref()
            .and_then(Self::parse_marker)
            .map(|marker| marker.count)
            .unwrap_or(0))
    }

    /// Split on char boundaries so no chunk exceeds the per-entry UTF-16
    /// budget (surrogate pairs are never divided).
    fn split_chunks(value: &str) -> Vec<String> {
        let mut chunks = Vec::new();
        let mut current = String::new();
        let mut units = 0usize;
        for ch in value.chars() {
            let n = ch.len_utf16();
            if units + n > MAX_ENTRY_UTF16_UNITS && !current.is_empty() {
                chunks.push(std::mem::take(&mut current));
                units = 0;
            }
            current.push(ch);
            units += n;
        }
        if !current.is_empty() || chunks.is_empty() {
            chunks.push(current);
        }
        chunks
    }
}

impl<S: KeyringStore> KeyringStore for ChunkedKeyringStore<S> {
    fn get(&self, service: &str, account: &str) -> Result<Option<String>, CliError> {
        let Some(primary) = self.inner.get(service, account)? else {
            return Ok(None);
        };
        let Some(marker) = Self::parse_marker(&primary) else {
            return Ok(Some(primary));
        };
        let ChunkMarker { count, utf16_len } = marker;
        let mut value = String::new();
        for i in 1..=count {
            match self.inner.get(service, &Self::chunk_account(account, i))? {
                Some(chunk) => value.push_str(&chunk),
                // A missing chunk means the entry set was partially removed
                // (e.g. by hand in a credential manager UI). Treat the whole
                // credential as absent so the caller prompts a fresh login
                // rather than resolving a truncated token.
                None => {
                    tracing::warn!(
                        "keyring entry {service}/{account} is chunked but chunk {i}/{count} is missing; treating credential as absent"
                    );
                    return Ok(None);
                }
            }
        }
        // A length mismatch means the chunk set does not match the marker
        // that describes it — the tell-tale of a write torn partway through
        // (process killed between chunk writes), which leaves a stale marker
        // pointing at a mix of old and new chunks. Reassembling that would
        // hand back a corrupt token, so treat it as absent and re-login.
        let actual_utf16_len = value.encode_utf16().count();
        if actual_utf16_len != utf16_len {
            tracing::warn!(
                "keyring entry {service}/{account} reassembled to {actual_utf16_len} UTF-16 units but its marker records {utf16_len}; treating credential as absent"
            );
            return Ok(None);
        }
        Ok(Some(value))
    }

    fn set(&self, service: &str, account: &str, value: &str) -> Result<(), CliError> {
        let old_count = self.stored_chunk_count(service, account)?;

        let chunks = if self.chunk_writes {
            Self::split_chunks(value)
        } else {
            // No blob-size limit on this platform: store plain at any size.
            // Stale chunks from an entry written by a chunking build are
            // still reaped below.
            vec![value.to_string()]
        };
        let new_count = if chunks.len() > 1 { chunks.len() } else { 0 };
        if new_count == 0 {
            self.inner.set(service, account, value)?;
        } else {
            // Chunks first, marker last: a failure mid-write leaves the
            // previous primary entry (plain value or old marker) intact.
            // The old marker then describes a chunk set it no longer
            // matches, which `get` catches via the recorded UTF-16 length.
            for (i, chunk) in chunks.iter().enumerate() {
                self.inner
                    .set(service, &Self::chunk_account(account, i + 1), chunk)?;
            }
            let marker = ChunkMarker {
                count: chunks.len(),
                utf16_len: value.encode_utf16().count(),
            };
            self.inner
                .set(service, account, &Self::format_marker(marker))?;
        }

        // Remove chunks left over from a previous, larger value.
        for i in (new_count + 1)..=old_count {
            self.inner.delete(service, &Self::chunk_account(account, i))?;
        }
        Ok(())
    }

    fn delete(&self, service: &str, account: &str) -> Result<(), CliError> {
        let old_count = self.stored_chunk_count(service, account)?;
        self.inner.delete(service, account)?;
        for i in 1..=old_count {
            self.inner.delete(service, &Self::chunk_account(account, i))?;
        }
        Ok(())
    }

    fn backend_label(&self) -> String {
        self.inner.backend_label()
    }
}

// ---------------------------------------------------------------------------
// Auto-pick + process-global handle
// ---------------------------------------------------------------------------

/// Try the OS keyring; fall back to file on probe failure. Returns the
/// file backend as a last resort if no home directory is available
/// (Docker FROM scratch, etc.) — pointed at `/tmp/<cli>-credentials`,
/// which won't persist but won't crash. The user will see this in
/// `auth status` and can take action.
pub fn auto_store() -> Arc<dyn KeyringStore> {
    // Explicit override: `FERN_CLI_CREDENTIAL_STORE=file` forces the file backend, bypassing the
    // OS keyring entirely. Useful for CI, containers, and hermetic tests (e.g. the generated wire
    // tests) where the OS keyring is unavailable or would pop an interactive unlock prompt. The
    // file location still honors `HOME` / `XDG_CONFIG_HOME`, so a test can redirect it to a temp dir.
    if std::env::var_os("FERN_CLI_CREDENTIAL_STORE").is_some_and(|value| value == "file") {
        tracing::debug!("FERN_CLI_CREDENTIAL_STORE=file; using file backend for credential storage");
        return match FileKeyringStore::user_default() {
            Some(store) => Arc::new(store),
            None => Arc::new(FileKeyringStore::at_root(PathBuf::from("/tmp/fern-cli-credentials"))),
        };
    }
    #[cfg(not(target_env = "musl"))]
    {
        if OsKeyringStore::probe().is_ok() {
            tracing::debug!("Using OS keyring backend for credential storage");
            return Arc::new(ChunkedKeyringStore::for_platform(OsKeyringStore));
        }
    }
    tracing::debug!("OS keyring unavailable; falling back to file backend");
    match FileKeyringStore::user_default() {
        Some(store) => Arc::new(store),
        None => {
            tracing::warn!("No config dir available; using /tmp for credential storage");
            Arc::new(FileKeyringStore::at_root(PathBuf::from("/tmp/fern-cli-credentials")))
        }
    }
}

/// Process-global active keyring store. Initialised once by `CliApp::run`
/// (or by tests via [`set_active_store`]).
static ACTIVE_STORE: OnceLock<RwLock<Arc<dyn KeyringStore>>> = OnceLock::new();

/// Install the active credential store. Idempotent: first call wins for
/// the `OnceLock` slot; subsequent calls swap the inner `Arc` via the
/// `RwLock`. Tests use the swap path to install mocks.
pub fn set_active_store(store: Arc<dyn KeyringStore>) {
    match ACTIVE_STORE.get() {
        Some(slot) => {
            *slot.write().expect("ACTIVE_STORE poisoned") = store;
        }
        None => {
            let _ = ACTIVE_STORE.set(RwLock::new(store));
        }
    }
}

/// Get a handle to the active credential store, initialising it with
/// [`auto_store`] on first access if `CliApp` hasn't installed one yet.
pub fn active_store() -> Arc<dyn KeyringStore> {
    let slot = ACTIVE_STORE.get_or_init(|| RwLock::new(auto_store()));
    slot.read().expect("ACTIVE_STORE poisoned").clone()
}

// ---------------------------------------------------------------------------
// In-memory mock (for tests)
// ---------------------------------------------------------------------------

/// In-memory store for tests. Thread-safe.
#[derive(Debug, Clone, Default)]
pub struct MockKeyringStore {
    inner: Arc<RwLock<std::collections::HashMap<(String, String), String>>>,
}

impl MockKeyringStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn snapshot(&self) -> Vec<((String, String), String)> {
        self.inner
            .read()
            .unwrap()
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect()
    }
}

impl KeyringStore for MockKeyringStore {
    fn get(&self, service: &str, account: &str) -> Result<Option<String>, CliError> {
        Ok(self
            .inner
            .read()
            .unwrap()
            .get(&(service.to_string(), account.to_string()))
            .cloned())
    }

    fn set(&self, service: &str, account: &str, value: &str) -> Result<(), CliError> {
        self.inner
            .write()
            .unwrap()
            .insert((service.to_string(), account.to_string()), value.to_string());
        Ok(())
    }

    fn delete(&self, service: &str, account: &str) -> Result<(), CliError> {
        self.inner
            .write()
            .unwrap()
            .remove(&(service.to_string(), account.to_string()));
        Ok(())
    }

    fn backend_label(&self) -> String {
        "mock (in-memory)".to_string()
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;

    #[test]
    fn file_store_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let store = FileKeyringStore::at_root(dir.path().to_path_buf());

        assert_eq!(store.get("elevenlabs", "OAuth2").unwrap(), None);

        store.set("elevenlabs", "OAuth2", "token-abc").unwrap();
        assert_eq!(
            store.get("elevenlabs", "OAuth2").unwrap().as_deref(),
            Some("token-abc")
        );

        store.delete("elevenlabs", "OAuth2").unwrap();
        assert_eq!(store.get("elevenlabs", "OAuth2").unwrap(), None);
    }

    #[test]
    fn file_store_multiple_accounts_per_service() {
        let dir = tempfile::tempdir().unwrap();
        let store = FileKeyringStore::at_root(dir.path().to_path_buf());

        store.set("svc", "acct1", "v1").unwrap();
        store.set("svc", "acct2", "v2").unwrap();

        assert_eq!(store.get("svc", "acct1").unwrap().as_deref(), Some("v1"));
        assert_eq!(store.get("svc", "acct2").unwrap().as_deref(), Some("v2"));

        store.delete("svc", "acct1").unwrap();
        assert_eq!(store.get("svc", "acct1").unwrap(), None);
        // acct2 untouched
        assert_eq!(store.get("svc", "acct2").unwrap().as_deref(), Some("v2"));
    }

    #[test]
    fn file_store_isolates_services() {
        let dir = tempfile::tempdir().unwrap();
        let store = FileKeyringStore::at_root(dir.path().to_path_buf());

        store.set("svc-a", "key", "value-a").unwrap();
        store.set("svc-b", "key", "value-b").unwrap();

        assert_eq!(store.get("svc-a", "key").unwrap().as_deref(), Some("value-a"));
        assert_eq!(store.get("svc-b", "key").unwrap().as_deref(), Some("value-b"));
    }

    #[test]
    fn file_store_delete_missing_is_ok() {
        let dir = tempfile::tempdir().unwrap();
        let store = FileKeyringStore::at_root(dir.path().to_path_buf());
        // Deleting a missing entry is idempotent — no error.
        store.delete("nothing", "here").unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn file_store_writes_owner_only_perms() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let store = FileKeyringStore::at_root(dir.path().to_path_buf());
        store.set("svc", "k", "v").unwrap();

        let path = dir.path().join("svc").join("auth-keyring.json");
        let mode = std::fs::metadata(&path).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o600, "credential file should be 0600");
    }

    #[test]
    fn mock_store_roundtrip() {
        let store = MockKeyringStore::new();
        assert_eq!(store.get("s", "a").unwrap(), None);
        store.set("s", "a", "v").unwrap();
        assert_eq!(store.get("s", "a").unwrap().as_deref(), Some("v"));
        store.delete("s", "a").unwrap();
        assert_eq!(store.get("s", "a").unwrap(), None);
    }

    #[test]
    fn mock_store_snapshot_lists_entries() {
        let store = MockKeyringStore::new();
        store.set("s", "a", "v1").unwrap();
        store.set("s", "b", "v2").unwrap();
        let mut snap = store.snapshot();
        snap.sort();
        assert_eq!(
            snap,
            vec![
                (("s".to_string(), "a".to_string()), "v1".to_string()),
                (("s".to_string(), "b".to_string()), "v2".to_string()),
            ]
        );
    }

    #[test]
    #[serial]
    fn active_store_install_and_swap() {
        let mock1 = Arc::new(MockKeyringStore::new());
        set_active_store(mock1.clone());
        // First call returns mock1.
        active_store().set("svc", "acct", "v1").unwrap();
        assert_eq!(mock1.get("svc", "acct").unwrap().as_deref(), Some("v1"));

        // Swap to mock2.
        let mock2 = Arc::new(MockKeyringStore::new());
        set_active_store(mock2.clone());
        active_store().set("svc", "acct", "v2").unwrap();
        assert_eq!(mock2.get("svc", "acct").unwrap().as_deref(), Some("v2"));
        // mock1 retains its original value (we wrote v1 there).
        assert_eq!(mock1.get("svc", "acct").unwrap().as_deref(), Some("v1"));
    }

    fn value_of_utf16_units(units: usize) -> String {
        "x".repeat(units)
    }

    #[test]
    fn chunked_store_small_value_stored_plain() {
        let mock = MockKeyringStore::new();
        let store = ChunkedKeyringStore::new(mock.clone());

        store.set("svc", "acct", "short-token").unwrap();
        assert_eq!(mock.get("svc", "acct").unwrap().as_deref(), Some("short-token"));
        assert_eq!(store.get("svc", "acct").unwrap().as_deref(), Some("short-token"));
        assert_eq!(mock.snapshot().len(), 1);
    }

    #[test]
    fn chunked_store_splits_and_reassembles_large_value() {
        let mock = MockKeyringStore::new();
        let store = ChunkedKeyringStore::new(mock.clone());

        let value = value_of_utf16_units(MAX_ENTRY_UTF16_UNITS * 2 + 100);
        store.set("svc", "acct", &value).unwrap();

        // Primary entry holds the marker, chunks hold the payload.
        let primary = mock.get("svc", "acct").unwrap().unwrap();
        assert_eq!(
            primary,
            format!("{CHUNK_MARKER_PREFIX}3:{}", value.encode_utf16().count())
        );
        for ((_, account), chunk) in store_snapshot_chunks(&mock) {
            assert_ne!(account, "acct");
            assert!(
                chunk.encode_utf16().count() <= MAX_ENTRY_UTF16_UNITS,
                "chunk {account} exceeds the per-entry UTF-16 budget"
            );
        }

        assert_eq!(store.get("svc", "acct").unwrap().as_deref(), Some(value.as_str()));
    }

    /// Chunk entries (everything except the primary marker entry).
    fn store_snapshot_chunks(mock: &MockKeyringStore) -> Vec<((String, String), String)> {
        mock.snapshot()
            .into_iter()
            .filter(|((_, account), _)| account != "acct")
            .collect()
    }

    #[test]
    fn chunked_store_never_splits_surrogate_pairs() {
        let mock = MockKeyringStore::new();
        let store = ChunkedKeyringStore::new(mock.clone());

        // '𝄞' is 2 UTF-16 code units. The leading 1-unit char makes the
        // per-entry budget run out mid-pair, so the splitter must break
        // one unit early rather than divide a surrogate pair.
        let mut value = String::from("x");
        value.extend(std::iter::repeat_n('𝄞', MAX_ENTRY_UTF16_UNITS));
        store.set("svc", "acct", &value).unwrap();
        assert_eq!(store.get("svc", "acct").unwrap().as_deref(), Some(value.as_str()));
    }

    #[test]
    fn chunked_store_overwrite_with_smaller_value_removes_stale_chunks() {
        let mock = MockKeyringStore::new();
        let store = ChunkedKeyringStore::new(mock.clone());

        let big = value_of_utf16_units(MAX_ENTRY_UTF16_UNITS * 3);
        store.set("svc", "acct", &big).unwrap();
        assert_eq!(mock.snapshot().len(), 4); // marker + 3 chunks

        store.set("svc", "acct", "small").unwrap();
        assert_eq!(store.get("svc", "acct").unwrap().as_deref(), Some("small"));
        assert_eq!(mock.snapshot().len(), 1, "stale chunk entries must be removed");
    }

    #[test]
    fn chunked_store_delete_removes_all_chunks() {
        let mock = MockKeyringStore::new();
        let store = ChunkedKeyringStore::new(mock.clone());

        let big = value_of_utf16_units(MAX_ENTRY_UTF16_UNITS * 2);
        store.set("svc", "acct", &big).unwrap();
        store.delete("svc", "acct").unwrap();

        assert_eq!(store.get("svc", "acct").unwrap(), None);
        assert!(mock.snapshot().is_empty(), "delete must remove marker and chunks");
    }

    #[test]
    fn chunked_store_reads_plain_value_from_older_binary() {
        let mock = MockKeyringStore::new();
        // An older binary wrote directly, without the chunking wrapper.
        mock.set("svc", "acct", "legacy-token").unwrap();

        let store = ChunkedKeyringStore::new(mock);
        assert_eq!(store.get("svc", "acct").unwrap().as_deref(), Some("legacy-token"));
    }

    #[test]
    fn chunked_store_missing_chunk_treated_as_absent() {
        let mock = MockKeyringStore::new();
        let store = ChunkedKeyringStore::new(mock.clone());

        let big = value_of_utf16_units(MAX_ENTRY_UTF16_UNITS * 2);
        store.set("svc", "acct", &big).unwrap();
        // Simulate a user deleting one chunk in a credential-manager UI.
        mock.delete("svc", "acct#2").unwrap();

        assert_eq!(store.get("svc", "acct").unwrap(), None);
    }

    #[test]
    fn chunked_store_torn_write_detected_by_length() {
        let mock = MockKeyringStore::new();
        let store = ChunkedKeyringStore::new(mock.clone());

        // Three chunks on disk, then a write that dies after replacing only
        // the first chunk with a shorter value. The stale marker still says
        // three chunks, so `get` would otherwise splice new chunk 1 onto old
        // chunks 2-3 and hand back a corrupt token.
        let big = value_of_utf16_units(MAX_ENTRY_UTF16_UNITS * 3);
        store.set("svc", "acct", &big).unwrap();
        mock.set("svc", "acct#1", "truncated-replacement").unwrap();

        assert_eq!(store.get("svc", "acct").unwrap(), None);
    }

    #[test]
    fn chunked_store_marker_without_length_is_not_treated_as_chunked() {
        let mock = MockKeyringStore::new();
        // A count-only marker is not a marker this version writes; it must
        // not be parsed as one and silently reassemble missing chunks.
        mock.set("svc", "acct", &format!("{CHUNK_MARKER_PREFIX}2"))
            .unwrap();

        let store = ChunkedKeyringStore::new(mock);
        assert_eq!(
            store.get("svc", "acct").unwrap().as_deref(),
            Some(format!("{CHUNK_MARKER_PREFIX}2").as_str())
        );
    }

    #[test]
    fn chunked_store_write_gating_follows_platform() {
        let mock = MockKeyringStore::new();
        let store = ChunkedKeyringStore::for_platform(mock.clone());

        let big = value_of_utf16_units(MAX_ENTRY_UTF16_UNITS * 2);
        store.set("svc", "acct", &big).unwrap();

        if cfg!(target_os = "windows") {
            assert_eq!(
                mock.snapshot().len(),
                3,
                "Windows must split oversized values: marker + 2 chunks"
            );
        } else {
            // Byte-identical to a pre-chunking binary, so a downgraded CLI
            // still reads a usable credential rather than the marker.
            assert_eq!(
                mock.snapshot().len(),
                1,
                "platforms without a blob limit must store plain"
            );
            assert_eq!(mock.get("svc", "acct").unwrap().as_deref(), Some(big.as_str()));
        }

        assert_eq!(store.get("svc", "acct").unwrap().as_deref(), Some(big.as_str()));
    }

    #[test]
    fn chunked_store_reads_chunks_even_when_writes_are_gated() {
        let mock = MockKeyringStore::new();
        let big = value_of_utf16_units(MAX_ENTRY_UTF16_UNITS * 2);
        // Written by a chunking build.
        ChunkedKeyringStore::new(mock.clone())
            .set("svc", "acct", &big)
            .unwrap();

        // A non-chunking wrapper must still reassemble it.
        let reader = ChunkedKeyringStore::with_chunk_writes(mock, false);
        assert_eq!(reader.get("svc", "acct").unwrap().as_deref(), Some(big.as_str()));
    }

    #[test]
    fn chunked_store_gated_write_reaps_chunks_from_a_chunking_build() {
        let mock = MockKeyringStore::new();
        let big = value_of_utf16_units(MAX_ENTRY_UTF16_UNITS * 3);
        ChunkedKeyringStore::new(mock.clone())
            .set("svc", "acct", &big)
            .unwrap();
        assert_eq!(mock.snapshot().len(), 4);

        // Re-login on a platform that stores plain must not leave the old
        // chunk entries behind.
        let plain = ChunkedKeyringStore::with_chunk_writes(mock.clone(), false);
        plain.set("svc", "acct", &big).unwrap();

        assert_eq!(mock.snapshot().len(), 1, "stale chunks must be removed");
        assert_eq!(plain.get("svc", "acct").unwrap().as_deref(), Some(big.as_str()));
    }

    #[test]
    fn chunked_store_backend_label_delegates() {
        let store = ChunkedKeyringStore::new(MockKeyringStore::new());
        assert_eq!(store.backend_label(), "mock (in-memory)");
    }

    #[test]
    fn backend_labels_describe_themselves() {
        let file = FileKeyringStore::at_root(PathBuf::from("/tmp/xx"));
        assert!(file.backend_label().contains("file"));
        let mock = MockKeyringStore::new();
        assert_eq!(mock.backend_label(), "mock (in-memory)");
    }
}
