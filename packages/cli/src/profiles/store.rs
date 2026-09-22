//! `profiles.toml` — the on-disk profile store.
//!
//! Lives at `<config_dir>/<bin>/profiles.toml`, the same directory the
//! credential fallback store and the OAuth token cache already use (see
//! [`crate::auth::oauth_common::config_dir`]), and is written through the
//! same [`atomic_write`] helper, so it inherits the 0600 handling and the
//! temp-file-then-rename semantics.
//!
//! ```toml
//! version = 1
//! active = "prod"
//!
//! [profiles.prod]
//! credential = "prod"              # names a keyring account, never a secret
//! oauth_client_id = "abc123"       # not a secret; the secret is in the keychain
//! base_url = "https://api.ashburn.us1.twilio.com"
//! format = "json"
//!
//! [profiles.prod.parameters]
//! AccountSid = "AC11..."
//!
//! [profiles.prod.server_variables]
//! region = "us1"
//!
//! [profiles.tenant-acme]
//! parent = "prod"                  # inherits everything but `format`
//! [profiles.tenant-acme.parameters]
//! AccountSid = "AC99..."           # overrides only this
//! ```
//!
//! # Why `toml_edit` and not `toml`
//!
//! An older binary must be able to read, modify and write back a file a
//! *newer* binary produced without silently deleting the fields it does not
//! understand — and without destroying the comments a user hand-wrote.
//! Serde-based round-tripping through a typed struct drops both. `toml_edit`
//! keeps the document, so a write is a surgical edit of the keys we own.
//!
//! # Concurrency
//!
//! Last-writer-wins, via [`atomic_write`]'s rename. There is no lock file:
//! the failure mode for two simultaneous `profiles use` calls is a lost
//! switch, not a corrupt file, and a lock would introduce a stale-lock
//! failure mode that is strictly worse for an interactive CLI.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use toml_edit::{DocumentMut, Item, Table};

use crate::auth::oauth_common::{atomic_write, config_dir};
use crate::error::CliError;

/// Schema version written into new files. Bumped only for a change an older
/// binary cannot tolerate; additive fields do not bump it.
pub const PROFILES_VERSION: i64 = 1;

/// Filename inside `<config_dir>/<bin>/`.
pub const PROFILES_FILENAME: &str = "profiles.toml";

/// How deep a `parent` chain may go. One level to start — deeper trees are
/// speculative, and the cap is cheap to raise later but expensive to remove
/// once configurations depend on it.
pub const MAX_PARENT_DEPTH: usize = 1;

/// One profile exactly as written in the file, before inheritance.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ProfileEntry {
    pub name: String,
    /// Name of the profile whose values this one falls back to.
    pub parent: Option<String>,
    /// Keyring *account* suffix — not a secret. See
    /// [`crate::profiles::keyring_account`].
    pub credential: Option<String>,
    /// OAuth client id. Public by construction (RFC 6749 §2.2), so it lives
    /// in the file; the client *secret* is written to the keychain under the
    /// profile-namespaced account.
    pub oauth_client_id: Option<String>,
    /// Explicit base-URL override, for specs that declare no server
    /// variables to template.
    pub base_url: Option<String>,
    /// Default `--retries` for this profile: additional attempts after the
    /// first. `Some(0)` means "never retry in this profile", which is a
    /// meaningful setting and therefore distinct from `None`.
    pub retries: Option<u32>,
    /// Default `--format` for this profile.
    pub format: Option<String>,
    /// Default values for named operation parameters, keyed by the wire name
    /// or the flag name (see [`crate::profiles::ResolvedProfile::parameter`]).
    pub parameters: BTreeMap<String, String>,
    /// Default values for `servers[].variables` entries.
    pub server_variables: BTreeMap<String, String>,
}

/// A parsed `profiles.toml`, plus the document it came from so writes can
/// preserve everything this binary does not model.
#[derive(Debug, Clone)]
pub struct ProfileStore {
    path: PathBuf,
    doc: DocumentMut,
}

