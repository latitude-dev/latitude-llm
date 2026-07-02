//! Composition wrappers: [`AnyAuthProvider`] (OR semantics) and
//! [`RoutingAuthProvider`] (per-endpoint dispatch via the operation's
//! `security_requirements`).

use std::collections::HashMap;

use crate::auth::provider::{AuthProvider, DynAuthProvider, EndpointAuthMetadata};
use crate::error::CliError;

// ---------------------------------------------------------------------------
// AnyAuthProvider — OR semantics.
// ---------------------------------------------------------------------------

/// Try each child provider in order. The first one with credentials applies
/// its headers and the wrapper returns. If no child has credentials, the
/// request goes out unauthenticated.
///
/// Mirrors the TS `AnyAuthProvider`. Used when the CLI declares multiple
/// schemes but the OpenAPI operations don't pin one per endpoint.
#[derive(Debug, Clone)]
pub struct AnyAuthProvider {
    name: String,
    providers: Vec<DynAuthProvider>,
}

impl AnyAuthProvider {
    pub fn new(providers: Vec<DynAuthProvider>) -> Self {
        Self {
            name: "any".to_string(),
            providers,
        }
    }
}

impl AuthProvider for AnyAuthProvider {
    fn name(&self) -> &str {
        &self.name
    }

    fn has_credentials(&self) -> bool {
        self.providers.iter().any(|p| p.has_credentials())
    }

    fn inject_token_cache(&self, cli_name: &str) {
        for p in &self.providers {
            p.inject_token_cache(cli_name);
        }
    }

    fn credential_hints(&self) -> Vec<String> {
        self.providers
            .iter()
            .flat_map(|p| p.credential_hints())
            .collect()
    }

    fn has_credentials_for(&self, endpoint: &EndpointAuthMetadata) -> bool {
        self.providers
            .iter()
            .any(|p| p.has_credentials_for(endpoint))
    }

    fn apply(
        &self,
        request: reqwest::RequestBuilder,
        endpoint: &EndpointAuthMetadata,
    ) -> Result<reqwest::RequestBuilder, CliError> {
        // Endpoint-aware filter: lets nested `RoutingAuthProvider` children
        // tell us they can't satisfy *this* endpoint even though they have
        // credentials for some scheme. Leaf providers (Bearer/Basic/Header)
        // ignore the endpoint, so this degenerates to `has_credentials()`
        // for them.
        for provider in &self.providers {
            if provider.has_credentials_for(endpoint) {
                return provider.apply(request, endpoint);
            }
        }
        Ok(request)
    }
}

// ---------------------------------------------------------------------------
// AllAuthProvider — AND semantics. Every scheme is applied to every request.
// ---------------------------------------------------------------------------

/// Apply *every* child provider's headers to the request, in registration
/// order. The "all auth" strategy: when an API requires multiple schemes
/// simultaneously on every operation (e.g., `Authorization: Bearer X` AND
/// `X-Api-Key: Y`), and the spec doesn't express that via per-operation
/// security blocks.
///
/// `has_credentials()` is `true` only when *all* children have credentials —
/// the request can't be satisfied otherwise. If a child fails to apply
/// (e.g., malformed token bytes), the error short-circuits.
#[derive(Debug, Clone)]
pub struct AllAuthProvider {
    name: String,
    providers: Vec<DynAuthProvider>,
}

impl AllAuthProvider {
    pub fn new(providers: Vec<DynAuthProvider>) -> Self {
        Self {
            name: "all".to_string(),
            providers,
        }
    }
}

impl AuthProvider for AllAuthProvider {
    fn name(&self) -> &str {
        &self.name
    }

    fn has_credentials(&self) -> bool {
        // All-auth means every scheme must contribute. If any is missing,
        // the request can't be authenticated as the API requires.
        !self.providers.is_empty() && self.providers.iter().all(|p| p.has_credentials())
    }

    fn inject_token_cache(&self, cli_name: &str) {
        for p in &self.providers {
            p.inject_token_cache(cli_name);
        }
    }

    fn credential_hints(&self) -> Vec<String> {
        self.providers
            .iter()
            .flat_map(|p| p.credential_hints())
            .collect()
    }

    fn has_credentials_for(&self, endpoint: &EndpointAuthMetadata) -> bool {
        !self.providers.is_empty()
            && self
                .providers
                .iter()
                .all(|p| p.has_credentials_for(endpoint))
    }

