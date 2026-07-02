//! Typed auth-scheme builders for root-level `CliApp` registration.
//!
//! These builders provide a type-safe, discoverable API for declaring auth
//! at the CLI level. Each builder produces the underlying `(String, SchemeBinding)`
//! pair consumed by the existing auth infrastructure.
//!
//! # Example
//!
//! ```rust,no_run
//! use fern_cli_sdk::app::CliApp;
//! use fern_cli_sdk::auth::{BearerAuth, ApiKeyAuth, BasicAuth, OAuth2Auth};
//! use fern_cli_sdk::openapi::OpenApiBinding;
//!
//! CliApp::new("platform")
//!     .auth(BearerAuth::new("bearerAuth").env("PLATFORM_TOKEN"))
//!     .auth(ApiKeyAuth::new("apiKey").env("API_KEY"))
//!     .auth(BasicAuth::new("basicAuth").username_env("USER").password_env("PASS"))
//!     .auth(OAuth2Auth::new("OAuth2Security").client_id_env("ID").client_secret_env("SECRET").token_url("https://auth.example.com/token"))
//!     .binding(OpenApiBinding::new().spec("openapi: '3.0.0'\ninfo:\n  title: x\n  version: '1'\npaths: {}"))
//!     .run();
//! ```

use std::sync::Arc;

use super::builder::SchemeBinding;
use super::credential::AuthCredentialSource;
use super::oauth2::{MisconfiguredOAuth2Provider, OAuth2Grant, OAuth2TokenProvider};
use super::provider::DynAuthProvider;

/// Trait implemented by all typed auth builders. Converts the builder
/// into the `(scheme_name, SchemeBinding)` pair used by the auth
/// infrastructure.
pub trait AuthSchemeBuilder {
    /// Consume the builder and produce a `(scheme_name, SchemeBinding)` pair.
    fn into_binding(self) -> (String, SchemeBinding);
}

// ---------------------------------------------------------------------------
// BearerAuth — Authorization: Bearer <token>
// ---------------------------------------------------------------------------

/// Builder for bearer token authentication (`Authorization: Bearer <token>`).
///
/// The scheme name must match the `securitySchemes` key in the binding's spec.
#[derive(Debug, Clone)]
pub struct BearerAuth {
    name: String,
    source: AuthCredentialSource,
}

impl BearerAuth {
    /// Create a new bearer auth builder. `name` must match the scheme name
    /// declared in the spec's `components.securitySchemes`.
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            source: AuthCredentialSource::Missing,
        }
    }

    /// Read the bearer token from an environment variable.
    pub fn env(mut self, var_name: impl Into<String>) -> Self {
        self.source = AuthCredentialSource::from_env(var_name);
        self
    }

    /// Read the bearer token from a CLI flag (`--<arg_name>`).
    pub fn cli(mut self, arg_name: impl Into<String>) -> Self {
        self.source = AuthCredentialSource::cli(arg_name);
        self
    }

    /// Read the bearer token from a file.
    pub fn file(mut self, path: impl Into<std::path::PathBuf>) -> Self {
        self.source = AuthCredentialSource::file(path.into());
        self
    }

    /// Use a fallback chain: try env, then CLI, then file, etc.
    pub fn source(mut self, source: AuthCredentialSource) -> Self {
        self.source = source;
        self
    }
}

impl AuthSchemeBuilder for BearerAuth {
    fn into_binding(self) -> (String, SchemeBinding) {
        (self.name, SchemeBinding::Token(self.source))
    }
}

// ---------------------------------------------------------------------------
// ApiKeyAuth — header or query-parameter API key
// ---------------------------------------------------------------------------

/// Builder for API key authentication (header-based or query-parameter).
///
/// The scheme name must match the `securitySchemes` key in the binding's spec.
/// The header name is read from the spec's `in: header` / `name: X-API-Key`
/// declaration; it does NOT need to be set here unless overriding.
#[derive(Debug, Clone)]
pub struct ApiKeyAuth {
    name: String,
    source: AuthCredentialSource,
}