impl ProfileStore {
    /// The store for `cli_name`, whether or not the file exists. Returns
    /// `None` only when no home directory can be determined — the same
    /// condition under which the credential fallback store is unavailable.
    pub fn for_cli(cli_name: &str) -> Option<Self> {
        let dir = config_dir()?;
        Some(Self::at_path(dir.join(cli_name).join(PROFILES_FILENAME)))
    }

    /// A store at an explicit path. Reads the file if present; a missing file
    /// yields an empty store, and a *malformed* one yields an empty store
    /// plus a warning rather than bricking every command on the CLI.
    pub fn at_path(path: PathBuf) -> Self {
        let doc = match std::fs::read_to_string(&path) {
            Ok(text) => match text.parse::<DocumentMut>() {
                Ok(doc) => doc,
                Err(e) => {
                    // A corrupt profiles.toml must not make the CLI unusable:
                    // profiles are a convenience layer, and every command still
                    // works with flags and env vars. Warn and behave as if no
                    // profile were configured.
                    tracing::warn!(
                        path = %path.display(),
                        "ignoring malformed profiles.toml ({e}); \
                         run `profiles list` after fixing it"
                    );
                    DocumentMut::new()
                }
            },
            Err(_) => DocumentMut::new(),
        };
        Self { path, doc }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// True when the file has no `[profiles.*]` tables. A fresh CLI, or one
    /// whose user has never run `profiles create`.
    pub fn is_empty(&self) -> bool {
        self.profiles_table().is_none_or(|t| t.is_empty())
    }

    /// The `active = "..."` profile name, if any.
    pub fn active(&self) -> Option<&str> {
        self.doc.get("active")?.as_str()
    }

    /// Every profile name, sorted, for error messages and `profiles list`.
    pub fn names(&self) -> Vec<String> {
        let Some(table) = self.profiles_table() else {
            return Vec::new();
        };
        let mut names: Vec<String> = table.iter().map(|(k, _)| k.to_string()).collect();
        names.sort();
        names
    }

    /// One profile as written, without inheritance applied.
    pub fn entry(&self, name: &str) -> Option<ProfileEntry> {
        let table = self.profiles_table()?.get(name)?.as_table_like()?;
        Some(ProfileEntry {
            name: name.to_string(),
            parent: str_field(table, "parent"),
            credential: str_field(table, "credential"),
            oauth_client_id: str_field(table, "oauth_client_id"),
            base_url: str_field(table, "base_url"),
            retries: u32_field(table, "retries"),
            format: str_field(table, "format"),
            parameters: map_field(table, "parameters"),
            server_variables: map_field(table, "server_variables"),
        })
    }

    /// Every profile as written, in name order.
    pub fn entries(&self) -> Vec<ProfileEntry> {
        self.names()
            .into_iter()
            .filter_map(|name| self.entry(&name))
            .collect()
    }

    // ── Mutation ────────────────────────────────────────────────────────

    /// Insert or replace `entry`. Only the keys this binary models are
    /// touched: an unknown key already present under `[profiles.<name>]`
    /// survives, and so does the surrounding formatting.
    pub fn upsert(&mut self, entry: &ProfileEntry) {
        self.ensure_version();
        let profiles = self.profiles_table_mut();
        if !profiles.contains_key(&entry.name) {
            let mut table = Table::new();
            // Implicit so `[profiles.<name>.parameters]` renders without an
            // empty `[profiles.<name>]` header above it when the profile
            // itself carries no scalar keys.
            table.set_implicit(false);
            profiles.insert(&entry.name, Item::Table(table));
        }
        let Some(table) = profiles
            .get_mut(&entry.name)
            .and_then(|item| item.as_table_mut())
        else {
            return;
        };
        set_str(table, "parent", entry.parent.as_deref());
        // A root profile whose credential is just its own name carries no
        // information — `resolve` defaults an absent `credential` to exactly
        // that. Omitting it keeps the file readable.
        //
        // A profile *with a parent* must still write it: there, absent means
        // "inherit the chain root's slot", which is not the same as "my own
        // name". Conflating the two is what let a child's `--with-token`
        // overwrite its parent's credential.
        let credential_is_redundant =
            entry.parent.is_none() && entry.credential.as_deref() == Some(entry.name.as_str());
        set_str(
            table,
            "credential",
            if credential_is_redundant {
                None
            } else {
                entry.credential.as_deref()
            },
        );
        set_str(table, "oauth_client_id", entry.oauth_client_id.as_deref());
        set_str(table, "base_url", entry.base_url.as_deref());
        set_u32(table, "retries", entry.retries);
        set_str(table, "format", entry.format.as_deref());
        set_map(table, "parameters", &entry.parameters);
        set_map(table, "server_variables", &entry.server_variables);
    }

    /// Remove a profile. Returns `true` when one was there. Clears `active`
    /// if it pointed at the removed profile, so the file never names a
    /// profile that does not exist.
    pub fn remove(&mut self, name: &str) -> bool {
        let existed = self
            .profiles_table_mut()
            .remove(name)
            .is_some();
        if self.active() == Some(name) {
            self.doc.remove("active");
        }
        existed
    }

    /// Point `active` at `name`. The caller is responsible for checking that
    /// `name` exists — `profiles use` does, and reports the known names.
    pub fn set_active(&mut self, name: &str) {
        self.ensure_version();
        self.doc["active"] = toml_edit::value(name);
    }

    /// Drop `active`, so resolution falls through to "no profile".
    pub fn clear_active(&mut self) {
        self.doc.remove("active");
    }

    /// Write the document back, creating the parent directory if needed.
    pub fn save(&self) -> Result<(), CliError> {
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                CliError::Other(anyhow::anyhow!(
                    "Failed to create profile directory {}: {e}",
                    parent.display()
                ))
            })?;
        }
        atomic_write(&self.path, self.doc.to_string().as_bytes())
    }

    // ── Internals ───────────────────────────────────────────────────────

    fn profiles_table(&self) -> Option<&Table> {
        self.doc.get("profiles")?.as_table()
    }

    fn profiles_table_mut(&mut self) -> &mut Table {
        if self.doc.get("profiles").and_then(Item::as_table).is_none() {
            let mut table = Table::new();
            table.set_implicit(true);
            self.doc.insert("profiles", Item::Table(table));
        }
        // `insert` above guarantees the table exists and is a table.
        self.doc["profiles"]
            .as_table_mut()
            .expect("profiles table was just installed")
    }

    /// Stamp `version` on a file we are about to write for the first time.
    /// An existing value — including one from a newer binary — is left
    /// alone; downgrading it would be a lie about the file's shape.
    fn ensure_version(&mut self) {
        if self.doc.get("version").is_none() {
            self.doc["version"] = toml_edit::value(PROFILES_VERSION);
        }
    }
}

