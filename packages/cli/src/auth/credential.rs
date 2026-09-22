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

use crate::error::CliError;

use crate::auth::keyring_store::active_store;

type CredentialClosure = Arc<dyn Fn() -> Option<String> + Send + Sync>;

/// How an auth credential's value is resolved at request time.
///
/// `#[non_exhaustive]`: new rungs get added as the credential chain grows
/// (`KeyringField` was the most recent), and a hand-authored `custom.rs`
/// matching every variant would otherwise fail to compile on each addition.
/// Downstream matches need a `_` arm; construction goes through the
/// constructors below rather than struct literals.
#[derive(Clone)]
#[non_exhaustive]
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
    /// Read one field out of a JSON object stored in a single keyring entry.
    ///
    /// Exists for HTTP basic, whose two halves must be stored together. One
    /// entry rather than two (`…:username` / `…:password`) because the OS
    /// keychain prompts per item: two entries means two prompts for one
    /// logical credential, on every request that has to unlock them.
    ///
    /// A non-JSON value, or JSON missing the field, resolves to `None` —
    /// the same as an absent entry. That keeps a hand-written or
    /// pre-existing raw-string entry from surfacing as a username.
    KeyringField {
        service: String,
        account: String,
        /// Key to read out of the stored JSON object (`username` / `password`).
        field: String,
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

    /// Bind to one field of a JSON object stored at `(service, account)`.
    /// See [`AuthCredentialSource::KeyringField`].
    pub fn keyring_field(
        service: impl Into<String>,
        account: impl Into<String>,
        field: impl Into<String>,
    ) -> Self {
        AuthCredentialSource::KeyringField {
            service: service.into(),
            account: account.into(),
            field: field.into(),
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
    ///
    /// Treats every failure as "no credential". Correct for *probing* — an
    /// `auth status` listing or a `has_credentials` check should report what is
    /// usable, not abort — but wrong on the request path, where a credential
    /// the user has but the CLI could not read must not silently downgrade the
    /// request to unauthenticated. Use [`try_resolve`](Self::try_resolve) there.
    pub fn resolve(&self) -> Option<SecretString> {
        self.try_resolve().ok().flatten()
    }

    /// Resolve the value, distinguishing "not configured" (`Ok(None)`) from
    /// "configured but unreadable" (`Err`).
    ///
    /// The distinction only exists for the keyring today, and it is the one
    /// that matters: denying the OS keychain prompt used to be indistinguishable
    /// from having stored nothing, so the CLI sent the request anonymously and
    /// the user saw whatever the server says to a stranger — a 404, typically —
    /// instead of an auth failure.
    pub fn try_resolve(&self) -> Result<Option<SecretString>, CliError> {
        let value = match self {
            AuthCredentialSource::Env(name) => std::env::var(name)
                .ok()
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty())
                .map(SecretString::from),
            AuthCredentialSource::Cli(_) => None, // resolved post-finalize
            AuthCredentialSource::File(path) => read_credential_file(path),
            AuthCredentialSource::Literal(v) if v.is_empty() => None,
            AuthCredentialSource::Literal(v) => Some(SecretString::from(v.clone())),
            // First source that yields a value wins; a source that *errors*
            // stops the walk rather than falling through, so a denied keychain
            // is reported instead of being masked by a later empty rung.
            AuthCredentialSource::Chain(sources) => {
                let mut found = None;
                for source in sources {
                    if let Some(v) = source.try_resolve()? {
                        found = Some(v);
                        break;
                    }
                }
                found
            }
            AuthCredentialSource::Closure(f, _) => {
                f().filter(|v| !v.is_empty()).map(SecretString::from)
            }
            AuthCredentialSource::Keyring { service, account } => active_store()
                .get(service, account)?
                .filter(|v| !v.is_empty())
                .map(SecretString::from),
            AuthCredentialSource::KeyringField {
                service,
                account,
                field,
            } => active_store()
                .get(service, account)?
                .as_deref()
                .and_then(read_json_field(field))
                .filter(|v| !v.is_empty())
                .map(SecretString::from),
            AuthCredentialSource::Missing => None,
        };
        Ok(value)
    }

    /// True when a keyring-backed rung of this source currently holds a value —
    /// i.e. the credential is one the user stored (`auth login` /
    /// `profiles set`), not one supplied by env, flag, file or literal.
    ///
    /// Lossy by the same rule as [`resolve`](Self::resolve), which it is built
    /// on: an unreadable keychain (a denied macOS prompt) is indistinguishable
    /// from an empty account, so both answer `false`. For the `--profile`
    /// preference pass that means a denial falls through to an ambient
    /// env-backed scheme instead of surfacing the keychain error — the same
    /// outcome the pre-preference `has_credentials()` probe produced, since it
    /// is equally `resolve`-based. Making selection report the distinction
    /// needs a fallible predicate on
    /// [`AuthProvider`](crate::auth::AuthProvider); until then the error does
    /// still surface whenever the stored scheme *is* the one selected, because
    /// `apply` resolves through [`try_resolve`](Self::try_resolve).
    pub fn has_stored_value(&self) -> bool {
        match self {
            AuthCredentialSource::Keyring { .. }
            | AuthCredentialSource::KeyringField { .. } => self.resolve().is_some(),
            AuthCredentialSource::Chain(sources) => {
                sources.iter().any(|source| source.has_stored_value())
            }
            AuthCredentialSource::Env(_)
            | AuthCredentialSource::Cli(_)
            | AuthCredentialSource::File(_)
            | AuthCredentialSource::Literal(_)
            | AuthCredentialSource::Closure(_, _)
            | AuthCredentialSource::Missing => false,
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
                // `service` is the CLI's binary name (see the variant's docs),
                // so the command is spellable. It used to render as a literal
                // `<bin>`, which reached users on any non-OAuth scheme — the
                // OAuth provider overrides `credential_hints` and substituted
                // correctly, hiding the placeholder on the one path anyone
                // looked at.
                vec![format!(
                    "keyring entry {service}:{account} (populated by `{service} auth login`)"
                )]
            }
            AuthCredentialSource::KeyringField {
                service,
                account,
                field,
            } => vec![format!(
                "{field} from keyring entry {service}:{account} \
                 (populated by `{service} auth login`)"
            )],
            AuthCredentialSource::Literal(_)
            | AuthCredentialSource::Closure(_, None)
            | AuthCredentialSource::Missing => Vec::new(),
        }
    }

    /// Like [`credential_hints`](Self::credential_hints), but only the sources
    /// that currently hold a value.
    ///
    /// The 401/403 path used to list every *declared* source — so a CLI with
    /// two schemes told the user "Credentials were supplied via: TOKEN env var,
    /// keyring …, API_KEY env var, keyring …" when exactly one of them had
    /// supplied anything, and then advised hunting for shadowing that did not
    /// exist. Naming only what actually resolved makes the message true, and
    /// lets the caller decide whether shadowing is even possible.
    ///
    /// Resolution cost is paid only on the error path. `Cli` sources always
    /// report empty (they resolve post-finalize, so `try_resolve` cannot see
    /// them) and `Closure` sources are reported without invoking the closure —
    /// re-running it here could have side effects, and it has already run
    /// during `apply()`.
    pub fn populated_credential_hints(&self) -> Vec<String> {
        match self {
            AuthCredentialSource::Chain(sources) => sources
                .iter()
                .flat_map(|s| s.populated_credential_hints())
                .collect(),
            // Can't be checked here without side effects or post-finalize
            // state; keep them so the user still sees a source they can use.
            AuthCredentialSource::Cli(_) | AuthCredentialSource::Closure(_, Some(_)) => {
                self.credential_hints()
            }
            // `try_resolve` rather than `resolve`: a keyring entry that exists
            // but could not be read (denied prompt) is *configured*, and saying
            // otherwise would send the user looking in the wrong place.
            _ => match self.try_resolve() {
                Ok(Some(_)) | Err(_) => self.credential_hints(),
                Ok(None) => Vec::new(),
            },
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
            | AuthCredentialSource::KeyringField { .. }
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
            AuthCredentialSource::KeyringField {
                service,
                account,
                field,
            } => write!(f, "KeyringField({service}:{account}.{field})"),
            AuthCredentialSource::Missing => write!(f, "Missing"),
        }
    }
}