    fn apply(
        &self,
        request: reqwest::RequestBuilder,
        endpoint: &EndpointAuthMetadata,
    ) -> Result<reqwest::RequestBuilder, CliError> {
        // Short-circuit when the requirement can't be fully satisfied. The
        // all-auth contract is "every scheme contributes"; sending a partial
        // request with only some headers attached would let the request hit
        // the wire half-authed and leak whichever bound credentials we do
        // have. The friendly-error path catches this on the response side,
        // but pre-emptively dropping the headers keeps stray tokens off the
        // wire too.
        if !self.has_credentials_for(endpoint) {
            return Ok(request);
        }
        let mut req = request;
        for provider in &self.providers {
            req = provider.apply(req, endpoint)?;
        }
        Ok(req)
    }
}

// ---------------------------------------------------------------------------
// LayeredAuthProvider — a primary scheme plus optional additive headers.
// ---------------------------------------------------------------------------

/// Wrap a `primary` provider and layer zero or more *optional* providers on
/// top of it. The layers are additive supplements, not alternatives: every
/// layer that currently has credentials is applied to the request in addition
/// to whatever the primary attaches.
///
/// Unlike [`AllAuthProvider`], a layer never makes the request mandatory —
/// satisfiability (`has_credentials` / `has_credentials_for`) is decided by
/// the primary alone, and a layer with no credentials is simply skipped. This
/// is the right shape for a supplementary header that sits *alongside* real
/// auth and is only present in some environments.
///
/// The motivating case is Lattice Sandboxes: every request carries the normal
/// `Authorization: Bearer <token>` (the primary) and, only when developing
/// against a sandbox, an additional `Anduril-Sandbox-Authorization: Bearer
/// <SANDBOXES_TOKEN>` header (a layer). In production the layer's credential
/// is absent, so the request behaves exactly as if no layer were configured.
#[derive(Debug, Clone)]
pub struct LayeredAuthProvider {
    primary: DynAuthProvider,
    layers: Vec<DynAuthProvider>,
}

impl LayeredAuthProvider {
    pub fn new(primary: DynAuthProvider, layers: Vec<DynAuthProvider>) -> Self {
        Self { primary, layers }
    }
}

impl AuthProvider for LayeredAuthProvider {
    fn name(&self) -> &str {
        self.primary.name()
    }

    fn has_credentials(&self) -> bool {
        // Optional layers don't gate satisfiability — the primary decides
        // whether the CLI can authenticate at all.
        self.primary.has_credentials()
    }

    fn inject_token_cache(&self, cli_name: &str) {
        self.primary.inject_token_cache(cli_name);
        for layer in &self.layers {
            layer.inject_token_cache(cli_name);
        }
    }

    fn credential_hints(&self) -> Vec<String> {
        // Surface only the primary's hints in the friendly auth-error path:
        // a missing optional layer (e.g. no sandbox token in production) is
        // not a misconfiguration and shouldn't be reported as a missing
        // credential.
        self.primary.credential_hints()
    }

    fn has_credentials_for(&self, endpoint: &EndpointAuthMetadata) -> bool {
        self.primary.has_credentials_for(endpoint)
    }

    fn apply(
        &self,
        request: reqwest::RequestBuilder,
        endpoint: &EndpointAuthMetadata,
    ) -> Result<reqwest::RequestBuilder, CliError> {
        // Explicitly anonymous endpoints (`security: []`) opt out of auth
        // entirely. The executor already short-circuits these before calling
        // `apply`, but guard here too so a supplementary header can never
        // leak onto an opt-out endpoint regardless of the call path.
        if endpoint.is_explicit_anonymous() {
            return Ok(request);
        }
        let mut req = self.primary.apply(request, endpoint)?;
        for layer in &self.layers {
            if layer.has_credentials() {
                req = layer.apply(req, endpoint)?;
            }
        }
        Ok(req)
    }
}

// ---------------------------------------------------------------------------
// RoutingAuthProvider — per-endpoint security map.
// ---------------------------------------------------------------------------

