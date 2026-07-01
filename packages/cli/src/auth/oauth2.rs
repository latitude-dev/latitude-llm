//! OAuth 2.0 auth provider with persistent token storage.
//!
//! [`OAuth2TokenProvider`] implements [`AuthProvider`] so it plugs directly into
//! the `auth_provider()` builder method on `CliApp`. On first `apply()`:
//!
//! 1. Check the on-disk credential cache (`~/.config/<cli>/credentials.json`).
//!    If a cached access token exists and hasn't expired, use it.
//! 2. If the cache holds a refresh token, exchange it for a new access token
//!    (RFC 6749 §6) and update the cache.
//! 3. Otherwise fall back to the configured grant (client credentials or
//!    refresh token from env) and persist the result.
//!
//! This mirrors the token persistence patterns used by `gcloud`, `gh`, and
//! `aws sso`. Tokens are stored as JSON with owner-only file permissions
//! (0600) and written atomically via temp-file-then-rename.
//!
//! For the async token fetch to work inside the synchronous `apply()`
//! method, the provider uses `tokio::task::block_in_place` +
//! `Handle::current().block_on()`. This is safe because `CliApp::run`
//! creates a multi-threaded tokio runtime.

use std::path::PathBuf;
use std::sync::OnceLock;

use secrecy::{ExposeSecret, SecretString};
use serde::Serialize;

use crate::auth::oauth_common::{
    atomic_write, config_dir, now_epoch, parse_oauth_error_message, token_http_client,
    truncate_body, TokenBundle, TokenSuccessBody, EXPIRY_BUFFER_SECS,
};
use crate::auth::provider::{AuthProvider, EndpointAuthMetadata};
use crate::error::CliError;

// ---------------------------------------------------------------------------
// On-disk token cache
// ---------------------------------------------------------------------------

/// On-disk credential store at `~/.config/<cli_name>/credentials.json`.
///
/// The file is a JSON object keyed by token_url:
/// ```json
/// {
///   "https://identity.xero.com/connect/token": {
///     "access_token": "...",
///     "refresh_token": "...",
///     "expires_at": 1715550000
///   }
/// }
/// ```
///
/// Coexists with the newer `FileKeyringStore` (`auth-keyring.json` in the
/// same directory) — same shape, distinct file. Login-flow providers use
/// the keyring store; legacy `OAuth2TokenProvider` callers (e.g. `xero`)
/// continue to use this cache via `.with_cache(...)`.
#[derive(Debug, Clone)]
pub struct TokenCache {
    path: PathBuf,
}

type TokenMap = std::collections::HashMap<String, TokenBundle>;

impl TokenCache {
    /// Build a cache path at `~/.config/<cli_name>/credentials.json`.
    pub fn for_cli(cli_name: &str) -> Option<Self> {
        let dir = config_dir()?;
        Some(Self {
            path: dir.join(cli_name).join("credentials.json"),
        })
    }

    /// Build a cache at an explicit path (for testing).
    #[cfg(test)]
    fn at_path(path: PathBuf) -> Self {
        Self { path }
    }

    fn read_map(&self) -> TokenMap {
        let data = match std::fs::read_to_string(&self.path) {
            Ok(d) => d,
            Err(_) => return TokenMap::new(),
        };
        serde_json::from_str(&data).unwrap_or_default()
    }

    fn write_map(&self, map: &TokenMap) -> Result<(), CliError> {
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                CliError::Auth(format!(
                    "Failed to create token cache directory {}: {e}",
                    parent.display()
                ))
            })?;
        }

        let json = serde_json::to_string_pretty(map).map_err(|e| {
            CliError::Auth(format!("Failed to serialize token cache: {e}"))
        })?;

        atomic_write(&self.path, json.as_bytes())
    }

    /// Load a non-expired cached token for the given token_url.
    fn load(&self, token_url: &str) -> Option<TokenBundle> {
        let map = self.read_map();
        let entry = map.get(token_url)?;
        if let Some(expires_at) = entry.expires_at {
            if now_epoch() >= expires_at {
                return None;
            }
        }
        Some(entry.clone())
    }

    /// Persist a token response to disk.
    fn store(
        &self,
        token_url: &str,
        access_token: &str,
        refresh_token: Option<&str>,
        expires_in: Option<u64>,
    ) -> Result<(), CliError> {
        let mut map = self.read_map();
        let expires_at = expires_in.map(|ei| {
            let buffered = ei.saturating_sub(EXPIRY_BUFFER_SECS);
            now_epoch() + buffered
        });
        // Preserve existing refresh_token if the new response didn't include one
        let prev_refresh = map.get(token_url).and_then(|e| e.refresh_token.clone());
        map.insert(
            token_url.to_string(),
            TokenBundle {
                access_token: access_token.to_string(),
                refresh_token: refresh_token
                    .map(|s| s.to_string())
                    .or(prev_refresh),
                expires_at,
            },
        );
        self.write_map(&map)
    }

    /// Remove the cached entry for a token_url (e.g., on refresh failure).
    fn remove(&self, token_url: &str) {
        let mut map = self.read_map();
        if map.remove(token_url).is_some() {
            let _ = self.write_map(&map);
        }
    }
}

