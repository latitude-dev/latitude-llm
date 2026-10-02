//! OAuth login flows + the auth provider that resolves their tokens at request time.
//!
//! - [`DeviceCodeLoginFlow`] — RFC 8628. Runs on `<bin> auth login`.
//! - [`PkceLoginFlow`] — authorization code + PKCE. Runs on `<bin> auth login`.
//!   (TB4 — see below.)
//! - [`OAuth2KeyringProvider`] — the request-time
//!   [`AuthProvider`](crate::auth::AuthProvider) used by both flows. Reads
//!   the JSON token bundle from the active keyring, refreshes via the
//!   token URL when the access token has expired, applies the result as
//!   `Authorization: Bearer <…>`.
//!
//! All three pieces share the JSON `TokenBundle` schema:
//!
//! ```json
//! {
//!   "access_token": "…",
//!   "refresh_token": "…",         // optional — present iff the server returned one
//!   "expires_at": 1715550000      // epoch seconds; optional iff the server didn't return expires_in
//! }
//! ```
//!
//! The bundle is stored at keyring `(service=<cli_name>, account=<scheme_name>)`,
//! same key shape as the universal `--with-token` paste (which stores a
//! plain string instead). The provider tries JSON-decode first, falls back
//! to treating the value as a raw bearer token — so paste-stored tokens
//! and OAuth-flow tokens coexist seamlessly.

use std::sync::{Arc, OnceLock};
use std::time::Duration;

use secrecy::{ExposeSecret, SecretString};
use serde::Deserialize;

use crate::auth::keyring_store::active_store;
use crate::auth::login::{LoginContext, LoginFlow};
use crate::auth::oauth_common::{
    parse_oauth_error_body, token_http_client, truncate_body, TokenSuccessBody,
};
// `TokenBundle` continues to be re-exported from this module for backward
// compatibility with `crate::auth::oauth_login::TokenBundle` import paths.
pub use crate::auth::oauth_common::TokenBundle;
use crate::auth::provider::{AuthProvider, DynAuthProvider, EndpointAuthMetadata};
use crate::error::CliError;

// ---------------------------------------------------------------------------
// Device-code flow (RFC 8628)
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct DeviceAuthBody {
    device_code: String,
    user_code: String,
    verification_uri: String,
    #[serde(default)]
    verification_uri_complete: Option<String>,
    expires_in: u64,
    #[serde(default = "default_interval")]
    interval: u64,
}

fn default_interval() -> u64 {
    5
}

/// Extra literal OAuth parameters (e.g. `audience`, `resource`) appended to an
/// authorization, token, device-authorization, or refresh request. Sourced from
/// the IR's `authorizationParameters` / `tokenParameters` / `refreshParameters`
/// maps, which are optional — an empty list is a no-op.
type ExtraParams = Vec<(String, String)>;

/// Append `extra` params to a form, skipping any protocol-reserved keys the flow
/// controls itself, so user config can't clobber the handshake (RFC 6749).
fn extend_with_extra(form: &mut Vec<(String, String)>, extra: &ExtraParams, reserved: &[&str]) {
    for (key, value) in extra {
        if reserved.iter().any(|r| *r == key.as_str()) {
            continue;
        }
        form.push((key.clone(), value.clone()));
    }
}

/// Device-code login flow.
///
/// Generator-emitted main.rs calls this with values from the OpenAPI
/// `flows.deviceCode` block + `x-fern-cli-auth` extension (see ADR-0007).
#[derive(Debug, Clone)]
pub struct DeviceCodeLoginFlow {
    scheme: String,
    client_id: String,
    device_authorization_url: String,
    token_url: String,
    scopes: Vec<String>,
    token_paste_url: Option<String>,
    device_authorization_params: ExtraParams,
    token_params: ExtraParams,
    refresh_params: ExtraParams,
}

impl DeviceCodeLoginFlow {
    pub fn new(scheme: impl Into<String>) -> Self {
        Self {
            scheme: scheme.into(),
            client_id: String::new(),
            device_authorization_url: String::new(),
            token_url: String::new(),
            scopes: Vec::new(),
            token_paste_url: None,
            device_authorization_params: Vec::new(),
            token_params: Vec::new(),
            refresh_params: Vec::new(),
        }
    }

    pub fn client_id(mut self, v: impl Into<String>) -> Self {
        self.client_id = v.into();
        self
    }
    pub fn device_authorization_url(mut self, v: impl Into<String>) -> Self {
        self.device_authorization_url = v.into();
        self
    }
    pub fn token_url(mut self, v: impl Into<String>) -> Self {
        self.token_url = v.into();
        self
    }
    pub fn scopes<I, S>(mut self, scopes: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        self.scopes = scopes.into_iter().map(Into::into).collect();
        self
    }
    pub fn token_paste_url(mut self, v: impl Into<String>) -> Self {
        self.token_paste_url = Some(v.into());
        self
    }
    /// Extra literal parameters included in the device authorization request (e.g. `audience`).
    pub fn device_authorization_params<I, K, V>(mut self, params: I) -> Self
    where
        I: IntoIterator<Item = (K, V)>,
        K: Into<String>,
        V: Into<String>,
    {
        self.device_authorization_params = params.into_iter().map(|(k, v)| (k.into(), v.into())).collect();
        self
    }
    /// Extra literal parameters included in the device-code token exchange (polling) request.
    pub fn token_params<I, K, V>(mut self, params: I) -> Self
    where
        I: IntoIterator<Item = (K, V)>,
        K: Into<String>,
        V: Into<String>,
    {
        self.token_params = params.into_iter().map(|(k, v)| (k.into(), v.into())).collect();
        self
    }
    /// Extra literal parameters included in the refresh token request.
    pub fn refresh_params<I, K, V>(mut self, params: I) -> Self
    where
        I: IntoIterator<Item = (K, V)>,
        K: Into<String>,
        V: Into<String>,
    {
        self.refresh_params = params.into_iter().map(|(k, v)| (k.into(), v.into())).collect();
        self
    }

    fn validate(&self) -> Result<(), CliError> {
        if self.client_id.is_empty() {
            return Err(CliError::Validation(format!(
                "DeviceCodeLoginFlow `{}`: client_id is required",
                self.scheme
            )));
        }
        if self.device_authorization_url.is_empty() {
            return Err(CliError::Validation(format!(
                "DeviceCodeLoginFlow `{}`: device_authorization_url is required",
                self.scheme
            )));
        }
        if self.token_url.is_empty() {
            return Err(CliError::Validation(format!(
                "DeviceCodeLoginFlow `{}`: token_url is required",
                self.scheme
            )));
        }
        Ok(())
    }
}

impl LoginFlow for DeviceCodeLoginFlow {
    fn flow_type(&self) -> &'static str {
        "device-code"
    }
    fn scheme_name(&self) -> &str {
        &self.scheme
    }
    fn token_paste_url(&self) -> Option<&str> {
        self.token_paste_url.as_deref()
    }
    fn run(&self, ctx: &LoginContext) -> Result<(), CliError> {
        self.validate()?;
        let scopes = self.scopes.clone();
        let scope = if scopes.is_empty() {
            None
        } else {
            Some(scopes.join(" "))
        };

        // The flow runs synchronously from the user's perspective, but the
        // HTTP calls are async — block_on inside the existing runtime.
        tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current().block_on(run_device_code(
                &ctx.cli_name,
                &self.scheme,
                &self.client_id,
                &self.device_authorization_url,
                &self.token_url,
                scope.as_deref(),
                ctx.no_browser,
                &self.device_authorization_params,
                &self.token_params,
            ))
        })
    }
    fn build_auth_provider(&self, cli_name: &str) -> Option<DynAuthProvider> {
        Some(Arc::new(
            OAuth2KeyringProvider::new(&self.scheme, cli_name, &self.token_url, &self.client_id)
                .with_refresh_params(self.refresh_params.clone()),
        ))
    }
}

#[allow(clippy::too_many_arguments)]
async fn run_device_code(
    cli_name: &str,
    scheme: &str,
    client_id: &str,
    device_auth_url: &str,
    token_url: &str,
    scope: Option<&str>,
    no_browser: bool,
    device_authorization_params: &ExtraParams,
    token_params: &ExtraParams,
) -> Result<(), CliError> {
    use std::io::Write;

    let http = token_http_client()?;

    // 1. Request device + user codes.
    let mut device_form: Vec<(String, String)> =
        vec![("client_id".to_string(), client_id.to_string())];
    if let Some(s) = scope {
        device_form.push(("scope".to_string(), s.to_string()));
    }
    extend_with_extra(&mut device_form, device_authorization_params, &["client_id", "scope"]);
    let resp = http
        .post(device_auth_url)
        .form(&device_form)
        .send()
        .await
        .map_err(|e| CliError::Auth(format!("device auth request failed: {e}")))?;
    let status = resp.status();
    let body = resp
        .text()
        .await
        .map_err(|e| CliError::Auth(format!("device auth response body: {e}")))?;
    if !status.is_success() {
        let detail = parse_oauth_error_body(&body)
            .and_then(|e| e.error_description.or(e.error))
            .unwrap_or_else(|| truncate_body(&body));
        return Err(CliError::Auth(format!(
            "device authorization endpoint returned HTTP {status}: {detail}"
        )));
    }
    let device: DeviceAuthBody = serde_json::from_str(&body)
        .map_err(|e| CliError::Auth(format!("device auth response not JSON: {e}")))?;

    // 2. Show the user code + URL.
    let verification_url = device
        .verification_uri_complete
        .clone()
        .unwrap_or_else(|| device.verification_uri.clone());
    {
        let mut err = std::io::stderr().lock();
        let _ = writeln!(err, "! First copy your one-time code: {}", device.user_code);
        let _ = writeln!(err, "  Then visit: {}", device.verification_uri);
        if !no_browser {
            let _ = writeln!(err, "  Opening browser…");
        } else {
            let _ = writeln!(err, "  (browser not opened — use the URL above)");
        }
        let _ = err.flush();
    }
    if !no_browser {
        let _ = webbrowser::open(&verification_url);
    }

    // 3. Poll the token endpoint.
    let mut token_form: Vec<(String, String)> = vec![
        (
            "grant_type".to_string(),
            "urn:ietf:params:oauth:grant-type:device_code".to_string(),
        ),
        ("client_id".to_string(), client_id.to_string()),
        ("device_code".to_string(), device.device_code.clone()),
    ];
    extend_with_extra(&mut token_form, token_params, &["grant_type", "client_id", "device_code"]);
    // Floor the poll interval at 1 second. RFC 8628 §3.5 mandates a
    // minimum of 5s in production, but tests deliberately use interval=0
    // for speed. A 1s floor keeps tests fast while preventing any
    // production server's `interval=0` from busy-looping the token
    // endpoint.
    let mut interval = device.interval.max(1);
    let deadline = std::time::Instant::now() + Duration::from_secs(device.expires_in);

    loop {
        if std::time::Instant::now() >= deadline {
            return Err(CliError::Auth(
                "Device code expired before authorization was granted. Run `auth login` again.".to_string(),
            ));
        }

        tokio::time::sleep(Duration::from_secs(interval)).await;

        let resp = http
            .post(token_url)
            .form(&token_form)
            .send()
            .await
            .map_err(|e| CliError::Auth(format!("device token poll failed: {e}")))?;
        let status = resp.status();
        let body = resp
            .text()
            .await
            .map_err(|e| CliError::Auth(format!("device token response body: {e}")))?;

        if status.is_success() {
            let ok: TokenSuccessBody = serde_json::from_str(&body).map_err(|e| {
                CliError::Auth(format!("token response not JSON: {e}"))
            })?;
            let bundle = TokenBundle::from_token_response(
                &ok.access_token,
                ok.refresh_token.as_deref(),
                ok.expires_in,
            );
            active_store().set(
                cli_name,
                &crate::profiles::keyring_account(scheme),
                &bundle.to_keyring_value()?,
            )?;
            {
                let mut err = std::io::stderr().lock();
                let _ = writeln!(
                    err,
                    "{}",
                    crate::auth::login::green(&format!(
                        "✓ Authenticated. Stored credential in {}.",
                        active_store().backend_label()
                    ))
                );
            }
            return Ok(());
        }

        // Distinguish polling-control errors (continue) from terminal errors (stop).
        let parsed = parse_oauth_error_body(&body);
        let code = parsed
            .as_ref()
            .and_then(|e| e.error.as_deref())
            .unwrap_or("")
            .to_string();
        match code.as_str() {
            "authorization_pending" => continue,
            "slow_down" => {
                interval = interval.saturating_add(5);
                continue;
            }
            "access_denied" => {
                return Err(CliError::Auth(
                    "Authorization was denied. Run `auth login` again to retry.".to_string(),
                ));
            }
            "expired_token" => {
                return Err(CliError::Auth(
                    "Device code expired. Run `auth login` again.".to_string(),
                ));
            }
            other => {
                let detail = parsed
                    .and_then(|e| e.error_description)
                    .unwrap_or_else(|| truncate_body(&body));
                return Err(CliError::Auth(format!(
                    "device token poll failed ({status}, code={other}): {detail}"
                )));
            }
        }
    }
}