// ── Field helpers ───────────────────────────────────────────────────────

fn str_field(table: &dyn toml_edit::TableLike, key: &str) -> Option<String> {
    table.get(key)?.as_str().map(str::to_string)
}

/// Read a non-negative integer. A negative or non-integer value is dropped
/// with a warning rather than clamped: `retries = -1` is a mistake, and
/// silently reading it as `0` would turn retries off without saying so.
fn u32_field(table: &dyn toml_edit::TableLike, key: &str) -> Option<u32> {
    let value = table.get(key)?;
    match value.as_integer() {
        Some(n) if (0..=i64::from(u32::MAX)).contains(&n) => Some(n as u32),
        _ => {
            tracing::warn!(
                key,
                "profiles.toml: expected a non-negative integer; ignoring this key",
            );
            None
        }
    }
}

/// Read a sub-table of string values. Non-string values are skipped with a
/// warning: a `parameters` entry that is a table or an array cannot become a
/// clap default, and dropping it silently would look like the profile simply
/// had no effect.
fn map_field(table: &dyn toml_edit::TableLike, key: &str) -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    let Some(sub) = table.get(key).and_then(Item::as_table_like) else {
        return out;
    };
    for (name, item) in sub.iter() {
        match item.as_str() {
            Some(value) => {
                out.insert(name.to_string(), value.to_string());
            }
            None => tracing::warn!(
                "profiles.toml: ignoring `{key}.{name}` — expected a string value"
            ),
        }
    }
    out
}

fn set_u32(table: &mut Table, key: &str, value: Option<u32>) {
    match value {
        Some(v) => table[key] = toml_edit::value(i64::from(v)),
        None => {
            table.remove(key);
        }
    }
}