impl ApiKeyAuth {
    /// Create a new API key auth builder. `name` must match the scheme name
    /// declared in the spec's `components.securitySchemes`.
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            source: AuthCredentialSource::Missing,
        }
    }

    /// Read the API key from an environment variable.
    pub fn env(mut self, var_name: impl Into<String>) -> Self {
        self.source = AuthCredentialSource::from_env(var_name);
        self
    }

    /// Read the API key from a CLI flag (`--<arg_name>`).
    pub fn cli(mut self, arg_name: impl Into<String>) -> Self {
        self.source = AuthCredentialSource::cli(arg_name);
        self
    }

    /// Read the API key from a file.
    pub fn file(mut self, path: impl Into<std::path::PathBuf>) -> Self {
        self.source = AuthCredentialSource::file(path.into());
        self
    }

    /// Use a custom credential source.
    pub fn source(mut self, source: AuthCredentialSource) -> Self {
        self.source = source;
        self
    }
}

impl AuthSchemeBuilder for ApiKeyAuth {
    fn into_binding(self) -> (String, SchemeBinding) {
        (self.name, SchemeBinding::Token(self.source))
    }
}

// ---------------------------------------------------------------------------
// BasicAuth — HTTP Basic authentication
// ---------------------------------------------------------------------------

/// Builder for HTTP Basic authentication (`Authorization: Basic base64(user:pass)`).
///
/// The scheme name must match the `securitySchemes` key in the binding's spec.
#[derive(Debug, Clone)]
pub struct BasicAuth {
    name: String,
    username: AuthCredentialSource,
    password: AuthCredentialSource,
}

impl BasicAuth {
    /// Create a new basic auth builder. `name` must match the scheme name
    /// declared in the spec's `components.securitySchemes`.
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            username: AuthCredentialSource::Missing,
            password: AuthCredentialSource::Missing,
        }
    }

    /// Read the username from an environment variable.
    pub fn username_env(mut self, var_name: impl Into<String>) -> Self {
        self.username = AuthCredentialSource::from_env(var_name);
        self
    }

    /// Read the password from an environment variable.
    pub fn password_env(mut self, var_name: impl Into<String>) -> Self {
        self.password = AuthCredentialSource::from_env(var_name);
        self
    }

    /// Read the username from a CLI flag.
    pub fn username_cli(mut self, arg_name: impl Into<String>) -> Self {
        self.username = AuthCredentialSource::cli(arg_name);
        self
    }

    /// Read the password from a CLI flag.
    pub fn password_cli(mut self, arg_name: impl Into<String>) -> Self {
        self.password = AuthCredentialSource::cli(arg_name);
        self
    }

    /// Set a custom credential source for the username.
    pub fn username_source(mut self, source: AuthCredentialSource) -> Self {
        self.username = source;
        self
    }

    /// Set a custom credential source for the password.
    pub fn password_source(mut self, source: AuthCredentialSource) -> Self {
        self.password = source;
        self
    }
}

impl AuthSchemeBuilder for BasicAuth {
    fn into_binding(self) -> (String, SchemeBinding) {
        (
            self.name,
            SchemeBinding::Basic {
                username: self.username,
                password: self.password,
            },
        )
    }
}

// ---------------------------------------------------------------------------
// OAuth2Auth — OAuth2 flows (client-credentials, refresh-token, PKCE)
// ---------------------------------------------------------------------------

/// Builder for OAuth2 authentication.
///
/// The scheme name must match the `securitySchemes` key in the binding's spec.
/// The token URL is embedded by the generator (from the spec's
/// `securitySchemes.*.flows.clientCredentials.tokenUrl` or Fern IR).
///
/// At runtime, this resolves to a bearer token — the OAuth2 flow is
/// handled by the binding's executor using the token URL and credentials
/// declared here.
#[derive(Debug, Clone)]
pub struct OAuth2Auth {
    name: String,
    client_id: AuthCredentialSource,
    client_secret: AuthCredentialSource,
    access_token: AuthCredentialSource,
    refresh_token: AuthCredentialSource,
    token_url: Option<String>,
}