// ---------------------------------------------------------------------------
// PKCE flow (authorization code + PKCE, RFC 7636)
// ---------------------------------------------------------------------------

use base64::Engine;
use sha2::Digest;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

const CODE_VERIFIER_LEN: usize = 64;

/// Generate a `code_verifier` per RFC 7636 §4.1 — 43-128 chars from the
/// unreserved set. 64 random base64url chars satisfies both length and
/// alphabet constraints.
fn generate_code_verifier() -> String {
    use rand::Rng;
    let mut bytes = [0u8; CODE_VERIFIER_LEN];
    rand::thread_rng().fill(&mut bytes);
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

/// SHA-256(code_verifier) base64url-no-pad — the `code_challenge` per
/// RFC 7636 §4.2.
fn code_challenge_s256(verifier: &str) -> String {
    let hash = sha2::Sha256::digest(verifier.as_bytes());
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(hash)
}

/// PKCE login flow.
#[derive(Debug, Clone)]
pub struct PkceLoginFlow {
    scheme: String,
    client_id: String,
    authorization_url: String,
    token_url: String,
    scopes: Vec<String>,
    /// The primary loopback callback port. `None` = ephemeral (OS-assigned) port per RFC 8252
    /// §7.3; `Some(port)` pins an exact port the authorization server must have pre-registered.
    /// At login time `run_pkce` resolves this to the actually-bound port.
    redirect_port: Option<u16>,
    /// Ordered fallback ports, tried after `redirect_port` when it's busy. Each must also be
    /// pre-registered with the authorization server. Empty unless set via `redirect_ports`.
    redirect_backup_ports: Vec<u16>,
    /// Loopback host the callback listener binds and the redirect URI is built with. `None`
    /// defaults to `127.0.0.1` (RFC 8252 §7.3). Set to `localhost` when the authorization server
    /// registered a `localhost` redirect (must match exactly). Only loopback hosts are valid.
    redirect_host: Option<String>,
    /// Callback path served by the listener and used in the redirect URI. `None` defaults to
    /// `/callback`. Set to match a non-`/callback` registered redirect path.
    redirect_path: Option<String>,
    /// Page the loopback listener redirects the browser to once the code is captured. `None`
    /// serves the built-in "you can close this tab" HTML inline; `Some(url)` answers `302` with
    /// `Location: <url>`, so the customer's own hosted page owns the branding.
    success_redirect_url: Option<String>,
    /// Page the loopback listener redirects the browser to when authorization fails, with `error`
    /// (and `error_description`, when the authorization server sent one) appended as query
    /// parameters. `None` serves the built-in failure page inline.
    error_redirect_url: Option<String>,
    token_paste_url: Option<String>,
    authorization_params: ExtraParams,
    token_params: ExtraParams,
    refresh_params: ExtraParams,
}

impl PkceLoginFlow {
    pub fn new(scheme: impl Into<String>) -> Self {
        Self {
            scheme: scheme.into(),
            client_id: String::new(),
            authorization_url: String::new(),
            token_url: String::new(),
            scopes: Vec::new(),
            redirect_port: None,
            redirect_backup_ports: Vec::new(),
            redirect_host: None,
            redirect_path: None,
            success_redirect_url: None,
            error_redirect_url: None,
            token_paste_url: None,
            authorization_params: Vec::new(),
            token_params: Vec::new(),
            refresh_params: Vec::new(),
        }
    }

    pub fn client_id(mut self, v: impl Into<String>) -> Self {
        self.client_id = v.into();
        self
    }
    pub fn authorization_url(mut self, v: impl Into<String>) -> Self {
        self.authorization_url = v.into();
        self
    }
    pub fn token_url(mut self, v: impl Into<String>) -> Self {
        self.token_url = v.into();
        self
    }
    pub fn scopes<I, S>(mut self, scopes: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        self.scopes = scopes.into_iter().map(Into::into).collect();
        self
    }
    /// Pin an exact loopback callback port. Omit this to use an ephemeral (OS-assigned) port.
    pub fn redirect_port(mut self, port: u16) -> Self {
        self.redirect_port = Some(port);
        self
    }
    /// Pin an ordered set of loopback callback ports: the first is preferred, the rest are
    /// fallbacks tried (in order) when an earlier one is busy. All must be pre-registered with the
    /// authorization server. An empty list is a no-op (leaves the flow on an ephemeral port).
    pub fn redirect_ports<I>(mut self, ports: I) -> Self
    where
        I: IntoIterator<Item = u16>,
    {
        let mut ports = ports.into_iter();
        if let Some(primary) = ports.next() {
            self.redirect_port = Some(primary);
            self.redirect_backup_ports = ports.collect();
        }
        self
    }
    /// Set the loopback host (`127.0.0.1` or `localhost`) — must match the registered redirect.
    pub fn redirect_host(mut self, host: impl Into<String>) -> Self {
        self.redirect_host = Some(host.into());
        self
    }
    /// Set the callback path (defaults to `/callback`) — must match the registered redirect.
    pub fn redirect_path(mut self, path: impl Into<String>) -> Self {
        self.redirect_path = Some(path.into());
        self
    }
    /// The loopback host the listener binds and the redirect URI uses. Defaults to `127.0.0.1`.
    fn redirect_host_str(&self) -> &str {
        self.redirect_host.as_deref().unwrap_or("127.0.0.1")
    }
    /// The callback path. Defaults to `/callback`.
    fn redirect_path_str(&self) -> &str {
        self.redirect_path.as_deref().unwrap_or("/callback")
    }
    /// Redirect the browser to `url` after a successful callback instead of rendering the built-in
    /// success page, letting the page live on the customer's own site.
    pub fn success_redirect_url(mut self, url: impl Into<String>) -> Self {
        self.success_redirect_url = Some(url.into());
        self
    }
    /// Redirect the browser to `url` when authorization fails instead of rendering the built-in
    /// failure page. `error` and `error_description` are appended so the page can explain what
    /// happened.
    pub fn error_redirect_url(mut self, url: impl Into<String>) -> Self {
        self.error_redirect_url = Some(url.into());
        self
    }
    fn callback_pages(&self) -> CallbackPages<'_> {
        CallbackPages {
            success_redirect_url: self.success_redirect_url.as_deref(),
            error_redirect_url: self.error_redirect_url.as_deref(),
        }
    }
    pub fn token_paste_url(mut self, v: impl Into<String>) -> Self {
        self.token_paste_url = Some(v.into());
        self
    }
    /// Extra literal parameters appended to the authorization request (e.g. `audience`).
    pub fn authorization_params<I, K, V>(mut self, params: I) -> Self
    where
        I: IntoIterator<Item = (K, V)>,
        K: Into<String>,
        V: Into<String>,
    {
        self.authorization_params = params.into_iter().map(|(k, v)| (k.into(), v.into())).collect();
        self
    }
    /// Extra literal parameters included in the authorization-code token exchange.
    pub fn token_params<I, K, V>(mut self, params: I) -> Self
    where
        I: IntoIterator<Item = (K, V)>,
        K: Into<String>,
        V: Into<String>,
    {
        self.token_params = params.into_iter().map(|(k, v)| (k.into(), v.into())).collect();
        self
    }
    /// Extra literal parameters included in the refresh token request.
    pub fn refresh_params<I, K, V>(mut self, params: I) -> Self
    where
        I: IntoIterator<Item = (K, V)>,
        K: Into<String>,
        V: Into<String>,
    {
        self.refresh_params = params.into_iter().map(|(k, v)| (k.into(), v.into())).collect();
        self
    }

    fn validate(&self) -> Result<(), CliError> {
        if self.client_id.is_empty() {
            return Err(CliError::Validation(format!(
                "PkceLoginFlow `{}`: client_id is required",
                self.scheme
            )));
        }
        if self.authorization_url.is_empty() {
            return Err(CliError::Validation(format!(
                "PkceLoginFlow `{}`: authorization_url is required",
                self.scheme
            )));
        }
        if self.token_url.is_empty() {
            return Err(CliError::Validation(format!(
                "PkceLoginFlow `{}`: token_url is required",
                self.scheme
            )));
        }
        Ok(())
    }

    /// The loopback callback URI. At login time `run_pkce` resolves `redirect_port` to the actual
    /// bound port (ephemeral or pinned) before this is read, so the authorize request and the token
    /// exchange always use the same port. The `unwrap_or(0)` is only reached by direct unit tests
    /// that never bind a listener.
    fn redirect_uri(&self) -> String {
        format!(
            "http://{}:{}{}",
            self.redirect_host_str(),
            self.redirect_port.unwrap_or(0),
            self.redirect_path_str()
        )
    }

    fn build_authorize_url(&self, state: &str, challenge: &str) -> String {
        use form_urlencoded::Serializer;
        let scopes = self.scopes.join(" ");
        let mut pairs = Serializer::new(String::new());
        pairs
            .append_pair("response_type", "code")
            .append_pair("client_id", &self.client_id)
            .append_pair("redirect_uri", &self.redirect_uri())
            .append_pair("state", state)
            .append_pair("code_challenge", challenge)
            .append_pair("code_challenge_method", "S256");
        if !scopes.is_empty() {
            pairs.append_pair("scope", &scopes);
        }
        // Extra literal params (e.g. Auth0 `audience`), skipping protocol-reserved keys.
        const RESERVED: &[&str] = &[
            "response_type",
            "client_id",
            "redirect_uri",
            "state",
            "code_challenge",
            "code_challenge_method",
            "scope",
        ];
        for (key, value) in &self.authorization_params {
            if RESERVED.contains(&key.as_str()) {
                continue;
            }
            pairs.append_pair(key, value);
        }
        let query = pairs.finish();
        let sep = if self.authorization_url.contains('?') {
            '&'
        } else {
            '?'
        };
        format!("{}{}{}", self.authorization_url, sep, query)
    }
}

impl LoginFlow for PkceLoginFlow {
    fn flow_type(&self) -> &'static str {
        "pkce"
    }
    fn scheme_name(&self) -> &str {
        &self.scheme
    }
    fn token_paste_url(&self) -> Option<&str> {
        self.token_paste_url.as_deref()
    }
    fn run(&self, ctx: &LoginContext) -> Result<(), CliError> {
        self.validate()?;
        let flow = self.clone();
        let ctx = ctx.clone();
        tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current().block_on(run_pkce(flow, ctx))
        })
    }
    fn build_auth_provider(&self, cli_name: &str) -> Option<DynAuthProvider> {
        Some(Arc::new(
            OAuth2KeyringProvider::new(&self.scheme, cli_name, &self.token_url, &self.client_id)
                .with_refresh_params(self.refresh_params.clone()),
        ))
    }
}

/// Bind a loopback TCP listener on the first available port in `candidate_ports` (tried in order).
/// Pass `[0]` for an ephemeral (OS-assigned) port. Returns the bound listener, or an error naming
/// every candidate when all are taken.
async fn bind_loopback_listener(host: &str, candidate_ports: &[u16]) -> Result<TcpListener, CliError> {
    let mut last_err: Option<String> = None;
    for &port in candidate_ports {
        match TcpListener::bind((host, port)).await {
            Ok(listener) => return Ok(listener),
            Err(e) => last_err = Some(e.to_string()),
        }
    }
    let ports = candidate_ports
        .iter()
        .map(u16::to_string)
        .collect::<Vec<_>>()
        .join(", ");
    Err(CliError::Auth(format!(
        "Could not bind any {host} callback port [{ports}] — is another instance running, or did you forget to register these redirect URIs? ({})",
        last_err.unwrap_or_default()
    )))
}