fn set_str(table: &mut Table, key: &str, value: Option<&str>) {
    match value {
        Some(v) => table[key] = toml_edit::value(v),
        None => {
            table.remove(key);
        }
    }
}

fn set_map(table: &mut Table, key: &str, values: &BTreeMap<String, String>) {
    if values.is_empty() {
        table.remove(key);
        return;
    }
    let mut sub = Table::new();
    for (name, value) in values {
        sub[name] = toml_edit::value(value.as_str());
    }
    table.insert(key, Item::Table(sub));
}

// ── Inheritance ─────────────────────────────────────────────────────────

/// Resolve `name` against the store, folding in its `parent` chain.
///
/// Inherited: `credential`, `oauth_client_id`, `base_url`, `retries`, `server_variables`,
/// and `parameters` (per key, child wins). **Not** inherited: `format`. A
/// subaccount profile borrowing its parent's credentials is the point of the
/// feature; silently borrowing its rendering is not — `--format` belongs to
/// the invocation, and inheriting it makes a script's output shape depend on
/// a profile the script did not name.
///
/// Errors when the profile is missing, when a `parent` names a profile that
/// does not exist, when the chain is cyclic, or when it is deeper than
/// [`MAX_PARENT_DEPTH`].
pub fn resolve(store: &ProfileStore, name: &str) -> Result<ResolvedProfile, CliError> {
    let entry = store.entry(name).ok_or_else(|| unknown_profile(store, name))?;

    // Walk parents into a chain, nearest-first, checking for cycles and depth
    // as we go. `seen` starts with the requested profile so `parent = <self>`
    // is caught as the one-node cycle it is.
    let mut chain = vec![entry];
    let mut seen: Vec<String> = vec![name.to_string()];
    while let Some(parent_name) = chain
        .last()
        .and_then(|entry| entry.parent.clone())
    {
        if seen.iter().any(|s| s == &parent_name) {
            seen.push(parent_name.clone());
            return Err(CliError::Validation(format!(
                "profile `{name}` has a cyclic parent chain: {}",
                seen.join(" → "),
            )));
        }
        if chain.len() > MAX_PARENT_DEPTH {
            return Err(CliError::Validation(format!(
                "profile `{name}` nests parents {} deep; at most {MAX_PARENT_DEPTH} \
                 level(s) of `parent` is supported",
                chain.len(),
            )));
        }
        let parent = store.entry(&parent_name).ok_or_else(|| {
            CliError::Validation(format!(
                "profile `{}` sets parent = \"{parent_name}\", which does not exist. \
                 Known profiles: {}",
                chain.last().map(|e| e.name.as_str()).unwrap_or(name),
                render_names(store),
            ))
        })?;
        seen.push(parent_name);
        chain.push(parent);
    }

    // Fold parents-first so the child's values land last and win.
    let mut resolved = ResolvedProfile {
        name: name.to_string(),
        ..ResolvedProfile::default()
    };
    for entry in chain.iter().rev() {
        if entry.credential.is_some() {
            resolved.credential = entry.credential.clone();
        }
        if entry.oauth_client_id.is_some() {
            resolved.oauth_client_id = entry.oauth_client_id.clone();
        }
        if entry.base_url.is_some() {
            resolved.base_url = entry.base_url.clone();
        }
        if entry.retries.is_some() {
            resolved.retries = entry.retries;
        }
        resolved.parameters.extend(
            entry
                .parameters
                .iter()
                .map(|(k, v)| (k.clone(), v.clone())),
        );
        resolved.server_variables.extend(
            entry
                .server_variables
                .iter()
                .map(|(k, v)| (k.clone(), v.clone())),
        );
    }
    // Deliberately outside the fold — see the doc comment.
    resolved.format = chain
        .first()
        .and_then(|entry| entry.format.clone());

    // A profile with no explicit `credential` anywhere in its chain keys its
    // keyring slot by the name of the chain's *root* — not its own.
    //
    // That is what makes `profiles create acme --parent prod` mean "another
    // tenant on the same credential", which is the subaccount case the
    // feature exists for: the child borrows the parent's slot instead of
    // silently getting an empty one of its own and reporting "not logged
    // in". A root profile still gets a slot named after itself, so
    // `profiles create prod` needs no ceremony.
    if resolved.credential.is_none() {
        resolved.credential = chain
            .last()
            .map(|root| root.name.clone())
            .or_else(|| Some(name.to_string()));
    }
    Ok(resolved)
}