// ---------------------------------------------------------------------------
// Grant configuration
// ---------------------------------------------------------------------------

/// Which OAuth2 grant type to use.
#[derive(Debug, Clone)]
pub enum OAuth2Grant {
    /// Client credentials grant (RFC 6749 §4.4).
    ClientCredentials {
        /// Env var name for the client ID.
        client_id_env: String,
        /// Env var name for the client secret.
        client_secret_env: String,
        /// Optional space-delimited scope string.
        scope: Option<String>,
    },
    /// Refresh token grant (RFC 6749 §6).
    RefreshToken {
        /// Env var name for the client ID.
        client_id_env: String,
        /// Env var name for the client secret.
        client_secret_env: String,
        /// Env var name for the refresh token.
        refresh_token_env: String,
    },
}

// ---------------------------------------------------------------------------
// Form bodies (serde)
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct ClientCredentialsForm<'a> {
    grant_type: &'static str,
    client_id: &'a str,
    client_secret: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    scope: Option<&'a str>,
}

#[derive(Serialize)]
struct RefreshTokenForm<'a> {
    grant_type: &'static str,
    client_id: &'a str,
    client_secret: &'a str,
    refresh_token: &'a str,
}

// ---------------------------------------------------------------------------
// Token fetch
// ---------------------------------------------------------------------------

struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: Option<u64>,
}

async fn fetch_token(token_url: &str, grant: &OAuth2Grant) -> Result<TokenResponse, CliError> {
    if token_url.trim().is_empty() {
        return Err(CliError::Validation(
            "OAuth2: token_url must not be empty".to_string(),
        ));
    }

    let http = token_http_client()?;

    let response = match grant {
        OAuth2Grant::ClientCredentials {
            client_id_env,
            client_secret_env,
            scope,
        } => {
            let client_id = read_env(client_id_env, "client_id")?;
            let client_secret = read_env(client_secret_env, "client_secret")?;
            http.post(token_url)
                .form(&ClientCredentialsForm {
                    grant_type: "client_credentials",
                    client_id: &client_id,
                    client_secret: &client_secret,
                    scope: scope.as_deref(),
                })
                .send()
                .await
        }
        OAuth2Grant::RefreshToken {
            client_id_env,
            client_secret_env,
            refresh_token_env,
        } => {
            let client_id = read_env(client_id_env, "client_id")?;
            let client_secret = read_env(client_secret_env, "client_secret")?;
            let refresh_token = read_env(refresh_token_env, "refresh_token")?;
            http.post(token_url)
                .form(&RefreshTokenForm {
                    grant_type: "refresh_token",
                    client_id: &client_id,
                    client_secret: &client_secret,
                    refresh_token: &refresh_token,
                })
                .send()
                .await
        }
    }
    .map_err(|e| CliError::Auth(format!("OAuth2 token request failed: {e}")))?;

    parse_token_response(response).await
}

/// Exchange a cached refresh token for a new access token.
async fn refresh_cached_token(
    token_url: &str,
    client_id: &str,
    client_secret: &str,
    refresh_token: &str,
) -> Result<TokenResponse, CliError> {
    let http = token_http_client()?;
    let response = http
        .post(token_url)
        .form(&RefreshTokenForm {
            grant_type: "refresh_token",
            client_id,
            client_secret,
            refresh_token,
        })
        .send()
        .await
        .map_err(|e| CliError::Auth(format!("OAuth2 token refresh failed: {e}")))?;
    parse_token_response(response).await
}

async fn parse_token_response(response: reqwest::Response) -> Result<TokenResponse, CliError> {
    let status = response.status();
    let body_text = response
        .text()
        .await
        .map_err(|e| CliError::Auth(format!("OAuth2 token response body: {e}")))?;

    if !status.is_success() {
        let detail = parse_oauth_error_message(&body_text)
            .unwrap_or_else(|| truncate_body(&body_text));
        return Err(CliError::Auth(format!(
            "OAuth2 token endpoint returned HTTP {status}: {detail}"
        )));
    }

    let parsed: TokenSuccessBody = serde_json::from_str(&body_text).map_err(|e| {
        CliError::Auth(format!(
            "OAuth2 token response is not valid JSON with access_token: {e}"
        ))
    })?;

    if parsed.access_token.is_empty() {
        return Err(CliError::Auth(
            "OAuth2 token response contained an empty access_token".to_string(),
        ));
    }

    Ok(TokenResponse {
        access_token: parsed.access_token,
        refresh_token: parsed.refresh_token,
        expires_in: parsed.expires_in,
    })
}