async fn run_pkce(mut flow: PkceLoginFlow, ctx: LoginContext) -> Result<(), CliError> {
    use std::io::Write;

    let verifier = generate_code_verifier();
    let challenge = code_challenge_s256(&verifier);
    let state = generate_code_verifier(); // reuse generator; just needs entropy

    // Bind the loopback listener first. `redirect_port = None` → bind port 0 so the OS assigns a
    // free ephemeral port (RFC 8252 §7.3). A pinned `redirect_port` (with optional backups) is
    // tried in order and the first free one wins; all are pre-registered with the authorization
    // server, so whichever binds still matches. Fails only if every candidate is taken.
    let candidate_ports: Vec<u16> = match flow.redirect_port {
        None => vec![0],
        Some(primary) => {
            let mut ports = Vec::with_capacity(1 + flow.redirect_backup_ports.len());
            ports.push(primary);
            ports.extend(flow.redirect_backup_ports.iter().copied());
            ports
        }
    };
    let redirect_host = flow.redirect_host_str().to_string();
    let redirect_path = flow.redirect_path_str().to_string();
    let listener = bind_loopback_listener(&redirect_host, &candidate_ports).await?;
    // Resolve the actually-bound port (the ephemeral one the OS chose, or the pinned one) and use
    // it everywhere so the authorize request and token exchange carry the same redirect_uri.
    let actual_port = listener
        .local_addr()
        .map_err(|e| CliError::Auth(format!("could not resolve loopback callback port: {e}")))?
        .port();
    flow.redirect_port = Some(actual_port);

    let url = flow.build_authorize_url(&state, &challenge);
    let listening_uri = flow.redirect_uri();
    // Take the stderr lock, write, drop — before any .await — to keep
    // the future Send across awaits.
    {
        let mut err = std::io::stderr().lock();
        let _ = writeln!(err, "Opening browser to authenticate…");
        let _ = writeln!(err, "  URL: {url}");
        let _ = writeln!(err, "  Listening on {listening_uri}");
        let _ = err.flush();
    }
    if !ctx.no_browser {
        let _ = webbrowser::open(&url);
    }

    // Wait for the browser to hit /callback with code+state. The listener checks the `state` it
    // received against the one we sent, but answers the browser only for a callback it rejects —
    // a usable one comes back still connected, via the responder.
    let (code, responder) = match accept_callback(&listener, &redirect_path, &state, flow.callback_pages()).await {
        Ok(v) => v,
        Err(e) => return Err(e),
    };

    // Everything the browser is still waiting on. Funneled through one result so the page it lands
    // on is chosen from what actually happened, rather than from having received a code.
    let outcome = exchange_code_and_store(&flow, &ctx, &code, &verifier).await;
    match outcome {
        Ok(()) => responder.success().await,
        Err(e) => {
            responder
                .failure("server_error", Some(POST_CALLBACK_FAILURE_DESCRIPTION))
                .await;
            return Err(e);
        }
    }

    {
        let mut err = std::io::stderr().lock();
        let _ = writeln!(
            err,
            "{}",
            crate::auth::login::green(&format!(
                "✓ Authenticated. Stored credential in {}.",
                active_store().backend_label()
            ))
        );
    }
    Ok(())
}

/// Redeem the authorization code and persist the credential — the part of the login that happens
/// after the browser callback and decides whether it actually succeeded. Split out of `run_pkce`
/// so its failures are a single `Result` the caller can answer the waiting browser from, instead
/// of a handful of `?`s that would return past it.
async fn exchange_code_and_store(
    flow: &PkceLoginFlow,
    ctx: &LoginContext,
    code: &str,
    verifier: &str,
) -> Result<(), CliError> {
    let http = token_http_client()?;
    let redirect_uri = flow.redirect_uri();
    let mut form: Vec<(String, String)> = vec![
        ("grant_type".to_string(), "authorization_code".to_string()),
        ("code".to_string(), code.to_string()),
        ("code_verifier".to_string(), verifier.to_string()),
        ("client_id".to_string(), flow.client_id.clone()),
        ("redirect_uri".to_string(), redirect_uri),
    ];
    extend_with_extra(
        &mut form,
        &flow.token_params,
        &["grant_type", "code", "code_verifier", "client_id", "redirect_uri"],
    );
    let resp = http
        .post(&flow.token_url)
        .form(&form)
        .send()
        .await
        .map_err(|e| CliError::Auth(format!("PKCE token exchange failed: {e}")))?;
    let status = resp.status();
    let body = resp
        .text()
        .await
        .map_err(|e| CliError::Auth(format!("token response body: {e}")))?;
    if !status.is_success() {
        let detail = parse_oauth_error_body(&body)
            .and_then(|e| e.error_description.or(e.error))
            .unwrap_or_else(|| truncate_body(&body));
        return Err(CliError::Auth(format!(
            "PKCE token exchange failed (HTTP {status}): {detail}"
        )));
    }
    let ok: TokenSuccessBody = serde_json::from_str(&body)
        .map_err(|e| CliError::Auth(format!("token response not JSON: {e}")))?;
    let bundle = TokenBundle::from_token_response(
        &ok.access_token,
        ok.refresh_token.as_deref(),
        ok.expires_in,
    );
    active_store().set(
        &ctx.cli_name,
        &crate::profiles::keyring_account(&flow.scheme),
        &bundle.to_keyring_value()?,
    )?;
    Ok(())
}

/// Where the loopback listener sends the browser once the callback has been handled. Empty by
/// default, in which case the listener renders its own page inline.
#[derive(Clone, Copy, Default)]
struct CallbackPages<'a> {
    success_redirect_url: Option<&'a str>,
    error_redirect_url: Option<&'a str>,
}

impl<'a> CallbackPages<'a> {
    /// A configured URL is interpolated straight into a `Location` header, so a value carrying
    /// CR/LF (or any other control character) could smuggle in extra headers. `fern check` rejects
    /// such values, so this only fires if one reaches a built binary anyway — in which case we
    /// serve the built-in page instead of emitting a malformed response.
    fn success(&self) -> Option<&'a str> {
        self.success_redirect_url.filter(|url| is_header_safe_url(url))
    }
    fn error(&self) -> Option<&'a str> {
        self.error_redirect_url.filter(|url| is_header_safe_url(url))
    }
}

/// The still-open loopback connection, handed back to the caller so the browser is answered only
/// once the login has actually finished. Responding from inside the listener would mean deciding
/// the outcome before the token exchange and the keyring write have happened — every page that
/// says "you're logged in", ours or a customer's, would be a guess.
///
/// The browser waits in the meantime. That is bounded: the token exchange carries a 10s connect /
/// 30s total timeout, and the keyring write is local.
struct CallbackResponder<'a> {
    socket: tokio::net::TcpStream,
    pages: CallbackPages<'a>,
}

impl<'a> CallbackResponder<'a> {
    /// The login completed and the credential is stored. Consumes `self`: one response per
    /// connection, and it closes.
    async fn success(mut self) {
        match self.pages.success() {
            Some(url) => {
                let _ = write_redirect(&mut self.socket, url).await;
            }
            None => {
                let _ =
                    write_response_html(&mut self.socket, 200, &render_callback_page(CallbackOutcome::Success)).await;
            }
        }
    }

    /// The callback was fine but the login failed after it — a rejected token exchange, or a
    /// credential we couldn't persist.
    async fn failure(mut self, error: &str, description: Option<&str>) {
        write_failure(&mut self.socket, &self.pages, error, description).await;
    }
}

/// What a hosted error page is told when the callback was accepted but the login failed afterwards.
/// The reason itself stays in the terminal: a token-endpoint body is not something to forward into
/// a URL, and the user is being sent back to the terminal to read it anyway.
const POST_CALLBACK_FAILURE_DESCRIPTION: &str = "The CLI could not complete the login. Check your terminal for details.";

/// Cap on how long the PKCE listener waits for the browser callback
/// before bailing. Five minutes matches typical OAuth authorization-code
/// lifetimes — if the user abandoned the browser tab or got distracted,
/// surfacing a clear timeout beats hanging silently.
const PKCE_CALLBACK_TIMEOUT: Duration = Duration::from_secs(300);

/// Accept one HTTP request on the loopback listener, parse `?code=…&state=…` from the request
/// line, and check `state` against `expected_state`. A callback we can't use is answered here and
/// returns an error; a usable one returns the code plus the still-open connection, so the caller
/// answers the browser once it knows whether the login actually worked.
async fn accept_callback<'a>(
    listener: &TcpListener,
    expected_path: &str,
    expected_state: &str,
    pages: CallbackPages<'a>,
) -> Result<(String, CallbackResponder<'a>), CliError> {
    accept_callback_with_timeout(listener, expected_path, expected_state, pages, PKCE_CALLBACK_TIMEOUT).await
}

async fn accept_callback_with_timeout<'a>(
    listener: &TcpListener,
    expected_path: &str,
    expected_state: &str,
    pages: CallbackPages<'a>,
    timeout: Duration,
) -> Result<(String, CallbackResponder<'a>), CliError> {
    match tokio::time::timeout(
        timeout,
        accept_callback_inner(listener, expected_path, expected_state, pages),
    )
    .await
    {
        Ok(r) => r,
        Err(_) => Err(CliError::Auth(format!(
            "Timed out waiting for the OAuth callback after {}s. \
             Run `auth login` again — if your browser didn't open, pass `--no-browser` \
             and visit the printed URL manually.",
            timeout.as_secs()
        ))),
    }
}

async fn accept_callback_inner<'a>(
    listener: &TcpListener,
    expected_path: &str,
    expected_state: &str,
    pages: CallbackPages<'a>,
) -> Result<(String, CallbackResponder<'a>), CliError> {
    // Single-shot accept. If the browser hits us with a noisy preflight
    // (favicon, etc.) we skip and accept the next; cap at 8 attempts.
    for _ in 0..8 {
        let (mut socket, _) = listener
            .accept()
            .await
            .map_err(|e| CliError::Auth(format!("accept on loopback failed: {e}")))?;

        let mut buf = [0u8; 8192];
        let n = socket
            .read(&mut buf)
            .await
            .map_err(|e| CliError::Auth(format!("read from loopback failed: {e}")))?;
        if n == 0 {
            continue;
        }
        let req = String::from_utf8_lossy(&buf[..n]);
        let path = match parse_request_path(&req) {
            Some(p) => p,
            None => continue,
        };
        // Match the configured callback path exactly (query string stripped). The listener must
        // serve whatever path the redirect URI advertised — defaulting to `/callback`, but honoring
        // a custom registered path — otherwise the browser callback 404s and login hangs. Anything
        // else (favicon.ico, /.well-known, stray probes) is skipped.
        let path_only = path.split('?').next().unwrap_or(path);
        if path_only != expected_path {
            let _ = write_response(&mut socket, 404, "not found").await;
            continue;
        }

        // Parse query.
        let qs = path.split_once('?').map(|(_, q)| q).unwrap_or("");
        let mut code = None;
        let mut state = None;
        let mut error_param = None;
        let mut error_description = None;
        for (k, v) in form_urlencoded::parse(qs.as_bytes()) {
            match k.as_ref() {
                "code" => code = Some(v.into_owned()),
                "state" => state = Some(v.into_owned()),
                "error" => error_param = Some(v.into_owned()),
                "error_description" => error_description = Some(v.into_owned()),
                _ => {}
            }
        }

        if let Some(e) = error_param {
            write_failure(&mut socket, &pages, &e, error_description.as_deref()).await;
            return Err(CliError::Auth(match error_description {
                Some(description) => format!("Authorization server returned error: {e} ({description})"),
                None => format!("Authorization server returned error: {e}"),
            }));
        }

        let (code, state) = match (code, state) {
            (Some(code), Some(state)) => (code, state),
            (code, _) => {
                // No `error` from the authorization server, but the callback is unusable. Synthesize
                // the OAuth error code for it so a hosted error page always has something to render.
                let missing = if code.is_none() { "code" } else { "state" };
                write_failure(
                    &mut socket,
                    &pages,
                    "invalid_request",
                    Some(&format!("The callback was missing its `{missing}` parameter.")),
                )
                .await;
                return Err(CliError::Auth(format!(
                    "callback missing `{missing}` query parameter"
                )));
            }
        };

        if state != expected_state {
            // Possible CSRF. The browser gets the failure page like any other unusable callback —
            // telling it "you're all set" for a callback we're about to reject would be a lie, and
            // on a configured page a branded one. Neither state value is forwarded: the one we sent
            // is a per-login nonce and has no business leaving the loopback.
            write_failure(
                &mut socket,
                &pages,
                "invalid_request",
                Some("The callback `state` parameter did not match the one the CLI sent."),
            )
            .await;
            return Err(CliError::Auth(format!(
                "OAuth state mismatch (expected `{expected_state}`, got `{state}`) — possible CSRF; aborting"
            )));
        }

        // A usable callback. The browser stays connected and unanswered until the caller has
        // exchanged the code and stored the credential.
        return Ok((code, CallbackResponder { socket, pages }));
    }
    Err(CliError::Auth(
        "Too many invalid requests on the loopback listener; giving up".to_string(),
    ))
}