/// A profile with its `parent` chain folded in — what the rest of the SDK
/// reads. Constructed by [`resolve`].
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ResolvedProfile {
    pub name: String,
    /// Keyring account suffix. Always `Some` after [`resolve`] — it defaults
    /// to the profile's own name.
    pub credential: Option<String>,
    pub oauth_client_id: Option<String>,
    pub base_url: Option<String>,
    /// Additional retry attempts for this profile. Inherited, unlike
    /// `format`: retries describe the network the profile talks to, which a
    /// subaccount shares with its parent, whereas output shape belongs to the
    /// invocation.
    pub retries: Option<u32>,
    pub format: Option<String>,
    pub parameters: BTreeMap<String, String>,
    pub server_variables: BTreeMap<String, String>,
}

/// The error for a named-but-absent profile. Deliberately *not* a fallthrough
/// to env vars: a user who typed `-p prod` and got their default credentials
/// instead would not find out until the request hit the wrong tenant.
pub fn unknown_profile(store: &ProfileStore, name: &str) -> CliError {
    CliError::Validation(format!(
        "unknown profile `{name}`. Known profiles: {}",
        render_names(store),
    ))
}

fn render_names(store: &ProfileStore) -> String {
    let names = store.names();
    if names.is_empty() {
        "(none configured)".to_string()
    } else {
        names.join(", ")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// True when `item` is a TOML string. Asserts the writer never coerces a
    /// caller's value into an integer or a boolean.
    fn is_string_value(item: &Item) -> bool {
        matches!(item.as_value(), Some(toml_edit::Value::String(_)))
    }

    fn store_from(text: &str) -> ProfileStore {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(PROFILES_FILENAME);
        std::fs::write(&path, text).unwrap();
        let store = ProfileStore::at_path(path);
        // Keep the tempdir alive for the store's lifetime by leaking it: the
        // tests only read, and the OS reclaims it at process exit.
        std::mem::forget(dir);
        store
    }

    const TWO_PROFILES: &str = r#"
version = 1
active = "prod"

[profiles.prod]
credential = "prod"
base_url = "https://api.example.com"
format = "json"

[profiles.prod.parameters]
AccountSid = "AC11"

[profiles.prod.server_variables]
region = "us1"

[profiles.acme]
parent = "prod"

[profiles.acme.parameters]
AccountSid = "AC99"
"#;

    #[test]
    fn reads_scalars_and_maps() {
        let store = store_from(TWO_PROFILES);
        assert_eq!(store.active(), Some("prod"));
        assert_eq!(store.names(), vec!["acme", "prod"]);
        let prod = store.entry("prod").unwrap();
        assert_eq!(prod.credential.as_deref(), Some("prod"));
        assert_eq!(prod.base_url.as_deref(), Some("https://api.example.com"));
        assert_eq!(prod.parameters.get("AccountSid").unwrap(), "AC11");
        assert_eq!(prod.server_variables.get("region").unwrap(), "us1");
    }

    #[test]
    fn parent_inherits_credential_and_server_vars_but_not_format() {
        let store = store_from(TWO_PROFILES);
        let acme = resolve(&store, "acme").unwrap();
        // Borrowed from the parent — the subaccount case.
        assert_eq!(acme.credential.as_deref(), Some("prod"));
        assert_eq!(acme.base_url.as_deref(), Some("https://api.example.com"));
        assert_eq!(acme.server_variables.get("region").unwrap(), "us1");
        // Overridden by the child.
        assert_eq!(acme.parameters.get("AccountSid").unwrap(), "AC99");
        // Deliberately not inherited: output shape belongs to the invocation.
        assert_eq!(acme.format, None);
    }

    #[test]
    fn credential_defaults_to_the_profile_name() {
        let store = store_from("[profiles.solo]\n");
        let solo = resolve(&store, "solo").unwrap();
        assert_eq!(solo.credential.as_deref(), Some("solo"));
    }

    #[test]
    fn a_child_with_no_explicit_credential_borrows_the_parents_slot() {
        // The subaccount case: `create acme --parent prod` means "another
        // tenant on the same credential". Defaulting to the child's own name
        // here would give it an empty keyring slot and report "not logged in"
        // on a profile the user deliberately attached to an existing login.
        let store = store_from("[profiles.prod]\n\n[profiles.acme]\nparent = \"prod\"\n");
        assert_eq!(
            resolve(&store, "acme").unwrap().credential.as_deref(),
            Some("prod"),
        );
    }

    #[test]
    fn a_child_may_still_pin_its_own_credential() {
        let store = store_from(
            "[profiles.prod]\n\n[profiles.acme]\nparent = \"prod\"\ncredential = \"own\"\n",
        );
        assert_eq!(
            resolve(&store, "acme").unwrap().credential.as_deref(),
            Some("own"),
        );
    }

    #[test]
    fn missing_profile_names_the_known_ones() {
        let store = store_from(TWO_PROFILES);
        let err = resolve(&store, "nope").unwrap_err().to_string();
        assert!(err.contains("unknown profile `nope`"), "{err}");
        assert!(err.contains("acme, prod"), "{err}");
    }

    #[test]
    fn missing_parent_is_rejected() {
        let store = store_from("[profiles.child]\nparent = \"ghost\"\n");
        let err = resolve(&store, "child").unwrap_err().to_string();
        assert!(err.contains("does not exist"), "{err}");
        assert!(err.contains("ghost"), "{err}");
    }

    #[test]
    fn self_parent_is_a_cycle_not_a_hang() {
        let store = store_from("[profiles.loop]\nparent = \"loop\"\n");
        let err = resolve(&store, "loop").unwrap_err().to_string();
        assert!(err.contains("cyclic"), "{err}");
    }

    #[test]
    fn mutual_parents_are_a_cycle() {
        let store = store_from(
            "[profiles.a]\nparent = \"b\"\n\n[profiles.b]\nparent = \"a\"\n",
        );
        let err = resolve(&store, "a").unwrap_err().to_string();
        assert!(err.contains("cyclic"), "{err}");
    }

    #[test]
    fn depth_beyond_the_cap_is_rejected() {
        // a → b → c is two levels; MAX_PARENT_DEPTH is one.
        let store = store_from(
            "[profiles.a]\nparent = \"b\"\n\n[profiles.b]\nparent = \"c\"\n\n[profiles.c]\n",
        );
        let err = resolve(&store, "a").unwrap_err().to_string();
        assert!(err.contains("deep"), "{err}");
    }

    #[test]
    fn malformed_file_reads_as_empty_rather_than_failing() {
        // Every command must keep working with flags and env vars.
        let store = store_from("this is not = = toml [[[");
        assert!(store.is_empty());
        assert_eq!(store.active(), None);
    }

    #[test]
    fn missing_file_reads_as_empty() {
        let dir = tempfile::tempdir().unwrap();
        let store = ProfileStore::at_path(dir.path().join("absent.toml"));
        assert!(store.is_empty());
        assert!(store.names().is_empty());
    }

    #[test]
    fn round_trip_preserves_comments_and_unknown_keys() {
        // The compatibility guarantee: an older binary editing a file a newer
        // one wrote must not drop `future_field`, and must not eat the comment.
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(PROFILES_FILENAME);
        std::fs::write(
            &path,
            "# my notes\nversion = 2\n\n[profiles.prod]\n\
             credential = \"prod\"\nfuture_field = \"keep me\"\n",
        )
        .unwrap();

        let mut store = ProfileStore::at_path(path.clone());
        store.set_active("prod");
        store.save().unwrap();

        let text = std::fs::read_to_string(&path).unwrap();
        assert!(text.contains("# my notes"), "{text}");
        assert!(text.contains("future_field = \"keep me\""), "{text}");
        assert!(text.contains("active = \"prod\""), "{text}");
        // A newer binary's version is not downgraded to ours.
        assert!(text.contains("version = 2"), "{text}");
    }

    #[test]
    fn upsert_then_reload_round_trips_every_field() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(PROFILES_FILENAME);
        let mut store = ProfileStore::at_path(path.clone());
        let entry = ProfileEntry {
            name: "au".to_string(),
            parent: Some("prod".to_string()),
            credential: Some("prod".to_string()),
            oauth_client_id: Some("abc123".to_string()),
            base_url: Some("https://api.au1.example.com".to_string()),
            retries: None,
            format: Some("json".to_string()),
            parameters: [("AccountSid".to_string(), "AC11".to_string())].into(),
            server_variables: [
                ("region".to_string(), "au1".to_string()),
                ("edge".to_string(), "sydney".to_string()),
            ]
            .into(),
        };
        store.upsert(&entry);
        store.save().unwrap();

        let reloaded = ProfileStore::at_path(path);
        assert_eq!(reloaded.entry("au").as_ref(), Some(&entry));
        // A fresh file gets our version stamp.
        assert_eq!(
            reloaded.doc.get("version").and_then(|v| v.as_integer()),
            Some(PROFILES_VERSION),
        );
    }

    #[test]
    fn upsert_writes_every_value_as_a_string() {
        // A parameter value like `123` or `true` must not become a TOML
        // integer / boolean: it is fed to clap as a default, which is a string.
        let dir = tempfile::tempdir().unwrap();
        let mut store = ProfileStore::at_path(dir.path().join(PROFILES_FILENAME));
        store.upsert(&ProfileEntry {
            name: "p".to_string(),
            parameters: [("limit".to_string(), "10".to_string())].into(),
            ..Default::default()
        });
        let table = store
            .profiles_table()
            .unwrap()
            .get("p")
            .unwrap()
            .as_table()
            .unwrap()
            .get("parameters")
            .unwrap()
            .as_table()
            .unwrap()
            .get("limit")
            .unwrap()
            .clone();
        assert!(is_string_value(&table));
    }

    #[test]
    fn upsert_clears_fields_set_back_to_none() {
        let dir = tempfile::tempdir().unwrap();
        let mut store = ProfileStore::at_path(dir.path().join(PROFILES_FILENAME));
        store.upsert(&ProfileEntry {
            name: "p".to_string(),
            base_url: Some("https://old".to_string()),
            parameters: [("a".to_string(), "1".to_string())].into(),
            ..Default::default()
        });
        store.upsert(&ProfileEntry {
            name: "p".to_string(),
            ..Default::default()
        });
        let entry = store.entry("p").unwrap();
        assert_eq!(entry.base_url, None);
        assert!(entry.parameters.is_empty());
    }

    #[test]
    fn remove_drops_the_active_pointer_with_the_profile() {
        // Otherwise `active` names a profile that is gone, and every
        // subsequent invocation errors on a profile the user did not type.
        let dir = tempfile::tempdir().unwrap();
        let mut store = ProfileStore::at_path(dir.path().join(PROFILES_FILENAME));
        store.upsert(&ProfileEntry {
            name: "p".to_string(),
            ..Default::default()
        });
        store.set_active("p");
        assert!(store.remove("p"));
        assert_eq!(store.active(), None);
        assert!(!store.remove("p"), "remove is idempotent");
    }

    #[test]
    fn remove_keeps_an_unrelated_active_pointer() {
        let dir = tempfile::tempdir().unwrap();
        let mut store = ProfileStore::at_path(dir.path().join(PROFILES_FILENAME));
        for name in ["a", "b"] {
            store.upsert(&ProfileEntry {
                name: name.to_string(),
                ..Default::default()
            });
        }
        store.set_active("a");
        store.remove("b");
        assert_eq!(store.active(), Some("a"));
    }

    #[test]
    fn non_string_map_values_are_skipped_not_coerced() {
        let store = store_from(
            "[profiles.p.parameters]\nok = \"1\"\nbad = { nested = true }\n",
        );
        let entry = store.entry("p").unwrap();
        assert_eq!(entry.parameters.get("ok").unwrap(), "1");
        assert!(!entry.parameters.contains_key("bad"));
    }
}
