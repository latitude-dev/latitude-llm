//! Auth-aware HTTP error mapping.
//!
//! On a 401/403 response, we want to surface a friendly "no credentials"
//! message when the request actually went out without working auth (the
//! user just needs to set their env var / file / flag), but pass the raw
//! server error through when the request *did* carry credentials (the
//! server is rejecting them — a real backend problem).
//!
//! Per-endpoint awareness comes from
//! [`AuthProvider::has_credentials_for`][hcf]: a routing wrapper can have
//! credentials for *some* schemes but not the one this specific endpoint
//! demanded, and the friendly path should still fire.
//!
//! [hcf]: crate::auth::AuthProvider::has_credentials_for

use serde_json::Value;

use crate::auth::provider::{AuthProvider, EndpointAuthMetadata};
use crate::error::CliError;

/// Map an HTTP error response to a [`CliError`], honoring whether the
/// provider could have authenticated *this specific endpoint*.
///
/// When `status` is 401/403 and the provider reports it couldn't satisfy
/// the endpoint's auth requirements, returns a friendly
/// [`CliError::Auth`] hinting the user to check their configured auth
/// source. Otherwise, parses the response body as a structured
/// `{ "error": { code, message, errors[].reason | reason } }` envelope
/// and returns [`CliError::Api`]; falls back to wrapping the raw body if
/// the response isn't JSON.
pub fn handle_error_response<T>(
    status: reqwest::StatusCode,
    error_body: &str,
    provider: &dyn AuthProvider,
    endpoint: &EndpointAuthMetadata,
) -> Result<T, CliError> {
    if status.as_u16() == 401 || status.as_u16() == 403 {
        if !provider.has_credentials_for(endpoint) {
            let hints = provider.credential_hints();
            let message = if hints.is_empty() {
                "Access denied. Authentication credentials are missing. \
                 Check that the configured auth source for this CLI \
                 (environment variable, --flag, or credential file) has a value set."
                    .to_string()
            } else {
                let joined = dedup_preserve_order(hints).join(", ");
                format!(
                    "Access denied. Authentication credentials are missing. \
                     Set {joined}.",
                )
            };
            return Err(CliError::Auth(message));
        }
        // Credentials were sent but the server rejected them.
        // Surface which source supplied the credential so the user can
        // diagnose shadowing (e.g. stale env var winning over a fresh
        // `auth login`). ADR-0008 § 8e.
        let hints = dedup_preserve_order(provider.credential_hints());
        if !hints.is_empty() {
            let base = parse_api_error(status, error_body);
            return Err(decorate_with_source_hint(base, &hints));
        }
    }
    Err(parse_api_error(status, error_body))
}

/// Append a "Credentials were supplied via: …" line to an existing
/// `CliError::Api` message, preserving the structured fields. For
/// non-`Api` variants (defensive — shouldn't happen here), pass through.
fn decorate_with_source_hint(err: CliError, hints: &[String]) -> CliError {
    let joined = hints.join(", ");
    match err {
        CliError::Api { code, message, reason } => CliError::Api {
            code,
            message: format!(
                "{message}\nCredentials were supplied via: {joined}. \
                 Run `auth status` to see all visible sources and check for shadowing."
            ),
            reason,
        },
        other => other,
    }
}

/// Deduplicate strings while preserving first-seen order.
fn dedup_preserve_order(items: Vec<String>) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    items
        .into_iter()
        .filter(|s| seen.insert(s.clone()))
        .collect()
}