impl OAuth2Auth {
    /// Create a new OAuth2 auth builder. `name` must match the scheme name
    /// declared in the spec's `components.securitySchemes`.
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            client_id: AuthCredentialSource::Missing,
            client_secret: AuthCredentialSource::Missing,
            access_token: AuthCredentialSource::Missing,
            refresh_token: AuthCredentialSource::Missing,
            token_url: None,
        }
    }

    /// Set the OAuth2 token endpoint URL (from spec or Fern IR).
    pub fn token_url(mut self, url: impl Into<String>) -> Self {
        self.token_url = Some(url.into());
        self
    }

    /// Read the client ID from an environment variable.
    pub fn client_id_env(mut self, var_name: impl Into<String>) -> Self {
        self.client_id = AuthCredentialSource::from_env(var_name);
        self
    }

    /// Read the client secret from an environment variable.
    pub fn client_secret_env(mut self, var_name: impl Into<String>) -> Self {
        self.client_secret = AuthCredentialSource::from_env(var_name);
        self
    }

    /// Read a static access token from an environment variable.
    /// If set and resolvable, this bypasses the client-credentials flow.
    pub fn access_token_env(mut self, var_name: impl Into<String>) -> Self {
        self.access_token = AuthCredentialSource::from_env(var_name);
        self
    }

    /// Read a refresh token from an environment variable.
    pub fn refresh_token_env(mut self, var_name: impl Into<String>) -> Self {
        self.refresh_token = AuthCredentialSource::from_env(var_name);
        self
    }

    /// Set a custom credential source for the client ID.
    pub fn client_id_source(mut self, source: AuthCredentialSource) -> Self {
        self.client_id = source;
        self
    }

    /// Set a custom credential source for the client secret.
    pub fn client_secret_source(mut self, source: AuthCredentialSource) -> Self {
        self.client_secret = source;
        self
    }

    /// Set a custom credential source for the access token.
    pub fn access_token_source(mut self, source: AuthCredentialSource) -> Self {
        self.access_token = source;
        self
    }

    /// Set a custom credential source for the refresh token.
    pub fn refresh_token_source(mut self, source: AuthCredentialSource) -> Self {
        self.refresh_token = source;
        self
    }

    /// Get the token URL, if set.
    pub fn get_token_url(&self) -> Option<&str> {
        self.token_url.as_deref()
    }

    /// Get the client ID source.
    pub fn get_client_id(&self) -> &AuthCredentialSource {
        &self.client_id
    }

    /// Get the client secret source.
    pub fn get_client_secret(&self) -> &AuthCredentialSource {
        &self.client_secret
    }

    /// Get the access token source.
    pub fn get_access_token(&self) -> &AuthCredentialSource {
        &self.access_token
    }

    /// Get the refresh token source.
    pub fn get_refresh_token(&self) -> &AuthCredentialSource {
        &self.refresh_token
    }
}