fn parse_request_path(req: &str) -> Option<&str> {
    // Request line: "GET /callback?... HTTP/1.1\r\n"
    let line = req.split("\r\n").next()?;
    let mut parts = line.split_whitespace();
    let _method = parts.next()?;
    parts.next() // path
}

async fn write_response(socket: &mut tokio::net::TcpStream, status: u16, msg: &str) -> std::io::Result<()> {
    let body = msg;
    let resp = format!(
        "HTTP/1.1 {status} {}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        status_phrase(status),
        body.len()
    );
    socket.write_all(resp.as_bytes()).await?;
    socket.flush().await
}

/// A configured redirect target is interpolated straight into a `Location` header, so anything
/// carrying CR/LF (or other control characters) could smuggle in extra headers. The generator
/// rejects such values at codegen time; this is the runtime backstop — an unsafe URL falls back to
/// the built-in success page rather than emitting a malformed response.
fn is_header_safe_url(url: &str) -> bool {
    !url.is_empty() && !url.chars().any(char::is_control)
}

/// Answer a failed callback: hand the browser off to the configured error page (carrying `error` /
/// `error_description` so it can explain what happened), or render the built-in failure page.
async fn write_failure(
    socket: &mut tokio::net::TcpStream,
    pages: &CallbackPages<'_>,
    error: &str,
    description: Option<&str>,
) {
    match pages.error() {
        Some(url) => {
            let _ = write_redirect(socket, &build_error_redirect(url, error, description)).await;
        }
        None => {
            let page = render_callback_page(CallbackOutcome::Failure { error, description });
            let _ = write_response_html(socket, 400, &page).await;
        }
    }
}

/// Append `error` (and `error_description`, when the authorization server sent one) to the
/// configured error page URL. Parameters are serialized as `application/x-www-form-urlencoded`
/// rather than concatenated, merged into any query string the URL already carries, and inserted
/// before a fragment so `…/error#recover` stays a fragment.
fn build_error_redirect(url: &str, error: &str, description: Option<&str>) -> String {
    let mut serializer = form_urlencoded::Serializer::new(String::new());
    serializer.append_pair("error", error);
    if let Some(description) = description {
        serializer.append_pair("error_description", description);
    }
    let params = serializer.finish();

    let (base, fragment) = match url.split_once('#') {
        Some((base, fragment)) => (base, Some(fragment)),
        None => (url, None),
    };
    let separator = if base.contains('?') { '&' } else { '?' };
    match fragment {
        Some(fragment) => format!("{base}{separator}{params}#{fragment}"),
        None => format!("{base}{separator}{params}"),
    }
}

/// Hand the browser off to an externally hosted page. The body is a courtesy for clients that
/// don't follow the redirect; browsers never render it.
async fn write_redirect(socket: &mut tokio::net::TcpStream, location: &str) -> std::io::Result<()> {
    let body = format!(
        "<!DOCTYPE html><html><body><a href=\"{}\">Continue</a></body></html>",
        html_escape(location)
    );
    let resp = format!(
        "HTTP/1.1 302 {}\r\nLocation: {location}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        status_phrase(302),
        body.len()
    );
    socket.write_all(resp.as_bytes()).await?;
    socket.flush().await
}

async fn write_response_html(socket: &mut tokio::net::TcpStream, status: u16, body: &str) -> std::io::Result<()> {
    let resp = format!(
        "HTTP/1.1 {status} {}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        status_phrase(status),
        body.len()
    );
    socket.write_all(resp.as_bytes()).await?;
    socket.flush().await
}

/// What the loopback listener is rendering a page for. Carried instead of a pre-rendered string so
/// the two states share one template.
#[derive(Clone, Copy)]
enum CallbackOutcome<'a> {
    Success,
    Failure {
        error: &'a str,
        description: Option<&'a str>,
    },
}

/// The Fern leaf, as inline SVG. Everything in these pages is inlined on purpose: the loopback
/// listener has no CDN behind it, and a hosted asset is one corp proxy away from a broken image on
/// the last screen of `auth login`.
const FERN_LEAF_SVG: &str = "<svg viewBox=\"0 0 167 164\" aria-hidden=\"true\"><path fill=\"currentColor\" d=\"M149.383 80.2222C138.594 71.101 122.341 67.4445 107.936 78.0925C107.273 78.5747 106.449 77.751 106.952 77.1081C110.367 72.7082 114.325 67.9668 117.519 63.2053C120.774 58.3233 125.636 54.8275 131.241 53.1198C161.076 44.079 152.116 0 152.116 0C152.116 0 106.027 2.97342 111.713 42.7329C112.657 49.3829 110.889 56.1535 106.731 61.4374C101.628 67.8865 95.7008 74.0543 91.4014 78.5144C90.4973 79.4386 88.9705 78.5546 89.3321 77.309C93.4909 63.3058 96.5246 41.648 82.1195 27.685L61.848 10.849L57.9504 15.9922C46.3581 31.2812 49.7534 52.8385 65.0625 64.4108C73.8422 71.0407 77.8201 78.2533 77.1973 86.169C76.8156 90.9104 74.6659 95.3505 71.4514 98.8663C65.4041 105.496 59.7586 112.608 55.3989 120.846C54.7962 121.991 53.0483 121.549 53.1086 120.243C53.7314 106.641 52.4255 75.983 29.5221 65.0336L3.88635 55.1289L1.89737 61.0556C-4.55174 80.182 5.99588 100.614 25.1021 107.104C41.7171 112.749 47.6439 123.457 43.6458 139.51C43.465 140.092 40.572 156.627 40.9738 163.96H59.3969C60.0198 152.589 71.9536 145.115 82.3003 149.756C85.2135 151.062 88.207 152.93 91.2809 155.341C107.755 168.32 132.025 165.246 144.983 148.752L148.68 144.05L125.375 127.315C109.383 114.738 88.0463 120.424 72.255 131.192C70.929 132.096 69.2414 130.65 69.9847 129.203C89.0709 91.7542 113.883 91.8346 123.607 100.152C135.4 110.238 153.261 108.429 163.266 96.5961L166.139 93.2007L149.363 80.2222H149.383Z\"/></svg>";

/// The pages the loopback listener serves when no hosted page is configured. Self-contained: no
/// external stylesheet, font, or image request, so it renders identically offline and behind a
/// proxy.
fn render_callback_page(outcome: CallbackOutcome<'_>) -> String {
    let (title, glyph, heading, detail) = match outcome {
        CallbackOutcome::Success => (
            "Authentication complete",
            "&#10003;",
            "You're all set",
            "The CLI received your authorization. You can close this tab and return to your terminal."
                .to_string(),
        ),
        CallbackOutcome::Failure { error, description } => (
            "Authentication failed",
            "&#33;",
            "Authorization didn't complete",
            match description {
                Some(description) => format!(
                    "{} (<span class=\"code\">{}</span>) Close this tab and run <span class=\"code\">auth login</span> again.",
                    html_escape(description),
                    html_escape(error)
                ),
                None => format!(
                    "The authorization server returned <span class=\"code\">{}</span>. Close this tab and run <span class=\"code\">auth login</span> again.",
                    html_escape(error)
                ),
            },
        ),
    };
    let status_class = match outcome {
        CallbackOutcome::Success => "ok",
        CallbackOutcome::Failure { .. } => "bad",
    };
    format!(
        "<!DOCTYPE html>\n<html lang=\"en\"><head><meta charset=\"utf-8\">\
<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\
<meta name=\"robots\" content=\"noindex\"><title>{title}</title><style>\
:root{{--bg:oklch(99.56% 0.0078 139.44);--fg:oklch(16.16% 0.021 144.53);--muted:#6b7280;\
--card:#fff;--border:rgba(0,0,0,.08);--fern:oklch(62.42% 0.1929 143.94);--bad:#dc2626}}\
@media(prefers-color-scheme:dark){{:root{{--bg:oklch(16.16% 0.021 144.53);\
--fg:oklch(99.56% 0.0078 139.44);--muted:#9ca3af;--card:rgba(255,255,255,.04);\
--border:rgba(255,255,255,.1)}}}}\
*{{box-sizing:border-box}}body{{margin:0;min-height:100vh;display:flex;align-items:center;\
justify-content:center;padding:24px;background:var(--bg);color:var(--fg);\
font:16px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif}}\
.card{{width:100%;max-width:420px;padding:32px;text-align:center;background:var(--card);\
border:1px solid var(--border);border-radius:16px}}\
.glyph{{width:44px;height:44px;margin:0 auto 20px;display:flex;align-items:center;\
justify-content:center;border-radius:50%;font-size:22px;color:#fff}}\
.glyph.ok{{background:var(--fern)}}.glyph.bad{{background:var(--bad)}}\
h1{{margin:0 0 8px;font-size:20px;font-weight:600;letter-spacing:-.01em}}\
p{{margin:0;color:var(--muted);font-size:14px}}\
.code{{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;\
padding:1px 5px;border-radius:5px;background:var(--border);color:var(--fg)}}\
.footer{{margin-top:28px;padding-top:20px;border-top:1px solid var(--border)}}\
.footer a{{display:inline-flex;align-items:center;gap:6px;color:var(--muted);\
font-size:12px;text-decoration:none}}.footer a:hover{{color:var(--fern)}}\
.footer svg{{width:12px;height:12px}}</style></head>\
<body><main class=\"card\"><div class=\"glyph {status_class}\">{glyph}</div>\
<h1>{heading}</h1><p>{detail}</p>\
<div class=\"footer\"><a href=\"https://buildwithfern.com?utm_source=cli&amp;utm_medium=cli\" \
target=\"_blank\" rel=\"noreferrer\">Built with {FERN_LEAF_SVG} Fern</a></div>\
</main></body></html>"
    )
}

/// Escape text interpolated into the built-in pages. `error` / `error_description` come off the
/// query string, so they are attacker-influenced in the same way any callback parameter is.
fn html_escape(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    for ch in value.chars() {
        match ch {
            '&' => escaped.push_str("&amp;"),
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '"' => escaped.push_str("&quot;"),
            '\'' => escaped.push_str("&#39;"),
            _ => escaped.push(ch),
        }
    }
    escaped
}

fn status_phrase(s: u16) -> &'static str {
    match s {
        200 => "OK",
        302 => "Found",
        400 => "Bad Request",
        404 => "Not Found",
        _ => "Status",
    }
}

// ---------------------------------------------------------------------------
// OAuth2KeyringProvider — request-time provider used by both flows
// ---------------------------------------------------------------------------

/// Reads the access token from the active keyring, refreshes it when
/// expired via `token_url`, and applies `Authorization: Bearer <…>`.
///
/// Memoises the resolved token per process via [`OnceLock`] so repeated
/// `apply()` calls in the same invocation never re-hit the keyring or
/// the network.
pub struct OAuth2KeyringProvider {
    scheme_name: String,
    cli_name: String,
    token_url: String,
    client_id: String,
    refresh_params: ExtraParams,
    cached: OnceLock<Result<SecretString, String>>,
}

impl std::fmt::Debug for OAuth2KeyringProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("OAuth2KeyringProvider")
            .field("scheme_name", &self.scheme_name)
            .field("cli_name", &self.cli_name)
            .field("token_url", &self.token_url)
            .finish()
    }
}

