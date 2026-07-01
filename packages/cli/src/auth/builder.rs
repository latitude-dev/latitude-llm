//! Builder bindings: how the `CliApp` builder records "bind credential X to
//! scheme Y" before the doc is parsed, and how those bindings are lowered
//! into a concrete [`DynAuthProvider`] once the doc is available.

use std::collections::HashMap;
use std::sync::Arc;

use crate::auth::compose::{AllAuthProvider, AnyAuthProvider, RoutingAuthProvider};
use crate::auth::credential::AuthCredentialSource;
use crate::auth::provider::{DynAuthProvider, NoAuthProvider};
use crate::auth::schemes::{BasicAuthProvider, BearerAuthProvider, HeaderAuthProvider};

/// How the bound auth schemes should compose into a single
/// [`DynAuthProvider`]. Generators that already know their API's auth
/// model can pick the right strategy explicitly; hand-written CLIs can
/// rely on `Auto` and let the spec decide.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum AuthStrategy {
    /// Default: derive the strategy from the spec. If any operation
    /// declares per-endpoint `security:`, use [`Routing`](Self::Routing);
    /// otherwise use [`Any`](Self::Any). Matches the behaviour from before
    /// `auth_strategy()` existed.
    #[default]
    Auto,
    /// Try each scheme in registration order; first one with credentials
    /// applies. The "any of" semantics — common when an API accepts
    /// multiple equivalent auth methods (e.g., bearer or API key).
    Any,
    /// Apply *every* scheme to every request. The "and" semantics — used
    /// when an API requires multiple schemes simultaneously (e.g., HMAC
    /// signature plus an API key).
    All,
    /// Per-endpoint dispatch via the operation's `security_requirements`.
    /// Falls back to an [`AnyAuthProvider`] over the bound schemes for
    /// operations that didn't declare requirements. If the spec has no
    /// per-endpoint security at all, this behaves identically to `Any`.
    Routing,
}

/// How a builder caller has bound credentials to a scheme name.
#[derive(Clone)]
pub enum SchemeBinding {
    /// Single-value source — bearer / apiKey / oauth2 schemes.
    Token(AuthCredentialSource),
    /// Two-value source — http basic. Both must resolve for the provider
    /// to claim credentials.
    Basic {
        username: AuthCredentialSource,
        password: AuthCredentialSource,
    },
    /// Caller built their own provider. Used as-is. Bypasses the
    /// spec→provider lowering, so the binding's `name` is purely a routing
    /// key into [`RoutingAuthProvider`].
    Custom(DynAuthProvider),
}

impl std::fmt::Debug for SchemeBinding {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SchemeBinding::Token(s) => f.debug_tuple("Token").field(s).finish(),
            SchemeBinding::Basic { .. } => f.write_str("Basic { .. }"),
            SchemeBinding::Custom(p) => write!(f, "Custom({})", p.name()),
        }
    }
}

impl SchemeBinding {
    /// Walk the binding's credential sources for every CLI arg name they
    /// reference. CliApp uses this before clap parsing to register the
    /// corresponding global `--<name>` flags. `Custom` bindings are opaque
    /// (the user owns the provider) so they contribute nothing here.
    pub fn cli_args(&self) -> Vec<&str> {
        match self {
            SchemeBinding::Token(src) => src.cli_args(),
            SchemeBinding::Basic { username, password } => {
                let mut out = username.cli_args();
                out.extend(password.cli_args());
                out
            }
            SchemeBinding::Custom(_) => Vec::new(),
        }
    }

    /// Finalize the binding's credential sources against the parsed clap
    /// matches — replaces any `Cli(name)` variants with closures that read
    /// from `matches`. Pass-through for `Custom` (the user already owns
    /// the resolution path).
    pub fn finalize(self, matches: &Arc<clap::ArgMatches>) -> Self {
        match self {
            SchemeBinding::Token(src) => SchemeBinding::Token(src.finalize(matches)),
            SchemeBinding::Basic { username, password } => SchemeBinding::Basic {
                username: username.finalize(matches),
                password: password.finalize(matches),
            },
            SchemeBinding::Custom(p) => SchemeBinding::Custom(p),
        }
    }
}

