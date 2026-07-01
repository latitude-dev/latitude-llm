//! The [`AuthProvider`] trait, its per-request metadata
//! ([`EndpointAuthMetadata`]), the [`DynAuthProvider`] handle alias, and
//! the [`NoAuthProvider`] sentinel.

use std::collections::HashMap;
use std::sync::Arc;

use crate::error::CliError;

/// Per-request context the executor passes to providers. Maps directly to
/// the TS generator's `endpointMetadata` argument.
///
/// Three states encode OpenAPI's three semantics:
/// - `None` — the operation didn't pin a security policy. The composition
///   wrapper's default (typically `AnyAuthProvider`) handles it.
/// - `Some(vec![])` — explicitly anonymous (`security: []` in the spec).
///   The provider must not attach any auth, even if credentials are available.
/// - `Some(vec![req1, req2, ...])` — OR-of-ANDs: satisfy any one requirement.
#[derive(Debug, Clone, Default)]
pub struct EndpointAuthMetadata {
    pub security_requirements: Option<Vec<HashMap<String, Vec<String>>>>,
}

impl EndpointAuthMetadata {
    /// No security policy declared on the operation — let the wrapper's
    /// default policy decide.
    pub fn unspecified() -> Self {
        Self::default()
    }

    /// `security: []` in the spec — operation is explicitly unauthenticated.
    pub fn explicit_anonymous() -> Self {
        Self {
            security_requirements: Some(Vec::new()),
        }
    }

    pub fn with_requirements(reqs: Vec<HashMap<String, Vec<String>>>) -> Self {
        Self {
            security_requirements: Some(reqs),
        }
    }

    /// True when the operation pinned `security: []` — the spec's "this
    /// endpoint is explicitly unauthenticated" signal. The executor uses
    /// this to short-circuit `apply` so credentials never leak onto an
    /// opt-out endpoint, regardless of which provider is configured.
    pub fn is_explicit_anonymous(&self) -> bool {
        matches!(&self.security_requirements, Some(reqs) if reqs.is_empty())
    }
}

/// A pluggable authentication scheme.
///
/// Implementors mutate `request` with the appropriate headers (or other
/// modifications) for an outgoing API call. Returning the request unchanged
/// is the right behaviour when the provider can't satisfy this request and
/// composition wrappers should fall through to the next provider.
///
/// # Repeated credential resolution
///
/// Composition wrappers (`AnyAuthProvider`, `AllAuthProvider`,
/// `RoutingAuthProvider`) call `has_credentials` / `has_credentials_for`
/// before `apply` on each request, so an
/// [`AuthCredentialSource`](crate::auth::AuthCredentialSource) backing a
/// leaf provider can be resolved twice (or more, through nested wrappers).
/// For `Env` / `Literal` / `Cli` sources this is free; for `File` it means
/// a re-read on each call and for `Closure` it means re-invocation. This
/// is acceptable for the CLI workload (one request per process invocation),
/// but provider implementations that wrap an expensive source — token
/// refresh, keychain access, network round-trips — should memoize
/// internally rather than expect the trait to deduplicate calls.
pub trait AuthProvider: Send + Sync + std::fmt::Debug {
    /// Stable identifier. Used by [`RoutingAuthProvider`][rap] to look up
    /// the provider for a security requirement and by error messages. Should
    /// match the scheme name from the OpenAPI spec where applicable.
    ///
    /// [rap]: crate::auth::RoutingAuthProvider
    fn name(&self) -> &str;

    /// Whether this provider currently has *any* credential available.
    /// Used by composition wrappers to decide whether to try this provider
    /// at all (e.g., `AnyAuthProvider` skips children whose
    /// `has_credentials()` is false).
    ///
    /// For "could this provider have authenticated *this specific
    /// endpoint*?" — used by the friendly-error path on 401/403 — see
    /// [`has_credentials_for`](Self::has_credentials_for) instead.
    fn has_credentials(&self) -> bool;

