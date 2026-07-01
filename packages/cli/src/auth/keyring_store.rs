//! On-disk / OS-keyring credential storage for `auth login` flows.
//!
//! Two backends behind a single [`KeyringStore`] trait:
//! - [`OsKeyringStore`] — wraps [`keyring`] (macOS Keychain, Windows
//!   Credential Manager, Linux secret-service).
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
#[derive(Debug)]
pub struct OsKeyringStore;

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
// Auto-pick + process-global handle
// ---------------------------------------------------------------------------

/// Try the OS keyring; fall back to file on probe failure. Returns the
/// file backend as a last resort if no home directory is available
/// (Docker FROM scratch, etc.) — pointed at `/tmp/<cli>-credentials`,
/// which won't persist but won't crash. The user will see this in
/// `auth status` and can take action.
pub fn auto_store() -> Arc<dyn KeyringStore> {
    if OsKeyringStore::probe().is_ok() {
        tracing::debug!("Using OS keyring backend for credential storage");
        return Arc::new(OsKeyringStore);
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

    #[test]
    fn backend_labels_describe_themselves() {
        let file = FileKeyringStore::at_root(PathBuf::from("/tmp/xx"));
        assert!(file.backend_label().contains("file"));
        let mock = MockKeyringStore::new();
        assert_eq!(mock.backend_label(), "mock (in-memory)");
    }
}