/// Render a human-readable "Authentication:" section for `--help`
/// describing each binding's scheme name and where it reads its value
/// from. Returns `None` when there are no bindings (caller can omit the
/// section entirely).
///
/// The output looks like:
///
/// ```text
/// Authentication:
///   bearerAuth   API_TOKEN env var
///   apiKey       --api-key flag / API_KEY env var / ~/.api/key file
/// ```
///
/// CLI flags and file paths are described in human terms. Closures and
/// the `Custom` binding are reported as "custom" — their source isn't
/// inspectable.
pub fn render_auth_help_section(bindings: &[(String, SchemeBinding)]) -> Option<String> {
    if bindings.is_empty() {
        return None;
    }
    let max_name = bindings
        .iter()
        .map(|(n, _)| n.len())
        .max()
        .unwrap_or(0)
        .max(8);

    let mut out = String::from("Authentication:\n");
    for (name, binding) in bindings {
        let sources = describe_binding_sources(binding);
        let _ = std::fmt::Write::write_fmt(
            &mut out,
            format_args!("  {name:<max_name$}   {sources}\n"),
        );
    }
    Some(out)
}

/// Render the optional-layer rows for the `--help` "Authentication:" block.
///
/// Layers are additive supplementary headers (e.g. a sandbox-only token) that
/// are attached on top of the primary auth when their credential is present.
/// Each row is rendered as `  <name>   <hints> (optional)` and the block is
/// returned *without* the `Authentication:` heading so the caller can append
/// it under [`render_auth_help_section`]'s output (or supply the heading
/// itself when there are no primary bindings).
///
/// Returns `None` when there are no layers.
pub fn render_auth_layers_help(layers: &[(String, Vec<String>)]) -> Option<String> {
    if layers.is_empty() {
        return None;
    }
    let max_name = layers.iter().map(|(n, _)| n.len()).max().unwrap_or(0).max(8);
    let mut out = String::new();
    for (name, hints) in layers {
        let sources = if hints.is_empty() {
            "custom (optional)".to_string()
        } else {
            format!("{} (optional)", hints.join(" / "))
        };
        let _ = std::fmt::Write::write_fmt(
            &mut out,
            format_args!("  {name:<max_name$}   {sources}\n"),
        );
    }
    Some(out)
}

fn describe_binding_sources(binding: &SchemeBinding) -> String {
    match binding {
        SchemeBinding::Token(src) => describe_credential_source(src),
        SchemeBinding::Basic { username, password } => {
            format!(
                "basic auth · username: {} · password: {}",
                describe_credential_source(username),
                describe_credential_source(password),
            )
        }
        SchemeBinding::Custom(provider) => {
            let hints = provider.credential_hints();
            if hints.is_empty() {
                "custom auth provider".to_string()
            } else {
                // credential_hints() uses "environment variable"; normalise
                // to the shorter "env var" used by describe_credential_source.
                hints
                    .iter()
                    .map(|h| h.replace("environment variable", "env var"))
                    .collect::<Vec<_>>()
                    .join(" / ")
            }
        }
    }
}

fn describe_credential_source(src: &AuthCredentialSource) -> String {
    match src {
        AuthCredentialSource::Env(name) => format!("{name} env var"),
        AuthCredentialSource::Cli(arg) => format!("--{arg} flag"),
        AuthCredentialSource::File(path) => format!("{} file", path.display()),
        AuthCredentialSource::Literal(_) => "built-in literal".to_string(),
        AuthCredentialSource::Closure(_, Some(hint)) => hint.clone(),
        AuthCredentialSource::Closure(_, None) => "custom resolver".to_string(),
        AuthCredentialSource::Chain(sources) => sources
            .iter()
            .map(describe_credential_source)
            .collect::<Vec<_>>()
            .join(" / "),
        AuthCredentialSource::Keyring { service, account } => {
            format!("keyring {service}:{account}")
        }
        AuthCredentialSource::Missing => "(unbound)".to_string(),
    }
}

/// Walk every binding in `bindings` and collect the union of CLI arg
/// names they reference. Deduplicated while preserving first-seen order.
pub fn collect_binding_cli_args(bindings: &[(String, SchemeBinding)]) -> Vec<String> {
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut out: Vec<String> = Vec::new();
    for (_, b) in bindings {
        for arg in b.cli_args() {
            if seen.insert(arg.to_string()) {
                out.push(arg.to_string());
            }
        }
    }
    out
}