/// Read a credential file: expand `~`, trim trailing whitespace, treat
/// empty content / missing files as `None`. Result is wrapped in
/// [`SecretString`] so the file contents can't leak through Debug.
/// Extract `field` from a JSON object, as a closure so the caller can
/// `and_then` it onto an `Option<&str>`.
///
/// Only string values are returned: a numeric or nested value is not a
/// credential, and coercing one would produce a header the server rejects
/// for reasons the user cannot see.
fn read_json_field(field: &str) -> impl Fn(&str) -> Option<String> + '_ {
    move |raw| {
        serde_json::from_str::<serde_json::Value>(raw)
            .ok()?
            .get(field)?
            .as_str()
            .map(str::to_string)
    }
}

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

/// The credential sources a scheme reads, grouped for `auth status`.
///
/// [`required`](Self::required) slots are ANDed: each inner `Vec` is one
/// slot (e.g. the client id) listing the sources tried for it in
/// precedence order, and every slot must resolve for the scheme to
/// authenticate. [`alternatives`](Self::alternatives) are ORed against
/// the whole set — any one of them satisfies the scheme on its own. A
/// cached OAuth access token is the motivating case: it authenticates
/// without the client-id/secret pair that would mint it, but the pair
/// still has to be reported so a user can see whether their env vars
/// were picked up.
#[derive(Clone, Debug, Default)]
pub struct CredentialSlots {
    /// Slots that must *all* resolve. Empty means "nothing declared".
    pub required: Vec<Vec<AuthCredentialSource>>,
    /// Sources that each independently satisfy the whole scheme.
    pub alternatives: Vec<AuthCredentialSource>,
}