impl AuthSchemeBuilder for OAuth2Auth {
    fn into_binding(self) -> (String, SchemeBinding) {
        // A static access token bypasses the OAuth flow entirely — surface it
        // as a plain bearer Token binding (lowered to a BearerAuthProvider).
        if !matches!(self.access_token, AuthCredentialSource::Missing) {
            return (self.name, SchemeBinding::Token(self.access_token));
        }

        // No static token: actually wire the client-credentials / refresh-token
        // flow so the CLI obtains a token and authenticates — rather than
        // silently sending unauthenticated requests (FER-10745). The previous
        // behavior collapsed to `Token(Missing)`, which lowered to a bearer
        // provider with no credential and no Authorization header.
        //
        // `OAuth2Grant` reads credentials from environment variables at refresh
        // time, so we need the env-var *names* behind the client_id /
        // client_secret / refresh_token sources. Non-env sources can't feed
        // that grant; we treat them (and any missing token_url) as incomplete
        // config and fail fast at request time instead of authenticating
        // silently.
        let provider: DynAuthProvider = match (
            self.token_url.as_deref(),
            self.client_id.env_var_name(),
            self.client_secret.env_var_name(),
        ) {
            (Some(token_url), Some(client_id_env), Some(client_secret_env)) => {
                let grant = match self.refresh_token.env_var_name() {
                    Some(refresh_token_env) => OAuth2Grant::RefreshToken {
                        client_id_env: client_id_env.to_string(),
                        client_secret_env: client_secret_env.to_string(),
                        refresh_token_env: refresh_token_env.to_string(),
                    },
                    None if matches!(self.refresh_token, AuthCredentialSource::Missing) => {
                        OAuth2Grant::ClientCredentials {
                            client_id_env: client_id_env.to_string(),
                            client_secret_env: client_secret_env.to_string(),
                            scope: None,
                        }
                    }
                    None => {
                        // Non-env refresh token source (literal, file, closure,
                        // etc.) — OAuth2Grant can't consume it. Fail fast.
                        return (
                            self.name.clone(),
                            SchemeBinding::Custom(Arc::new(MisconfiguredOAuth2Provider::new(
                                self.name,
                                "refresh_token configured via non-env source; \
                                 OAuth2Grant only supports env-var credentials"
                                    .to_string(),
                            ))),
                        );
                    }
                };
                Arc::new(OAuth2TokenProvider::new(
                    self.name.clone(),
                    token_url.to_string(),
                    grant,
                ))
            }
            _ => Arc::new(MisconfiguredOAuth2Provider::new(
                self.name.clone(),
                oauth2_missing_config_reason(
                    self.token_url.is_some(),
                    self.client_id.env_var_name().is_some(),
                    self.client_secret.env_var_name().is_some(),
                ),
            )),
        };

        (self.name, SchemeBinding::Custom(provider))
    }
}

