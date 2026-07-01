//! `AuthCredentialSource` — the lazy-supplier model for credential values.
//!
//! Mirrors the TypeScript SDK's `Supplier<T>` and grows it into a full
//! resolution graph. Each binding holds a description of *where* its value
//! comes from — env var, CLI flag, file, literal, fallback chain, or
//! arbitrary closure — without coupling that to the auth provider that
//! consumes the resolved string.
//!
//! Resolution happens at request time so env-var changes between
//! invocations Just Work, files re-read on every call, and fallback chains
//! can mix any of the source kinds.
//!
//! # CLI flag wiring
//!
//! [`AuthCredentialSource::Cli`] holds the *name* of a clap arg — the SDK's
//! `CliApp::run_async` walks every registered binding before parsing,
//! auto-registers a global `--<name>` flag for each `Cli` variant, and then
//! finalizes the bindings post-parse so that resolution reads from the
//! captured matches. None of this is visible to the binding's author —
//! they just write `AuthCredentialSource::cli("api-token")` and the flag
//! shows up.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use secrecy::SecretString;

use crate::auth::keyring_store::active_store;

type CredentialClosure = Arc<dyn Fn() -> Option<String> + Send + Sync>;

/// How an auth credential's value is resolved at request time.
#[derive(Clone)]
pub enum AuthCredentialSource {
    /// Read from a process environment variable. Surrounding whitespace is
    /// trimmed; returns `None` if unset, empty, or whitespace-only —
    /// matching the trimming behaviour of [`File`](Self::File) so chained
    /// sources behave the same regardless of which one supplies the value.
    Env(String),
    /// Read from a clap CLI arg. The string is the arg's *name* (clap's
    /// internal id), not the `--flag` form — `cli("api-token")` corresponds
    /// to a `--api-token` flag. Leading `--` / `-` are stripped for
    /// convenience, so `cli("--api-token")` works too.
    ///
    /// Until the binding is finalized via [`finalize`](Self::finalize) (i.e.
    /// before clap parses), this variant always resolves to `None` —
    /// CliApp does the finalization automatically before any request runs.
    Cli(String),
    /// Read the contents of a file. `~` and `~/` are expanded to the
    /// process's `$HOME`. Trailing whitespace is trimmed; a missing file
    /// or empty content resolves to `None`.
    File(PathBuf),
    /// A literal value embedded at build time.
    Literal(String),
    /// Fallback chain. Each child is tried in order; the first to return
    /// `Some` wins. Empty results count as "missing" — useful for
    /// "CLI flag, then env var, then file" patterns.
    Chain(Vec<AuthCredentialSource>),
    /// A user-supplied closure invoked on every request. The escape hatch
    /// for any source the built-in variants don't cover (token refresh,
    /// shell-out, OS keychain, etc.).
    ///
    /// The optional `String` carries a human-readable credential hint
    /// (e.g. `"--api-token flag"`) so that `credential_hints()` can still
    /// report the original source after `finalize()` replaces `Cli` with
    /// a `Closure`.
    Closure(CredentialClosure, Option<String>),
    /// Read from the OS keyring (or its file fallback). Populated by
    /// `auth login` flows; resolves via the process-global active
    /// [`KeyringStore`](crate::auth::keyring_store::KeyringStore).
    ///
    /// Sits at priority 3 in the default credential chain — below CLI
    /// flags and env vars, above file sources (ADR-0008).
    Keyring {
        /// Keyring service name — typically the CLI's binary name.
        service: String,
        /// Account name within the service — typically the auth scheme name.
        account: String,
    },
    /// No source bound. The provider will report itself as unable to
    /// satisfy requests.
    Missing,
}

impl AuthCredentialSource {
    pub fn from_env(var_name: impl Into<String>) -> Self {
        AuthCredentialSource::Env(var_name.into())
    }

    /// Bind to a clap CLI arg. Accepts either `"api-token"` or
    /// `"--api-token"` — leading dashes are stripped.
    pub fn cli(arg_name: impl Into<String>) -> Self {
        let raw = arg_name.into();
        let name = raw.trim_start_matches('-').to_string();
        AuthCredentialSource::Cli(name)
    }

