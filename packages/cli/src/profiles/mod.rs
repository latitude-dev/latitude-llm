//! Named bundles of request context — "profiles".
//!
//! A profile is **not** new transport. It is a *source of defaults* for
//! mechanisms that already accept defaults, resolved once per invocation:
//!
//! | Profile field      | Existing machinery it feeds |
//! |--------------------|-----------------------------|
//! | `credential`       | [`AuthCredentialSource::Keyring`]'s `account` |
//! | `oauth_client_id`  | the OAuth grant's client id, and the token-cache key |
//! | `parameters`       | a `clap::Arg`'s `default_value` |
//! | `server_variables` | `server_var(...)` substitution |
//! | `base_url`         | [`crate::cli_args::resolve_base_url_override`] |
//! | `format`           | [`crate::formatter::OutputPipeline`] |
//!
//! That is what keeps the feature tractable *and* generic: nothing about
//! auth, HTTP, retries, or command construction changes.
//!
//! # Precedence
//!
//! Which profile:
//!
//! ```text
//! --profile / -p  →  <BIN>_PROFILE env  →  active in profiles.toml  →  none
//! ```
//!
//! Which value, per field:
//!
//! ```text
//! explicit flag  →  env var  →  profile  →  spec default (x-fern-default)
//! ```
//!
//! Profile sits **below** env so a CI pipeline that exports env vars is never
//! silently overridden by a developer's stored profile, and **above** spec
//! defaults so a profile is meaningful at all. For credentials the profile
//! does not add a rung to ADR-0008's chain — it only selects *which keyring
//! account* the existing `Keyring` rung reads.
//!
//! `none` is not an error. With no profile selected every generated CLI
//! behaves exactly as it did before this module existed; that is the
//! compatibility guarantee, and the regression tests in
//! [`crate::profiles::selection`] pin it.
//!
//! # Why a process-global
//!
//! The resolved profile is installed once, process-globally, by
//! `CliApp::run` — the same shape as
//! [`crate::auth::keyring_store::active_store`], and for the same reason.
//! The eight sites that need it (the keyring account, the token-cache key,
//! two base-URL resolvers, the parameter-arg builder, the server-variable
//! resolver, the output pipeline, and `auth status`) are reached through
//! four different call graphs, several of which are `&self` methods on
//! already-built structures. Threading an `Option<&ResolvedProfile>` through
//! all of them would touch ~30 signatures to carry one value that is
//! constant for the lifetime of the process.
//!
//! [`AuthCredentialSource::Keyring`]: crate::auth::AuthCredentialSource::Keyring

pub mod commands;
pub mod selection;
pub mod store;

pub use selection::{
    active, active_source, collides_with_profile_flag, install_for_tests,
    install_for_tests_from, outranks_env, reserve_profile_flag, resolve_selection, Selection,
    SelectionSource,
};
pub use store::{ProfileEntry, ProfileStore, ResolvedProfile, PROFILES_FILENAME, PROFILES_VERSION};

/// Generator-supplied configuration for the profiles feature.
///
/// Ships **default-off**: adding a top-level subcommand to every existing
/// generated CLI is a surface change, and per the repo's breaking-changes
/// policy it must not arrive unannounced. A CLI that never calls
/// `CliApp::profiles(...)` is byte-identical to one built before this
/// module existed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProfilesConfig {
    /// Name of the top-level subcommand group (`profiles` by default).
    /// Configurable because an API may already own that noun.
    pub command_name: String,
    /// Dotted command path of an operation that revokes a profile's remote
    /// credential, e.g. `iam.keys.remove`.
    ///
    /// When set, `profiles remove` grows a `--revoke` flag that calls it
    /// before deleting the profile. Unset — the default — and the flag is
    /// not registered at all.
    ///
    /// The framework cannot know which operation deletes a key, so this is
    /// named by the generator rather than guessed. The operation is invoked
    /// with the profile's stored `parameters` as its arguments; a required
    /// parameter the profile does not carry is a clear error rather than a
    /// silent no-op.
    pub revoke_operation: Option<String>,
}

impl Default for ProfilesConfig {
    fn default() -> Self {
        Self {
            command_name: "profiles".to_string(),
            revoke_operation: None,
        }
    }
}

impl ProfilesConfig {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn command_name(mut self, name: impl Into<String>) -> Self {
        self.command_name = name.into();
        self
    }

    /// Name the operation `profiles remove --revoke` invokes. See
    /// [`Self::revoke_operation`].
    pub fn revoke_operation(mut self, op: impl Into<String>) -> Self {
        self.revoke_operation = Some(op.into());
        self
    }

    /// The revoke operation as a command path (`iam.keys.remove` →
    /// `["iam", "keys", "remove"]`).
    pub fn revoke_op_path(&self) -> Option<Vec<String>> {
        self.revoke_operation
            .as_ref()
            .map(|op| op.split('.').map(str::to_string).collect())
    }
}

// ── Read-side helpers ───────────────────────────────────────────────────
//
// Every consumer goes through one of these rather than reaching into
// `active()` itself, so the "no profile selected → behave exactly as
// before" branch is written once.

/// The keyring **account** for `scheme`, namespaced by the active profile.
///
/// Byte-identical to the pre-profiles account (`scheme`) when no profile is
/// selected, so an existing keychain entry keeps resolving and nobody is
/// logged out by an upgrade. With a profile it is `<scheme>#<credential>`,
/// which is what lets two tenants hold separate tokens for one scheme.
///
/// `#` is the separator because it cannot appear in an OpenAPI security
/// scheme name, so `<scheme>#<credential>` is unambiguous.
pub fn keyring_account(scheme: &str) -> String {
    match active().and_then(|p| p.credential.clone()) {
        Some(credential) => keyring_account_for(scheme, &credential),
        None => scheme.to_string(),
    }
}