/// Finalize every binding against `matches`. Returns a new `Vec`; the
/// originals are consumed.
pub fn finalize_bindings(
    bindings: Vec<(String, SchemeBinding)>,
    matches: &Arc<clap::ArgMatches>,
) -> Vec<(String, SchemeBinding)> {
    bindings
        .into_iter()
        .map(|(name, b)| (name, b.finalize(matches)))
        .collect()
}

/// Lower a single binding to a concrete provider, given the spec scheme
/// declaration that names it (or `None` if the binding references a scheme
/// not declared in `components.securitySchemes`).
///
/// Undeclared schemes (`declared == None`) default to bearer for token
/// bindings and basic for two-value bindings — sensible defaults for
/// callers who don't have a spec to lean on (e.g., GraphQL CLIs).
///
/// When a binding shape doesn't match its declared scheme (e.g., a Token
/// bound to `HttpBasic`), the binding is dropped with a `tracing::warn!`
/// so the misconfiguration shows up in the structured logs rather than
/// silently sending requests with no auth.
fn provider_for_binding(
    scheme_name: &str,
    binding: &SchemeBinding,
    declared: Option<&crate::openapi::discovery::SecurityScheme>,
) -> Option<DynAuthProvider> {
    use crate::openapi::discovery::SecurityScheme as S;
    match binding {
        SchemeBinding::Custom(p) => Some(p.clone()),
        SchemeBinding::Token(source) => match declared {
            // Bearer/OAuth2 → standard Authorization: Bearer <token>.
            // Undeclared schemes default to bearer (legacy parity).
            Some(S::HttpBearer) | Some(S::OAuth2) | None => Some(Arc::new(
                BearerAuthProvider::new(scheme_name, source.clone()),
            )),
            Some(S::ApiKeyHeader { name }) => Some(Arc::new(HeaderAuthProvider::new(
                scheme_name,
                name,
                source.clone(),
                false,
            ))),
            Some(S::ApiKeyQuery { .. }) => {
                tracing::warn!(
                    scheme = scheme_name,
                    "auth_scheme: apiKey-in-query schemes are not yet supported; binding ignored",
                );
                None
            }
            Some(S::HttpBasic) => {
                tracing::warn!(
                    scheme = scheme_name,
                    "auth_scheme: scheme is HTTP Basic but a single-value Token binding was supplied; \
                     use auth_basic_scheme instead",
                );
                None
            }
            Some(S::Other(kind)) => {
                tracing::warn!(
                    scheme = scheme_name,
                    kind = kind,
                    "auth_scheme: unsupported scheme type; bind via auth_provider with a custom \
                     provider instead",
                );
                None
            }
        },
        SchemeBinding::Basic { username, password } => match declared {
            Some(S::HttpBasic) | None => Some(Arc::new(BasicAuthProvider::new(
                scheme_name,
                username.clone(),
                password.clone(),
            ))),
            _ => {
                tracing::warn!(
                    scheme = scheme_name,
                    "auth_basic_scheme: scheme is not HTTP Basic; binding ignored",
                );
                None
            }
        },
    }
}

/// Walk a `RestDescription` and decide whether any operation declares
/// per-endpoint security requirements. Used to choose between
/// `AnyAuthProvider` (no spec-level routing needed) and
/// `RoutingAuthProvider` (some endpoints require specific schemes).
fn doc_has_per_endpoint_security(doc: &crate::openapi::discovery::RestDescription) -> bool {
    fn walk(res: &crate::openapi::discovery::RestResource) -> bool {
        if res
            .methods
            .values()
            .any(|m| m.security_requirements.is_some())
        {
            return true;
        }
        res.resources.values().any(walk)
    }
    doc.resources.values().any(walk)
}

/// Protocol-agnostic provider construction. Used directly by GraphQL
/// (which has no spec-declared schemes and no per-endpoint metadata) and
/// indirectly by [`build_provider_from_doc`] for OpenAPI.
///
/// Equivalent to [`build_provider_with_strategy`] called with
/// [`AuthStrategy::Auto`]: the strategy is derived from
/// `has_per_endpoint_security`. Use [`build_provider_with_strategy`]
/// directly if your generator wants explicit control (e.g., the all-auth
/// case the spec doesn't express).
pub fn build_provider_from_bindings(
    bindings: &[(String, SchemeBinding)],
    security_schemes: &HashMap<String, crate::openapi::discovery::SecurityScheme>,
    has_per_endpoint_security: bool,
) -> DynAuthProvider {
    build_provider_with_strategy(
        bindings,
        security_schemes,
        AuthStrategy::Auto,
        has_per_endpoint_security,
    )
}