    /// Bind to a file path. `~` and `~/` expand against `$HOME`.
    pub fn file(path: impl AsRef<Path>) -> Self {
        AuthCredentialSource::File(path.as_ref().to_path_buf())
    }

    pub fn literal(value: impl Into<String>) -> Self {
        AuthCredentialSource::Literal(value.into())
    }

    /// Try each source in order; the first non-empty value wins.
    pub fn any(sources: impl IntoIterator<Item = AuthCredentialSource>) -> Self {
        AuthCredentialSource::Chain(sources.into_iter().collect())
    }

    pub fn closure<F>(f: F) -> Self
    where
        F: Fn() -> Option<String> + Send + Sync + 'static,
    {
        AuthCredentialSource::Closure(Arc::new(f), None)
    }

    /// Bind to a keyring entry at `(service, account)`. The value is read
    /// from the process-global active [`KeyringStore`] at resolve time.
    pub fn keyring(service: impl Into<String>, account: impl Into<String>) -> Self {
        AuthCredentialSource::Keyring {
            service: service.into(),
            account: account.into(),
        }
    }

    /// Resolve the value, if available. Empty strings are treated as
    /// missing — they would otherwise produce an empty header, which is
    /// almost never what a caller intends.
    ///
    /// Returns a [`SecretString`] so the value can't accidentally leak via
    /// `Debug`/`Display`/panic messages. Callers that need the raw `&str`
    /// (to build a `HeaderValue`, base64-encode for basic auth, etc.)
    /// must opt in explicitly via [`ExposeSecret::expose_secret`].
    pub fn resolve(&self) -> Option<SecretString> {
        match self {
            AuthCredentialSource::Env(name) => std::env::var(name)
                .ok()
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty())
                .map(SecretString::from),
            AuthCredentialSource::Cli(_) => None, // resolved post-finalize
            AuthCredentialSource::File(path) => read_credential_file(path),
            AuthCredentialSource::Literal(v) if v.is_empty() => None,
            AuthCredentialSource::Literal(v) => Some(SecretString::from(v.clone())),
            AuthCredentialSource::Chain(sources) => sources.iter().find_map(|s| s.resolve()),
            AuthCredentialSource::Closure(f, _) => f().filter(|v| !v.is_empty()).map(SecretString::from),
            AuthCredentialSource::Keyring { service, account } => active_store()
                .get(service, account)
                .ok()
                .flatten()
                .filter(|v| !v.is_empty())
                .map(SecretString::from),
            AuthCredentialSource::Missing => None,
        }
    }

    /// The environment-variable name backing this source, if it is an
    /// [`Env`](Self::Env) source. Returns `None` for every other variant.
    ///
    /// Used by the OAuth2 lowering ([`OAuth2Auth`](crate::auth::OAuth2Auth)),
    /// whose [`OAuth2Grant`](crate::auth::OAuth2Grant) resolves client
    /// credentials from env-var *names* at token-refresh time. Non-env
    /// sources can't feed that grant, so the OAuth2 path treats them as
    /// missing config and fails fast rather than authenticating silently.
    pub fn env_var_name(&self) -> Option<&str> {
        match self {
            AuthCredentialSource::Env(name) => Some(name),
            _ => None,
        }
    }

    /// Human-readable descriptions of where this source reads credentials
    /// from. Used by the auth-error path to tell the user which env var,
    /// flag, or file to set.
    pub fn credential_hints(&self) -> Vec<String> {
        match self {
            AuthCredentialSource::Env(name) => vec![format!("{name} environment variable")],
            AuthCredentialSource::Cli(arg) => vec![format!("--{arg} flag")],
            AuthCredentialSource::File(path) => vec![format!("{} file", path.display())],
            AuthCredentialSource::Chain(sources) => {
                sources.iter().flat_map(|s| s.credential_hints()).collect()
            }
            AuthCredentialSource::Closure(_, Some(hint)) => vec![hint.clone()],
            AuthCredentialSource::Keyring { service, account } => {
                vec![format!("keyring entry {service}:{account} (populated by `<bin> auth login`)")]
            }
            AuthCredentialSource::Literal(_)
            | AuthCredentialSource::Closure(_, None)
            | AuthCredentialSource::Missing => Vec::new(),
        }
    }

    /// Recursively collect every CLI arg name this source references.
    /// CliApp uses this before clap parsing to register the corresponding
    /// global `--<name>` flags.
    pub fn cli_args(&self) -> Vec<&str> {
        let mut out = Vec::new();
        self.collect_cli_args(&mut out);
        out
    }

    fn collect_cli_args<'a>(&'a self, out: &mut Vec<&'a str>) {
        // Enumerate every variant explicitly so adding a future variant
        // (especially one that nests sources or carries an arg name) is a
        // compile error rather than a silent miss.
        match self {
            AuthCredentialSource::Cli(name) => out.push(name.as_str()),
            AuthCredentialSource::Chain(sources) => {
                for s in sources {
                    s.collect_cli_args(out);
                }
            }
            AuthCredentialSource::Env(_)
            | AuthCredentialSource::File(_)
            | AuthCredentialSource::Literal(_)
            | AuthCredentialSource::Closure(_, _)
            | AuthCredentialSource::Keyring { .. }
            | AuthCredentialSource::Missing => {}
        }
    }

    /// Replace every `Cli(name)` variant in this source with a `Closure`
    /// that reads the matched value out of `matches`. Called by CliApp
    /// after clap parses, so that subsequent `resolve()` calls can see the
    /// CLI-supplied values.
    ///
    /// Pass-through for non-`Cli` variants. Recurses into `Chain`.
    pub fn finalize(self, matches: &Arc<clap::ArgMatches>) -> Self {
        match self {
            AuthCredentialSource::Cli(name) => {
                let m = Arc::clone(matches);
                let hint = format!("--{name} flag");
                AuthCredentialSource::Closure(
                    Arc::new(move || {
                        m.try_get_one::<String>(&name).ok().flatten().cloned()
                    }),
                    Some(hint),
                )
            }
            AuthCredentialSource::Chain(sources) => {
                AuthCredentialSource::Chain(
                    sources.into_iter().map(|s| s.finalize(matches)).collect(),
                )
            }
            other => other,
        }
    }
}

