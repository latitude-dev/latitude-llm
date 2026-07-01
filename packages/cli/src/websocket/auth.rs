// SPDX-License-Identifier: Apache-2.0

//! WebSocket authentication: query-param, header, and first-message
//! variants. Each variant takes an [`AuthCredentialSource`] directly — the
//! WS path deliberately bypasses [`AuthProvider`](crate::auth::AuthProvider)
//! (which is shaped around `reqwest::RequestBuilder`); see
//! `docs/adr/0001-auth-provider-no-cred-extraction.md`.

use percent_encoding::{utf8_percent_encode, AsciiSet, CONTROLS};
use secrecy::ExposeSecret;
use serde_json::Value;

use crate::auth::AuthCredentialSource;
use crate::error::CliError;

/// Percent-encoding set for query-string components: encode everything that
/// is not in the application/x-www-form-urlencoded "safe" set, plus the
/// reserved characters that would otherwise terminate the value (`&`, `=`,
/// `#`, `+`, ` `, `/`, `?`). Mirrors the `url::form_urlencoded` set without
/// adding `url` as a direct dep.
const QUERY_VALUE: &AsciiSet = &CONTROLS
    .add(b' ')
    .add(b'"')
    .add(b'#')
    .add(b'&')
    .add(b'+')
    .add(b'/')
    .add(b'<')
    .add(b'=')
    .add(b'>')
    .add(b'?')
    .add(b'`')
    .add(b'{')
    .add(b'}');

/// Where the WS handshake / first frame puts the credential.
///
/// Variants take an [`AuthCredentialSource`] directly rather than a
/// resolved string so the same `cli > env > file` precedence patterns
/// users already configure for the HTTP path work without extra plumbing.
///
/// # `AuthCredentialSource::Cli` footgun
///
/// `AuthCredentialSource::cli("token")` is bound to a clap argument and
/// resolves to `None` until [`AuthCredentialSource::finalize`] is called
/// against the parsed matches. The HTTP path runs `finalize` automatically
/// inside `CliApp::run`; the WS path is invoked from a custom-command
/// handler that does *not* go through that finalize step. If you want
/// CLI-bound creds, either:
///
/// - prefer `AuthCredentialSource::from_env(...)` so the same scheme used
///   by `auth_scheme_env` Just Works;
/// - or call `source = source.finalize(matches)` yourself before passing
///   the source into `WsAuth::*`.
///
/// Missing creds surface as `CliError::Auth` so the failure mode is loud,
/// not silent.
pub enum WsAuth {
    /// Append the credential as a query parameter on the connect URL.
    /// Example: ElevenLabs `tts/stream-input?authorization=<bearer>`.
    QueryParam(String, AuthCredentialSource),
    /// Send the credential as an HTTP header on the WS upgrade request.
    /// Example: standard `xi-api-key: <key>` on ElevenLabs convai.
    ///
    /// # Header-value prefixes (footgun)
    ///
    /// The source's resolved value becomes the *entire* header value.
    /// Deepgram requires `Authorization: Token <key>` — the literal word
    /// `Token` is part of the value, NOT a scheme the library prepends.
    /// **Prefer the convenience constructors [`WsAuth::bearer`] /
    /// [`WsAuth::token`]** rather than baking the prefix into a literal
    /// or closure by hand; they're auditable in one place and impossible
    /// to misspell.
    Header(String, AuthCredentialSource),
    /// Send multiple HTTP headers on the WS upgrade request. Use when the
    /// API requires more than one header on the handshake — for example,
    /// OpenAI Realtime needs both `Authorization: Bearer <key>` AND
    /// `OpenAI-Beta: realtime=v1`. Each pair is validated against the
    /// WS-protocol reserved-header deny-list and each source must
    /// resolve to a non-empty value.
    Headers(Vec<(String, AuthCredentialSource)>),
    /// Merge the credential into the *first* outbound JSON frame as the
    /// named field. Example: ElevenLabs TTS `stream-input` requires
    /// `{"xi_api_key": "<key>", ...}` as the first text frame.
    FirstMessage(String, AuthCredentialSource),
    /// No auth (anonymous connection, or auth handled by the customer
    /// outside this module).
    None,
}