fn read_env(var: &str, label: &str) -> Result<String, CliError> {
    let val = std::env::var(var).map_err(|_| {
        CliError::Auth(format!(
            "Missing environment variable {var} (OAuth2 {label})"
        ))
    })?;
    if val.is_empty() {
        return Err(CliError::Auth(format!(
            "Environment variable {var} (OAuth2 {label}) must be non-empty"
        )));
    }
    Ok(val)
}

// ---------------------------------------------------------------------------
// OAuth2TokenProvider
// ---------------------------------------------------------------------------

/// OAuth2 auth provider with on-disk token persistence.
///
/// Resolution order on each `apply()`:
/// 1. In-process cache (`OnceLock`) — already resolved this invocation.
/// 2. On-disk cache — non-expired access token from a previous invocation.
/// 3. Cached refresh token — exchange for a new access token.
/// 4. Configured grant (client credentials or env-based refresh token).
///
/// New tokens are persisted to `~/.config/<cli>/credentials.json` (Linux),
/// `~/Library/Application Support/<cli>/credentials.json` (macOS), or
/// `%APPDATA%/<cli>/credentials.json` (Windows).
pub struct OAuth2TokenProvider {
    scheme_name: String,
    token_url: String,
    grant: OAuth2Grant,
    cache: OnceLock<TokenCache>,
    cached_token: OnceLock<Result<SecretString, String>>,
}

impl std::fmt::Debug for OAuth2TokenProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("OAuth2TokenProvider")
            .field("scheme_name", &self.scheme_name)
            .field("token_url", &self.token_url)
            .field("grant", &self.grant)
            .finish()
    }
}

impl OAuth2TokenProvider {
    pub fn new(
        scheme_name: impl Into<String>,
        token_url: impl Into<String>,
        grant: OAuth2Grant,
    ) -> Self {
        Self {
            scheme_name: scheme_name.into(),
            token_url: token_url.into(),
            grant,
            cache: OnceLock::new(),
            cached_token: OnceLock::new(),
        }
    }

    /// Enable on-disk token persistence. `cli_name` is the binary name
    /// (e.g., `"xero"`) — tokens are stored under the platform config dir.
    pub fn with_cache(self, cli_name: &str) -> Self {
        if let Some(tc) = TokenCache::for_cli(cli_name) {
            let _ = self.cache.set(tc);
        }
        self
    }

    /// Enable on-disk token persistence with a pre-built [`TokenCache`].
    pub fn with_token_cache(self, cache: TokenCache) -> Self {
        let _ = self.cache.set(cache);
        self
    }

    /// Returns `true` if on-disk token caching has been wired.
    pub fn has_cache(&self) -> bool {
        self.cache.get().is_some()
    }

    fn resolve_token(&self) -> Result<&SecretString, CliError> {
        let result = self.cached_token.get_or_init(|| {
            tokio::task::block_in_place(|| {
                tokio::runtime::Handle::current()
                    .block_on(self.resolve_token_async())
                    .map(SecretString::from)
                    .map_err(|e| e.to_string())
            })
        });
        match result {
            Ok(token) => Ok(token),
            Err(msg) => Err(CliError::Auth(msg.clone())),
        }
    }

    async fn resolve_token_async(&self) -> Result<String, CliError> {
        // 1. Check on-disk cache for a valid access token
        if let Some(cache) = self.cache.get() {
            if let Some(cached) = cache.load(&self.token_url) {
                tracing::debug!("Using cached OAuth2 access token for {}", self.token_url);
                return Ok(cached.access_token);
            }

            // 2. Try refreshing with a cached refresh token
            if let Some(token_resp) = self.try_cached_refresh(cache).await {
                return Ok(token_resp);
            }
        }

        // 3. Fall back to the configured grant
        let resp = fetch_token(&self.token_url, &self.grant).await?;
        self.persist_response(&resp);
        Ok(resp.access_token)
    }

    /// Attempt to use a cached refresh token. Returns the new access token
    /// on success, or None if there's no cached refresh token or the refresh
    /// fails (in which case we fall through to the configured grant).
    async fn try_cached_refresh(&self, cache: &TokenCache) -> Option<String> {
        let map = cache.read_map();
        let entry = map.get(&self.token_url)?;
        let refresh_token = entry.refresh_token.as_deref()?;

        // We need client_id and client_secret to do the refresh
        let (client_id_env, client_secret_env) = match &self.grant {
            OAuth2Grant::ClientCredentials {
                client_id_env,
                client_secret_env,
                ..
            } => (client_id_env.as_str(), client_secret_env.as_str()),
            OAuth2Grant::RefreshToken {
                client_id_env,
                client_secret_env,
                ..
            } => (client_id_env.as_str(), client_secret_env.as_str()),
        };

        let client_id = match read_env(client_id_env, "client_id") {
            Ok(v) => v,
            Err(_) => {
                tracing::debug!(
                    "Cannot refresh cached token: {} not set",
                    client_id_env
                );
                return None;
            }
        };
        let client_secret = match read_env(client_secret_env, "client_secret") {
            Ok(v) => v,
            Err(_) => {
                tracing::debug!(
                    "Cannot refresh cached token: {} not set",
                    client_secret_env
                );
                return None;
            }
        };

        tracing::debug!(
            "Attempting cached refresh token grant for {}",
            self.token_url
        );

        match refresh_cached_token(
            &self.token_url,
            &client_id,
            &client_secret,
            refresh_token,
        )
        .await
        {
            Ok(resp) => {
                self.persist_response(&resp);
                Some(resp.access_token)
            }
            Err(e) => {
                tracing::debug!("Cached refresh token failed, falling through: {e}");
                cache.remove(&self.token_url);
                None
            }
        }
    }