    /// Whether this provider can satisfy *this specific endpoint*'s auth
    /// requirements. Used by the error path to decide whether a 401/403 is
    /// the user's fault (no creds for this endpoint → friendly error) or
    /// actually a server problem (creds were sent → surface raw error).
    ///
    /// The default delegates to [`has_credentials`](Self::has_credentials),
    /// which is correct for leaf providers (bearer, basic, header) and for
    /// `AnyAuthProvider` (any provider with creds will be tried regardless
    /// of endpoint). Composition wrappers that route by endpoint —
    /// notably [`RoutingAuthProvider`] — should override this to inspect
    /// the endpoint's `security_requirements` and check whether any
    /// requirement is satisfiable.
    fn has_credentials_for(&self, _endpoint: &EndpointAuthMetadata) -> bool {
        self.has_credentials()
    }

    /// Human-readable hints about where this provider reads its credentials
    /// from. Used by the friendly auth-error path to tell the user which
    /// env var / CLI flag / file to set.
    fn credential_hints(&self) -> Vec<String> {
        Vec::new()
    }

    /// Apply the scheme to `request`. Implementations should be a no-op if
    /// they can't satisfy the request (e.g., no env var set), so wrappers can
    /// fall through. Hard errors (malformed token bytes) are surfaced via
    /// [`CliError::Auth`].
    fn apply(
        &self,
        request: reqwest::RequestBuilder,
        endpoint: &EndpointAuthMetadata,
    ) -> Result<reqwest::RequestBuilder, CliError>;

    /// Post-construction hook: inject the on-disk token cache for
    /// cross-invocation persistence. Called by [`CliApp`] in
    /// `propagate_root_auth` once it knows the binary name.
    ///
    /// Default is a no-op. [`OAuth2TokenProvider`](crate::auth::OAuth2TokenProvider)
    /// overrides this to wire [`TokenCache`](crate::auth::oauth2::TokenCache).
    fn inject_token_cache(&self, _cli_name: &str) {}
}

/// Boxed handle the rest of the codebase passes around.
pub type DynAuthProvider = Arc<dyn AuthProvider>;

/// Construct a no-op [`AuthProvider`] handle. Use this in tests and in
/// custom command handlers that want to bypass auth for a one-off call.
pub fn no_auth_provider() -> DynAuthProvider {
    Arc::new(NoAuthProvider)
}

/// No-op provider. Used when the CLI hasn't configured auth at all.
#[derive(Debug, Clone, Default)]
pub struct NoAuthProvider;

impl AuthProvider for NoAuthProvider {
    fn name(&self) -> &str {
        "none"
    }

    fn has_credentials(&self) -> bool {
        false
    }

    fn apply(
        &self,
        request: reqwest::RequestBuilder,
        _endpoint: &EndpointAuthMetadata,
    ) -> Result<reqwest::RequestBuilder, CliError> {
        Ok(request)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::test_helpers::{auth_header, req};

    #[tokio::test]
    async fn no_auth_provider_emits_no_headers() {
        let p = NoAuthProvider;
        let r = p.apply(req(), &EndpointAuthMetadata::unspecified()).unwrap();
        assert_eq!(auth_header(r), None);
        assert!(!p.has_credentials());
        assert_eq!(p.name(), "none");
    }

    #[test]
    fn endpoint_metadata_three_states() {
        // `unspecified` and `default` agree.
        assert!(EndpointAuthMetadata::unspecified()
            .security_requirements
            .is_none());
        assert!(EndpointAuthMetadata::default()
            .security_requirements
            .is_none());

        // `explicit_anonymous` is `Some(empty)`.
        let anon = EndpointAuthMetadata::explicit_anonymous();
        assert_eq!(
            anon.security_requirements.as_ref().map(|v| v.len()),
            Some(0),
        );

        // `with_requirements` carries them through.
        let reqs = vec![{
            let mut m = HashMap::new();
            m.insert("a".to_string(), Vec::<String>::new());
            m
        }];
        let with = EndpointAuthMetadata::with_requirements(reqs);
        assert_eq!(
            with.security_requirements.as_ref().map(|v| v.len()),
            Some(1),
        );
    }
}
