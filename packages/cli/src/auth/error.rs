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
        // Only the sources that actually supplied something. Listing every
        // declared source named places the user had never configured.
        let supplied = dedup_preserve_order(provider.populated_credential_hints());
        if !supplied.is_empty() {
            let base = parse_api_error(status, error_body);
            return Err(decorate_with_source_hint(base, &supplied));
        }
        return Err(parse_api_error(status, error_body));
    }

    // Any other failure, sent without credentials. The condition the friendly
    // message above describes — "this request carried no auth" — has nothing to
    // do with the status code, but the message was gated on 401/403, so an API
    // that expresses "not authenticated" some other way said nothing useful.
    //
    // ElevenLabs answers 404 for a workspace scoped to the anonymous principal
    // (a deliberate pattern: a 401 would confirm the resource exists), so a
    // logged-out user saw `Workspace 1anonymous1 not found` with no hint that
    // the fix was `auth login`.
    //
    // This only *annotates* — the error keeps its class and exit code, because
    // the server, not the spec, is the authority on whether this endpoint
    // needed auth at all. Public endpoints must keep working.
    if !provider.has_credentials_for(endpoint) {
        let base = parse_api_error(status, error_body);
        if let Some(note) = missing_credentials_note(provider) {
            return Err(decorate_with_help(base, note));
        }
        return Err(base);
    }
    Err(parse_api_error(status, error_body))
}

/// Advice for a request that went out with no credentials at all, or `None`
/// when the CLI declares no auth sources to point at.
fn missing_credentials_note(provider: &dyn AuthProvider) -> Option<String> {
    let hints = dedup_preserve_order(provider.credential_hints());
    if hints.is_empty() {
        return None;
    }
    Some(format!(
        "No credentials were sent with this request. Set {}.",
        hints.join(", ")
    ))
}

/// Attach `note` as the error's `help`, leaving every other field alone.
fn decorate_with_help(err: CliError, note: String) -> CliError {
    match err {
        CliError::Api {
            code,
            message,
            reason,
            details,
            ..
        } => CliError::Api {
            code,
            message,
            reason,
            details,
            help: Some(note),
        },
        other => other,
    }
}