    fn persist_response(&self, resp: &TokenResponse) {
        if let Some(cache) = self.cache.get() {
            if let Err(e) = cache.store(
                &self.token_url,
                &resp.access_token,
                resp.refresh_token.as_deref(),
                resp.expires_in,
            ) {
                tracing::warn!("Failed to persist OAuth2 token to cache: {e}");
            }
        }
    }
}

impl AuthProvider for OAuth2TokenProvider {
    fn name(&self) -> &str {
        &self.scheme_name
    }

    fn has_credentials(&self) -> bool {
        // Check disk cache first — if we have a cached token, we have creds
        if let Some(cache) = self.cache.get() {
            if cache.load(&self.token_url).is_some() {
                return true;
            }
            // Also check if we have a cached refresh token (even if access expired)
            let map = cache.read_map();
            if let Some(entry) = map.get(&self.token_url) {
                if entry.refresh_token.is_some() {
                    return true;
                }
            }
        }
        // Fall back to env var check
        match &self.grant {
            OAuth2Grant::ClientCredentials {
                client_id_env,
                client_secret_env,
                ..
            } => env_is_set(client_id_env) && env_is_set(client_secret_env),
            OAuth2Grant::RefreshToken {
                client_id_env,
                client_secret_env,
                refresh_token_env,
            } => {
                env_is_set(client_id_env)
                    && env_is_set(client_secret_env)
                    && env_is_set(refresh_token_env)
            }
        }
    }

    fn credential_hints(&self) -> Vec<String> {
        match &self.grant {
            OAuth2Grant::ClientCredentials {
                client_id_env,
                client_secret_env,
                ..
            } => vec![
                format!("{client_id_env} environment variable"),
                format!("{client_secret_env} environment variable"),
            ],
            OAuth2Grant::RefreshToken {
                client_id_env,
                client_secret_env,
                refresh_token_env,
            } => vec![
                format!("{client_id_env} environment variable"),
                format!("{client_secret_env} environment variable"),
                format!("{refresh_token_env} environment variable"),
            ],
        }
    }

    fn apply(
        &self,
        request: reqwest::RequestBuilder,
        _endpoint: &EndpointAuthMetadata,
    ) -> Result<reqwest::RequestBuilder, CliError> {
        let token = self.resolve_token()?;
        let mut value = String::with_capacity(7 + token.expose_secret().len());
        value.push_str("Bearer ");
        value.push_str(token.expose_secret());
        let mut header = reqwest::header::HeaderValue::from_str(&value)
            .map_err(|e| CliError::Auth(format!("Invalid OAuth2 bearer token: {e}")))?;
        header.set_sensitive(true);
        Ok(request.header(reqwest::header::AUTHORIZATION, header))
    }

    fn inject_token_cache(&self, cli_name: &str) {
        if let Some(tc) = TokenCache::for_cli(cli_name) {
            let _ = self.cache.set(tc);
        }
    }
}

fn env_is_set(var: &str) -> bool {
    std::env::var(var)
        .map(|v| !v.trim().is_empty())
        .unwrap_or(false)
}

/// Fail-fast provider for an OAuth2 scheme that was declared (via
/// [`OAuth2Auth`](crate::auth::OAuth2Auth)) but is missing the config needed
/// to obtain a token — e.g. no `token_url`, or client credentials supplied
/// from a non-env source the [`OAuth2Grant`] env-var model can't read.
///
/// The point is to **never silently send an unauthenticated request**
/// (FER-10745). [`has_credentials`](AuthProvider::has_credentials) returns
/// `true` so composition wrappers select this provider rather than skipping
/// it, and [`apply`](AuthProvider::apply) then errors with a clear message
/// instead of letting the request go out with no `Authorization` header.
#[derive(Debug)]
pub(crate) struct MisconfiguredOAuth2Provider {
    scheme_name: String,
    reason: String,
}

impl MisconfiguredOAuth2Provider {
    pub(crate) fn new(scheme_name: impl Into<String>, reason: impl Into<String>) -> Self {
        Self {
            scheme_name: scheme_name.into(),
            reason: reason.into(),
        }
    }
}

