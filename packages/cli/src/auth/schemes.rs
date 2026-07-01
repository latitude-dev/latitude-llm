//! Concrete auth-scheme providers: bearer tokens, HTTP basic, and arbitrary
//! header-bound credentials. Each one is a small wrapper around an
//! [`AuthCredentialSource`] that knows how to format the resolved value as
//! an outgoing header.
//!
//! # Secret-handling tradeoff
//!
//! Each `apply` formats the outgoing header by `expose_secret`-ing the
//! resolved [`SecretString`] into a transient `String` buffer (e.g.
//! `"Bearer " + token`). That buffer is not zeroized on drop. We accept the
//! transient unprotected copy because the `HeaderValue` it lowers into
//! (and the resulting on-the-wire `reqwest::Request` body) is not zeroized
//! either — adding zeroization here without doing it end-to-end would be
//! security theater. The mitigations still in force: `set_sensitive(true)`
//! on every produced `HeaderValue` so reqwest redacts it in `Debug`, and
//! `SecretString`'s redacting `Debug`/`Display` impl at the source.

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use secrecy::ExposeSecret;

use crate::auth::credential::AuthCredentialSource;
use crate::auth::provider::{AuthProvider, EndpointAuthMetadata};
use crate::error::CliError;

// ---------------------------------------------------------------------------
// BearerAuthProvider — Authorization: Bearer <token>
// ---------------------------------------------------------------------------

/// `Authorization: Bearer <token>` (RFC 6750).
#[derive(Debug, Clone)]
pub struct BearerAuthProvider {
    name: String,
    token: AuthCredentialSource,
}

impl BearerAuthProvider {
    pub fn new(name: impl Into<String>, token: AuthCredentialSource) -> Self {
        Self {
            name: name.into(),
            token,
        }
    }
}

impl AuthProvider for BearerAuthProvider {
    fn name(&self) -> &str {
        &self.name
    }

    fn has_credentials(&self) -> bool {
        self.token.resolve().is_some()
    }

    fn credential_hints(&self) -> Vec<String> {
        self.token.credential_hints()
    }

    fn apply(
        &self,
        request: reqwest::RequestBuilder,
        _endpoint: &EndpointAuthMetadata,
    ) -> Result<reqwest::RequestBuilder, CliError> {
        let Some(token) = self.token.resolve() else {
            return Ok(request);
        };
        // Avoid `RequestBuilder::bearer_auth` — it panics on tokens with
        // bytes that can't be a HeaderValue (CTL chars, NUL, non-ASCII).
        // AGENTS.md flags adversarial inputs explicitly.
        let mut value = String::with_capacity(7 + token.expose_secret().len());
        value.push_str("Bearer ");
        value.push_str(token.expose_secret());
        let mut header = reqwest::header::HeaderValue::from_str(&value)
            .map_err(|e| CliError::Auth(format!("Invalid bearer token: {e}")))?;
        header.set_sensitive(true);
        Ok(request.header(reqwest::header::AUTHORIZATION, header))
    }
}

// ---------------------------------------------------------------------------
// BasicAuthProvider — Authorization: Basic base64(user:pass)
// ---------------------------------------------------------------------------

/// `Authorization: Basic base64(username:password)` (RFC 7617).
///
/// Three construction modes:
///
/// | Constructor | `has_credentials` requires | Omitted field sent as |
/// |---|---|---|
/// | [`new`](Self::new) | both username **and** password | — |
/// | [`username_only`](Self::username_only) | username | password = `""` |
/// | [`password_only`](Self::password_only) | password | username = `""` |
#[derive(Debug, Clone)]
pub struct BasicAuthProvider {
    name: String,
    username: AuthCredentialSource,
    password: AuthCredentialSource,
    mode: BasicAuthMode,
}

/// Controls which credentials [`BasicAuthProvider`] requires.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BasicAuthMode {
    /// Both username and password must resolve.
    Full,
    /// Only the username must resolve; password is sent as `""`.
    UsernameOnly,
    /// Only the password must resolve; username is sent as `""`.
    PasswordOnly,
}

impl BasicAuthProvider {
    /// Standard HTTP Basic auth — both username and password are required.
    pub fn new(
        name: impl Into<String>,
        username: AuthCredentialSource,
        password: AuthCredentialSource,
    ) -> Self {
        Self {
            name: name.into(),
            username,
            password,
            mode: BasicAuthMode::Full,
        }
    }

    /// Username-only Basic auth (empty password). Common for APIs that
    /// accept an API key as the HTTP Basic username (e.g. Close CRM).
    pub fn username_only(
        name: impl Into<String>,
        username: AuthCredentialSource,
    ) -> Self {
        Self {
            name: name.into(),
            username,
            password: AuthCredentialSource::Missing,
            mode: BasicAuthMode::UsernameOnly,
        }
    }