impl OAuth2KeyringProvider {
    pub fn new(
        scheme_name: &str,
        cli_name: &str,
        token_url: &str,
        client_id: &str,
    ) -> Self {
        Self {
            scheme_name: scheme_name.to_string(),
            cli_name: cli_name.to_string(),
            token_url: token_url.to_string(),
            client_id: client_id.to_string(),
            refresh_params: Vec::new(),
            cached: OnceLock::new(),
        }
    }

    /// Attach extra literal parameters (e.g. `audience`) to the refresh-token request.
    /// Defaults to none, so existing callers are unaffected.
    pub fn with_refresh_params(mut self, params: ExtraParams) -> Self {
        self.refresh_params = params;
        self
    }

    fn resolve(&self) -> Result<SecretString, CliError> {
        let result = self.cached.get_or_init(|| {
            tokio::task::block_in_place(|| {
                tokio::runtime::Handle::current()
                    .block_on(self.resolve_async())
                    .map(SecretString::from)
                    .map_err(|e| e.to_string())
            })
        });
        match result {
            Ok(s) => Ok(s.clone()),
            Err(m) => Err(CliError::Auth(m.clone())),
        }
    }

    async fn resolve_async(&self) -> Result<String, CliError> {
        let store = active_store();
        let account = crate::profiles::keyring_account(&self.scheme_name);
        let raw = store.get(&self.cli_name, &account)?.ok_or_else(|| {
            CliError::Auth(format!(
                "Not logged in. Run `{} auth login` to authenticate.",
                self.cli_name
            ))
        })?;

        let bundle = TokenBundle::parse_or_raw(&raw);

        if !bundle.is_expired() {
            return Ok(bundle.access_token);
        }

        let Some(refresh) = bundle.refresh_token.as_deref() else {
            return Err(CliError::Auth(format!(
                "Your session has expired and no refresh token is cached. Run `{} auth login` again.",
                self.cli_name
            )));
        };

        // Refresh via token_url. RFC 6749 §6.
        let http = token_http_client()?;
        let mut form: Vec<(String, String)> = vec![
            ("grant_type".to_string(), "refresh_token".to_string()),
            ("client_id".to_string(), self.client_id.clone()),
            ("refresh_token".to_string(), refresh.to_string()),
        ];
        extend_with_extra(&mut form, &self.refresh_params, &["grant_type", "client_id", "refresh_token"]);
        let resp = http
            .post(&self.token_url)
            .form(&form)
            .send()
            .await
            .map_err(|e| CliError::Auth(format!("refresh token request failed: {e}")))?;
        let status = resp.status();
        let body = resp
            .text()
            .await
            .map_err(|e| CliError::Auth(format!("refresh token response body: {e}")))?;
        if !status.is_success() {
            // ADR-0008 § refresh-fails: wipe the keyring entry and tell
            // the user to log in again.
            let _ = store.delete(&self.cli_name, &account);
            let detail = parse_oauth_error_body(&body)
                .and_then(|e| e.error_description.or(e.error))
                .unwrap_or_else(|| truncate_body(&body));
            return Err(CliError::Auth(format!(
                "Your session has expired ({detail}). Run `{} auth login` again.",
                self.cli_name
            )));
        }
        let ok: TokenSuccessBody = serde_json::from_str(&body).map_err(|e| {
            CliError::Auth(format!("refresh response not JSON: {e}"))
        })?;
        let new_bundle = TokenBundle::from_token_response(
            &ok.access_token,
            ok.refresh_token.as_deref().or(Some(refresh)),
            ok.expires_in,
        );
        store.set(&self.cli_name, &account, &new_bundle.to_keyring_value()?)?;
        Ok(new_bundle.access_token)
    }
}

impl AuthProvider for OAuth2KeyringProvider {
    fn name(&self) -> &str {
        &self.scheme_name
    }

    fn has_credentials(&self) -> bool {
        active_store()
            .get(
                &self.cli_name,
                &crate::profiles::keyring_account(&self.scheme_name),
            )
            .ok()
            .flatten()
            .map(|v| !v.is_empty())
            .unwrap_or(false)
    }

    /// Every credential this provider can offer is one `auth login` stored in
    /// the profile-namespaced keyring account — there is no env/flag rung — so
    /// "has credentials" and "has *stored* credentials" are the same question.
    /// Without this override the trait default (`false`) hid OAuth login
    /// tokens from the `--profile` preference pass in
    /// [`AnyAuthProvider`](crate::auth::AnyAuthProvider) /
    /// [`RoutingAuthProvider`](crate::auth::RoutingAuthProvider), which then
    /// picked an earlier env-backed scheme.
    fn has_stored_credentials(&self) -> bool {
        self.has_credentials()
    }

    fn credential_hints(&self) -> Vec<String> {
        vec![format!(
            "keyring entry {}:{} (populated by `{} auth login`)",
            self.cli_name,
            crate::profiles::keyring_account(&self.scheme_name),
            self.cli_name
        )]
    }

    fn apply(
        &self,
        request: reqwest::RequestBuilder,
        _endpoint: &EndpointAuthMetadata,
    ) -> Result<reqwest::RequestBuilder, CliError> {
        let token = self.resolve()?;
        let mut value = String::with_capacity(7 + token.expose_secret().len());
        value.push_str("Bearer ");
        value.push_str(token.expose_secret());
        let mut header = reqwest::header::HeaderValue::from_str(&value)
            .map_err(|e| CliError::Auth(format!("invalid bearer token: {e}")))?;
        header.set_sensitive(true);
        Ok(request.header(reqwest::header::AUTHORIZATION, header))
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::keyring_store::{set_active_store, KeyringStore, MockKeyringStore};
    use serial_test::serial;
    use std::sync::atomic::{AtomicU32, Ordering};
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    // `TokenBundle` roundtrip / raw-fallback / expiry tests live in
    // `oauth_common::tests` — the canonical home for that type.

    #[test]
    fn device_code_validates_required_fields() {
        let flow = DeviceCodeLoginFlow::new("OAuth2");
        let err = flow.validate().unwrap_err();
        assert!(matches!(err, CliError::Validation(_)));
    }

    #[test]
    fn device_code_flow_type_and_scheme() {
        let f = DeviceCodeLoginFlow::new("OAuth2")
            .client_id("x")
            .device_authorization_url("https://d")
            .token_url("https://t");
        assert_eq!(f.flow_type(), "device-code");
        assert_eq!(f.scheme_name(), "OAuth2");
    }

    #[tokio::test(flavor = "multi_thread")]
    #[serial]
    async fn device_code_polling_succeeds_on_third_try() {
        let server = MockServer::start().await;
        let mock_store = Arc::new(MockKeyringStore::new());
        set_active_store(mock_store.clone());

        // Device-authorization endpoint returns short interval to keep the test fast.
        Mock::given(method("POST"))
            .and(path("/device"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "device_code": "dev-code-xyz",
                "user_code": "ABCD-1234",
                "verification_uri": "https://example.com/device",
                "expires_in": 600,
                "interval": 0,
            })))
            .expect(1)
            .mount(&server)
            .await;

        // Token endpoint: pending, pending, success.
        let counter = Arc::new(AtomicU32::new(0));
        let c = counter.clone();
        Mock::given(method("POST"))
            .and(path("/token"))
            .respond_with(move |_req: &wiremock::Request| {
                let n = c.fetch_add(1, Ordering::SeqCst);
                if n < 2 {
                    ResponseTemplate::new(400).set_body_json(serde_json::json!({
                        "error": "authorization_pending"
                    }))
                } else {
                    ResponseTemplate::new(200).set_body_json(serde_json::json!({
                        "access_token": "acc-123",
                        "refresh_token": "ref-xyz",
                        "expires_in": 3600
                    }))
                }
            })
            .expect(3)
            .mount(&server)
            .await;

        let flow = DeviceCodeLoginFlow::new("OAuth2")
            .client_id("cli-id")
            .device_authorization_url(format!("{}/device", server.uri()))
            .token_url(format!("{}/token", server.uri()));

        let ctx = LoginContext {
            cli_name: "my-cli".to_string(),
            no_browser: true,
        };
        flow.run(&ctx).expect("device-code flow should succeed");