/// Shared parsing for the auth-aware error handler. Returns a structured
/// [`CliError::Api`] whether or not the body was JSON.
fn parse_api_error(status: reqwest::StatusCode, error_body: &str) -> CliError {
    if let Ok(error_json) = serde_json::from_str::<Value>(error_body) {
        if let Some(err_obj) = error_json.get("error") {
            let code = err_obj
                .get("code")
                .and_then(|c| c.as_u64())
                .unwrap_or(status.as_u16() as u64) as u16;
            let message = err_obj
                .get("message")
                .and_then(|m| m.as_str())
                .unwrap_or("Unknown error")
                .to_string();
            let reason = err_obj
                .get("errors")
                .and_then(|e| e.as_array())
                .and_then(|arr| arr.first())
                .and_then(|e| e.get("reason"))
                .and_then(|r| r.as_str())
                .or_else(|| err_obj.get("reason").and_then(|r| r.as_str()))
                .unwrap_or("unknown")
                .to_string();
            return CliError::Api {
                code,
                message,
                reason,
            };
        }
    }
    CliError::Api {
        code: status.as_u16(),
        message: error_body.to_string(),
        reason: "httpError".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::credential::AuthCredentialSource;
    use crate::auth::schemes::BearerAuthProvider;
    use serde_json::json;

    #[test]
    fn friendly_when_provider_has_no_credentials_for_endpoint() {
        let p = BearerAuthProvider::new("bearer", AuthCredentialSource::Missing);
        let err = handle_error_response::<()>(
            reqwest::StatusCode::UNAUTHORIZED,
            "Unauthorized",
            &p,
            &EndpointAuthMetadata::unspecified(),
        )
        .unwrap_err();
        match err {
            CliError::Auth(msg) => assert!(msg.contains("Access denied")),
            _ => panic!("Expected Auth"),
        }
    }

    #[test]
    fn passes_through_when_credentials_present() {
        let p = BearerAuthProvider::new("bearer", AuthCredentialSource::literal("t"));
        let err = handle_error_response::<()>(
            reqwest::StatusCode::UNAUTHORIZED,
            r#"{"error":{"code":401,"message":"bad","reason":"x"}}"#,
            &p,
            &EndpointAuthMetadata::unspecified(),
        )
        .unwrap_err();
        assert!(matches!(err, CliError::Api { .. }));
    }

    #[test]
    fn parses_structured_error_envelope() {
        let json_err = json!({
            "error": {
                "code": 401,
                "message": "Request had invalid authentication credentials.",
                "errors": [{ "reason": "authError" }]
            }
        })
        .to_string();
        let p = BearerAuthProvider::new("bearer", AuthCredentialSource::literal("t"));
        let err = handle_error_response::<()>(
            reqwest::StatusCode::UNAUTHORIZED,
            &json_err,
            &p,
            &EndpointAuthMetadata::unspecified(),
        )
        .unwrap_err();
        match err {
            CliError::Api { code, message, reason } => {
                assert_eq!(code, 401);
                assert!(message.contains("invalid authentication credentials"));
                assert_eq!(reason, "authError");
            }
            other => panic!("Expected Api, got: {other:?}"),
        }
    }

    #[test]
    fn handles_top_level_reason_field() {
        let json_err = json!({
            "error": { "code": 403, "message": "Forbidden", "reason": "accessDenied" }
        })
        .to_string();
        let p = BearerAuthProvider::new("bearer", AuthCredentialSource::literal("t"));
        let err = handle_error_response::<()>(
            reqwest::StatusCode::FORBIDDEN,
            &json_err,
            &p,
            &EndpointAuthMetadata::unspecified(),
        )
        .unwrap_err();
        match err {
            CliError::Api { reason, .. } => assert_eq!(reason, "accessDenied"),
            _ => panic!("Expected Api"),
        }
    }

    #[test]
    fn falls_back_to_raw_body_when_non_json() {
        let p = BearerAuthProvider::new("bearer", AuthCredentialSource::literal("t"));
        let err = handle_error_response::<()>(
            reqwest::StatusCode::INTERNAL_SERVER_ERROR,
            "Internal Server Error Text",
            &p,
            &EndpointAuthMetadata::unspecified(),
        )
        .unwrap_err();
        match err {
            CliError::Api { code, message, reason } => {
                assert_eq!(code, 500);
                assert_eq!(message, "Internal Server Error Text");
                assert_eq!(reason, "httpError");
            }
            _ => panic!("Expected Api"),
        }
    }

    #[test]
    fn friendly_error_names_env_var_bearer() {
        let p = BearerAuthProvider::new(
            "bearerAuth",
            AuthCredentialSource::from_env("__FERN_TEST_BEARER_KEY"),
        );
        let err = handle_error_response::<()>(
            reqwest::StatusCode::UNAUTHORIZED,
            "Unauthorized",
            &p,
            &EndpointAuthMetadata::unspecified(),
        )
        .unwrap_err();
        match err {
            CliError::Auth(msg) => {
                assert!(
                    msg.contains("__FERN_TEST_BEARER_KEY"),
                    "expected env var name in message, got: {msg}",
                );
            }
            other => panic!("Expected Auth, got: {other:?}"),
        }
    }

    #[test]
    fn friendly_error_names_env_var_header() {
        use crate::auth::schemes::HeaderAuthProvider;
        let p = HeaderAuthProvider::new(
            "X-Auth-Token",
            "X-Auth-Token",
            AuthCredentialSource::from_env("__FERN_TEST_HEADER_KEY"),
            false,
        );
        let err = handle_error_response::<()>(
            reqwest::StatusCode::UNAUTHORIZED,
            "Unauthorized",
            &p,
            &EndpointAuthMetadata::unspecified(),
        )
        .unwrap_err();
        match err {
            CliError::Auth(msg) => {
                assert!(
                    msg.contains("__FERN_TEST_HEADER_KEY"),
                    "expected env var name in message, got: {msg}",
                );
            }
            other => panic!("Expected Auth, got: {other:?}"),
        }
    }

    #[test]
    fn friendly_error_names_env_var_basic() {
        use crate::auth::schemes::BasicAuthProvider;
        let p = BasicAuthProvider::username_only(
            "ApiKeyAuth",
            AuthCredentialSource::from_env("__FERN_TEST_BASIC_KEY"),
        );
        let err = handle_error_response::<()>(
            reqwest::StatusCode::UNAUTHORIZED,
            "Unauthorized",
            &p,
            &EndpointAuthMetadata::unspecified(),
        )
        .unwrap_err();
        match err {
            CliError::Auth(msg) => {
                assert!(
                    msg.contains("__FERN_TEST_BASIC_KEY"),
                    "expected env var name in message, got: {msg}",
                );
            }
            other => panic!("Expected Auth, got: {other:?}"),
        }
    }

    #[test]
    fn friendly_error_names_cli_flag_in_chain() {
        // Use a non-finalized source to verify pre-finalize hints.
        let p = BearerAuthProvider::new(
            "bearer",
            AuthCredentialSource::any([
                AuthCredentialSource::cli("api-token"),
                AuthCredentialSource::from_env("__FERN_TEST_CHAIN_TOKEN"),
            ]),
        );
        let err = handle_error_response::<()>(
            reqwest::StatusCode::UNAUTHORIZED,
            "Unauthorized",
            &p,
            &EndpointAuthMetadata::unspecified(),
        )
        .unwrap_err();
        match err {
            CliError::Auth(msg) => {
                assert!(msg.contains("--api-token"), "expected flag hint, got: {msg}");
                assert!(msg.contains("__FERN_TEST_CHAIN_TOKEN"), "expected env var hint, got: {msg}");
            }
            other => panic!("Expected Auth, got: {other:?}"),
        }
    }

    #[test]
    fn friendly_error_names_cli_flag_after_finalize() {
        // Simulate the production path: finalize() converts Cli to Closure,
        // but the hint must survive so the error message still names the flag.
        let cmd = clap::Command::new("test").arg(
            clap::Arg::new("api-token").long("api-token").num_args(1),
        );
        let matches = std::sync::Arc::new(
            cmd.try_get_matches_from(vec!["test"]).unwrap(),
        );
        let source = AuthCredentialSource::any([
            AuthCredentialSource::cli("api-token"),
            AuthCredentialSource::from_env("__FERN_TEST_FINALIZE_TOKEN"),
        ])
        .finalize(&matches);

        let p = BearerAuthProvider::new("bearer", source);
        let err = handle_error_response::<()>(
            reqwest::StatusCode::UNAUTHORIZED,
            "Unauthorized",
            &p,
            &EndpointAuthMetadata::unspecified(),
        )
        .unwrap_err();
        match err {
            CliError::Auth(msg) => {
                assert!(msg.contains("--api-token"), "expected flag hint after finalize, got: {msg}");
                assert!(msg.contains("__FERN_TEST_FINALIZE_TOKEN"), "expected env var hint after finalize, got: {msg}");
            }
            other => panic!("Expected Auth, got: {other:?}"),
        }
    }

    #[test]
    fn friendly_error_fallback_when_no_hints() {
        let p = BearerAuthProvider::new("bearer", AuthCredentialSource::Missing);
        let err = handle_error_response::<()>(
            reqwest::StatusCode::UNAUTHORIZED,
            "Unauthorized",
            &p,
            &EndpointAuthMetadata::unspecified(),
        )
        .unwrap_err();
        match err {
            CliError::Auth(msg) => {
                assert!(msg.contains("Access denied"), "expected fallback msg, got: {msg}");
                assert!(
                    msg.contains("environment variable, --flag, or credential file"),
                    "expected generic hint in fallback, got: {msg}",
                );
            }
            other => panic!("Expected Auth, got: {other:?}"),
        }
    }

    #[test]
    fn friendly_error_json_envelope_contains_env_var() {
        let p = BearerAuthProvider::new(
            "bearerAuth",
            AuthCredentialSource::from_env("__FERN_TEST_JSON_KEY"),
        );
        let err = handle_error_response::<()>(
            reqwest::StatusCode::UNAUTHORIZED,
            "Unauthorized",
            &p,
            &EndpointAuthMetadata::unspecified(),
        )
        .unwrap_err();
        let json = err.to_json();
        let json_msg = json["error"]["message"].as_str().unwrap();
        assert!(
            json_msg.contains("__FERN_TEST_JSON_KEY"),
            "expected env var in JSON message, got: {json_msg}",
        );
    }

    #[test]
    fn unauthorized_with_credentials_discloses_source() {
        // 401 fired with valid creds → server rejecting → disclose source.
        std::env::set_var("__FERN_TEST_SHADOW_TOKEN", "stale-token");
        let p = BearerAuthProvider::new(
            "bearer",
            AuthCredentialSource::from_env("__FERN_TEST_SHADOW_TOKEN"),
        );
        let err = handle_error_response::<()>(
            reqwest::StatusCode::UNAUTHORIZED,
            r#"{"error":{"code":401,"message":"bad token"}}"#,
            &p,
            &EndpointAuthMetadata::unspecified(),
        )
        .unwrap_err();
        match err {
            CliError::Api { message, .. } => {
                assert!(message.contains("__FERN_TEST_SHADOW_TOKEN"));
                assert!(message.contains("auth status"));
            }
            other => panic!("expected Api with source-hint suffix, got: {other:?}"),
        }
        std::env::remove_var("__FERN_TEST_SHADOW_TOKEN");
    }

    #[test]
    fn forbidden_with_credentials_discloses_source() {
        std::env::set_var("__FERN_TEST_FORBIDDEN_TOKEN", "x");
        let p = BearerAuthProvider::new(
            "bearer",
            AuthCredentialSource::from_env("__FERN_TEST_FORBIDDEN_TOKEN"),
        );
        let err = handle_error_response::<()>(
            reqwest::StatusCode::FORBIDDEN,
            r#"{"error":{"code":403,"message":"forbidden"}}"#,
            &p,
            &EndpointAuthMetadata::unspecified(),
        )
        .unwrap_err();
        match err {
            CliError::Api { message, .. } => {
                assert!(message.contains("__FERN_TEST_FORBIDDEN_TOKEN"));
            }
            other => panic!("expected Api with source-hint suffix, got: {other:?}"),
        }
        std::env::remove_var("__FERN_TEST_FORBIDDEN_TOKEN");
    }

    #[test]
    fn non_auth_status_codes_skip_source_disclosure() {
        std::env::set_var("__FERN_TEST_NONAUTH_TOKEN", "x");
        let p = BearerAuthProvider::new(
            "bearer",
            AuthCredentialSource::from_env("__FERN_TEST_NONAUTH_TOKEN"),
        );
        let err = handle_error_response::<()>(
            reqwest::StatusCode::INTERNAL_SERVER_ERROR,
            r#"{"error":{"code":500,"message":"server down"}}"#,
            &p,
            &EndpointAuthMetadata::unspecified(),
        )
        .unwrap_err();
        match err {
            CliError::Api { message, .. } => {
                assert!(!message.contains("__FERN_TEST_NONAUTH_TOKEN"));
            }
            _ => panic!("expected Api"),
        }
        std::env::remove_var("__FERN_TEST_NONAUTH_TOKEN");
    }

    #[test]
    fn dedup_removes_duplicates_preserving_order() {
        let input = vec!["a".into(), "b".into(), "a".into(), "c".into(), "b".into()];
        let result = dedup_preserve_order(input);
        assert_eq!(result, vec!["a", "b", "c"]);
    }
}