/// Strategy-aware provider construction. The fully general factory.
///
/// Construction outline:
/// 1. Each binding is lowered to a concrete provider, using `security_schemes`
///    (if non-empty) to pick between Bearer / Header / Basic.
/// 2. Bindings are deduplicated by scheme name — last registration wins for
///    both the routing map and the AnyAuth fallback list, so the two views
///    can never disagree.
/// 3. Insertion order is preserved across the dedup so the `Any` and `All`
///    strategies see schemes in registration order.
/// 4. The `strategy` chooses how the lowered providers compose:
///    - `Auto` → `Routing` if `has_per_endpoint_security`, else `Any`.
///    - `Any` → `AnyAuthProvider`. First with credentials applies.
///    - `All` → `AllAuthProvider`. Every scheme applies, every request.
///    - `Routing` → `RoutingAuthProvider` with `AnyAuthProvider` as default.
/// 5. With no bindings at all, returns a [`NoAuthProvider`] sentinel —
///    independent of `strategy`. `All` / `Routing` with zero bindings would
///    otherwise produce a degenerate composite (an empty `AllAuthProvider`
///    that vacuously claims credentials, or a `RoutingAuthProvider` whose
///    only contribution is its default fallback). Collapsing to
///    `NoAuthProvider` keeps the unauthenticated-CLI case unambiguous.
pub fn build_provider_with_strategy(
    bindings: &[(String, SchemeBinding)],
    security_schemes: &HashMap<String, crate::openapi::discovery::SecurityScheme>,
    strategy: AuthStrategy,
    has_per_endpoint_security: bool,
) -> DynAuthProvider {
    if bindings.is_empty() {
        return Arc::new(NoAuthProvider);
    }

    let mut by_name: HashMap<String, DynAuthProvider> = HashMap::new();
    let mut order: Vec<String> = Vec::new();
    for (name, binding) in bindings {
        let declared = security_schemes.get(name);
        // Surface typos: if the spec declared *some* schemes but this
        // binding's name isn't among them, the binding will silently never
        // route — no operation's `security:` block can match a name that
        // isn't in the registry. Don't warn when there are no declared
        // schemes (that's legacy-style usage with no spec security).
        if declared.is_none() && !security_schemes.is_empty() {
            let declared_names: Vec<&str> =
                security_schemes.keys().map(String::as_str).collect();
            tracing::warn!(
                scheme = name.as_str(),
                declared = ?declared_names,
                "auth scheme name is not declared in components.securitySchemes; \
                 check for typos — operations referencing a different name won't \
                 receive this credential",
            );
        }
        let Some(provider) = provider_for_binding(name, binding, declared) else {
            continue;
        };
        if !by_name.contains_key(name) {
            order.push(name.clone());
        }
        by_name.insert(name.clone(), provider);
    }

    let ordered: Vec<DynAuthProvider> = order.iter().map(|n| by_name[n].clone()).collect();

    let resolved = match strategy {
        AuthStrategy::Auto => {
            if has_per_endpoint_security {
                AuthStrategy::Routing
            } else {
                AuthStrategy::Any
            }
        }
        explicit => explicit,
    };

    match resolved {
        AuthStrategy::Auto => unreachable!("Auto resolved above"),
        AuthStrategy::Any => Arc::new(AnyAuthProvider::new(ordered)),
        AuthStrategy::All => Arc::new(AllAuthProvider::new(ordered)),
        AuthStrategy::Routing => {
            // The default for unspecified endpoints is still AnyAuth over
            // all schemes — preserves the "use whatever works" fallback
            // for operations the spec didn't pin.
            let any: DynAuthProvider = Arc::new(AnyAuthProvider::new(ordered));
            Arc::new(RoutingAuthProvider::new(by_name).with_default(any))
        }
    }
}