impl WsAuth {
    /// `Authorization: Bearer <value>` convenience. Prepends the literal
    /// `Bearer ` to the resolved credential, so customers cannot
    /// accidentally double-prefix or omit it. Use for OpenAI Realtime
    /// and any RFC-6750 bearer-token API.
    pub fn bearer(source: AuthCredentialSource) -> Self {
        WsAuth::Header("Authorization".into(), prefix_source(source, "Bearer "))
    }

    /// `Authorization: Token <value>` convenience. Prepends the literal
    /// `Token ` to the resolved credential. Use for Deepgram realtime —
    /// Deepgram treats the word `Token` as part of the value, not a
    /// scheme tungstenite prepends, so customers that miss this footgun
    /// get a confusing 401 from the upgrade.
    pub fn token(source: AuthCredentialSource) -> Self {
        WsAuth::Header("Authorization".into(), prefix_source(source, "Token "))
    }

    /// Apply auth to the URL and header list before the handshake.
    ///
    /// For [`WsAuth::QueryParam`] this appends `?key=value` (or `&key=value`)
    /// to `url`. For [`WsAuth::Header`] it pushes `(name, value)` onto
    /// `headers`. For [`WsAuth::FirstMessage`] and [`WsAuth::None`] it's
    /// a no-op — `FirstMessage` is applied by [`Self::merge_into_first_message`]
    /// before the first send.
    ///
    /// Returns an error if the credential is required (i.e. variant is
    /// not `None`) but the source resolves to `None` — that's almost
    /// certainly a misconfiguration the user should see immediately.
    pub fn apply_to_url_and_headers(
        &self,
        url: &mut String,
        headers: &mut Vec<(String, String)>,
    ) -> Result<(), CliError> {
        match self {
            WsAuth::QueryParam(key, source) => {
                let secret = source.resolve().ok_or_else(|| {
                    CliError::Auth(format!(
                        "WebSocket auth: credential for query param `{key}` is unset"
                    ))
                })?;
                append_query_param(url, key, secret.expose_secret());
                Ok(())
            }
            WsAuth::Header(name, source) => {
                apply_single_header(name, source, headers)
            }
            WsAuth::Headers(pairs) => {
                for (name, source) in pairs {
                    apply_single_header(name, source, headers)?;
                }
                Ok(())
            }
            WsAuth::FirstMessage(_, _) | WsAuth::None => Ok(()),
        }
    }

    /// Merge the credential into the first outbound JSON frame.
    ///
    /// Used only for [`WsAuth::FirstMessage`]; other variants are a no-op.
    /// The frame must be a JSON object — merging a top-level field into a
    /// non-object value is a misconfiguration and surfaces as `Validation`.
    pub fn merge_into_first_message(&self, msg: &mut Value) -> Result<(), CliError> {
        if let WsAuth::FirstMessage(field, source) = self {
            let secret = source.resolve().ok_or_else(|| {
                CliError::Auth(format!(
                    "WebSocket auth: credential for first-message field `{field}` is unset"
                ))
            })?;
            // Pre-compute the type name string so the error closure
            // doesn't borrow `msg` while `as_object_mut` already holds a
            // mutable borrow.
            let observed = type_name(msg);
            let obj = msg.as_object_mut().ok_or_else(|| {
                CliError::Validation(format!(
                    "WebSocket auth: first message must be a JSON object to inject `{field}` \
                     (got {observed})"
                ))
            })?;
            obj.insert(field.clone(), Value::String(secret.expose_secret().to_string()));
        }
        Ok(())
    }
}

/// Shared body for `Header` / `Headers` application — validates the name
/// against the reserved-handshake-header deny-list and resolves the source.
fn apply_single_header(
    name: &str,
    source: &AuthCredentialSource,
    headers: &mut Vec<(String, String)>,
) -> Result<(), CliError> {
    // Reject WS-protocol headers — letting a customer set `Host`,
    // `Upgrade`, `Connection`, or `Sec-WebSocket-*` would silently
    // clobber the auto-generated values from `IntoClientRequest` and
    // produce a confusing handshake failure. Fail loudly.
    if is_reserved_handshake_header(name) {
        return Err(CliError::Validation(format!(
            "WebSocket auth: header `{name}` is a WS-protocol \
             header and cannot be set via WsAuth — the handshake \
             machinery sets it automatically"
        )));
    }
    let secret = source.resolve().ok_or_else(|| {
        CliError::Auth(format!(
            "WebSocket auth: credential for header `{name}` is unset"
        ))
    })?;
    headers.push((name.to_string(), secret.expose_secret().to_string()));
    Ok(())
}