/// Dispatch by the endpoint's security requirements. The OpenAPI `security`
/// field is an OR of ANDs: `[{schemeA: []}, {schemeB: [], schemeC: []}]`
/// means "schemeA alone, OR (schemeB AND schemeC)".
///
/// At call time:
/// 1. If the endpoint has no requirements, the wrapper falls through to its
///    `default` policy (typically an [`AnyAuthProvider`]) so unauthenticated
///    operations stay unauthenticated and unlabeled operations still get a
///    sensible default header.
/// 2. Otherwise, find the first requirement whose every scheme has a
///    registered provider with credentials, and apply each provider in turn
///    (their headers compose).
/// 3. If no requirement is satisfiable, return the request unchanged. The
///    server will respond 401/403 and `handle_error_response`
///    will surface a helpful "no credentials configured" message.
#[derive(Debug, Clone)]
pub struct RoutingAuthProvider {
    name: String,
    schemes: HashMap<String, DynAuthProvider>,
    /// Fallback for endpoints with no `security` declared. Typically an
    /// [`AnyAuthProvider`] over all configured schemes.
    default: Option<DynAuthProvider>,
}

impl RoutingAuthProvider {
    pub fn new(schemes: HashMap<String, DynAuthProvider>) -> Self {
        Self {
            name: "routing".to_string(),
            schemes,
            default: None,
        }
    }

    pub fn with_default(mut self, default: DynAuthProvider) -> Self {
        self.default = Some(default);
        self
    }
}

impl AuthProvider for RoutingAuthProvider {
    fn name(&self) -> &str {
        &self.name
    }

    fn has_credentials(&self) -> bool {
        self.schemes.values().any(|p| p.has_credentials())
            || self.default.as_ref().is_some_and(|p| p.has_credentials())
    }

    fn inject_token_cache(&self, cli_name: &str) {
        for p in self.schemes.values() {
            p.inject_token_cache(cli_name);
        }
        if let Some(d) = &self.default {
            d.inject_token_cache(cli_name);
        }
    }

    fn credential_hints(&self) -> Vec<String> {
        let mut hints: Vec<String> = self
            .schemes
            .values()
            .flat_map(|p| p.credential_hints())
            .collect();
        if let Some(d) = &self.default {
            hints.extend(d.credential_hints());
        }
        hints
    }

    /// Endpoint-aware credential check.
    ///
    /// - **No requirements declared**: defer to the wrapper's `default`
    ///   (typically an `AnyAuthProvider`), which decides based on its own
    ///   children. If there's no default, fall back to `has_credentials()`
    ///   over our schemes — that's the closest we can get.
    /// - **Explicit anonymous (`security: []`)**: the endpoint doesn't need
    ///   auth, so report `true` to suppress the friendly "no creds" message
    ///   on a 401 — that response would be a server-side mismatch, not a
    ///   user config issue.
    /// - **Concrete requirements**: report whether any requirement's
    ///   schemes are all bound *and* hold credentials — same predicate
    ///   `apply` uses to find a satisfiable requirement. If yes, we
    ///   attached headers; if no, the 401 is the user's missing-creds
    ///   problem and the friendly error fires.
    fn has_credentials_for(&self, endpoint: &EndpointAuthMetadata) -> bool {
        match &endpoint.security_requirements {
            None => match &self.default {
                Some(d) => d.has_credentials_for(endpoint),
                None => self.has_credentials(),
            },
            Some(reqs) if reqs.is_empty() => true,
            Some(reqs) => reqs.iter().any(|req| {
                req.keys().all(|name| {
                    self.schemes
                        .get(name)
                        .is_some_and(|p| p.has_credentials())
                })
            }),
        }
    }