impl std::fmt::Debug for AuthCredentialSource {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AuthCredentialSource::Env(name) => write!(f, "Env({name})"),
            AuthCredentialSource::Cli(name) => write!(f, "Cli({name})"),
            AuthCredentialSource::File(path) => write!(f, "File({})", path.display()),
            AuthCredentialSource::Literal(_) => write!(f, "Literal(<redacted>)"),
            AuthCredentialSource::Chain(sources) => f.debug_tuple("Chain").field(sources).finish(),
            AuthCredentialSource::Closure(_, hint) => {
                if let Some(h) = hint {
                    write!(f, "Closure({h})")
                } else {
                    write!(f, "Closure")
                }
            }
            AuthCredentialSource::Keyring { service, account } => {
                write!(f, "Keyring({service}:{account})")
            }
            AuthCredentialSource::Missing => write!(f, "Missing"),
        }
    }
}

/// Read a credential file: expand `~`, trim trailing whitespace, treat
/// empty content / missing files as `None`. Result is wrapped in
/// [`SecretString`] so the file contents can't leak through Debug.
fn read_credential_file(path: &Path) -> Option<SecretString> {
    let expanded = expand_home(path);
    let raw = std::fs::read_to_string(&expanded).ok()?;
    let trimmed = raw.trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(SecretString::from(trimmed))
    }
}

/// Expand a leading `~` or `~/` against the user's home directory. On
/// Unix that's `$HOME`; on Windows we fall back to `%USERPROFILE%` since
/// `$HOME` is typically unset there. Other forms (`~user`, embedded `~`)
/// are left as-is — uncommon for credential paths and surprising to
/// silently rewrite.
fn expand_home(path: &Path) -> PathBuf {
    let s = match path.to_str() {
        Some(s) => s,
        None => return path.to_path_buf(),
    };
    if s == "~" {
        return home_dir().unwrap_or_else(|| path.to_path_buf());
    }
    if let Some(rest) = s.strip_prefix("~/") {
        if let Some(home) = home_dir() {
            return home.join(rest);
        }
    }
    path.to_path_buf()
}