/// Build a human-readable reason listing which pieces of OAuth2
/// client-credentials config are missing, for the fail-fast provider's error
/// message. The env-var checks are `true` only when the corresponding source
/// is an `Env` source (the only kind `OAuth2Grant` can read).
fn oauth2_missing_config_reason(
    has_token_url: bool,
    has_client_id_env: bool,
    has_client_secret_env: bool,
) -> String {
    let mut missing = Vec::new();
    if !has_token_url {
        missing.push("token_url");
    }
    if !has_client_id_env {
        missing.push("client_id (env-var source)");
    }
    if !has_client_secret_env {
        missing.push("client_secret (env-var source)");
    }
    format!("missing OAuth2 config: {}", missing.join(", "))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bearer_auth_builds_token_binding() {
        let (name, binding) = BearerAuth::new("bearerAuth")
            .env("MY_TOKEN")
            .into_binding();
        assert_eq!(name, "bearerAuth");
        assert!(matches!(binding, SchemeBinding::Token(AuthCredentialSource::Env(ref e)) if e == "MY_TOKEN"));
    }

    #[test]
    fn api_key_auth_builds_token_binding() {
        let (name, binding) = ApiKeyAuth::new("apiKey")
            .env("API_KEY")
            .into_binding();
        assert_eq!(name, "apiKey");
        assert!(matches!(binding, SchemeBinding::Token(AuthCredentialSource::Env(ref e)) if e == "API_KEY"));
    }

    #[test]
    fn basic_auth_builds_basic_binding() {
        let (name, binding) = BasicAuth::new("httpBasic")
            .username_env("USER")
            .password_env("PASS")
            .into_binding();
        assert_eq!(name, "httpBasic");
        match binding {
            SchemeBinding::Basic { username, password } => {
                assert!(matches!(username, AuthCredentialSource::Env(ref e) if e == "USER"));
                assert!(matches!(password, AuthCredentialSource::Env(ref e) if e == "PASS"));
            }
            _ => panic!("expected Basic binding"),
        }
    }

    #[test]
    fn oauth2_auth_with_static_token() {
        let (name, binding) = OAuth2Auth::new("OAuth2Security")
            .access_token_env("MY_ACCESS_TOKEN")
            .token_url("https://auth.example.com/token")
            .into_binding();
        assert_eq!(name, "OAuth2Security");
        assert!(matches!(binding, SchemeBinding::Token(AuthCredentialSource::Env(ref e)) if e == "MY_ACCESS_TOKEN"));
    }

    // FER-10745: without a static access token, the client-credentials flow
    // must actually be wired (a Custom OAuth2 provider), NOT collapsed to a
    // credential-less bearer that silently sends unauthenticated requests.
    #[test]
    fn oauth2_auth_client_credentials_wires_oauth_provider() {
        let (name, binding) = OAuth2Auth::new("OAuth2Security")
            .client_id_env("CLIENT_ID")
            .client_secret_env("CLIENT_SECRET")
            .token_url("https://auth.example.com/token")
            .into_binding();
        assert_eq!(name, "OAuth2Security");
        let SchemeBinding::Custom(provider) = binding else {
            panic!("client-credentials OAuth2 should lower to a Custom provider");
        };
        // The wired provider reads the configured client-cred env vars.
        let hints = provider.credential_hints().join(" ");
        assert!(hints.contains("CLIENT_ID"), "hints: {hints}");
        assert!(hints.contains("CLIENT_SECRET"), "hints: {hints}");
    }

    #[test]
    fn oauth2_auth_refresh_token_wires_oauth_provider() {
        let (_, binding) = OAuth2Auth::new("OAuth2Security")
            .client_id_env("CLIENT_ID")
            .client_secret_env("CLIENT_SECRET")
            .refresh_token_env("REFRESH_TOKEN")
            .token_url("https://auth.example.com/token")
            .into_binding();
        let SchemeBinding::Custom(provider) = binding else {
            panic!("refresh-token OAuth2 should lower to a Custom provider");
        };
        let hints = provider.credential_hints().join(" ");
        assert!(hints.contains("REFRESH_TOKEN"), "hints: {hints}");
    }

    // FER-10745: incomplete config (no token_url / non-env creds) must fail
    // fast — selected by composition (has_credentials == true) so it errors
    // loudly rather than being skipped into a silent unauthenticated request.
    #[test]
    fn oauth2_auth_incomplete_config_fails_fast_not_silent() {
        let (_, binding) = OAuth2Auth::new("OAuth2Security")
            .client_id_env("CLIENT_ID")
            .client_secret_env("CLIENT_SECRET")
            // no token_url
            .into_binding();
        let SchemeBinding::Custom(provider) = binding else {
            panic!("incomplete OAuth2 should still lower to a Custom provider");
        };
        assert!(
            provider.has_credentials(),
            "must be selected (not skipped) so the misconfig surfaces loudly",
        );
    }

    // Non-env refresh_token source must fail fast rather than silently
    // falling back to client-credentials grant.
    #[test]
    fn oauth2_auth_non_env_refresh_token_fails_fast() {
        let (_, binding) = OAuth2Auth::new("OAuth2Security")
            .client_id_env("CLIENT_ID")
            .client_secret_env("CLIENT_SECRET")
            .refresh_token_source(AuthCredentialSource::literal("my-refresh-token"))
            .token_url("https://auth.example.com/token")
            .into_binding();
        let SchemeBinding::Custom(provider) = binding else {
            panic!("non-env refresh token should lower to a Custom provider");
        };
        assert!(
            provider.has_credentials(),
            "must be selected (not skipped) so the misconfig surfaces loudly",
        );
    }
}