impl AuthProvider for MisconfiguredOAuth2Provider {
    fn name(&self) -> &str {
        &self.scheme_name
    }

    // Report credentials as present so wrappers don't skip this provider
    // (skipping would fall through to an unauthenticated request — the bug).
    fn has_credentials(&self) -> bool {
        true
    }

    fn credential_hints(&self) -> Vec<String> {
        vec![self.reason.clone()]
    }

    fn apply(
        &self,
        _request: reqwest::RequestBuilder,
        _endpoint: &EndpointAuthMetadata,
    ) -> Result<reqwest::RequestBuilder, CliError> {
        Err(CliError::Auth(format!(
            "OAuth2 scheme '{}' is configured but cannot obtain a token: {}. \
             Refusing to send an unauthenticated request.",
            self.scheme_name, self.reason,
        )))
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::test_helpers::{auth_header, req};
    use serial_test::serial;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[tokio::test(flavor = "multi_thread")]
    #[serial]
    async fn client_credentials_fetches_and_caches_token() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/token"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(serde_json::json!({
                    "access_token": "cc-token-123",
                    "token_type": "Bearer"
                })),
            )
            .expect(1)
            .mount(&server)
            .await;

        std::env::set_var("TEST_CC_ID", "my-id");
        std::env::set_var("TEST_CC_SECRET", "my-secret");

        let provider = OAuth2TokenProvider::new(
            "oauth2",
            format!("{}/token", server.uri()),
            OAuth2Grant::ClientCredentials {
                client_id_env: "TEST_CC_ID".to_string(),
                client_secret_env: "TEST_CC_SECRET".to_string(),
                scope: None,
            },
        );

        assert!(provider.has_credentials());

        let r = provider
            .apply(req(), &EndpointAuthMetadata::unspecified())
            .unwrap();
        assert_eq!(auth_header(r).as_deref(), Some("Bearer cc-token-123"));

        // Second call uses in-process cache (wiremock expect(1) would fail otherwise)
        let r2 = provider
            .apply(req(), &EndpointAuthMetadata::unspecified())
            .unwrap();
        assert_eq!(auth_header(r2).as_deref(), Some("Bearer cc-token-123"));

        std::env::remove_var("TEST_CC_ID");
        std::env::remove_var("TEST_CC_SECRET");
    }

    #[tokio::test(flavor = "multi_thread")]
    #[serial]
    async fn client_credentials_no_creds_when_env_unset() {
        std::env::remove_var("MISSING_CC_ID_XYZ");
        std::env::remove_var("MISSING_CC_SECRET_XYZ");

        let provider = OAuth2TokenProvider::new(
            "oauth2",
            "https://unused.example.com/token",
            OAuth2Grant::ClientCredentials {
                client_id_env: "MISSING_CC_ID_XYZ".to_string(),
                client_secret_env: "MISSING_CC_SECRET_XYZ".to_string(),
                scope: None,
            },
        );

        assert!(!provider.has_credentials());
    }

    #[tokio::test(flavor = "multi_thread")]
    #[serial]
    async fn refresh_token_fetches_token() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/token"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(serde_json::json!({
                    "access_token": "refreshed-token-456",
                    "token_type": "Bearer"
                })),
            )
            .expect(1)
            .mount(&server)
            .await;

        std::env::set_var("TEST_RT_ID", "my-id");
        std::env::set_var("TEST_RT_SECRET", "my-secret");
        std::env::set_var("TEST_RT_REFRESH", "my-refresh-token");

        let provider = OAuth2TokenProvider::new(
            "oauth2",
            format!("{}/token", server.uri()),
            OAuth2Grant::RefreshToken {
                client_id_env: "TEST_RT_ID".to_string(),
                client_secret_env: "TEST_RT_SECRET".to_string(),
                refresh_token_env: "TEST_RT_REFRESH".to_string(),
            },
        );

        assert!(provider.has_credentials());

        let r = provider
            .apply(req(), &EndpointAuthMetadata::unspecified())
            .unwrap();
        assert_eq!(auth_header(r).as_deref(), Some("Bearer refreshed-token-456"));

        std::env::remove_var("TEST_RT_ID");
        std::env::remove_var("TEST_RT_SECRET");
        std::env::remove_var("TEST_RT_REFRESH");
    }

    #[tokio::test(flavor = "multi_thread")]
    #[serial]
    async fn refresh_token_no_creds_without_refresh_env() {
        std::env::set_var("TEST_RT_ID2", "id");
        std::env::set_var("TEST_RT_SECRET2", "secret");
        std::env::remove_var("MISSING_RT_XYZ");

        let provider = OAuth2TokenProvider::new(
            "oauth2",
            "https://unused.example.com/token",
            OAuth2Grant::RefreshToken {
                client_id_env: "TEST_RT_ID2".to_string(),
                client_secret_env: "TEST_RT_SECRET2".to_string(),
                refresh_token_env: "MISSING_RT_XYZ".to_string(),
            },
        );

        assert!(!provider.has_credentials());

        std::env::remove_var("TEST_RT_ID2");
        std::env::remove_var("TEST_RT_SECRET2");
    }

    // `parse_oauth_error_message` + `truncate_body` are tested in
    // `oauth_common::tests` — no need to duplicate here.

    // ---- Token cache tests ----

    #[test]
    fn token_cache_store_and_load() {
        let dir = tempfile::tempdir().unwrap();
        let cache = TokenCache::at_path(dir.path().join("credentials.json"));

        cache
            .store(
                "https://example.com/token",
                "access-abc",
                Some("refresh-xyz"),
                Some(3600),
            )
            .unwrap();

        let loaded = cache.load("https://example.com/token").unwrap();
        assert_eq!(loaded.access_token, "access-abc");
        assert_eq!(loaded.refresh_token.as_deref(), Some("refresh-xyz"));
        assert!(loaded.expires_at.is_some());
    }

    #[test]
    fn token_cache_expired_token_returns_none() {
        let dir = tempfile::tempdir().unwrap();
        let cache = TokenCache::at_path(dir.path().join("credentials.json"));

        // Store a token with 0 seconds expiry (immediately expired after buffer)
        cache
            .store("https://example.com/token", "expired", None, Some(0))
            .unwrap();

        assert!(cache.load("https://example.com/token").is_none());
    }

    #[test]
    fn token_cache_no_expiry_always_valid() {
        let dir = tempfile::tempdir().unwrap();
        let cache = TokenCache::at_path(dir.path().join("credentials.json"));

        cache
            .store("https://example.com/token", "forever", None, None)
            .unwrap();

        let loaded = cache.load("https://example.com/token").unwrap();
        assert_eq!(loaded.access_token, "forever");
        assert!(loaded.expires_at.is_none());
    }

    #[test]
    fn token_cache_remove() {
        let dir = tempfile::tempdir().unwrap();
        let cache = TokenCache::at_path(dir.path().join("credentials.json"));

        cache
            .store("https://example.com/token", "abc", None, Some(3600))
            .unwrap();
        assert!(cache.load("https://example.com/token").is_some());

        cache.remove("https://example.com/token");
        assert!(cache.load("https://example.com/token").is_none());
    }

    #[test]
    fn token_cache_preserves_refresh_token_on_update() {
        let dir = tempfile::tempdir().unwrap();
        let cache = TokenCache::at_path(dir.path().join("credentials.json"));

        // Initial store with refresh token
        cache
            .store("https://ex.com/t", "old-access", Some("my-refresh"), Some(3600))
            .unwrap();

        // Update with new access token but no refresh token in response
        cache
            .store("https://ex.com/t", "new-access", None, Some(3600))
            .unwrap();

        let loaded = cache.load("https://ex.com/t").unwrap();
        assert_eq!(loaded.access_token, "new-access");
        assert_eq!(loaded.refresh_token.as_deref(), Some("my-refresh"));
    }

    #[cfg(unix)]
    #[test]
    fn token_cache_file_permissions() {
        use std::os::unix::fs::PermissionsExt;

        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("credentials.json");
        let cache = TokenCache::at_path(path.clone());

        cache
            .store("https://example.com/token", "secret", None, None)
            .unwrap();

        let mode = std::fs::metadata(&path).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o600, "Token cache should be owner-only");
    }

    #[tokio::test(flavor = "multi_thread")]
    #[serial]
    async fn provider_uses_disk_cache() {
        let dir = tempfile::tempdir().unwrap();
        let cache = TokenCache::at_path(dir.path().join("credentials.json"));

        // Pre-populate the cache
        cache
            .store("https://example.com/token", "cached-token", None, Some(3600))
            .unwrap();

        // Provider should not hit the network (no MockServer needed)
        std::env::set_var("TEST_CACHE_ID", "id");
        std::env::set_var("TEST_CACHE_SECRET", "secret");

        let provider = OAuth2TokenProvider::new(
            "oauth2",
            "https://example.com/token",
            OAuth2Grant::ClientCredentials {
                client_id_env: "TEST_CACHE_ID".to_string(),
                client_secret_env: "TEST_CACHE_SECRET".to_string(),
                scope: None,
            },
        )
        .with_token_cache(cache);

        assert!(provider.has_credentials());

        let r = provider
            .apply(req(), &EndpointAuthMetadata::unspecified())
            .unwrap();
        assert_eq!(auth_header(r).as_deref(), Some("Bearer cached-token"));

        std::env::remove_var("TEST_CACHE_ID");
        std::env::remove_var("TEST_CACHE_SECRET");
    }

    #[tokio::test(flavor = "multi_thread")]
    #[serial]
    async fn provider_persists_token_to_disk() {
        let dir = tempfile::tempdir().unwrap();
        let cache = TokenCache::at_path(dir.path().join("credentials.json"));

        let server = MockServer::start().await;
        let token_url = format!("{}/token", server.uri());

        Mock::given(method("POST"))
            .and(path("/token"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(serde_json::json!({
                    "access_token": "new-token",
                    "refresh_token": "new-refresh",
                    "expires_in": 3600
                })),
            )
            .expect(1)
            .mount(&server)
            .await;

        std::env::set_var("TEST_PERSIST_ID", "id");
        std::env::set_var("TEST_PERSIST_SECRET", "secret");

        let provider = OAuth2TokenProvider::new(
            "oauth2",
            &token_url,
            OAuth2Grant::ClientCredentials {
                client_id_env: "TEST_PERSIST_ID".to_string(),
                client_secret_env: "TEST_PERSIST_SECRET".to_string(),
                scope: None,
            },
        )
        .with_token_cache(cache.clone());

        let r = provider
            .apply(req(), &EndpointAuthMetadata::unspecified())
            .unwrap();
        assert_eq!(auth_header(r).as_deref(), Some("Bearer new-token"));

        // Verify it was persisted
        let loaded = cache.load(&token_url).unwrap();
        assert_eq!(loaded.access_token, "new-token");
        assert_eq!(loaded.refresh_token.as_deref(), Some("new-refresh"));

        std::env::remove_var("TEST_PERSIST_ID");
        std::env::remove_var("TEST_PERSIST_SECRET");
    }

    #[tokio::test(flavor = "multi_thread")]
    #[serial]
    async fn provider_uses_cached_refresh_token() {
        let dir = tempfile::tempdir().unwrap();
        let cache = TokenCache::at_path(dir.path().join("credentials.json"));

        let server = MockServer::start().await;
        let token_url = format!("{}/token", server.uri());

        // Pre-populate cache with expired access + valid refresh
        {
            let mut map = TokenMap::new();
            map.insert(
                token_url.clone(),
                TokenBundle {
                    access_token: "expired".to_string(),
                    refresh_token: Some("cached-refresh".to_string()),
                    expires_at: Some(0), // already expired
                },
            );
            let json = serde_json::to_string_pretty(&map).unwrap();
            std::fs::write(dir.path().join("credentials.json"), json).unwrap();
        }

        Mock::given(method("POST"))
            .and(path("/token"))
            .respond_with(
                ResponseTemplate::new(200).set_body_json(serde_json::json!({
                    "access_token": "refreshed-from-cache",
                    "refresh_token": "new-refresh",
                    "expires_in": 7200
                })),
            )
            .expect(1)
            .mount(&server)
            .await;

        std::env::set_var("TEST_CREFRESH_ID", "id");
        std::env::set_var("TEST_CREFRESH_SECRET", "secret");

        let provider = OAuth2TokenProvider::new(
            "oauth2",
            &token_url,
            OAuth2Grant::ClientCredentials {
                client_id_env: "TEST_CREFRESH_ID".to_string(),
                client_secret_env: "TEST_CREFRESH_SECRET".to_string(),
                scope: None,
            },
        )
        .with_token_cache(cache.clone());

        let r = provider
            .apply(req(), &EndpointAuthMetadata::unspecified())
            .unwrap();
        assert_eq!(
            auth_header(r).as_deref(),
            Some("Bearer refreshed-from-cache")
        );

        // Verify the new tokens were persisted
        let loaded = cache.load(&token_url).unwrap();
        assert_eq!(loaded.access_token, "refreshed-from-cache");
        assert_eq!(loaded.refresh_token.as_deref(), Some("new-refresh"));

        std::env::remove_var("TEST_CREFRESH_ID");
        std::env::remove_var("TEST_CREFRESH_SECRET");
    }

    #[tokio::test(flavor = "multi_thread")]
    #[serial]
    async fn provider_falls_through_when_cached_refresh_fails() {
        let dir = tempfile::tempdir().unwrap();
        let cache = TokenCache::at_path(dir.path().join("credentials.json"));

        let server = MockServer::start().await;
        let token_url = format!("{}/token", server.uri());

        // Pre-populate cache with expired access + stale refresh
        {
            let mut map = TokenMap::new();
            map.insert(
                token_url.clone(),
                TokenBundle {
                    access_token: "expired".to_string(),
                    refresh_token: Some("stale-refresh".to_string()),
                    expires_at: Some(0),
                },
            );
            let json = serde_json::to_string_pretty(&map).unwrap();
            std::fs::write(dir.path().join("credentials.json"), json).unwrap();
        }

        // First call (refresh) fails, second call (client credentials) succeeds
        let call_count = std::sync::Arc::new(std::sync::atomic::AtomicU32::new(0));
        let call_count_clone = call_count.clone();

        Mock::given(method("POST"))
            .and(path("/token"))
            .respond_with(move |_req: &wiremock::Request| {
                let n = call_count_clone.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                if n == 0 {
                    // Refresh fails
                    ResponseTemplate::new(400).set_body_json(serde_json::json!({
                        "error": "invalid_grant",
                        "error_description": "refresh token expired"
                    }))
                } else {
                    // Client credentials succeeds
                    ResponseTemplate::new(200).set_body_json(serde_json::json!({
                        "access_token": "fresh-cc-token",
                        "expires_in": 3600
                    }))
                }
            })
            .expect(2)
            .mount(&server)
            .await;

        std::env::set_var("TEST_FALLTHRU_ID", "id");
        std::env::set_var("TEST_FALLTHRU_SECRET", "secret");

        let provider = OAuth2TokenProvider::new(
            "oauth2",
            &token_url,
            OAuth2Grant::ClientCredentials {
                client_id_env: "TEST_FALLTHRU_ID".to_string(),
                client_secret_env: "TEST_FALLTHRU_SECRET".to_string(),
                scope: None,
            },
        )
        .with_token_cache(cache.clone());

        let r = provider
            .apply(req(), &EndpointAuthMetadata::unspecified())
            .unwrap();
        assert_eq!(auth_header(r).as_deref(), Some("Bearer fresh-cc-token"));

        // The stale refresh token should have been removed
        let loaded = cache.load(&token_url).unwrap();
        assert_eq!(loaded.access_token, "fresh-cc-token");
        assert!(loaded.refresh_token.is_none());

        std::env::remove_var("TEST_FALLTHRU_ID");
        std::env::remove_var("TEST_FALLTHRU_SECRET");
    }

    #[test]
    fn has_credentials_true_when_cache_has_valid_token() {
        let dir = tempfile::tempdir().unwrap();
        let cache = TokenCache::at_path(dir.path().join("credentials.json"));

        cache
            .store("https://example.com/token", "valid", None, Some(3600))
            .unwrap();

        std::env::remove_var("NO_SUCH_ID_XYZ_TOKEN_TEST");
        std::env::remove_var("NO_SUCH_SECRET_XYZ_TOKEN_TEST");

        let provider = OAuth2TokenProvider::new(
            "oauth2",
            "https://example.com/token",
            OAuth2Grant::ClientCredentials {
                client_id_env: "NO_SUCH_ID_XYZ_TOKEN_TEST".to_string(),
                client_secret_env: "NO_SUCH_SECRET_XYZ_TOKEN_TEST".to_string(),
                scope: None,
            },
        )
        .with_token_cache(cache);

        // has_credentials is true because of disk cache, even though env vars are unset
        assert!(provider.has_credentials());
    }

    #[test]
    fn with_cache_sets_oncelock() {
        let p = OAuth2TokenProvider::new(
            "oauth2",
            "https://example.com/token",
            OAuth2Grant::ClientCredentials {
                client_id_env: "X".to_string(),
                client_secret_env: "Y".to_string(),
                scope: None,
            },
        );
        assert!(!p.has_cache());
        let p = p.with_cache("my-test-cli");
        assert!(p.has_cache());
    }

    #[test]
    fn inject_token_cache_sets_cache_via_trait() {
        use crate::auth::provider::AuthProvider;
        let p = OAuth2TokenProvider::new(
            "oauth2",
            "https://example.com/token",
            OAuth2Grant::ClientCredentials {
                client_id_env: "X".to_string(),
                client_secret_env: "Y".to_string(),
                scope: None,
            },
        );
        assert!(!p.has_cache());
        p.inject_token_cache("my-test-cli");
        assert!(p.has_cache());
    }

    #[test]
    fn inject_token_cache_idempotent() {
        use crate::auth::provider::AuthProvider;
        let p = OAuth2TokenProvider::new(
            "oauth2",
            "https://example.com/token",
            OAuth2Grant::ClientCredentials {
                client_id_env: "X".to_string(),
                client_secret_env: "Y".to_string(),
                scope: None,
            },
        );
        p.inject_token_cache("first-cli");
        assert!(p.has_cache());
        // Second call is a no-op (OnceLock already set)
        p.inject_token_cache("second-cli");
        assert!(p.has_cache());
    }

    // FER-10745: a misconfigured OAuth2 scheme must error loudly, never let an
    // unauthenticated request through.
    #[tokio::test(flavor = "multi_thread")]
    async fn misconfigured_oauth2_provider_errors_instead_of_silent_unauth() {
        let provider = MisconfiguredOAuth2Provider::new(
            "OAuth2Security",
            "missing OAuth2 config: token_url",
        );

        // Selected by composition (not skipped) so the failure surfaces.
        assert!(provider.has_credentials());

        let request = reqwest::Client::new().get("https://api.example.com/v1/thing");
        let result = provider.apply(request, &EndpointAuthMetadata::unspecified());
        let err = result.expect_err("misconfigured OAuth2 must refuse to send");
        assert!(matches!(err, CliError::Auth(_)));
        let msg = err.to_string();
        assert!(
            msg.contains("OAuth2Security") && msg.contains("token_url"),
            "error should name the scheme and the missing config: {msg}",
        );
    }
}