        let stored = mock_store.get("my-cli", "OAuth2").unwrap().unwrap();
        let bundle: TokenBundle = serde_json::from_str(&stored).unwrap();
        assert_eq!(bundle.access_token, "acc-123");
        assert_eq!(bundle.refresh_token.as_deref(), Some("ref-xyz"));
        assert!(bundle.expires_at.is_some());
    }

    #[tokio::test(flavor = "multi_thread")]
    #[serial]
    async fn device_code_handles_slow_down_increases_interval() {
        let server = MockServer::start().await;
        set_active_store(Arc::new(MockKeyringStore::new()));

        Mock::given(method("POST"))
            .and(path("/device"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "device_code": "dc",
                "user_code": "X",
                "verification_uri": "https://e",
                "expires_in": 600,
                "interval": 0,
            })))
            .mount(&server)
            .await;

        let counter = Arc::new(AtomicU32::new(0));
        let c = counter.clone();
        Mock::given(method("POST"))
            .and(path("/token"))
            .respond_with(move |_req: &wiremock::Request| {
                let n = c.fetch_add(1, Ordering::SeqCst);
                match n {
                    0 => ResponseTemplate::new(400)
                        .set_body_json(serde_json::json!({ "error": "slow_down" })),
                    _ => ResponseTemplate::new(200).set_body_json(serde_json::json!({
                        "access_token": "ok", "expires_in": 60
                    })),
                }
            })
            .mount(&server)
            .await;

        let flow = DeviceCodeLoginFlow::new("OAuth2")
            .client_id("c")
            .device_authorization_url(format!("{}/device", server.uri()))
            .token_url(format!("{}/token", server.uri()));
        flow.run(&LoginContext {
            cli_name: "my-cli".to_string(),
            no_browser: true,
        })
        .unwrap();
    }

    #[tokio::test(flavor = "multi_thread")]
    #[serial]
    async fn device_code_fails_on_access_denied() {
        let server = MockServer::start().await;
        set_active_store(Arc::new(MockKeyringStore::new()));

        Mock::given(method("POST"))
            .and(path("/device"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "device_code": "dc",
                "user_code": "X",
                "verification_uri": "https://e",
                "expires_in": 600,
                "interval": 0,
            })))
            .mount(&server)
            .await;
        Mock::given(method("POST"))
            .and(path("/token"))
            .respond_with(ResponseTemplate::new(400).set_body_json(serde_json::json!({
                "error": "access_denied"
            })))
            .mount(&server)
            .await;

        let flow = DeviceCodeLoginFlow::new("OAuth2")
            .client_id("c")
            .device_authorization_url(format!("{}/device", server.uri()))
            .token_url(format!("{}/token", server.uri()));
        let err = flow
            .run(&LoginContext {
                cli_name: "my-cli".to_string(),
                no_browser: true,
            })
            .unwrap_err();
        let msg = format!("{err}");
        assert!(msg.to_lowercase().contains("denied"));
    }

    // ---------- OAuth2KeyringProvider ----------

    #[tokio::test(flavor = "multi_thread")]
    #[serial]
    async fn provider_uses_cached_unexpired_token() {
        let mock = Arc::new(MockKeyringStore::new());
        let bundle = TokenBundle::from_token_response("cached-acc", Some("r"), Some(3600));
        mock.set("my-cli", "OAuth2", &bundle.to_keyring_value().unwrap())
            .unwrap();
        set_active_store(mock);

        let p = OAuth2KeyringProvider::new("OAuth2", "my-cli", "https://unused", "client");
        let client = reqwest::Client::new();
        let req = client.get("https://example.com");
        let r = p
            .apply(req, &EndpointAuthMetadata::unspecified())
            .unwrap()
            .build()
            .unwrap();
        let auth = r.headers().get("authorization").unwrap().to_str().unwrap();
        assert_eq!(auth, "Bearer cached-acc");
    }

    #[tokio::test(flavor = "multi_thread")]
    #[serial]
    async fn provider_refreshes_expired_token() {
        let server = MockServer::start().await;
        let mock = Arc::new(MockKeyringStore::new());
        let mut expired = TokenBundle::from_token_response("old", Some("ref-1"), Some(3600));
        expired.expires_at = Some(0); // forcibly expired
        mock.set("my-cli", "OAuth2", &expired.to_keyring_value().unwrap()).unwrap();
        set_active_store(mock.clone());

        Mock::given(method("POST"))
            .and(path("/token"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "access_token": "new-acc",
                "refresh_token": "ref-2",
                "expires_in": 3600
            })))
            .expect(1)
            .mount(&server)
            .await;

        let p = OAuth2KeyringProvider::new(
            "OAuth2",
            "my-cli",
            &format!("{}/token", server.uri()),
            "client",
        );
        let r = p
            .apply(reqwest::Client::new().get("https://example.com"), &EndpointAuthMetadata::unspecified())
            .unwrap()
            .build()
            .unwrap();
        let auth = r.headers().get("authorization").unwrap().to_str().unwrap();
        assert_eq!(auth, "Bearer new-acc");

        // New tokens persisted.
        let stored: TokenBundle = serde_json::from_str(&mock.get("my-cli", "OAuth2").unwrap().unwrap()).unwrap();
        assert_eq!(stored.access_token, "new-acc");
        assert_eq!(stored.refresh_token.as_deref(), Some("ref-2"));
    }

    #[tokio::test(flavor = "multi_thread")]
    #[serial]
    async fn provider_wipes_keyring_when_refresh_fails() {
        let server = MockServer::start().await;
        let mock = Arc::new(MockKeyringStore::new());
        let mut expired = TokenBundle::from_token_response("old", Some("stale"), Some(3600));
        expired.expires_at = Some(0);
        mock.set("my-cli", "OAuth2", &expired.to_keyring_value().unwrap()).unwrap();
        set_active_store(mock.clone());

        Mock::given(method("POST"))
            .and(path("/token"))
            .respond_with(ResponseTemplate::new(400).set_body_json(serde_json::json!({
                "error": "invalid_grant",
                "error_description": "refresh token revoked"
            })))
            .mount(&server)
            .await;

        let p = OAuth2KeyringProvider::new(
            "OAuth2",
            "my-cli",
            &format!("{}/token", server.uri()),
            "client",
        );
        let err = p
            .apply(reqwest::Client::new().get("https://example.com"), &EndpointAuthMetadata::unspecified())
            .unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("session has expired"));
        assert!(msg.contains("auth login"));

        // Keyring entry was wiped on the failed refresh — user has to log in again.
        assert!(mock.get("my-cli", "OAuth2").unwrap().is_none());
    }

    #[tokio::test(flavor = "multi_thread")]
    #[serial]
    async fn provider_has_credentials_returns_true_when_keyring_populated() {
        let mock = Arc::new(MockKeyringStore::new());
        mock.set("my-cli", "OAuth2", "anything").unwrap();
        set_active_store(mock);
        let p = OAuth2KeyringProvider::new("OAuth2", "my-cli", "https://x", "c");
        assert!(p.has_credentials());
    }

    #[tokio::test(flavor = "multi_thread")]
    #[serial]
    async fn provider_has_credentials_false_when_keyring_empty() {
        set_active_store(Arc::new(MockKeyringStore::new()));
        let p = OAuth2KeyringProvider::new("OAuth2", "my-cli", "https://x", "c");
        assert!(!p.has_credentials());
    }

    /// Every rung this provider reads is the profile's keyring account, so the
    /// stored-credentials predicate has to track `has_credentials` exactly.
    /// Inheriting the trait default (`false`) made OAuth login tokens invisible
    /// to the `--profile` preference pass.
    #[tokio::test(flavor = "multi_thread")]
    #[serial]
    async fn provider_stored_credentials_tracks_keyring_presence() {
        let mock = Arc::new(MockKeyringStore::new());
        mock.set("my-cli", "OAuth2", "anything").unwrap();
        set_active_store(mock);
        let p = OAuth2KeyringProvider::new("OAuth2", "my-cli", "https://x", "c");
        assert!(p.has_stored_credentials());

        set_active_store(Arc::new(MockKeyringStore::new()));
        assert!(!p.has_stored_credentials());
    }

    /// The end-to-end shape of the bug: a CLI offering env-backed basic auth
    /// first and an OAuth login flow second. Under `--profile` the stored login
    /// token must win; under ambient selection spec order still does.
    #[tokio::test(flavor = "multi_thread")]
    #[serial]
    async fn named_profile_prefers_login_token_over_env_scheme() {
        use crate::auth::compose::AnyAuthProvider;
        use crate::auth::credential::AuthCredentialSource;
        use crate::auth::provider::EndpointAuthMetadata;
        use crate::auth::schemes::BasicAuthProvider;
        use crate::auth::test_helpers::{auth_header, req, GlobalAuthStateGuard};
        use crate::profiles::SelectionSource;

        let composed = || {
            let basic: DynAuthProvider = Arc::new(BasicAuthProvider::new(
                "basic",
                AuthCredentialSource::from_env("FERN_LOGIN_PRECEDENCE_USER"),
                AuthCredentialSource::from_env("FERN_LOGIN_PRECEDENCE_PASSWORD"),
            ));
            let login: DynAuthProvider = Arc::new(OAuth2KeyringProvider::new(
                "OAuth2",
                "my-cli",
                "https://x",
                "c",
            ));
            AnyAuthProvider::new(vec![basic, login])
        };
        let state = |source| {
            let mut guard = GlobalAuthStateGuard::new();
            guard
                .install_profile("prod", source)
                .install_keyring("my-cli", &crate::profiles::keyring_account("OAuth2"), "tok")
                .set_env("FERN_LOGIN_PRECEDENCE_USER", "user")
                .set_env("FERN_LOGIN_PRECEDENCE_PASSWORD", "password");
            guard
        };

        {
            let _flag = state(SelectionSource::Flag);
            let out = composed()
                .apply(req(), &EndpointAuthMetadata::unspecified())
                .unwrap();
            assert_eq!(auth_header(out).as_deref(), Some("Bearer tok"));
        }
        {
            let _active = state(SelectionSource::Active);
            let out = composed()
                .apply(req(), &EndpointAuthMetadata::unspecified())
                .unwrap();
            assert!(auth_header(out).unwrap().starts_with("Basic "));
        }
    }

    // ---------- Login-flow → request-time provider wiring ----------
    //
    // These verify the two behaviors ElevenLabs asked for, tied to the *new* public-client
    // login flows: the flow's `build_auth_provider` must produce a provider that
    //   1. injects `Authorization: Bearer <token>` on requests, and
    //   2. automatically refreshes an expired token against the flow's configured `token_url`.
    // `CliApp::login_flow` registers exactly this provider, so this is the request-time path a
    // generated CLI runs after `auth login`.

    #[tokio::test(flavor = "multi_thread")]
    #[serial]
    async fn pkce_login_flow_provider_injects_bearer() {
        let mock = Arc::new(MockKeyringStore::new());
        let bundle = TokenBundle::from_token_response("pkce-acc", Some("r"), Some(3600));
        mock.set("my-cli", "OAuth2", &bundle.to_keyring_value().unwrap())
            .unwrap();
        set_active_store(mock);

        let flow = PkceLoginFlow::new("OAuth2")
            .client_id("public-client")
            .authorization_url("https://auth.example.com/authorize")
            .token_url("https://auth.example.com/token");
        let provider = flow
            .build_auth_provider("my-cli")
            .expect("PKCE flow must register a request-time auth provider");

        let req = provider
            .apply(
                reqwest::Client::new().get("https://example.com"),
                &EndpointAuthMetadata::unspecified(),
            )
            .unwrap()
            .build()
            .unwrap();
        let auth = req.headers().get("authorization").unwrap().to_str().unwrap();
        assert_eq!(auth, "Bearer pkce-acc");
    }

    #[tokio::test(flavor = "multi_thread")]
    #[serial]
    async fn device_code_login_flow_provider_refreshes_via_token_url() {
        let server = MockServer::start().await;
        let mock = Arc::new(MockKeyringStore::new());
        let mut expired = TokenBundle::from_token_response("old", Some("ref-1"), Some(3600));
        expired.expires_at = Some(0); // forcibly expired
        mock.set("my-cli", "OAuth2", &expired.to_keyring_value().unwrap())
            .unwrap();
        set_active_store(mock.clone());

        Mock::given(method("POST"))
            .and(path("/token"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "access_token": "device-refreshed-acc",
                "refresh_token": "ref-2",
                "expires_in": 3600
            })))
            .expect(1)
            .mount(&server)
            .await;

        let flow = DeviceCodeLoginFlow::new("OAuth2")
            .client_id("public-client")
            .device_authorization_url("https://auth.example.com/device/code")
            .token_url(&format!("{}/token", server.uri()));
        let provider = flow
            .build_auth_provider("my-cli")
            .expect("device-code flow must register a request-time auth provider");

        let req = provider
            .apply(
                reqwest::Client::new().get("https://example.com"),
                &EndpointAuthMetadata::unspecified(),
            )
            .unwrap()
            .build()
            .unwrap();
        let auth = req.headers().get("authorization").unwrap().to_str().unwrap();
        assert_eq!(auth, "Bearer device-refreshed-acc");

        // The refreshed tokens were persisted for the next invocation.
        let stored: TokenBundle =
            serde_json::from_str(&mock.get("my-cli", "OAuth2").unwrap().unwrap()).unwrap();
        assert_eq!(stored.access_token, "device-refreshed-acc");
        assert_eq!(stored.refresh_token.as_deref(), Some("ref-2"));
    }

    // ---------- Extra params (audience) passthrough ----------

    #[test]
    fn pkce_authorize_url_appends_extra_authorization_params() {
        let f = PkceLoginFlow::new("OAuth2")
            .client_id("id")
            .authorization_url("https://auth.example.com/authorize")
            .token_url("https://auth.example.com/token")
            .authorization_params([("audience", "https://api.acme.io")]);
        let url = f.build_authorize_url("state123", "challenge123");
        assert!(
            url.contains("audience=https%3A%2F%2Fapi.acme.io"),
            "audience missing from authorize URL: {url}"
        );
    }

    #[test]
    fn pkce_authorize_url_ignores_reserved_param_override() {
        // A user must not be able to clobber protocol-reserved keys via extra params.
        let f = PkceLoginFlow::new("OAuth2")
            .client_id("real-id")
            .authorization_url("https://auth.example.com/authorize")
            .token_url("https://auth.example.com/token")
            .authorization_params([("client_id", "attacker"), ("audience", "https://api.acme.io")]);
        let url = f.build_authorize_url("s", "c");
        assert!(url.contains("client_id=real-id"), "reserved client_id was overridden: {url}");
        assert!(!url.contains("client_id=attacker"), "attacker client_id leaked: {url}");
        assert!(url.contains("audience=https%3A%2F%2Fapi.acme.io"));
    }

    #[test]
    fn extend_with_extra_appends_and_skips_reserved() {
        // Shared helper used to build the token / device-authorization / refresh request bodies.
        let extra: ExtraParams = vec![
            ("audience".to_string(), "https://api.acme.io".to_string()),
            ("grant_type".to_string(), "attacker".to_string()), // reserved — must be dropped
        ];
        let mut form: Vec<(String, String)> = vec![("grant_type".to_string(), "refresh_token".to_string())];
        extend_with_extra(&mut form, &extra, &["grant_type", "client_id", "refresh_token"]);
        assert!(form.contains(&("audience".to_string(), "https://api.acme.io".to_string())));
        // The reserved `grant_type` was not clobbered or duplicated.
        assert_eq!(form.iter().filter(|(k, _)| k == "grant_type").count(), 1);
        assert!(form.iter().all(|(_, v)| v != "attacker"));
    }

    // ---------- PKCE ----------

    #[test]
    fn code_verifier_is_url_safe_and_long_enough() {
        let v = generate_code_verifier();
        assert!(v.len() >= 43 && v.len() <= 128, "verifier len {}", v.len());
        // URL-safe alphabet: A-Z a-z 0-9 - _ (no padding).
        assert!(v.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
    }

    #[test]
    fn code_challenge_s256_matches_rfc_example() {
        // RFC 7636 Appendix B example:
        // code_verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
        // code_challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        let v = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        assert_eq!(
            code_challenge_s256(v),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn pkce_authorize_url_includes_all_required_params() {
        let f = PkceLoginFlow::new("OAuth2")
            .client_id("my-id")
            .authorization_url("https://auth.example.com/authorize")
            .token_url("https://auth.example.com/token")
            .scopes(["read", "write"])
            .redirect_port(4711);
        let url = f.build_authorize_url("state-abc", "challenge-xyz");
        assert!(url.contains("response_type=code"));
        assert!(url.contains("client_id=my-id"));
        assert!(url.contains("redirect_uri=http%3A%2F%2F127.0.0.1%3A4711%2Fcallback"));
        assert!(url.contains("state=state-abc"));
        assert!(url.contains("code_challenge=challenge-xyz"));
        assert!(url.contains("code_challenge_method=S256"));
        assert!(url.contains("scope=read+write"));
    }

    #[test]
    fn pkce_pinned_redirect_port_is_honored() {
        let flow = PkceLoginFlow::new("OAuth2")
            .client_id("id")
            .authorization_url("https://auth.example.com/authorize")
            .token_url("https://auth.example.com/token")
            .redirect_port(8484);
        assert_eq!(flow.redirect_port, Some(8484));
        assert_eq!(flow.redirect_uri(), "http://127.0.0.1:8484/callback");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn bind_loopback_listener_uses_first_free_port() {
        // Occupy the first candidate; the loop must fall through to the next free one.
        let occupied = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let taken = occupied.local_addr().unwrap().port();
        let free = {
            let l = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
            l.local_addr().unwrap().port() // freed when `l` drops at end of block
        };

        let listener = bind_loopback_listener("127.0.0.1", &[taken, free]).await.unwrap();
        assert_eq!(
            listener.local_addr().unwrap().port(),
            free,
            "should skip the occupied port and bind the next free one"
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn bind_loopback_listener_errors_when_all_taken() {
        // Hold both candidate ports for the duration of the call.
        let a = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let b = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let pa = a.local_addr().unwrap().port();
        let pb = b.local_addr().unwrap().port();

        let err = bind_loopback_listener("127.0.0.1", &[pa, pb]).await.unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains(&pa.to_string()) && msg.contains(&pb.to_string()), "error should name all ports: {msg}");
    }

    #[test]
    fn pkce_redirect_uri_honors_configured_host_and_path() {
        // localhost + custom path must flow verbatim into the redirect URI (exact-match with the
        // authorization server's registration); default is 127.0.0.1 + /callback.
        let localhost = PkceLoginFlow::new("OAuth2")
            .client_id("id")
            .authorization_url("https://a")
            .token_url("https://t")
            .redirect_host("localhost")
            .redirect_path("/oauth/callback")
            .redirect_port(8484);
        assert_eq!(localhost.redirect_uri(), "http://localhost:8484/oauth/callback");

        let default = PkceLoginFlow::new("OAuth2").redirect_port(8484);
        assert_eq!(default.redirect_uri(), "http://127.0.0.1:8484/callback");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn bind_loopback_listener_binds_localhost() {
        // localhost must be a bindable loopback host (resolves to 127.0.0.1 or ::1 on the same box).
        let listener = bind_loopback_listener("localhost", &[0]).await.unwrap();
        assert_ne!(listener.local_addr().unwrap().port(), 0);
    }

    #[test]
    fn pkce_redirect_ports_sets_primary_and_backups() {
        let flow = PkceLoginFlow::new("OAuth2")
            .client_id("id")
            .authorization_url("https://auth.example.com/authorize")
            .token_url("https://auth.example.com/token")
            .redirect_ports([8484, 8483, 8482]);
        assert_eq!(flow.redirect_port, Some(8484));
        assert_eq!(flow.redirect_backup_ports, vec![8483, 8482]);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn pkce_ephemeral_port_binds_nonzero_and_flows_into_redirect_uri() {
        // No redirect_port pinned → ephemeral. Mirrors run_pkce's bind + resolve logic and asserts
        // the OS-assigned port flows consistently into both redirect_uri and the authorize URL.
        let mut flow = PkceLoginFlow::new("OAuth2")
            .client_id("id")
            .authorization_url("https://auth.example.com/authorize")
            .token_url("https://auth.example.com/token");
        assert!(flow.redirect_port.is_none(), "default must be ephemeral");

        let listener = TcpListener::bind(("127.0.0.1", flow.redirect_port.unwrap_or(0)))
            .await
            .unwrap();
        let port = listener.local_addr().unwrap().port();
        assert_ne!(port, 0, "OS should assign a nonzero ephemeral port");
        flow.redirect_port = Some(port);

        assert_eq!(flow.redirect_uri(), format!("http://127.0.0.1:{port}/callback"));
        let url = flow.build_authorize_url("s", "c");
        assert!(
            url.contains(&format!("127.0.0.1%3A{port}%2Fcallback")),
            "authorize URL must carry the bound ephemeral port: {url}"
        );
    }

    #[test]
    fn pkce_authorize_url_appends_with_ampersand_when_query_present() {
        let f = PkceLoginFlow::new("OAuth2")
            .client_id("x")
            .authorization_url("https://auth.example.com/authorize?prompt=login")
            .token_url("https://t");
        let url = f.build_authorize_url("s", "c");
        assert!(url.contains("?prompt=login&response_type=code"));
    }

    #[test]
    fn pkce_validates_required_fields() {
        let f = PkceLoginFlow::new("OAuth2");
        assert!(matches!(f.validate(), Err(CliError::Validation(_))));
    }

    #[test]
    fn pkce_flow_type_and_scheme() {
        let f = PkceLoginFlow::new("OAuth2")
            .client_id("c")
            .authorization_url("https://a")
            .token_url("https://t");
        assert_eq!(f.flow_type(), "pkce");
        assert_eq!(f.scheme_name(), "OAuth2");
    }

    fn pick_free_port() -> u16 {
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let p = l.local_addr().unwrap().port();
        drop(l);
        p
    }

    /// Mirror `run_pkce`'s happy path: accept the callback, then — standing in for a token exchange
    /// and keyring write that succeeded — answer the browser. Tests that assert on the success
    /// response have to go through this, because nothing is written until the caller says so.
    async fn accept_and_confirm(
        listener: &TcpListener,
        expected_path: &str,
        expected_state: &str,
        pages: CallbackPages<'_>,
    ) -> Result<String, CliError> {
        let (code, responder) = accept_callback(listener, expected_path, expected_state, pages).await?;
        responder.success().await;
        Ok(code)
    }

    /// Mirror `run_pkce`'s post-callback failure path: the callback was fine, the login wasn't.
    async fn accept_and_fail(
        listener: &TcpListener,
        expected_path: &str,
        expected_state: &str,
        pages: CallbackPages<'_>,
    ) -> Result<String, CliError> {
        let (code, responder) = accept_callback(listener, expected_path, expected_state, pages).await?;
        responder
            .failure("server_error", Some(POST_CALLBACK_FAILURE_DESCRIPTION))
            .await;
        Ok(code)
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn pkce_loopback_times_out_when_no_callback_arrives() {
        // When the browser never hits /callback (user closed tab, etc.),
        // accept_callback() must return a clear timeout error rather than
        // hanging forever. Drive accept_callback_with_timeout directly
        // with a 100ms cap so the test runs at wall-clock speed instead
        // of waiting the production 5-minute deadline.
        let port = pick_free_port();
        let listener = TcpListener::bind(("127.0.0.1", port)).await.unwrap();
        let err = accept_callback_with_timeout(
            &listener,
            "/callback",
            "state-xyz",
            CallbackPages::default(),
            Duration::from_millis(100),
        )
        .await
        .map(|(code, _responder)| code)
        .expect_err("expected timeout when no browser callback arrives");
        let msg = format!("{err}");
        assert!(
            msg.contains("Timed out") && msg.contains("auth login"),
            "expected timeout error message, got: {msg}"
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn pkce_loopback_handshake_returns_code() {
        let port = pick_free_port();
        let listener = TcpListener::bind(("127.0.0.1", port)).await.unwrap();

        // Spawn the accept task.
        let acceptor = tokio::spawn(async move {
            accept_and_confirm(&listener, "/callback", "state-xyz", CallbackPages::default()).await
        });

        // Act as the browser.
        tokio::time::sleep(Duration::from_millis(50)).await;
        let _ = reqwest::Client::new()
            .get(format!(
                "http://127.0.0.1:{port}/callback?code=auth-code-abc&state=state-xyz"
            ))
            .send()
            .await
            .unwrap();

        assert_eq!(acceptor.await.unwrap().unwrap(), "auth-code-abc");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn pkce_loopback_redirects_to_configured_success_page() {
        let port = pick_free_port();
        let listener = TcpListener::bind(("127.0.0.1", port)).await.unwrap();
        let acceptor = tokio::spawn(async move {
            accept_and_confirm(
                &listener,
                "/callback",
                "state-xyz",
                CallbackPages {
                    success_redirect_url: Some("https://acme.com/cli/welcome"),
                    error_redirect_url: None,
                },
            )
            .await
        });

        tokio::time::sleep(Duration::from_millis(50)).await;
        // No redirect following: the 302 itself is what we assert on.
        let resp = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap()
            .get(format!(
                "http://127.0.0.1:{port}/callback?code=auth-code-abc&state=state-xyz"
            ))
            .send()
            .await
            .unwrap();

        assert_eq!(resp.status().as_u16(), 302);
        assert_eq!(
            resp.headers().get("location").unwrap().to_str().unwrap(),
            "https://acme.com/cli/welcome"
        );
        assert_eq!(acceptor.await.unwrap().unwrap(), "auth-code-abc");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn pkce_loopback_writes_nothing_until_the_caller_answers() {
        // The invariant the responder buys: a valid callback gets *no* response while the caller is
        // still exchanging the code. Drive the browser from a task so we can observe it waiting.
        let port = pick_free_port();
        let listener = TcpListener::bind(("127.0.0.1", port)).await.unwrap();
        let mut browser = tokio::spawn(async move {
            reqwest::Client::new()
                .get(format!("http://127.0.0.1:{port}/callback?code=c&state=s"))
                .send()
                .await
        });

        let (code, responder) = accept_callback(&listener, "/callback", "s", CallbackPages::default())
            .await
            .expect("valid callback");
        assert_eq!(code, "c");

        // Still connected, still unanswered — this is where the token exchange would be running.
        assert!(
            tokio::time::timeout(Duration::from_millis(200), &mut browser)
                .await
                .is_err(),
            "browser was answered before the caller confirmed the login"
        );

        responder.success().await;
        let resp = browser.await.unwrap().unwrap();
        assert_eq!(resp.status().as_u16(), 200);
        assert!(resp.text().await.unwrap().contains("You're all set"));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn pkce_loopback_withholds_the_success_page_until_the_caller_confirms() {
        // The reason the responder exists. `code` and `state` are both valid, so the old listener
        // would have answered `200` here and then let the terminal report a failed token exchange.
        // Now nothing is written until the caller decides, and a caller that failed gets the
        // failure page — on a configured error URL, not the configured success one.
        let port = pick_free_port();
        let listener = TcpListener::bind(("127.0.0.1", port)).await.unwrap();
        let pages = CallbackPages {
            success_redirect_url: Some("https://acme.com/cli/success"),
            error_redirect_url: Some("https://acme.com/cli/error"),
        };
        let acceptor = tokio::spawn(async move { accept_and_fail(&listener, "/callback", "state-xyz", pages).await });

        tokio::time::sleep(Duration::from_millis(50)).await;
        let resp = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap()
            .get(format!(
                "http://127.0.0.1:{port}/callback?code=auth-code-abc&state=state-xyz"
            ))
            .send()
            .await
            .unwrap();

        assert_eq!(resp.status().as_u16(), 302);
        assert_eq!(
            resp.headers().get("location").unwrap().to_str().unwrap(),
            "https://acme.com/cli/error?error=server_error\
             &error_description=The+CLI+could+not+complete+the+login.+Check+your+terminal+for+details."
        );
        // The callback itself was fine — the code came back for the caller to try to redeem.
        assert_eq!(acceptor.await.unwrap().unwrap(), "auth-code-abc");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn pkce_loopback_builtin_failure_page_when_login_fails_after_a_valid_callback() {
        // Same, with no hosted pages configured: the built-in failure page, not the success one.
        let port = pick_free_port();
        let listener = TcpListener::bind(("127.0.0.1", port)).await.unwrap();
        let acceptor = tokio::spawn(async move {
            accept_and_fail(&listener, "/callback", "state-xyz", CallbackPages::default()).await
        });

        tokio::time::sleep(Duration::from_millis(50)).await;
        let resp = reqwest::Client::new()
            .get(format!(
                "http://127.0.0.1:{port}/callback?code=auth-code-abc&state=state-xyz"
            ))
            .send()
            .await
            .unwrap();

        assert_eq!(resp.status().as_u16(), 400);
        let body = resp.text().await.unwrap();
        assert!(body.contains("Authorization didn't complete"), "{body}");
        assert!(!body.contains("You're all set"), "{body}");
        assert_eq!(acceptor.await.unwrap().unwrap(), "auth-code-abc");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn pkce_loopback_falls_back_to_builtin_page_for_unsafe_redirect() {
        let port = pick_free_port();
        let listener = TcpListener::bind(("127.0.0.1", port)).await.unwrap();
        let acceptor = tokio::spawn(async move {
            accept_and_confirm(
                &listener,
                "/callback",
                "state-xyz",
                CallbackPages {
                    success_redirect_url: Some("https://acme.com/\r\nX-Injected: 1"),
                    error_redirect_url: None,
                },
            )
            .await
        });

        tokio::time::sleep(Duration::from_millis(50)).await;
        let resp = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap()
            .get(format!(
                "http://127.0.0.1:{port}/callback?code=auth-code-abc&state=state-xyz"
            ))
            .send()
            .await
            .unwrap();

        assert_eq!(resp.status().as_u16(), 200);
        assert!(resp.headers().get("x-injected").is_none());
        assert!(resp.text().await.unwrap().contains("You're all set"));
        assert!(acceptor.await.unwrap().is_ok());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn pkce_loopback_redirects_to_configured_error_page_with_params() {
        let port = pick_free_port();
        let listener = TcpListener::bind(("127.0.0.1", port)).await.unwrap();
        let acceptor = tokio::spawn(async move {
            accept_and_confirm(
                &listener,
                "/callback",
                "state-xyz",
                CallbackPages {
                    success_redirect_url: None,
                    error_redirect_url: Some("https://acme.com/cli/error"),
                },
            )
            .await
        });

        tokio::time::sleep(Duration::from_millis(50)).await;
        let resp = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap()
            .get(format!(
                "http://127.0.0.1:{port}/callback?error=access_denied&error_description=User%20denied%20the%20request"
            ))
            .send()
            .await
            .unwrap();

        assert_eq!(resp.status().as_u16(), 302);
        assert_eq!(
            resp.headers().get("location").unwrap().to_str().unwrap(),
            "https://acme.com/cli/error?error=access_denied&error_description=User+denied+the+request"
        );
        // The redirect is cosmetic: login still fails, and the terminal still explains why.
        let err = format!("{}", acceptor.await.unwrap().expect_err("denied authorization must fail"));
        assert!(err.contains("access_denied"), "{err}");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn pkce_loopback_error_page_renders_server_error_escaped() {
        let port = pick_free_port();
        let listener = TcpListener::bind(("127.0.0.1", port)).await.unwrap();
        let acceptor = tokio::spawn(async move {
            accept_and_confirm(&listener, "/callback", "state-xyz", CallbackPages::default()).await
        });

        tokio::time::sleep(Duration::from_millis(50)).await;
        let resp = reqwest::Client::new()
            .get(format!(
                "http://127.0.0.1:{port}/callback?error=access_denied&error_description=%3Cscript%3Ealert(1)%3C/script%3E"
            ))
            .send()
            .await
            .unwrap();

        assert_eq!(resp.status().as_u16(), 400);
        let body = resp.text().await.unwrap();
        assert!(body.contains("Authorization didn't complete"), "{body}");
        assert!(body.contains("Built with"), "{body}");
        assert!(!body.contains("<script>"), "{body}");
        assert!(body.contains("&lt;script&gt;"), "{body}");
        assert!(acceptor.await.unwrap().is_err());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn pkce_loopback_redirects_unusable_callback_with_synthesized_error() {
        let port = pick_free_port();
        let listener = TcpListener::bind(("127.0.0.1", port)).await.unwrap();
        let pages = CallbackPages {
            success_redirect_url: Some("https://acme.com/cli/success"),
            error_redirect_url: Some("https://acme.com/cli/error"),
        };
        let acceptor =
            tokio::spawn(async move { accept_and_confirm(&listener, "/callback", "state-xyz", pages).await });

        tokio::time::sleep(Duration::from_millis(50)).await;
        let resp = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap()
            .get(format!("http://127.0.0.1:{port}/callback?code=only-code"))
            .send()
            .await
            .unwrap();

        // The authorization server sent no `error`, so the page gets one synthesized for it —
        // naming the parameter that was actually missing.
        assert_eq!(resp.status().as_u16(), 302);
        assert_eq!(
            resp.headers().get("location").unwrap().to_str().unwrap(),
            "https://acme.com/cli/error?error=invalid_request\
             &error_description=The+callback+was+missing+its+%60state%60+parameter."
        );
        assert!(acceptor.await.unwrap().is_err());
    }

    #[test]
    fn error_redirect_merges_params_into_existing_query_and_precedes_fragment() {
        assert_eq!(
            build_error_redirect("https://acme.com/cli/error", "access_denied", None),
            "https://acme.com/cli/error?error=access_denied"
        );
        assert_eq!(
            build_error_redirect("https://acme.com/cli/error?src=cli", "access_denied", Some("No & yes")),
            "https://acme.com/cli/error?src=cli&error=access_denied&error_description=No+%26+yes"
        );
        assert_eq!(
            build_error_redirect("https://acme.com/cli/error#retry", "invalid_request", None),
            "https://acme.com/cli/error?error=invalid_request#retry"
        );
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn pkce_loopback_handshake_rejects_missing_code() {
        let port = pick_free_port();
        let listener = TcpListener::bind(("127.0.0.1", port)).await.unwrap();
        let acceptor = tokio::spawn(async move {
            accept_and_confirm(&listener, "/callback", "only-state", CallbackPages::default()).await
        });

        tokio::time::sleep(Duration::from_millis(50)).await;
        let _ = reqwest::Client::new()
            .get(format!("http://127.0.0.1:{port}/callback?state=only-state"))
            .send()
            .await
            .unwrap();

        let err = acceptor.await.unwrap().unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("missing"));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn pkce_loopback_handshake_surfaces_authorization_error_param() {
        let port = pick_free_port();
        let listener = TcpListener::bind(("127.0.0.1", port)).await.unwrap();
        let acceptor = tokio::spawn(async move {
            accept_and_confirm(&listener, "/callback", "state-xyz", CallbackPages::default()).await
        });

        tokio::time::sleep(Duration::from_millis(50)).await;
        let _ = reqwest::Client::new()
            .get(format!(
                "http://127.0.0.1:{port}/callback?error=access_denied&error_description=user+denied"
            ))
            .send()
            .await
            .unwrap();

        let err = acceptor.await.unwrap().unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("access_denied"));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn pkce_loopback_ignores_favicon_and_accepts_callback() {
        let port = pick_free_port();
        let listener = TcpListener::bind(("127.0.0.1", port)).await.unwrap();
        let acceptor =
            tokio::spawn(async move { accept_and_confirm(&listener, "/callback", "s1", CallbackPages::default()).await });

        tokio::time::sleep(Duration::from_millis(50)).await;
        let client = reqwest::Client::new();
        // Browser preflight that the listener should ignore.
        let _ = client
            .get(format!("http://127.0.0.1:{port}/favicon.ico"))
            .send()
            .await
            .unwrap();
        let _ = client
            .get(format!(
                "http://127.0.0.1:{port}/callback?code=c1&state=s1"
            ))
            .send()
            .await
            .unwrap();

        assert_eq!(acceptor.await.unwrap().unwrap(), "c1");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn pkce_loopback_honors_custom_callback_path() {
        // A custom registered redirect path (e.g. `/oauth/callback`) must be served by the
        // listener — not just advertised in the authorize URL — or the browser callback 404s and
        // login hangs. The listener accepts the configured path and ignores the default one.
        let port = pick_free_port();
        let listener = TcpListener::bind(("127.0.0.1", port)).await.unwrap();
        let acceptor = tokio::spawn(async move {
            accept_and_confirm(&listener, "/oauth/callback", "s2", CallbackPages::default()).await
        });

        tokio::time::sleep(Duration::from_millis(50)).await;
        let client = reqwest::Client::new();
        // The old default path must now be ignored (404), not treated as the callback.
        let _ = client
            .get(format!("http://127.0.0.1:{port}/callback?code=wrong&state=wrong"))
            .send()
            .await
            .unwrap();
        let _ = client
            .get(format!(
                "http://127.0.0.1:{port}/oauth/callback?code=c2&state=s2"
            ))
            .send()
            .await
            .unwrap();

        assert_eq!(acceptor.await.unwrap().unwrap(), "c2");
    }

    #[tokio::test(flavor = "multi_thread")]
    #[serial]
    async fn pkce_state_mismatch_aborts_and_serves_the_failure_page() {
        // A callback carrying a state we never issued is a possible CSRF. The listener must fail
        // the login *and* answer the browser with the failure page — the success page is written
        // only after this check passes.
        let port = pick_free_port();
        let listener = TcpListener::bind(("127.0.0.1", port)).await.unwrap();
        let acceptor = tokio::spawn(async move {
            accept_and_confirm(&listener, "/callback", "expected-state", CallbackPages::default()).await
        });

        tokio::time::sleep(Duration::from_millis(50)).await;
        let resp = reqwest::Client::new()
            .get(format!(
                "http://127.0.0.1:{port}/callback?code=c&state=attacker-state"
            ))
            .send()
            .await
            .unwrap();

        assert_eq!(resp.status().as_u16(), 400);
        let body = resp.text().await.unwrap();
        assert!(body.contains("Authorization didn't complete"), "{body}");
        assert!(!body.contains("You're all set"), "{body}");
        let err = format!("{}", acceptor.await.unwrap().expect_err("state mismatch must fail"));
        assert!(err.contains("possible CSRF"), "{err}");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn pkce_state_mismatch_redirects_to_the_error_page_without_leaking_the_nonce() {
        // Same check against a configured hosted page: the browser is handed to the *error* page,
        // and neither state value rides along — the one we issued is a per-login nonce.
        let port = pick_free_port();
        let listener = TcpListener::bind(("127.0.0.1", port)).await.unwrap();
        let pages = CallbackPages {
            success_redirect_url: Some("https://acme.com/cli/success"),
            error_redirect_url: Some("https://acme.com/cli/error"),
        };
        let acceptor =
            tokio::spawn(async move { accept_and_confirm(&listener, "/callback", "expected-state", pages).await });

        tokio::time::sleep(Duration::from_millis(50)).await;
        let resp = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap()
            .get(format!(
                "http://127.0.0.1:{port}/callback?code=c&state=attacker-state"
            ))
            .send()
            .await
            .unwrap();

        assert_eq!(resp.status().as_u16(), 302);
        let location = resp.headers().get("location").unwrap().to_str().unwrap().to_string();
        assert_eq!(
            location,
            "https://acme.com/cli/error?error=invalid_request\
             &error_description=The+callback+%60state%60+parameter+did+not+match+the+one+the+CLI+sent."
        );
        assert!(!location.contains("expected-state"), "{location}");
        assert!(!location.contains("attacker-state"), "{location}");
        assert!(acceptor.await.unwrap().is_err());
    }

    #[tokio::test(flavor = "multi_thread")]
    #[serial]
    async fn provider_treats_raw_string_as_unexpired_bearer() {
        // --with-token paste populates the keyring with a raw string,
        // not a JSON bundle. Provider should use it directly.
        let mock = Arc::new(MockKeyringStore::new());
        mock.set("my-cli", "OAuth2", "raw-pasted-token").unwrap();
        set_active_store(mock);
        let p = OAuth2KeyringProvider::new("OAuth2", "my-cli", "https://unused", "client");
        let r = p
            .apply(reqwest::Client::new().get("https://example.com"), &EndpointAuthMetadata::unspecified())
            .unwrap()
            .build()
            .unwrap();
        let auth = r.headers().get("authorization").unwrap().to_str().unwrap();
        assert_eq!(auth, "Bearer raw-pasted-token");
    }
}