/// [`keyring_account`] for an explicitly named credential rather than the
/// active profile's.
///
/// `profiles create` and `profiles remove` both operate on a profile that is
/// *not* the active one, so they cannot go through [`keyring_account`] —
/// writing a token under the wrong account, or deleting the wrong one, is
/// exactly the bug that would follow.
pub fn keyring_account_for(scheme: &str, credential: &str) -> String {
    format!("{scheme}#{credential}")
}

/// The profile's default for the parameter registered as `wire_name` with
/// flag `--<flag_name>`, if any.
///
/// Matched on either spelling: a user may reasonably write
/// `--set AccountSid=…` (the wire name, which is what `--schema` reports) or
/// `--set account-sid=…` (the flag they type). `profiles create` validates
/// the name against the parsed operation table, so an unmatched key here
/// means the operation simply does not take that parameter.
pub fn parameter_default(wire_name: &str, flag_name: &str) -> Option<String> {
    let profile = active()?;
    profile.parameter(wire_name, flag_name)
}

/// The profile's value for the `{name}` server-URL template variable.
pub fn server_variable(name: &str) -> Option<String> {
    active()?.server_variables.get(name).cloned()
}

/// The profile's explicit `base_url` override.
///
/// Consulted *below* `--base-url` and `<NAME>_BASE_URL`. Used for specs that
/// declare no `servers[].variables` to template — region/edge → URL shaping
/// is then an overlay concern rather than framework code.
pub fn base_url() -> Option<String> {
    active()?.base_url.clone()
}

/// The profile's default output format, as written (validated by the caller,
/// which already has to reject an unknown `--format`).
pub fn format() -> Option<String> {
    active()?.format.clone()
}

/// The profile's OAuth client id. Public by construction, so it lives in
/// `profiles.toml` and `profiles list` can show it without unlocking the
/// keychain; the client *secret* is in the keyring under
/// [`keyring_account`].
/// The profile's `--retries` value: additional attempts after the first.
/// `Some(0)` is meaningful ("never retry here") and distinct from `None`.
pub fn retries() -> Option<u32> {
    active()?.retries
}

pub fn oauth_client_id() -> Option<String> {
    active()?.oauth_client_id.clone()
}

/// The active profile's name, for `auth status` and diagnostics.
pub fn active_name() -> Option<String> {
    active().map(|p| p.name.clone())
}

impl ResolvedProfile {
    /// This profile's default for a parameter, by wire name or flag name.
    /// See [`parameter_default`].
    pub fn parameter(&self, wire_name: &str, flag_name: &str) -> Option<String> {
        if let Some(value) = self.parameters.get(wire_name) {
            return Some(value.clone());
        }
        if let Some(value) = self.parameters.get(flag_name) {
            return Some(value.clone());
        }
        // A key stored in one spelling must match a lookup in the other:
        // `AccountSid`, `account_sid`, and `account-sid` are one parameter.
        // Reached only when neither exact lookup hit, so a spec that really
        // does declare two names differing solely by separator still
        // resolves each of them exactly.
        let wanted = crate::text::normalize_identifier(wire_name);
        let wanted_flag = crate::text::normalize_identifier(flag_name);
        self.parameters
            .iter()
            .find(|(key, _)| {
                let normalized = crate::text::normalize_identifier(key);
                normalized == wanted || normalized == wanted_flag
            })
            .map(|(_, value)| value.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    fn profile_with(parameters: BTreeMap<String, String>) -> ResolvedProfile {
        ResolvedProfile {
            name: "p".to_string(),
            parameters,
            ..Default::default()
        }
    }

    #[test]
    fn parameter_matches_the_wire_name() {
        let p = profile_with([("AccountSid".to_string(), "AC11".to_string())].into());
        assert_eq!(p.parameter("AccountSid", "account-sid").as_deref(), Some("AC11"));
    }

    #[test]
    fn parameter_matches_the_flag_spelling() {
        // The user typed what they see in `--help`.
        let p = profile_with([("account-sid".to_string(), "AC11".to_string())].into());
        assert_eq!(p.parameter("AccountSid", "account-sid").as_deref(), Some("AC11"));
    }

    #[test]
    fn parameter_matches_across_spellings_via_kebab() {
        let p = profile_with([("account_sid".to_string(), "AC11".to_string())].into());
        assert_eq!(p.parameter("AccountSid", "account-sid").as_deref(), Some("AC11"));
    }

    #[test]
    fn parameter_returns_none_for_an_unrelated_key() {
        let p = profile_with([("AccountSid".to_string(), "AC11".to_string())].into());
        assert_eq!(p.parameter("PageSize", "page-size"), None);
    }

    #[test]
    fn exact_wire_name_wins_over_a_kebab_near_match() {
        let p = profile_with(
            [
                ("AccountSid".to_string(), "exact".to_string()),
                ("account-sid".to_string(), "kebab".to_string()),
            ]
            .into(),
        );
        assert_eq!(p.parameter("AccountSid", "account-sid").as_deref(), Some("exact"));
    }

    #[test]
    fn default_command_name_is_profiles() {
        assert_eq!(ProfilesConfig::default().command_name, "profiles");
        assert_eq!(
            ProfilesConfig::new().command_name("tenants").command_name,
            "tenants",
        );
    }
}