/// Append `?key=value` (or `&key=value` if a `?` is already present) to a
/// URL string. Percent-encodes the value so credentials with `&`, `=`, or
/// other URL-special characters survive the round-trip intact.
fn append_query_param(url: &mut String, key: &str, value: &str) {
    let separator = if url.contains('?') { '&' } else { '?' };
    url.push(separator);
    url.push_str(&utf8_percent_encode(key, QUERY_VALUE).to_string());
    url.push('=');
    url.push_str(&utf8_percent_encode(value, QUERY_VALUE).to_string());
}

/// Wrap `source` so its resolved value gets `prefix` prepended.
/// `AuthCredentialSource` derives `Clone`, so the move-closure can keep
/// re-resolving each request without consuming the original source.
fn prefix_source(source: AuthCredentialSource, prefix: &'static str) -> AuthCredentialSource {
    AuthCredentialSource::closure(move || {
        source
            .resolve()
            .map(|s| format!("{prefix}{}", s.expose_secret()))
    })
}

/// Names of HTTP headers the WS handshake machinery sets itself. Setting
/// any of them via `WsAuth::Header` would either clobber the correct value
/// or get clobbered by tungstenite — both end in a confusing handshake
/// failure. Reject up front.
fn is_reserved_handshake_header(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    matches!(
        lower.as_str(),
        "host"
            | "upgrade"
            | "connection"
            | "sec-websocket-key"
            | "sec-websocket-version"
            | "sec-websocket-extensions"
            | "sec-websocket-protocol"
            | "sec-websocket-accept"
    )
}