/// Attach a "Credentials were supplied via: …" note to an existing
/// `CliError::Api`. The note goes in `help` rather than `message` — it is
/// advice about the failure, not part of what the server reported.
///
/// Naming the source that was used is worth saying whenever credentials were
/// sent. The follow-up — "check for shadowing" — is not: shadowing means one
/// source silently outranking another, which cannot happen when there is only
/// one. On a single-source CLI it sent the reader to `auth status` to compare a
/// list of one against itself, which is busywork at best and, on a scope
/// failure like `OAuth token does not have required permissions`, actively
/// points away from the real fix.
/// Note for a request that carried credentials the server rejected.
///
/// `hints` must be the *populated* sources, not every declared one. The
/// shadowing advice is gated on more than one source actually holding a value,
/// because that is the only situation in which shadowing is possible — gating
/// it on the declared count meant any CLI with two auth schemes always told
/// the user to go looking for a conflict that could not exist.
fn decorate_with_source_hint(err: CliError, hints: &[String]) -> CliError {
    let joined = hints.join(", ");
    let note = if hints.len() > 1 {
        format!(
            "Credentials were supplied via: {joined}. More than one source has a \
             value, so one may be shadowing another — run `auth status` to see \
             which was used."
        )
    } else {
        format!("Credentials were supplied via: {joined}.")
    };
    decorate_with_help(err, note)
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
    crate::error::api_error_from_body(status.as_u16(), error_body)
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
            CliError::Api {
                code,
                message,
                reason,
                ..
            } => {
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
            CliError::Api {
                code,
                message,
                reason,
                ..
            } => {
                assert_eq!(code, 500);
                assert_eq!(message, "Internal Server Error Text");
                assert_eq!(reason, "internalServerError");
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
            CliError::Api { message, help, .. } => {
                // The hint is advice, so it lives in `help` — `message` stays
                // exactly what the server said.
                assert_eq!(message, "bad token");
                let help = help.expect("credential source hint");
                assert!(help.contains("__FERN_TEST_SHADOW_TOKEN"));
                // One source, so nothing can be shadowing anything: the
                // `auth status` follow-up would send the reader to compare a
                // list of one against itself.
                assert!(!help.contains("auth status"), "got: {help}");
            }
            other => panic!("expected Api with source-hint suffix, got: {other:?}"),
        }
        std::env::remove_var("__FERN_TEST_SHADOW_TOKEN");
    }

    #[test]
    fn names_only_the_sources_that_actually_hold_a_value() {
        // A declared-but-empty source must not be named. Listing every source
        // the provider *could* read told users their credential came from a
        // keyring entry they had never populated, and — because the shadowing
        // advice was gated on the declared count — sent them hunting for a
        // conflict that could not exist.
        std::env::set_var("__FERN_TEST_CHAIN_A", "stale");
        let p = BearerAuthProvider::new(
            "bearer",
            AuthCredentialSource::any([
                AuthCredentialSource::from_env("__FERN_TEST_CHAIN_A"),
                AuthCredentialSource::from_env("__FERN_TEST_CHAIN_UNSET"),
            ]),
        );
        let err = handle_error_response::<()>(
            reqwest::StatusCode::UNAUTHORIZED,
            r#"{"error":{"code":401,"message":"bad token"}}"#,
            &p,
            &EndpointAuthMetadata::unspecified(),
        )
        .unwrap_err();
        match err {
            CliError::Api { help, .. } => {
                let help = help.expect("credential source hint");
                assert!(help.contains("__FERN_TEST_CHAIN_A"), "got: {help}");
                assert!(
                    !help.contains("__FERN_TEST_CHAIN_UNSET"),
                    "an unset source must not be named: {help}",
                );
                assert!(
                    !help.contains("shadowing"),
                    "one populated source cannot be shadowed: {help}",
                );
            }
            other => panic!("expected Api, got: {other:?}"),
        }
        std::env::remove_var("__FERN_TEST_CHAIN_A");
    }

    #[test]
    fn shadowing_advice_appears_only_with_more_than_one_source() {
        // Two *populated* sources is the situation the advice was written for:
        // a stale env var can outrank a fresh one, and which won is not
        // observable from the error alone.
        std::env::set_var("__FERN_TEST_SHADOW_A", "stale");
        std::env::set_var("__FERN_TEST_SHADOW_B", "fresh");
        let p = BearerAuthProvider::new(
            "bearer",
            AuthCredentialSource::any([
                AuthCredentialSource::from_env("__FERN_TEST_SHADOW_A"),
                AuthCredentialSource::from_env("__FERN_TEST_SHADOW_B"),
            ]),
        );
        let err = handle_error_response::<()>(
            reqwest::StatusCode::UNAUTHORIZED,
            r#"{"error":{"code":401,"message":"bad token"}}"#,
            &p,
            &EndpointAuthMetadata::unspecified(),
        )
        .unwrap_err();
        match err {
            CliError::Api { help, .. } => {
                let help = help.expect("credential source hint");
                assert!(help.contains("__FERN_TEST_SHADOW_A"), "got: {help}");
                assert!(help.contains("__FERN_TEST_SHADOW_B"), "got: {help}");
                assert!(help.contains("shadowing"), "got: {help}");
            }
            other => panic!("expected Api, got: {other:?}"),
        }
        std::env::remove_var("__FERN_TEST_SHADOW_A");
        std::env::remove_var("__FERN_TEST_SHADOW_B");
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
            CliError::Api { help, .. } => {
                assert!(help
                    .expect("credential source hint")
                    .contains("__FERN_TEST_FORBIDDEN_TOKEN"));
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
            CliError::Api { message, help, .. } => {
                assert!(!message.contains("__FERN_TEST_NONAUTH_TOKEN"));
                assert!(help.is_none());
            }
            _ => panic!("expected Api"),
        }
        std::env::remove_var("__FERN_TEST_NONAUTH_TOKEN");
    }

    #[test]
    fn a_credentialless_request_is_annotated_whatever_the_status() {
        // ElevenLabs answers 404 for a workspace scoped to the anonymous
        // principal, so a logged-out user used to read `Workspace 1anonymous1
        // not found` with nothing pointing at `auth login`. The hint was gated
        // on 401/403; the condition it describes is status-independent.
        std::env::remove_var("__FERN_TEST_ABSENT_TOKEN");
        let p = BearerAuthProvider::new(
            "bearer",
            AuthCredentialSource::from_env("__FERN_TEST_ABSENT_TOKEN"),
        );
        let err = handle_error_response::<()>(
            reqwest::StatusCode::NOT_FOUND,
            r#"{"detail":{"message":"Workspace 1anonymous1 not found.","code":"workspace_not_found"}}"#,
            &p,
            &EndpointAuthMetadata::unspecified(),
        )
        .unwrap_err();
        match err {
            CliError::Api {
                code,
                message,
                reason,
                help,
                ..
            } => {
                // Class and exit code are untouched: the server, not the spec,
                // decides whether this endpoint needed auth.
                assert_eq!(code, 404);
                assert_eq!(reason, "workspace_not_found");
                assert_eq!(message, "Workspace 1anonymous1 not found.");
                let help = help.expect("missing-credentials note");
                assert!(help.contains("No credentials were sent"), "got: {help}");
                assert!(help.contains("__FERN_TEST_ABSENT_TOKEN"), "got: {help}");
            }
            other => panic!("expected Api, got: {other:?}"),
        }
        assert_eq!(
            CliError::api(404, "x", "y").exit_code(),
            CliError::EXIT_CODE_API
        );
    }

    #[test]
    fn a_credentialled_request_gets_no_missing_credentials_note() {
        // The note must not fire just because a call failed — only when the
        // request actually went out with nothing.
        std::env::set_var("__FERN_TEST_PRESENT_TOKEN", "x");
        let p = BearerAuthProvider::new(
            "bearer",
            AuthCredentialSource::from_env("__FERN_TEST_PRESENT_TOKEN"),
        );
        let err = handle_error_response::<()>(
            reqwest::StatusCode::NOT_FOUND,
            r#"{"detail":"Nope"}"#,
            &p,
            &EndpointAuthMetadata::unspecified(),
        )
        .unwrap_err();
        match err {
            CliError::Api { help, .. } => assert!(help.is_none(), "got: {help:?}"),
            other => panic!("expected Api, got: {other:?}"),
        }
        std::env::remove_var("__FERN_TEST_PRESENT_TOKEN");
    }

    #[test]
    fn dedup_removes_duplicates_preserving_order() {
        let input = vec!["a".into(), "b".into(), "a".into(), "c".into(), "b".into()];
        let result = dedup_preserve_order(input);
        assert_eq!(result, vec!["a", "b", "c"]);
    }
}