    /// Password-only Basic auth (empty username). Used by APIs that
    /// expect the token in the password field of HTTP Basic.
    pub fn password_only(
        name: impl Into<String>,
        password: AuthCredentialSource,
    ) -> Self {
        Self {
            name: name.into(),
            username: AuthCredentialSource::Missing,
            password,
            mode: BasicAuthMode::PasswordOnly,
        }
    }
}

impl AuthProvider for BasicAuthProvider {
    fn name(&self) -> &str {
        &self.name
    }

    fn has_credentials(&self) -> bool {
        match self.mode {
            BasicAuthMode::Full => {
                self.username.resolve().is_some() && self.password.resolve().is_some()
            }
            BasicAuthMode::UsernameOnly => self.username.resolve().is_some(),
            BasicAuthMode::PasswordOnly => self.password.resolve().is_some(),
        }
    }

    fn credential_hints(&self) -> Vec<String> {
        let mut hints = self.username.credential_hints();
        hints.extend(self.password.credential_hints());
        hints
    }

    fn apply(
        &self,
        request: reqwest::RequestBuilder,
        _endpoint: &EndpointAuthMetadata,
    ) -> Result<reqwest::RequestBuilder, CliError> {
        let u = self.username.resolve();
        let p = self.password.resolve();

        // In Full mode both must be present; in partial modes the
        // omitted half is sent as the empty string.
        match self.mode {
            BasicAuthMode::Full if u.is_none() || p.is_none() => return Ok(request),
            BasicAuthMode::UsernameOnly if u.is_none() => return Ok(request),
            BasicAuthMode::PasswordOnly if p.is_none() => return Ok(request),
            _ => {}
        }

        let u_ref = u.as_ref().map(|s| s.expose_secret()).unwrap_or("");
        let p_ref = p.as_ref().map(|s| s.expose_secret()).unwrap_or("");

        let mut combined = String::with_capacity(u_ref.len() + 1 + p_ref.len());
        combined.push_str(u_ref);
        combined.push(':');
        combined.push_str(p_ref);
        let encoded = BASE64.encode(&combined);
        let value = format!("Basic {encoded}");
        let mut header =
            reqwest::header::HeaderValue::from_str(&value).map_err(|e| {
                CliError::Auth(format!("Invalid basic-auth credentials: {e}"))
            })?;
        header.set_sensitive(true);
        Ok(request.header(reqwest::header::AUTHORIZATION, header))
    }
}

// ---------------------------------------------------------------------------
// HeaderAuthProvider — raw or bearer-prefixed token in a named header.
// ---------------------------------------------------------------------------

/// Send the token verbatim in a named header. Used by APIs like Linear
/// (`Authorization: <api_key>` with no `Bearer ` prefix) and any custom
/// `X-Api-Key` style scheme.
///
/// If `bearer_prefix` is true, the value is prefixed with `Bearer ` —
/// equivalent to a [`BearerAuthProvider`] but on a non-`Authorization`
/// header (the Square pattern).
#[derive(Debug, Clone)]
pub struct HeaderAuthProvider {
    name: String,
    header_name: String,
    token: AuthCredentialSource,
    bearer_prefix: bool,
}

impl HeaderAuthProvider {
    pub fn new(
        name: impl Into<String>,
        header_name: impl Into<String>,
        token: AuthCredentialSource,
        bearer_prefix: bool,
    ) -> Self {
        Self {
            name: name.into(),
            header_name: header_name.into(),
            token,
            bearer_prefix,
        }
    }
}

impl AuthProvider for HeaderAuthProvider {
    fn name(&self) -> &str {
        &self.name
    }

    fn has_credentials(&self) -> bool {
        self.token.resolve().is_some()
    }

    fn credential_hints(&self) -> Vec<String> {
        self.token.credential_hints()
    }