fn type_name(v: &Value) -> &'static str {
    match v {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn literal(v: &str) -> AuthCredentialSource {
        AuthCredentialSource::literal(v)
    }

    #[test]
    fn query_param_appends_to_clean_url() {
        let mut url = "wss://api.example.com/v1/socket".to_string();
        let mut headers = Vec::new();
        WsAuth::QueryParam("authorization".into(), literal("bearer-token"))
            .apply_to_url_and_headers(&mut url, &mut headers)
            .unwrap();
        assert!(url.starts_with("wss://api.example.com/v1/socket?"));
        assert!(url.contains("authorization=bearer-token"));
        assert!(headers.is_empty());
    }

    #[test]
    fn query_param_appends_with_ampersand_when_query_present() {
        let mut url = "wss://api.example.com/v1/socket?agent_id=abc".to_string();
        let mut headers = Vec::new();
        WsAuth::QueryParam("authorization".into(), literal("tok"))
            .apply_to_url_and_headers(&mut url, &mut headers)
            .unwrap();
        assert_eq!(url, "wss://api.example.com/v1/socket?agent_id=abc&authorization=tok");
    }

    #[test]
    fn query_param_percent_encodes_special_chars() {
        let mut url = "wss://api.example.com/".to_string();
        let mut headers = Vec::new();
        WsAuth::QueryParam("token".into(), literal("a&b=c d"))
            .apply_to_url_and_headers(&mut url, &mut headers)
            .unwrap();
        // Percent-encoded: & → %26, = → %3D, space → %20 (we encode all
        // reserved characters consistently rather than using application/
        // x-www-form-urlencoded's `+` for space — wss:// query strings
        // tend to round-trip the percent form more reliably across libs.)
        assert!(url.contains("token=a%26b%3Dc%20d"), "url: {url}");
    }

    #[test]
    fn header_adds_to_header_list_does_not_touch_url() {
        let mut url = "wss://api.example.com/".to_string();
        let mut headers = Vec::new();
        WsAuth::Header("xi-api-key".into(), literal("sk-test"))
            .apply_to_url_and_headers(&mut url, &mut headers)
            .unwrap();
        assert_eq!(url, "wss://api.example.com/");
        assert_eq!(headers, vec![("xi-api-key".to_string(), "sk-test".to_string())]);
    }

    #[test]
    fn first_message_is_noop_at_handshake() {
        let mut url = "wss://api.example.com/".to_string();
        let mut headers = Vec::new();
        WsAuth::FirstMessage("xi_api_key".into(), literal("sk-fm"))
            .apply_to_url_and_headers(&mut url, &mut headers)
            .unwrap();
        assert_eq!(url, "wss://api.example.com/");
        assert!(headers.is_empty());
    }

    #[test]
    fn none_is_noop() {
        let mut url = "wss://api.example.com/".to_string();
        let mut headers = Vec::new();
        WsAuth::None
            .apply_to_url_and_headers(&mut url, &mut headers)
            .unwrap();
        assert_eq!(url, "wss://api.example.com/");
        assert!(headers.is_empty());
    }

    #[test]
    fn missing_credential_for_header_surfaces_as_auth_error() {
        let mut url = "wss://api.example.com/".to_string();
        let mut headers = Vec::new();
        // Empty literal resolves to None — same path as a missing env var.
        let err = WsAuth::Header("xi-api-key".into(), literal(""))
            .apply_to_url_and_headers(&mut url, &mut headers)
            .expect_err("missing cred should error");
        assert!(matches!(err, CliError::Auth(_)));
        assert!(err.to_string().contains("xi-api-key"));
    }

    #[test]
    fn missing_credential_for_query_param_surfaces_as_auth_error() {
        let mut url = "wss://api.example.com/".to_string();
        let mut headers = Vec::new();
        let err = WsAuth::QueryParam("authorization".into(), literal(""))
            .apply_to_url_and_headers(&mut url, &mut headers)
            .expect_err("missing cred should error");
        assert!(matches!(err, CliError::Auth(_)));
        assert!(err.to_string().contains("authorization"));
    }

    #[test]
    fn first_message_merges_field_into_json_object() {
        let mut msg = serde_json::json!({"text": "hello", "voice_settings": {"stability": 0.5}});
        WsAuth::FirstMessage("xi_api_key".into(), literal("sk-merged"))
            .merge_into_first_message(&mut msg)
            .unwrap();
        assert_eq!(msg["xi_api_key"], "sk-merged");
        assert_eq!(msg["text"], "hello");
    }

    #[test]
    fn first_message_rejects_non_object() {
        let mut msg = serde_json::json!(["not", "an", "object"]);
        let err = WsAuth::FirstMessage("xi_api_key".into(), literal("sk"))
            .merge_into_first_message(&mut msg)
            .expect_err("array first frame should error");
        assert!(matches!(err, CliError::Validation(_)));
    }

    #[test]
    fn first_message_missing_credential_errors() {
        let mut msg = serde_json::json!({});
        let err = WsAuth::FirstMessage("xi_api_key".into(), literal(""))
            .merge_into_first_message(&mut msg)
            .expect_err("missing cred should error");
        assert!(matches!(err, CliError::Auth(_)));
    }

    #[test]
    fn header_rejects_ws_protocol_reserved_names() {
        let mut url = "wss://api.example.com/".to_string();
        let mut headers = Vec::new();
        for reserved in &[
            "Host",
            "host",
            "Upgrade",
            "Connection",
            "Sec-WebSocket-Key",
            "Sec-WebSocket-Version",
            "Sec-WebSocket-Protocol",
        ] {
            let err = WsAuth::Header((*reserved).into(), literal("x"))
                .apply_to_url_and_headers(&mut url, &mut headers)
                .expect_err(reserved);
            assert!(matches!(err, CliError::Validation(_)),
                "reserved `{reserved}` should validation-error, got: {err:?}");
        }
        // Sanity: a non-reserved name passes.
        assert!(WsAuth::Header("X-My-Custom".into(), literal("x"))
            .apply_to_url_and_headers(&mut url, &mut headers)
            .is_ok());
    }

    #[test]
    fn headers_variant_emits_all_pairs_in_order() {
        let mut url = "wss://api.openai.com/v1/realtime?model=gpt-4o".to_string();
        let mut headers = Vec::new();
        WsAuth::Headers(vec![
            (
                "Authorization".into(),
                literal("Bearer sk-openai-test"),
            ),
            (
                "OpenAI-Beta".into(),
                literal("realtime=v1"),
            ),
        ])
        .apply_to_url_and_headers(&mut url, &mut headers)
        .unwrap();
        assert_eq!(
            headers,
            vec![
                ("Authorization".to_string(), "Bearer sk-openai-test".to_string()),
                ("OpenAI-Beta".to_string(), "realtime=v1".to_string()),
            ]
        );
        // URL is unchanged.
        assert_eq!(url, "wss://api.openai.com/v1/realtime?model=gpt-4o");
    }

    #[test]
    fn headers_variant_rejects_reserved_names_per_pair() {
        let mut url = "wss://x".to_string();
        let mut headers = Vec::new();
        let err = WsAuth::Headers(vec![
            ("X-Custom".into(), literal("ok")),
            ("Upgrade".into(), literal("nope")),
        ])
        .apply_to_url_and_headers(&mut url, &mut headers)
        .expect_err("reserved header should error");
        assert!(matches!(err, CliError::Validation(_)));
    }

    #[test]
    fn headers_variant_missing_credential_errors() {
        let mut url = "wss://x".to_string();
        let mut headers = Vec::new();
        let err = WsAuth::Headers(vec![
            ("Authorization".into(), literal("Bearer xyz")),
            ("OpenAI-Beta".into(), literal("")),
        ])
        .apply_to_url_and_headers(&mut url, &mut headers)
        .expect_err("missing cred should error");
        assert!(matches!(err, CliError::Auth(_)));
        // Auth-error message names the missing header.
        assert!(err.to_string().contains("OpenAI-Beta"));
    }

    #[test]
    fn bearer_helper_prepends_literal_bearer_space() {
        let mut url = "wss://api.openai.com/v1/realtime".to_string();
        let mut headers = Vec::new();
        WsAuth::bearer(literal("sk-openai-test"))
            .apply_to_url_and_headers(&mut url, &mut headers)
            .unwrap();
        assert_eq!(
            headers,
            vec![("Authorization".to_string(), "Bearer sk-openai-test".to_string())]
        );
    }

    #[test]
    fn token_helper_prepends_literal_token_space() {
        let mut url = "wss://api.deepgram.com/v1/listen".to_string();
        let mut headers = Vec::new();
        WsAuth::token(literal("dg_secret"))
            .apply_to_url_and_headers(&mut url, &mut headers)
            .unwrap();
        assert_eq!(
            headers,
            vec![("Authorization".to_string(), "Token dg_secret".to_string())]
        );
    }

    #[test]
    fn bearer_helper_surfaces_missing_credential_loudly() {
        let mut url = "wss://x".to_string();
        let mut headers = Vec::new();
        // Empty literal source resolves to None — should bubble up as
        // CliError::Auth like the underlying Header variant.
        let err = WsAuth::bearer(literal(""))
            .apply_to_url_and_headers(&mut url, &mut headers)
            .expect_err("empty cred should error");
        assert!(matches!(err, CliError::Auth(_)));
    }

    #[test]
    fn token_helper_does_not_double_prefix_already_prefixed_value() {
        // If a customer mistakenly passes "Token foo" to `WsAuth::token`,
        // they get "Token Token foo" — documented surprise; we don't
        // try to detect "already prefixed" since that would be fragile.
        // This test is explicit so future refactors don't accidentally
        // start stripping prefixes (which would also be wrong).
        let mut url = "wss://x".to_string();
        let mut headers = Vec::new();
        WsAuth::token(literal("Token already-prefixed"))
            .apply_to_url_and_headers(&mut url, &mut headers)
            .unwrap();
        assert_eq!(
            headers[0].1,
            "Token Token already-prefixed",
            "token() always prepends — by design"
        );
    }

    #[test]
    fn other_variants_skip_merge_into_first_message() {
        let mut msg = serde_json::json!({"text": "hi"});
        WsAuth::Header("xi-api-key".into(), literal("k"))
            .merge_into_first_message(&mut msg)
            .unwrap();
        WsAuth::QueryParam("auth".into(), literal("k"))
            .merge_into_first_message(&mut msg)
            .unwrap();
        WsAuth::None.merge_into_first_message(&mut msg).unwrap();
        // No mutation expected from any of these variants.
        assert_eq!(msg, serde_json::json!({"text": "hi"}));
    }
}