    fn apply(
        &self,
        request: reqwest::RequestBuilder,
        endpoint: &EndpointAuthMetadata,
    ) -> Result<reqwest::RequestBuilder, CliError> {
        let requirements = match &endpoint.security_requirements {
            // Operation didn't pin a policy: defer to the default.
            None => {
                return match &self.default {
                    Some(d) => d.apply(request, endpoint),
                    None => Ok(request),
                };
            }
            // `security: []` — explicit anonymous, attach nothing.
            Some(reqs) if reqs.is_empty() => return Ok(request),
            Some(reqs) => reqs,
        };

        let satisfiable = requirements.iter().find(|req| {
            req.keys().all(|name| {
                self.schemes
                    .get(name)
                    .is_some_and(|p| p.has_credentials())
            })
        });

        let Some(requirement) = satisfiable else {
            // No declared requirement is satisfiable. Diverges from the TS
            // generator (which throws): we let the request go out unauthed
            // so the server's 401/403 + `handle_error_response`
            // can surface a friendly "no credentials configured" message.
            return Ok(request);
        };

        let mut req = request;
        // Sort the requirement's scheme names so multi-scheme requirements
        // apply in a stable order regardless of `HashMap` iteration. Each
        // provider sets a distinct header so order doesn't affect the wire
        // payload, but reproducibility matters for tracing and snapshot
        // tests.
        let mut scheme_names: Vec<&String> = requirement.keys().collect();
        scheme_names.sort();
        for scheme_name in scheme_names {
            // Safe: `satisfiable` filtered to requirements where every key
            // has a registered provider.
            let provider = &self.schemes[scheme_name];
            req = provider.apply(req, endpoint)?;
        }
        Ok(req)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    use crate::auth::credential::AuthCredentialSource;
    use crate::auth::schemes::{BearerAuthProvider, HeaderAuthProvider};
    use crate::auth::test_helpers::{api_key, auth_header, bearer, header, req};

    // -------- AnyAuthProvider --------

    #[tokio::test]
    async fn any_auth_picks_first_with_credentials() {
        let a: DynAuthProvider = Arc::new(BearerAuthProvider::new(
            "a",
            AuthCredentialSource::Missing,
        ));
        let b: DynAuthProvider = api_key("b", "X-Api-Key", "k");
        let any = AnyAuthProvider::new(vec![a, b]);
        assert!(any.has_credentials());
        let r = any.apply(req(), &EndpointAuthMetadata::unspecified()).unwrap();
        assert_eq!(header(r, "x-api-key").as_deref(), Some("k"));
    }

    #[tokio::test]
    async fn any_auth_skips_routing_child_that_cant_satisfy_endpoint() {
        // Nested-composition guard: an `AnyAuthProvider` whose first child
        // is a `RoutingAuthProvider` that *has some credentials* but can't
        // satisfy this specific endpoint must fall through to the next
        // child rather than calling apply on the routing child.
        //
        // Without the endpoint-aware filter, the first child's
        // `has_credentials()` returns true and `apply` short-circuits — even
        // though that child would attach nothing to the request.
        let mut routing_schemes: HashMap<String, DynAuthProvider> = HashMap::new();
        routing_schemes.insert("apiKey".to_string(), api_key("apiKey", "X-Api-Key", "k"));
        let routing_child: DynAuthProvider = std::sync::Arc::new(
            RoutingAuthProvider::new(routing_schemes),
        );
        let bearer_child: DynAuthProvider = bearer("bearer", "tok");
        let any = AnyAuthProvider::new(vec![routing_child, bearer_child]);

        // Endpoint demands `bearer`; routing child only has `apiKey`.
        let mut requirement = HashMap::new();
        requirement.insert("bearer".to_string(), Vec::<String>::new());
        let endpoint = EndpointAuthMetadata::with_requirements(vec![requirement]);

        let r = any.apply(req(), &endpoint).unwrap();
        // Bearer should have been attached by the second child.
        assert_eq!(auth_header(r).as_deref(), Some("Bearer tok"));
    }

    #[tokio::test]
    async fn any_auth_no_credentials_is_passthrough() {
        let any = AnyAuthProvider::new(vec![Arc::new(BearerAuthProvider::new(
            "x",
            AuthCredentialSource::Missing,
        ))]);
        assert!(!any.has_credentials());
        let r = any.apply(req(), &EndpointAuthMetadata::unspecified()).unwrap();
        assert_eq!(auth_header(r), None);
    }

    // -------- AllAuthProvider --------

    #[tokio::test]
    async fn all_auth_applies_every_provider() {
        let a: DynAuthProvider = bearer("a", "tok");
        let b: DynAuthProvider = api_key("b", "X-Api-Key", "k");
        let all = AllAuthProvider::new(vec![a, b]);
        assert!(all.has_credentials());
        let r = all.apply(req(), &EndpointAuthMetadata::unspecified()).unwrap();
        let built = r.build().unwrap();
        assert_eq!(
            built.headers().get("authorization").and_then(|v| v.to_str().ok()),
            Some("Bearer tok"),
        );
        assert_eq!(
            built.headers().get("x-api-key").and_then(|v| v.to_str().ok()),
            Some("k"),
        );
    }

    #[test]
    fn all_auth_has_credentials_requires_every_child() {
        let a: DynAuthProvider = bearer("a", "tok");
        let b: DynAuthProvider = Arc::new(BearerAuthProvider::new(
            "b",
            AuthCredentialSource::Missing,
        ));
        let all = AllAuthProvider::new(vec![a, b]);
        // One missing → all auth can't be satisfied.
        assert!(!all.has_credentials());
    }

    #[test]
    fn all_auth_empty_provider_list_is_no_credentials() {
        // Vacuous truth would say "all of zero providers have creds = true",
        // but for the all-auth strategy that's misleading: no providers
        // means no auth gets attached, which isn't what the user asked for.
        let all = AllAuthProvider::new(Vec::new());
        assert!(!all.has_credentials());
    }

    #[tokio::test]
    async fn all_auth_short_circuits_on_provider_error() {
        // Bearer with a token containing CTL chars errors in apply.
        let bad: DynAuthProvider = Arc::new(BearerAuthProvider::new(
            "bad",
            AuthCredentialSource::literal("bad\ntoken"),
        ));
        let good: DynAuthProvider = api_key("good", "X-Api-Key", "k");
        // Order matters: bad first → error before good ever runs.
        let all = AllAuthProvider::new(vec![bad, good]);
        let err = all
            .apply(req(), &EndpointAuthMetadata::unspecified())
            .unwrap_err();
        assert!(matches!(err, CliError::Auth(_)));
    }

    // -------- LayeredAuthProvider --------

    #[tokio::test]
    async fn layered_applies_primary_and_present_layer() {
        let primary: DynAuthProvider = bearer("bearer", "tok");
        let layer: DynAuthProvider = Arc::new(HeaderAuthProvider::new(
            "sandbox",
            "Anduril-Sandbox-Authorization",
            AuthCredentialSource::literal("sbx"),
            true,
        ));
        let p = LayeredAuthProvider::new(primary, vec![layer]);
        let r = p.apply(req(), &EndpointAuthMetadata::unspecified()).unwrap();
        let built = r.build().unwrap();
        assert_eq!(
            built.headers().get("authorization").and_then(|v| v.to_str().ok()),
            Some("Bearer tok"),
        );
        assert_eq!(
            built
                .headers()
                .get("anduril-sandbox-authorization")
                .and_then(|v| v.to_str().ok()),
            Some("Bearer sbx"),
        );
    }

    #[tokio::test]
    async fn layered_skips_layer_without_credentials() {
        // Production case: no sandbox token set. The layer is silently
        // skipped and the request behaves as if it weren't configured.
        let primary: DynAuthProvider = bearer("bearer", "tok");
        let layer: DynAuthProvider = Arc::new(HeaderAuthProvider::new(
            "sandbox",
            "Anduril-Sandbox-Authorization",
            AuthCredentialSource::Missing,
            true,
        ));
        let p = LayeredAuthProvider::new(primary, vec![layer]);
        let r = p.apply(req(), &EndpointAuthMetadata::unspecified()).unwrap();
        let built = r.build().unwrap();
        assert_eq!(
            built.headers().get("authorization").and_then(|v| v.to_str().ok()),
            Some("Bearer tok"),
        );
        assert!(built.headers().get("anduril-sandbox-authorization").is_none());
    }

    #[test]
    fn layered_satisfiability_follows_primary_only() {
        // A present layer must not make an otherwise-unauthenticated CLI
        // claim it has credentials.
        let primary: DynAuthProvider = Arc::new(BearerAuthProvider::new(
            "bearer",
            AuthCredentialSource::Missing,
        ));
        let layer: DynAuthProvider = api_key("sandbox", "Anduril-Sandbox-Authorization", "sbx");
        let p = LayeredAuthProvider::new(primary, vec![layer]);
        assert!(!p.has_credentials());
        assert_eq!(p.name(), "bearer");
    }

    #[test]
    fn layered_credential_hints_exclude_layers() {
        // The friendly auth-error path should point at the primary's source,
        // not nag about an optional layer that's missing by design.
        let primary: DynAuthProvider = Arc::new(BearerAuthProvider::new(
            "bearer",
            AuthCredentialSource::from_env("ENVIRONMENT_TOKEN"),
        ));
        let layer: DynAuthProvider = Arc::new(HeaderAuthProvider::new(
            "sandbox",
            "Anduril-Sandbox-Authorization",
            AuthCredentialSource::from_env("SANDBOXES_TOKEN"),
            true,
        ));
        let p = LayeredAuthProvider::new(primary, vec![layer]);
        let hints = p.credential_hints();
        assert_eq!(hints, vec!["ENVIRONMENT_TOKEN environment variable"]);
    }

    #[tokio::test]
    async fn layered_does_not_attach_to_explicit_anonymous_endpoint() {
        // `security: []` opts the operation out of auth entirely — neither
        // the primary nor the supplementary layer should be attached.
        let primary: DynAuthProvider = bearer("bearer", "tok");
        let layer: DynAuthProvider = api_key("sandbox", "Anduril-Sandbox-Authorization", "sbx");
        let p = LayeredAuthProvider::new(primary, vec![layer]);
        let r = p
            .apply(req(), &EndpointAuthMetadata::explicit_anonymous())
            .unwrap();
        let built = r.build().unwrap();
        assert!(built.headers().get("anduril-sandbox-authorization").is_none());
    }

    // -------- RoutingAuthProvider --------

    fn routing_setup() -> RoutingAuthProvider {
        let mut schemes: HashMap<String, DynAuthProvider> = HashMap::new();
        schemes.insert("bearer".to_string(), bearer("bearer", "tok"));
        schemes.insert("apiKey".to_string(), api_key("apiKey", "X-Api-Key", "k"));
        RoutingAuthProvider::new(schemes)
    }

    #[tokio::test]
    async fn routing_unspecified_no_default_is_passthrough() {
        let r = routing_setup();
        assert!(r.has_credentials());
        let out = r
            .apply(req(), &EndpointAuthMetadata::unspecified())
            .unwrap();
        assert_eq!(auth_header(out), None);
    }

    #[tokio::test]
    async fn routing_explicit_anonymous_skips_auth_even_with_default() {
        // `security: []` on the operation means the endpoint is explicitly
        // unauthenticated. Even with a default provider that would happily
        // attach a bearer header, the routing wrapper must respect the
        // operation's opt-out.
        let routing = RoutingAuthProvider::new(HashMap::new())
            .with_default(bearer("bearer", "tok"));
        let out = routing
            .apply(req(), &EndpointAuthMetadata::explicit_anonymous())
            .unwrap();
        assert_eq!(auth_header(out), None);
    }

    #[tokio::test]
    async fn routing_picks_satisfiable_requirement() {
        let routing = routing_setup();
        let mut req_a = HashMap::new();
        req_a.insert("apiKey".to_string(), Vec::<String>::new());
        let endpoint = EndpointAuthMetadata::with_requirements(vec![req_a]);
        let out = routing.apply(req(), &endpoint).unwrap();
        assert_eq!(header(out, "x-api-key").as_deref(), Some("k"));
    }

    #[tokio::test]
    async fn routing_falls_back_to_or_alternative() {
        let routing = routing_setup();
        let mut req1 = HashMap::new();
        req1.insert("nonexistent".to_string(), Vec::<String>::new());
        let mut req2 = HashMap::new();
        req2.insert("bearer".to_string(), Vec::<String>::new());
        let endpoint = EndpointAuthMetadata::with_requirements(vec![req1, req2]);
        let out = routing.apply(req(), &endpoint).unwrap();
        assert_eq!(auth_header(out).as_deref(), Some("Bearer tok"));
    }

    #[tokio::test]
    async fn routing_combines_anded_schemes_in_one_requirement() {
        let routing = routing_setup();
        let mut requirement = HashMap::new();
        requirement.insert("bearer".to_string(), Vec::<String>::new());
        requirement.insert("apiKey".to_string(), Vec::<String>::new());
        let endpoint = EndpointAuthMetadata::with_requirements(vec![requirement]);
        let out = routing.apply(req(), &endpoint).unwrap();
        let built = out.build().unwrap();
        assert_eq!(
            built.headers().get("authorization").and_then(|v| v.to_str().ok()),
            Some("Bearer tok"),
        );
        assert_eq!(
            built.headers().get("x-api-key").and_then(|v| v.to_str().ok()),
            Some("k"),
        );
    }

    #[tokio::test]
    async fn routing_uses_default_when_endpoint_has_no_requirements() {
        let routing = RoutingAuthProvider::new(HashMap::new())
            .with_default(bearer("bearer", "tok"));
        let out = routing
            .apply(req(), &EndpointAuthMetadata::unspecified())
            .unwrap();
        assert_eq!(auth_header(out).as_deref(), Some("Bearer tok"));
    }

    #[tokio::test]
    async fn routing_no_satisfiable_requirement_is_passthrough() {
        let mut schemes: HashMap<String, DynAuthProvider> = HashMap::new();
        schemes.insert(
            "bearer".to_string(),
            Arc::new(BearerAuthProvider::new(
                "bearer",
                AuthCredentialSource::Missing,
            )),
        );
        let routing = RoutingAuthProvider::new(schemes);
        let mut requirement = HashMap::new();
        requirement.insert("bearer".to_string(), Vec::<String>::new());
        let endpoint = EndpointAuthMetadata::with_requirements(vec![requirement]);
        let out = routing.apply(req(), &endpoint).unwrap();
        assert_eq!(auth_header(out), None);
    }

    // -------- has_credentials_for(endpoint) --------

    #[test]
    fn routing_has_credentials_for_unspecified_with_no_default_uses_general_check() {
        let r = routing_setup();
        // No default → falls back to has_credentials() over schemes.
        assert!(r.has_credentials_for(&EndpointAuthMetadata::unspecified()));
    }

    #[test]
    fn routing_has_credentials_for_explicit_anonymous_is_true() {
        // `security: []` means "no creds needed" — report true so a 401
        // doesn't trigger the friendly "no creds" message (the response
        // would be a server-side mismatch, not a user config issue).
        let r = routing_setup();
        assert!(r.has_credentials_for(&EndpointAuthMetadata::explicit_anonymous()));
    }

    #[test]
    fn routing_has_credentials_for_satisfiable_requirement_is_true() {
        let r = routing_setup();
        let mut req = HashMap::new();
        req.insert("apiKey".to_string(), Vec::<String>::new());
        let endpoint = EndpointAuthMetadata::with_requirements(vec![req]);
        assert!(r.has_credentials_for(&endpoint));
    }

    #[test]
    fn routing_has_credentials_for_unsatisfiable_requirement_is_false() {
        // The endpoint requires `bearer` but bearer's source is Missing.
        let mut schemes: HashMap<String, DynAuthProvider> = HashMap::new();
        schemes.insert(
            "bearer".to_string(),
            Arc::new(BearerAuthProvider::new(
                "bearer",
                AuthCredentialSource::Missing,
            )),
        );
        // Also bind apiKey with creds — proving has_credentials_for is
        // *endpoint-aware*, not just "any scheme has creds".
        schemes.insert("apiKey".to_string(), api_key("apiKey", "X-Api-Key", "k"));
        let routing = RoutingAuthProvider::new(schemes);
        let mut req = HashMap::new();
        req.insert("bearer".to_string(), Vec::<String>::new());
        let endpoint = EndpointAuthMetadata::with_requirements(vec![req]);
        // Even though `apiKey` has creds, the endpoint demands `bearer` —
        // and bearer has none. So the friendly error path should fire.
        assert!(!routing.has_credentials_for(&endpoint));
        // But the coarse `has_credentials()` returns true. This is the
        // delta the new method exists to fix.
        assert!(routing.has_credentials());
    }

    #[test]
    fn routing_has_credentials_for_unspecified_delegates_to_default() {
        // Default present + has creds → endpoint-aware check inherits.
        let routing = RoutingAuthProvider::new(HashMap::new())
            .with_default(bearer("bearer", "tok"));
        assert!(routing.has_credentials_for(&EndpointAuthMetadata::unspecified()));
    }

    #[test]
    fn routing_has_credentials_for_unspecified_propagates_default_false() {
        // Default present but its provider has no creds → we should
        // honestly report no creds, not just "yes, a default exists".
        // Pins that the delegation actually consults the default's
        // predicate rather than treating "is there a default" as a yes/no.
        let empty_default: DynAuthProvider = Arc::new(BearerAuthProvider::new(
            "bearer",
            AuthCredentialSource::Missing,
        ));
        let routing = RoutingAuthProvider::new(HashMap::new()).with_default(empty_default);
        assert!(!routing.has_credentials_for(&EndpointAuthMetadata::unspecified()));
    }

    // Sanity-check that routing_setup produces a HeaderAuthProvider with the
    // expected name when looked up by scheme key — guards against an
    // accidental shape change in the test helper.
    #[test]
    fn routing_setup_registers_provider_named_apikey() {
        let r = routing_setup();
        assert_eq!(r.schemes["apiKey"].name(), "apiKey");
        assert_eq!(r.schemes["bearer"].name(), "bearer");
        // Silence dead-code lint on HeaderAuthProvider import path.
        let _: &dyn AuthProvider = &HeaderAuthProvider::new(
            "x",
            "Y",
            AuthCredentialSource::Missing,
            false,
        );
    }
}
