//! Shared test fixtures used across the `auth` submodules. Compiled only
//! under `#[cfg(test)]`.

use std::sync::Arc;

use crate::auth::credential::AuthCredentialSource;
use crate::auth::provider::DynAuthProvider;
use crate::auth::schemes::{BearerAuthProvider, HeaderAuthProvider};

/// A bare `RequestBuilder` pointing at example.com. Tests only inspect the
/// resulting headers — the URL doesn't matter.
pub fn req() -> reqwest::RequestBuilder {
    reqwest::Client::new().post("https://example.com/")
}

/// Read the `Authorization` header back off a built request, if present.
pub fn auth_header(req: reqwest::RequestBuilder) -> Option<String> {
    let built = req.build().unwrap();
    built
        .headers()
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .map(str::to_string)
}

/// Read an arbitrary header value back off a built request.
pub fn header(req: reqwest::RequestBuilder, name: &str) -> Option<String> {
    let built = req.build().unwrap();
    built
        .headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .map(str::to_string)
}

/// Pre-built bearer provider with a literal token. Used as a fixture
/// for tests that need a credential-bearing provider.
pub fn bearer(name: &str, token: &str) -> DynAuthProvider {
    Arc::new(BearerAuthProvider::new(
        name,
        AuthCredentialSource::literal(token),
    ))
}

/// Pre-built header provider — convenience for the apiKey-style tests.
pub fn api_key(name: &str, header_name: &str, value: &str) -> DynAuthProvider {
    Arc::new(HeaderAuthProvider::new(
        name,
        header_name,
        AuthCredentialSource::literal(value),
        false,
    ))
}

/// Restores, on `Drop`, every piece of process-global state a
/// profile-precedence test touches: the installed profile selection, the
/// active keyring store, and whichever env vars the test set through
/// [`set_env`](Self::set_env).
///
/// Cleanup written at the end of a test body only runs on the happy path — a
/// failed `assert!` or an `unwrap()` panic leaves a `Flag` selection and a
/// populated mock keyring installed for every subsequent `#[serial]` test,
/// turning one real failure into a cascade of unrelated ones. `Drop` runs
/// during unwinding too, so holding one of these makes the reset
/// unconditional.
///
/// Only meaningful under `#[serial_test::serial]`: the state it restores is
/// shared by the whole process.
#[must_use = "the guard resets global state when dropped; binding it to `_` drops it immediately"]
pub struct GlobalAuthStateGuard {
    env_vars: Vec<String>,
}

impl GlobalAuthStateGuard {
    pub fn new() -> Self {
        Self {
            env_vars: Vec::new(),
        }
    }

    /// Set `var` for the remainder of the test; removed when the guard drops.
    pub fn set_env(&mut self, var: &str, value: &str) -> &mut Self {
        std::env::set_var(var, value);
        self.env_vars.push(var.to_string());
        self
    }

    /// Install a profile named `name` as the selection made by `source`, so a
    /// test can exercise the `--profile`-outranks-env rung
    /// (`SelectionSource::Flag`) against the ambient one (`Active`).
    pub fn install_profile(
        &mut self,
        name: &str,
        source: crate::profiles::SelectionSource,
    ) -> &mut Self {
        self.install_resolved_profile(
            crate::profiles::ResolvedProfile {
                name: name.to_string(),
                credential: Some(name.to_string()),
                ..Default::default()
            },
            source,
        )
    }

    /// [`install_profile`](Self::install_profile) for tests that need to set
    /// more of the profile than its name — e.g. `oauth_client_id`, the one
    /// plaintext credential rung `profiles.toml` carries.
    pub fn install_resolved_profile(
        &mut self,
        profile: crate::profiles::ResolvedProfile,
        source: crate::profiles::SelectionSource,
    ) -> &mut Self {
        crate::profiles::install_for_tests_from(Some(profile), source);
        self
    }

    /// Install a fresh mock keyring store holding exactly one entry.
    pub fn install_keyring(&mut self, service: &str, account: &str, value: &str) -> &mut Self {
        use crate::auth::keyring_store::KeyringStore;
        let mock = Arc::new(crate::auth::keyring_store::MockKeyringStore::new());
        mock.set(service, account, value).unwrap();
        crate::auth::keyring_store::set_active_store(mock);
        self
    }

    /// Install a fresh, empty mock keyring store — the "this profile has
    /// nothing stored" fallthrough case.
    pub fn install_empty_keyring(&mut self) -> &mut Self {
        crate::auth::keyring_store::set_active_store(Arc::new(
            crate::auth::keyring_store::MockKeyringStore::new(),
        ));
        self
    }
}

impl Default for GlobalAuthStateGuard {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for GlobalAuthStateGuard {
    fn drop(&mut self) {
        for var in &self.env_vars {
            std::env::remove_var(var);
        }
        crate::profiles::install_for_tests_from(None, crate::profiles::SelectionSource::Active);
        crate::auth::keyring_store::set_active_store(Arc::new(
            crate::auth::keyring_store::MockKeyringStore::new(),
        ));
    }
}