    fn apply(
        &self,
        request: reqwest::RequestBuilder,
        _endpoint: &EndpointAuthMetadata,
    ) -> Result<reqwest::RequestBuilder, CliError> {
        let Some(token) = self.token.resolve() else {
            return Ok(request);
        };
        let value = if self.bearer_prefix {
            let mut s = String::with_capacity(7 + token.expose_secret().len());
            s.push_str("Bearer ");
            s.push_str(token.expose_secret());
            s
        } else {
            token.expose_secret().to_string()
        };
        let mut header_value =
            reqwest::header::HeaderValue::from_str(&value).map_err(|e| {
                CliError::Auth(format!(
                    "Invalid token for header '{}': {e}",
                    self.header_name
                ))
            })?;
        header_value.set_sensitive(true);
        Ok(request.header(self.header_name.as_str(), header_value))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::test_helpers::{auth_header, header, req};

    // -------- BearerAuthProvider --------

    #[tokio::test]
    async fn bearer_provider_emits_authorization_bearer() {
        let p = BearerAuthProvider::new("bearerAuth", AuthCredentialSource::literal("tok"));
        let r = p.apply(req(), &EndpointAuthMetadata::unspecified()).unwrap();
        assert_eq!(auth_header(r).as_deref(), Some("Bearer tok"));
    }

    #[tokio::test]
    async fn bearer_provider_no_token_is_noop() {
        let p = BearerAuthProvider::new("bearerAuth", AuthCredentialSource::Missing);
        assert!(!p.has_credentials());
        let r = p.apply(req(), &EndpointAuthMetadata::unspecified()).unwrap();
        assert_eq!(auth_header(r), None);
    }

    #[tokio::test]
    async fn bearer_provider_rejects_invalid_token_bytes() {
        // A token containing a newline is not a valid HeaderValue.
        // We must error, not panic — adversarial inputs are called out in
        // AGENTS.md.
        let p = BearerAuthProvider::new(
            "bearerAuth",
            AuthCredentialSource::literal("bad\ntoken"),
        );
        let err = p
            .apply(req(), &EndpointAuthMetadata::unspecified())
            .unwrap_err();
        assert!(matches!(err, CliError::Auth(_)));
    }

    // -------- BasicAuthProvider --------

    #[tokio::test]
    async fn basic_provider_emits_base64_authorization() {
        let p = BasicAuthProvider::new(
            "basicAuth",
            AuthCredentialSource::literal("alice"),
            AuthCredentialSource::literal("hunter2"),
        );
        let r = p.apply(req(), &EndpointAuthMetadata::unspecified()).unwrap();
        // base64("alice:hunter2") = "YWxpY2U6aHVudGVyMg=="
        assert_eq!(
            auth_header(r).as_deref(),
            Some("Basic YWxpY2U6aHVudGVyMg=="),
        );
    }

    #[test]
    fn basic_provider_full_missing_password_is_no_credentials() {
        let p = BasicAuthProvider::new(
            "basicAuth",
            AuthCredentialSource::literal("alice"),
            AuthCredentialSource::Missing,
        );
        assert!(!p.has_credentials());
    }

    #[test]
    fn basic_provider_full_missing_username_is_no_credentials() {
        let p = BasicAuthProvider::new(
            "basicAuth",
            AuthCredentialSource::Missing,
            AuthCredentialSource::literal("pass"),
        );
        assert!(!p.has_credentials());
    }

    #[tokio::test]
    async fn basic_provider_username_only_sends_empty_password() {
        let p = BasicAuthProvider::username_only(
            "basicAuth",
            AuthCredentialSource::literal("api_key_123"),
        );
        assert!(p.has_credentials());
        let r = p.apply(req(), &EndpointAuthMetadata::unspecified()).unwrap();
        // base64("api_key_123:") — colon present, empty password
        assert_eq!(
            auth_header(r).as_deref(),
            Some("Basic YXBpX2tleV8xMjM6"),
        );
    }

    #[test]
    fn basic_provider_username_only_missing_is_no_credentials() {
        let p = BasicAuthProvider::username_only(
            "basicAuth",
            AuthCredentialSource::Missing,
        );
        assert!(!p.has_credentials());
    }

    #[tokio::test]
    async fn basic_provider_password_only_sends_empty_username() {
        let p = BasicAuthProvider::password_only(
            "basicAuth",
            AuthCredentialSource::literal("secret_token"),
        );
        assert!(p.has_credentials());
        let r = p.apply(req(), &EndpointAuthMetadata::unspecified()).unwrap();
        // base64(":secret_token")
        assert_eq!(
            auth_header(r).as_deref(),
            Some("Basic OnNlY3JldF90b2tlbg=="),
        );
    }

    #[test]
    fn basic_provider_password_only_missing_is_no_credentials() {
        let p = BasicAuthProvider::password_only(
            "basicAuth",
            AuthCredentialSource::Missing,
        );
        assert!(!p.has_credentials());
    }

    // -------- HeaderAuthProvider --------

    #[tokio::test]
    async fn header_provider_raw_value_no_prefix() {
        let p = HeaderAuthProvider::new(
            "linearKey",
            "Authorization",
            AuthCredentialSource::literal("lin_api_xxx"),
            false,
        );
        let r = p.apply(req(), &EndpointAuthMetadata::unspecified()).unwrap();
        assert_eq!(auth_header(r).as_deref(), Some("lin_api_xxx"));
    }

    #[tokio::test]
    async fn header_provider_bearer_prefix_named_header() {
        let p = HeaderAuthProvider::new(
            "squareKey",
            "X-Auth",
            AuthCredentialSource::literal("tok"),
            true,
        );
        let r = p.apply(req(), &EndpointAuthMetadata::unspecified()).unwrap();
        assert_eq!(header(r, "x-auth").as_deref(), Some("Bearer tok"));
    }

    #[tokio::test]
    async fn header_provider_custom_header_name() {
        let p = HeaderAuthProvider::new(
            "apiKey",
            "X-Api-Key",
            AuthCredentialSource::literal("k"),
            false,
        );
        let r = p.apply(req(), &EndpointAuthMetadata::unspecified()).unwrap();
        assert_eq!(header(r, "x-api-key").as_deref(), Some("k"));
    }
}