/// Cross-platform home directory lookup: `$HOME` first (set on Unix and
/// honored on Windows under WSL/MSYS shells), then `%USERPROFILE%` as the
/// native Windows fallback.
fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .filter(|p| !p.as_os_str().is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    use secrecy::ExposeSecret;

    /// Test helper: resolve the source and expose the secret so assertions
    /// can compare against plain strings. Production code should keep the
    /// `SecretString` wrapper as long as possible.
    fn resolved(s: &AuthCredentialSource) -> Option<String> {
        s.resolve().map(|v| v.expose_secret().to_string())
    }

    // -------- Env --------

    #[test]
    fn literal_resolves() {
        assert_eq!(
            resolved(&AuthCredentialSource::literal("abc")),
            Some("abc".to_string()),
        );
    }

    #[test]
    fn env_returns_none_when_unset() {
        let s = AuthCredentialSource::from_env("FERN_CLI_AUTH_TEST_DEFINITELY_UNSET");
        assert_eq!(resolved(&s), None);
    }

    #[test]
    fn env_treats_empty_as_missing() {
        let key = "FERN_CLI_AUTH_TEST_EMPTY";
        std::env::set_var(key, "");
        let s = AuthCredentialSource::from_env(key);
        assert_eq!(resolved(&s), None);
        std::env::remove_var(key);
    }

    #[test]
    fn env_treats_whitespace_only_as_missing() {
        // Parity with `File` (which trims). A whitespace-only env var would
        // otherwise produce a header value of "   ", which is almost never
        // what the user intended and breaks `Chain` fallthrough.
        let key = "FERN_CLI_AUTH_TEST_WHITESPACE";
        std::env::set_var(key, "   \t  \n");
        let s = AuthCredentialSource::from_env(key);
        assert_eq!(resolved(&s), None);
        std::env::remove_var(key);
    }

    #[test]
    fn env_trims_surrounding_whitespace() {
        let key = "FERN_CLI_AUTH_TEST_TRIM";
        std::env::set_var(key, "  tok  \n");
        let s = AuthCredentialSource::from_env(key);
        assert_eq!(resolved(&s), Some("tok".to_string()));
        std::env::remove_var(key);
    }

    // -------- Closure --------

    #[test]
    fn closure_resolves() {
        let s = AuthCredentialSource::closure(|| Some("zzz".to_string()));
        assert_eq!(resolved(&s), Some("zzz".to_string()));
    }

    #[test]
    fn closure_returning_none_is_missing() {
        let s = AuthCredentialSource::closure(|| None);
        assert_eq!(resolved(&s), None);
    }

    #[test]
    fn closure_returning_empty_string_is_missing() {
        let s = AuthCredentialSource::closure(|| Some(String::new()));
        assert_eq!(resolved(&s), None);
    }

    #[test]
    fn missing_resolves_to_none() {
        assert_eq!(resolved(&AuthCredentialSource::Missing), None);
    }

    // -------- File --------

    #[test]
    fn file_reads_and_trims_contents() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("token");
        std::fs::write(&path, "  my-token  \n").unwrap();
        let s = AuthCredentialSource::file(&path);
        assert_eq!(resolved(&s), Some("my-token".to_string()));
    }

    #[test]
    fn file_missing_resolves_to_none() {
        let s = AuthCredentialSource::file("/definitely/not/a/real/path-xyz");
        assert_eq!(resolved(&s), None);
    }

    #[test]
    fn file_empty_content_is_missing() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("empty");
        std::fs::write(&path, "   \n\n").unwrap();
        let s = AuthCredentialSource::file(&path);
        assert_eq!(resolved(&s), None);
    }

    #[test]
    fn literal_empty_string_resolves_to_none() {
        // Consistency with Env / Closure variants: empty values aren't
        // sent as headers. Also makes `Chain([literal(""), env(...)])`
        // fall through to the env source as a user would expect.
        assert_eq!(resolved(&AuthCredentialSource::literal("")), None);
    }

    #[test]
    fn chain_with_empty_literal_falls_through() {
        let s = AuthCredentialSource::any([
            AuthCredentialSource::literal(""),
            AuthCredentialSource::literal("backup"),
        ]);
        assert_eq!(resolved(&s), Some("backup".to_string()));
    }

    #[test]
    fn home_dir_falls_back_to_userprofile_when_home_unset() {
        // Save/restore both env vars to keep test isolated.
        let prev_home = std::env::var_os("HOME");
        let prev_userprofile = std::env::var_os("USERPROFILE");

        std::env::remove_var("HOME");
        std::env::set_var("USERPROFILE", "/win-home");
        assert_eq!(home_dir(), Some(PathBuf::from("/win-home")));

        // Restore.
        match prev_home {
            Some(v) => std::env::set_var("HOME", v),
            None => std::env::remove_var("HOME"),
        }
        match prev_userprofile {
            Some(v) => std::env::set_var("USERPROFILE", v),
            None => std::env::remove_var("USERPROFILE"),
        }
    }

    #[test]
    fn expand_home_resolves_tilde_prefix() {
        std::env::set_var("HOME", "/tmp/test-home");
        assert_eq!(
            expand_home(Path::new("~/foo/bar")),
            PathBuf::from("/tmp/test-home/foo/bar"),
        );
        assert_eq!(expand_home(Path::new("~")), PathBuf::from("/tmp/test-home"));
        // Non-tilde paths pass through.
        assert_eq!(
            expand_home(Path::new("/etc/passwd")),
            PathBuf::from("/etc/passwd"),
        );
        // Embedded ~ left alone.
        assert_eq!(
            expand_home(Path::new("/foo/~bar")),
            PathBuf::from("/foo/~bar"),
        );
    }

    // -------- Chain --------

    #[test]
    fn chain_picks_first_with_value() {
        let s = AuthCredentialSource::any([
            AuthCredentialSource::Missing,
            AuthCredentialSource::literal("second"),
            AuthCredentialSource::literal("third"),
        ]);
        assert_eq!(resolved(&s), Some("second".to_string()));
    }

    #[test]
    fn chain_returns_none_when_all_missing() {
        let s = AuthCredentialSource::any([
            AuthCredentialSource::Missing,
            AuthCredentialSource::from_env("FERN_CLI_AUTH_TEST_DEFINITELY_UNSET"),
        ]);
        assert_eq!(resolved(&s), None);
    }

    // -------- Cli --------

    #[test]
    fn cli_strips_leading_dashes() {
        match AuthCredentialSource::cli("--api-token") {
            AuthCredentialSource::Cli(n) => assert_eq!(n, "api-token"),
            _ => panic!("expected Cli variant"),
        }
        match AuthCredentialSource::cli("api-token") {
            AuthCredentialSource::Cli(n) => assert_eq!(n, "api-token"),
            _ => panic!("expected Cli variant"),
        }
    }

    #[test]
    fn cli_resolves_to_none_before_finalize() {
        let s = AuthCredentialSource::cli("api-token");
        assert_eq!(resolved(&s), None);
    }

    #[test]
    fn cli_args_collects_recursively_through_chain() {
        let s = AuthCredentialSource::any([
            AuthCredentialSource::cli("flag-a"),
            AuthCredentialSource::from_env("X"),
            AuthCredentialSource::any([AuthCredentialSource::cli("flag-b")]),
        ]);
        let args = s.cli_args();
        assert_eq!(args, vec!["flag-a", "flag-b"]);
    }

    #[test]
    fn cli_args_empty_when_no_cli_variants() {
        let s = AuthCredentialSource::any([
            AuthCredentialSource::from_env("X"),
            AuthCredentialSource::literal("y"),
        ]);
        assert!(s.cli_args().is_empty());
    }

    fn build_matches(arg_name: &'static str, value: Option<&str>) -> Arc<clap::ArgMatches> {
        let cmd = clap::Command::new("test").arg(
            clap::Arg::new(arg_name)
                .long(arg_name)
                .num_args(1),
        );
        let argv: Vec<String> = match value {
            Some(v) => vec![
                "test".to_string(),
                format!("--{arg_name}"),
                v.to_string(),
            ],
            None => vec!["test".to_string()],
        };
        Arc::new(cmd.try_get_matches_from(argv).unwrap())
    }

    #[test]
    fn finalize_replaces_cli_with_closure_reading_matches() {
        let matches = build_matches("api-token", Some("supplied-on-cli"));
        let s = AuthCredentialSource::cli("api-token").finalize(&matches);
        assert_eq!(resolved(&s), Some("supplied-on-cli".to_string()));
    }

    #[test]
    fn finalize_cli_returns_none_when_flag_absent() {
        let matches = build_matches("api-token", None);
        let s = AuthCredentialSource::cli("api-token").finalize(&matches);
        assert_eq!(resolved(&s), None);
    }

    #[test]
    fn finalize_recurses_into_chain_with_cli_fallback_to_env() {
        // Chain: --api-token (not passed) -> env var (set) -> file (missing)
        let matches = build_matches("api-token", None);
        std::env::set_var("FERN_CLI_AUTH_TEST_CHAIN_FALLBACK", "from-env");
        let s = AuthCredentialSource::any([
            AuthCredentialSource::cli("api-token"),
            AuthCredentialSource::from_env("FERN_CLI_AUTH_TEST_CHAIN_FALLBACK"),
        ])
        .finalize(&matches);
        assert_eq!(resolved(&s), Some("from-env".to_string()));
        std::env::remove_var("FERN_CLI_AUTH_TEST_CHAIN_FALLBACK");
    }

    #[test]
    fn finalize_chain_cli_wins_over_env() {
        // CLI is registered FIRST in the chain — when both are present,
        // CLI's value takes precedence.
        let matches = build_matches("api-token", Some("from-cli"));
        std::env::set_var("FERN_CLI_AUTH_TEST_CHAIN_PRECEDENCE", "from-env");
        let s = AuthCredentialSource::any([
            AuthCredentialSource::cli("api-token"),
            AuthCredentialSource::from_env("FERN_CLI_AUTH_TEST_CHAIN_PRECEDENCE"),
        ])
        .finalize(&matches);
        assert_eq!(resolved(&s), Some("from-cli".to_string()));
        std::env::remove_var("FERN_CLI_AUTH_TEST_CHAIN_PRECEDENCE");
    }

    #[test]
    fn finalize_passes_through_non_cli_variants() {
        let matches = build_matches("ignored", None);
        let s = AuthCredentialSource::literal("constant").finalize(&matches);
        assert_eq!(resolved(&s), Some("constant".to_string()));
    }

    #[test]
    fn resolved_secret_does_not_leak_through_debug() {
        // SecretString redacts its inner value in Debug — defense in
        // depth against accidentally panic-printing or logging tokens.
        let s = AuthCredentialSource::literal("super-secret-token");
        let secret = s.resolve().unwrap();
        let dbg = format!("{secret:?}");
        assert!(!dbg.contains("super-secret-token"));
    }

    #[test]
    fn debug_redacts_literal_value() {
        let s = AuthCredentialSource::literal("super-secret");
        let dbg = format!("{s:?}");
        assert!(!dbg.contains("super-secret"));
        assert!(dbg.contains("redacted"));
    }

    // -------- credential_hints --------

    #[test]
    fn credential_hints_env() {
        let s = AuthCredentialSource::from_env("MY_TOKEN");
        assert_eq!(s.credential_hints(), vec!["MY_TOKEN environment variable"]);
    }

    #[test]
    fn credential_hints_cli() {
        let s = AuthCredentialSource::cli("api-token");
        assert_eq!(s.credential_hints(), vec!["--api-token flag"]);
    }

    #[test]
    fn credential_hints_file() {
        let s = AuthCredentialSource::file("~/.config/token");
        assert_eq!(
            s.credential_hints(),
            vec!["~/.config/token file"],
        );
    }

    #[test]
    fn credential_hints_chain_collects_all() {
        let s = AuthCredentialSource::any([
            AuthCredentialSource::cli("api-token"),
            AuthCredentialSource::from_env("API_TOKEN"),
            AuthCredentialSource::file("~/.token"),
        ]);
        assert_eq!(
            s.credential_hints(),
            vec![
                "--api-token flag",
                "API_TOKEN environment variable",
                "~/.token file",
            ],
        );
    }

    #[test]
    fn credential_hints_missing_is_empty() {
        assert!(AuthCredentialSource::Missing.credential_hints().is_empty());
    }

    #[test]
    fn credential_hints_literal_is_empty() {
        assert!(AuthCredentialSource::literal("x").credential_hints().is_empty());
    }

    #[test]
    fn credential_hints_closure_without_hint_is_empty() {
        let s = AuthCredentialSource::closure(|| Some("x".into()));
        assert!(s.credential_hints().is_empty());
    }

    // -------- Keyring --------

    #[test]
    #[serial_test::serial]
    fn keyring_source_resolves_via_active_store() {
        use crate::auth::keyring_store::{set_active_store, KeyringStore, MockKeyringStore};
        let mock = Arc::new(MockKeyringStore::new());
        mock.set("svc", "OAuth2", "stashed-token").unwrap();
        set_active_store(mock.clone());

        let s = AuthCredentialSource::keyring("svc", "OAuth2");
        assert_eq!(resolved(&s), Some("stashed-token".to_string()));
    }

    #[test]
    #[serial_test::serial]
    fn keyring_source_returns_none_when_unset() {
        use crate::auth::keyring_store::{set_active_store, MockKeyringStore};
        set_active_store(Arc::new(MockKeyringStore::new()));

        let s = AuthCredentialSource::keyring("svc", "nothing-here");
        assert_eq!(resolved(&s), None);
    }

    #[test]
    #[serial_test::serial]
    fn keyring_source_empty_value_resolves_to_none() {
        use crate::auth::keyring_store::{set_active_store, KeyringStore, MockKeyringStore};
        let mock = Arc::new(MockKeyringStore::new());
        mock.set("svc", "k", "").unwrap();
        set_active_store(mock);

        let s = AuthCredentialSource::keyring("svc", "k");
        assert_eq!(resolved(&s), None);
    }

    #[test]
    #[serial_test::serial]
    fn keyring_source_in_chain_falls_through_when_missing() {
        use crate::auth::keyring_store::{set_active_store, MockKeyringStore};
        set_active_store(Arc::new(MockKeyringStore::new()));

        let s = AuthCredentialSource::any([
            AuthCredentialSource::keyring("svc", "nothing"),
            AuthCredentialSource::literal("fallback"),
        ]);
        assert_eq!(resolved(&s), Some("fallback".to_string()));
    }

    #[test]
    fn keyring_credential_hint_describes_entry() {
        let s = AuthCredentialSource::keyring("elevenlabs", "OAuth2");
        let hints = s.credential_hints();
        assert_eq!(hints.len(), 1);
        assert!(hints[0].contains("elevenlabs"));
        assert!(hints[0].contains("OAuth2"));
        assert!(hints[0].contains("auth login"));
    }

    #[test]
    fn keyring_cli_args_is_empty() {
        let s = AuthCredentialSource::keyring("svc", "acct");
        assert!(s.cli_args().is_empty());
    }

    #[test]
    fn keyring_finalize_is_pass_through() {
        let cmd = clap::Command::new("test");
        let matches = Arc::new(cmd.try_get_matches_from(vec!["test"]).unwrap());
        let s = AuthCredentialSource::keyring("svc", "acct").finalize(&matches);
        assert!(matches!(s, AuthCredentialSource::Keyring { .. }));
    }

    #[test]
    fn keyring_debug_shows_service_and_account() {
        let s = AuthCredentialSource::keyring("elevenlabs", "OAuth2");
        let dbg = format!("{s:?}");
        assert!(dbg.contains("elevenlabs"));
        assert!(dbg.contains("OAuth2"));
    }

    #[test]
    fn credential_hints_closure_with_hint_from_finalize() {
        let cmd = clap::Command::new("test").arg(
            clap::Arg::new("api-token").long("api-token").num_args(1),
        );
        let matches = Arc::new(cmd.try_get_matches_from(vec!["test"]).unwrap());
        let s = AuthCredentialSource::cli("api-token").finalize(&matches);
        assert_eq!(s.credential_hints(), vec!["--api-token flag"]);
    }
}