impl CredentialSlots {
    /// Build from the required slots alone.
    pub fn required(slots: impl IntoIterator<Item = Vec<AuthCredentialSource>>) -> Self {
        Self {
            required: slots.into_iter().collect(),
            alternatives: Vec::new(),
        }
    }

    /// Add a source that satisfies the scheme on its own.
    pub fn with_alternative(mut self, source: AuthCredentialSource) -> Self {
        self.alternatives.push(source);
        self
    }

    /// `true` when the provider declared no sources at all — the status
    /// surface reports such a scheme as opaque.
    pub fn is_empty(&self) -> bool {
        self.required.is_empty() && self.alternatives.is_empty()
    }
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
    fn has_stored_value_is_true_for_populated_keyring_entry() {
        use crate::auth::keyring_store::{set_active_store, KeyringStore, MockKeyringStore};
        let mock = Arc::new(MockKeyringStore::new());
        mock.set("svc", "OAuth2", "stashed-token").unwrap();
        set_active_store(mock);

        assert!(AuthCredentialSource::keyring("svc", "OAuth2").has_stored_value());
    }

    #[test]
    fn has_stored_value_is_false_for_env_source() {
        assert!(!AuthCredentialSource::from_env("AUTH_TOKEN").has_stored_value());
    }

    #[test]
    #[serial_test::serial]
    fn has_stored_value_finds_keyring_entry_inside_chain() {
        use crate::auth::keyring_store::{set_active_store, KeyringStore, MockKeyringStore};
        let mock = Arc::new(MockKeyringStore::new());
        mock.set("svc", "OAuth2", "stashed-token").unwrap();
        set_active_store(mock);

        let source = AuthCredentialSource::any([
            AuthCredentialSource::from_env("AUTH_TOKEN"),
            AuthCredentialSource::keyring("svc", "OAuth2"),
        ]);
        assert!(source.has_stored_value());
    }

    #[test]
    #[serial_test::serial]
    fn has_stored_value_is_false_for_empty_keyring_chain() {
        use crate::auth::keyring_store::{set_active_store, MockKeyringStore};
        set_active_store(Arc::new(MockKeyringStore::new()));

        let source = AuthCredentialSource::any([
            AuthCredentialSource::from_env("AUTH_TOKEN"),
            AuthCredentialSource::keyring("svc", "OAuth2"),
        ]);
        assert!(!source.has_stored_value());
    }

    /// A store that fails every read, standing in for a denied OS keychain
    /// prompt (`keyring::Error::PlatformFailure` on macOS).
    #[derive(Debug)]
    struct DeniedKeyringStore;

    impl crate::auth::keyring_store::KeyringStore for DeniedKeyringStore {
        fn get(&self, _: &str, _: &str) -> Result<Option<String>, CliError> {
            Err(CliError::Auth("keyring get failed: User denied access".into()))
        }
        fn set(&self, _: &str, _: &str, _: &str) -> Result<(), CliError> {
            unreachable!()
        }
        fn delete(&self, _: &str, _: &str) -> Result<(), CliError> {
            unreachable!()
        }
        fn backend_label(&self) -> String {
            "denied".into()
        }
    }

    #[test]
    #[serial_test::serial]
    fn a_denied_keyring_is_an_error_not_an_absent_credential() {
        use crate::auth::keyring_store::set_active_store;
        set_active_store(Arc::new(DeniedKeyringStore));

        let s = AuthCredentialSource::keyring("svc", "OAuth2");
        // The request path must be able to tell these apart: sending the
        // request anonymously makes the server answer as if to a stranger, and
        // the user sees a 404 instead of an auth failure.
        let err = s.try_resolve().unwrap_err();
        assert!(matches!(err, CliError::Auth(_)), "got: {err:?}");
        assert_eq!(err.exit_code(), CliError::EXIT_CODE_AUTH);
        // The probing path still degrades to "no credential", so `auth status`
        // and `has_credentials` keep working rather than aborting.
        assert!(s.resolve().is_none());
    }

    #[test]
    #[serial_test::serial]
    fn a_chain_stops_at_a_denied_keyring_rather_than_falling_through() {
        use crate::auth::keyring_store::set_active_store;
        set_active_store(Arc::new(DeniedKeyringStore));

        // Env is empty, so without propagation the chain would report "no
        // credential anywhere" and the denial would vanish.
        let chain = AuthCredentialSource::any([
            AuthCredentialSource::keyring("svc", "OAuth2"),
            AuthCredentialSource::from_env("__FERN_TEST_DEFINITELY_UNSET"),
        ]);
        assert!(matches!(chain.try_resolve(), Err(CliError::Auth(_))));
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