/// OpenAPI-flavored convenience: pulls `security_schemes` and the
/// per-endpoint flag out of a parsed [`RestDescription`][rd].
///
/// [rd]: crate::openapi::discovery::RestDescription
pub fn build_provider_from_doc(
    doc: &crate::openapi::discovery::RestDescription,
    bindings: &[(String, SchemeBinding)],
) -> DynAuthProvider {
    build_provider_from_bindings(
        bindings,
        &doc.security_schemes,
        doc_has_per_endpoint_security(doc),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::provider::EndpointAuthMetadata;
    use crate::auth::test_helpers::{auth_header, header, req};

    fn doc_with_schemes(
        schemes: &[(&str, crate::openapi::discovery::SecurityScheme)],
    ) -> crate::openapi::discovery::RestDescription {
        let mut d = crate::openapi::discovery::RestDescription::default();
        for (name, scheme) in schemes {
            d.security_schemes
                .insert((*name).to_string(), scheme.clone());
        }
        d
    }

    fn doc_with_method_requirement(
        schemes: &[(&str, crate::openapi::discovery::SecurityScheme)],
        requirement: HashMap<String, Vec<String>>,
    ) -> crate::openapi::discovery::RestDescription {
        let mut d = doc_with_schemes(schemes);
        let method = crate::openapi::discovery::RestMethod {
            security_requirements: Some(vec![requirement]),
            ..Default::default()
        };
        let mut resource = crate::openapi::discovery::RestResource::default();
        resource.methods.insert("op".to_string(), method);
        d.resources.insert("group".to_string(), resource);
        d
    }

    #[test]
    fn no_bindings_returns_noop() {
        let doc = crate::openapi::discovery::RestDescription::default();
        let p = build_provider_from_doc(&doc, &[]);
        assert_eq!(p.name(), "none");
        assert!(!p.has_credentials());
    }

    #[tokio::test]
    async fn bearer_scheme_routes_to_bearer_provider() {
        let doc = doc_with_schemes(&[(
            "bearerAuth",
            crate::openapi::discovery::SecurityScheme::HttpBearer,
        )]);
        let bindings = vec![(
            "bearerAuth".to_string(),
            SchemeBinding::Token(AuthCredentialSource::literal("tok")),
        )];
        let p = build_provider_from_doc(&doc, &bindings);
        assert_eq!(p.name(), "any");
        let r = p.apply(req(), &EndpointAuthMetadata::unspecified()).unwrap();
        assert_eq!(auth_header(r).as_deref(), Some("Bearer tok"));
    }

    #[tokio::test]
    async fn apikey_header_uses_declared_header_name() {
        let doc = doc_with_schemes(&[(
            "apiKey",
            crate::openapi::discovery::SecurityScheme::ApiKeyHeader {
                name: "X-Api-Key".to_string(),
            },
        )]);
        let bindings = vec![(
            "apiKey".to_string(),
            SchemeBinding::Token(AuthCredentialSource::literal("k")),
        )];
        let p = build_provider_from_doc(&doc, &bindings);
        let r = p.apply(req(), &EndpointAuthMetadata::unspecified()).unwrap();
        assert_eq!(header(r, "x-api-key").as_deref(), Some("k"));
    }

    #[tokio::test]
    async fn basic_scheme_routes_to_basic_provider() {
        let doc = doc_with_schemes(&[(
            "basic",
            crate::openapi::discovery::SecurityScheme::HttpBasic,
        )]);
        let bindings = vec![(
            "basic".to_string(),
            SchemeBinding::Basic {
                username: AuthCredentialSource::literal("alice"),
                password: AuthCredentialSource::literal("hunter2"),
            },
        )];
        let p = build_provider_from_doc(&doc, &bindings);
        let r = p.apply(req(), &EndpointAuthMetadata::unspecified()).unwrap();
        assert_eq!(
            auth_header(r).as_deref(),
            Some("Basic YWxpY2U6aHVudGVyMg=="),
        );
    }

    #[test]
    fn token_binding_for_basic_scheme_is_skipped() {
        // Token form can't satisfy HttpBasic (which needs two values).
        // The binding should be silently dropped — provider has no creds.
        let doc = doc_with_schemes(&[(
            "basic",
            crate::openapi::discovery::SecurityScheme::HttpBasic,
        )]);
        let bindings = vec![(
            "basic".to_string(),
            SchemeBinding::Token(AuthCredentialSource::literal("oops")),
        )];
        let p = build_provider_from_doc(&doc, &bindings);
        assert!(!p.has_credentials());
    }

    #[tokio::test]
    async fn uses_routing_when_doc_has_per_endpoint_security() {
        let mut req_map = HashMap::new();
        req_map.insert("apiKey".to_string(), Vec::<String>::new());
        let doc = doc_with_method_requirement(
            &[
                (
                    "bearerAuth",
                    crate::openapi::discovery::SecurityScheme::HttpBearer,
                ),
                (
                    "apiKey",
                    crate::openapi::discovery::SecurityScheme::ApiKeyHeader {
                        name: "X-Api-Key".to_string(),
                    },
                ),
            ],
            req_map.clone(),
        );
        let bindings = vec![
            (
                "bearerAuth".to_string(),
                SchemeBinding::Token(AuthCredentialSource::literal("tok")),
            ),
            (
                "apiKey".to_string(),
                SchemeBinding::Token(AuthCredentialSource::literal("k")),
            ),
        ];
        let p = build_provider_from_doc(&doc, &bindings);
        assert_eq!(p.name(), "routing");
        let endpoint = EndpointAuthMetadata::with_requirements(vec![req_map]);
        let r = p.apply(req(), &endpoint).unwrap();
        let built = r.build().unwrap();
        assert_eq!(
            built.headers().get("x-api-key").and_then(|v| v.to_str().ok()),
            Some("k"),
        );
        assert!(built.headers().get("authorization").is_none());
    }

    #[tokio::test]
    async fn routing_falls_back_to_any_for_unspecified_endpoint() {
        let mut req_map = HashMap::new();
        req_map.insert("apiKey".to_string(), Vec::<String>::new());
        let doc = doc_with_method_requirement(
            &[(
                "bearerAuth",
                crate::openapi::discovery::SecurityScheme::HttpBearer,
            )],
            req_map,
        );
        let bindings = vec![(
            "bearerAuth".to_string(),
            SchemeBinding::Token(AuthCredentialSource::literal("tok")),
        )];
        let p = build_provider_from_doc(&doc, &bindings);
        let r = p
            .apply(req(), &EndpointAuthMetadata::unspecified())
            .unwrap();
        assert_eq!(auth_header(r).as_deref(), Some("Bearer tok"));
    }

    #[tokio::test]
    async fn duplicate_binding_uses_last_write_consistently() {
        // Two bindings to the same scheme name. The user almost certainly
        // didn't mean it, but if it happens, both the AnyAuth fallback and
        // the RoutingAuth map must agree on which provider wins.
        let mut req_map = HashMap::new();
        req_map.insert("apiKey".to_string(), Vec::<String>::new());
        let doc = doc_with_method_requirement(
            &[(
                "apiKey",
                crate::openapi::discovery::SecurityScheme::ApiKeyHeader {
                    name: "X-Api-Key".to_string(),
                },
            )],
            req_map.clone(),
        );
        let bindings = vec![
            (
                "apiKey".to_string(),
                SchemeBinding::Token(AuthCredentialSource::literal("first")),
            ),
            (
                "apiKey".to_string(),
                SchemeBinding::Token(AuthCredentialSource::literal("second")),
            ),
        ];
        let p = build_provider_from_doc(&doc, &bindings);
        let endpoint = EndpointAuthMetadata::with_requirements(vec![req_map]);
        let r = p.apply(req(), &endpoint).unwrap();
        assert_eq!(header(r, "x-api-key").as_deref(), Some("second"));
        let r2 = p.apply(req(), &EndpointAuthMetadata::unspecified()).unwrap();
        assert_eq!(header(r2, "x-api-key").as_deref(), Some("second"));
    }

    #[tokio::test]
    async fn from_bindings_works_without_doc() {
        // GraphQL path: no security_schemes registry, no per-endpoint
        // metadata, but the same builder API. Should still produce a
        // working AnyAuthProvider.
        let bindings = vec![(
            "bearerAuth".to_string(),
            SchemeBinding::Token(AuthCredentialSource::literal("g")),
        )];
        let p = build_provider_from_bindings(&bindings, &HashMap::new(), false);
        assert_eq!(p.name(), "any");
        let r = p.apply(req(), &EndpointAuthMetadata::unspecified()).unwrap();
        assert_eq!(auth_header(r).as_deref(), Some("Bearer g"));
    }

    #[tokio::test]
    async fn strategy_all_applies_every_scheme_unconditionally() {
        // Generator knows the API requires bearer AND apiKey on every
        // request. Spec might not express this; the strategy override
        // does.
        let bindings = vec![
            (
                "bearer".to_string(),
                SchemeBinding::Token(AuthCredentialSource::literal("tok")),
            ),
            (
                "apiKey".to_string(),
                SchemeBinding::Custom(crate::auth::test_helpers::api_key(
                    "apiKey",
                    "X-Api-Key",
                    "k",
                )),
            ),
        ];
        let p = build_provider_with_strategy(
            &bindings,
            &HashMap::new(),
            AuthStrategy::All,
            false,
        );
        assert_eq!(p.name(), "all");
        let r = p.apply(req(), &EndpointAuthMetadata::unspecified()).unwrap();
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
    fn strategy_any_overrides_spec_routing() {
        // Spec has per-endpoint security (would auto-pick Routing), but
        // the generator forces Any anyway. Verifies the override actually
        // wins.
        let mut req_map = HashMap::new();
        req_map.insert("bearer".to_string(), Vec::<String>::new());
        let doc = doc_with_method_requirement(
            &[(
                "bearer",
                crate::openapi::discovery::SecurityScheme::HttpBearer,
            )],
            req_map,
        );
        let bindings = vec![(
            "bearer".to_string(),
            SchemeBinding::Token(AuthCredentialSource::literal("t")),
        )];
        let p = build_provider_with_strategy(
            &bindings,
            &doc.security_schemes,
            AuthStrategy::Any,
            true, // doc has per-endpoint security, but Any wins
        );
        assert_eq!(p.name(), "any");
    }

    #[test]
    fn strategy_routing_used_even_without_per_endpoint_security() {
        // Generator wants routing semantics regardless of what the spec
        // says. Falls back to AnyAuthProvider default for any op without
        // requirements.
        let bindings = vec![(
            "bearer".to_string(),
            SchemeBinding::Token(AuthCredentialSource::literal("t")),
        )];
        let p = build_provider_with_strategy(
            &bindings,
            &HashMap::new(),
            AuthStrategy::Routing,
            false, // no per-endpoint security in the spec
        );
        assert_eq!(p.name(), "routing");
    }

    #[test]
    fn strategy_auto_picks_routing_when_spec_has_per_endpoint_security() {
        let mut req_map = HashMap::new();
        req_map.insert("bearer".to_string(), Vec::<String>::new());
        let doc = doc_with_method_requirement(
            &[(
                "bearer",
                crate::openapi::discovery::SecurityScheme::HttpBearer,
            )],
            req_map,
        );
        let bindings = vec![(
            "bearer".to_string(),
            SchemeBinding::Token(AuthCredentialSource::literal("t")),
        )];
        let p =
            build_provider_with_strategy(&bindings, &doc.security_schemes, AuthStrategy::Auto, true);
        assert_eq!(p.name(), "routing");
    }

    #[test]
    fn strategy_routing_with_zero_bindings_returns_no_auth() {
        // Explicit Routing strategy + no bindings collapses to NoAuthProvider.
        // Confirms the early-return at the top of build_provider_with_strategy
        // applies regardless of `strategy` — a Routing wrapper around zero
        // schemes would have only its (also empty) default to fall back on,
        // which isn't a useful state to expose.
        let p = build_provider_with_strategy(
            &[],
            &HashMap::new(),
            AuthStrategy::Routing,
            true,
        );
        assert_eq!(p.name(), "none");
        assert!(!p.has_credentials());
    }

    #[test]
    fn strategy_all_with_zero_bindings_returns_no_auth() {
        // Same contract for All. An empty AllAuthProvider would vacuously
        // claim no credentials anyway, but collapsing to NoAuthProvider
        // keeps the unauthenticated case uniform across strategies.
        let p = build_provider_with_strategy(
            &[],
            &HashMap::new(),
            AuthStrategy::All,
            false,
        );
        assert_eq!(p.name(), "none");
        assert!(!p.has_credentials());
    }

    #[test]
    fn strategy_auto_picks_any_when_no_per_endpoint_security() {
        let bindings = vec![(
            "bearer".to_string(),
            SchemeBinding::Token(AuthCredentialSource::literal("t")),
        )];
        let p = build_provider_with_strategy(
            &bindings,
            &HashMap::new(),
            AuthStrategy::Auto,
            false,
        );
        assert_eq!(p.name(), "any");
    }

    // -------- render_auth_help_section --------

    #[test]
    fn render_auth_help_section_none_for_empty_bindings() {
        assert!(render_auth_help_section(&[]).is_none());
    }

    #[test]
    fn render_auth_help_section_describes_env_var() {
        let bindings = vec![(
            "bearerAuth".to_string(),
            SchemeBinding::Token(AuthCredentialSource::from_env("API_TOKEN")),
        )];
        let out = render_auth_help_section(&bindings).unwrap();
        assert!(out.contains("Authentication:"));
        assert!(out.contains("bearerAuth"));
        assert!(out.contains("API_TOKEN env var"));
    }

    #[test]
    fn render_auth_help_section_describes_chain() {
        let bindings = vec![(
            "apiKey".to_string(),
            SchemeBinding::Token(AuthCredentialSource::any([
                AuthCredentialSource::cli("api-key"),
                AuthCredentialSource::from_env("API_KEY"),
                AuthCredentialSource::file("~/.api/key"),
            ])),
        )];
        let out = render_auth_help_section(&bindings).unwrap();
        assert!(out.contains("--api-key flag"));
        assert!(out.contains("API_KEY env var"));
        assert!(out.contains("~/.api/key file"));
        assert!(out.contains(" / "));
    }

    #[test]
    fn render_auth_help_section_describes_basic_pair() {
        let bindings = vec![(
            "basic".to_string(),
            SchemeBinding::Basic {
                username: AuthCredentialSource::from_env("API_USER"),
                password: AuthCredentialSource::from_env("API_PASS"),
            },
        )];
        let out = render_auth_help_section(&bindings).unwrap();
        assert!(out.contains("basic"));
        assert!(out.contains("username"));
        assert!(out.contains("password"));
        assert!(out.contains("API_USER env var"));
        assert!(out.contains("API_PASS env var"));
    }

    #[test]
    fn render_auth_layers_help_none_for_empty() {
        assert!(render_auth_layers_help(&[]).is_none());
    }

    #[test]
    fn render_auth_layers_help_marks_optional_with_hints() {
        let layers = vec![(
            "sandboxAuthorization".to_string(),
            vec!["SANDBOXES_TOKEN environment variable".to_string()],
        )];
        let out = render_auth_layers_help(&layers).unwrap();
        assert!(out.contains("sandboxAuthorization"));
        assert!(out.contains("SANDBOXES_TOKEN environment variable"));
        assert!(out.contains("(optional)"));
    }

    #[test]
    fn render_auth_layers_help_handles_hintless_layer() {
        let layers = vec![("x".to_string(), Vec::new())];
        let out = render_auth_layers_help(&layers).unwrap();
        assert!(out.contains("custom (optional)"));
    }

    #[test]
    fn render_auth_help_section_marks_hintless_custom_provider_opaque() {
        let bindings = vec![(
            "x".to_string(),
            SchemeBinding::Custom(crate::auth::test_helpers::bearer("x", "tok")),
        )];
        let out = render_auth_help_section(&bindings).unwrap();
        assert!(out.contains("custom auth provider"));
    }

    #[test]
    fn render_auth_help_section_shows_custom_provider_credential_hints() {
        use crate::auth::schemes::BasicAuthProvider;
        let provider: DynAuthProvider = Arc::new(BasicAuthProvider::username_only(
            "ApiKeyAuth",
            AuthCredentialSource::from_env("CLOSE_API_KEY"),
        ));
        let bindings = vec![(
            "ApiKeyAuth".to_string(),
            SchemeBinding::Custom(provider),
        )];
        let out = render_auth_help_section(&bindings).unwrap();
        assert!(out.contains("CLOSE_API_KEY env var"), "should show env var name with short label, got: {out}");
        assert!(!out.contains("environment variable"), "should use 'env var' not 'environment variable', got: {out}");
        assert!(!out.contains("custom auth provider"), "should not show opaque label, got: {out}");
    }

    #[tokio::test]
    async fn custom_binding_used_as_is() {
        let custom: DynAuthProvider = Arc::new(HeaderAuthProvider::new(
            "custom",
            "X-Custom",
            AuthCredentialSource::literal("c"),
            false,
        ));
        let doc = crate::openapi::discovery::RestDescription::default();
        let bindings = vec![("custom".to_string(), SchemeBinding::Custom(custom))];
        let p = build_provider_from_doc(&doc, &bindings);
        let r = p.apply(req(), &EndpointAuthMetadata::unspecified()).unwrap();
        assert_eq!(header(r, "x-custom").as_deref(), Some("c"));
    }
}
