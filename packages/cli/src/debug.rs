//! Debug HTTP dump and rich error display.
//!
//! When `--debug` is passed on the CLI, the executor calls into this module
//! to print a curl-style HTTP request/response dump to stderr. Auth headers
//! are redacted to avoid leaking secrets into logs, terminal scrollback, or
//! screenshots. Request bodies are also scanned for sensitive keys
//! (`password`, `client_secret`, etc.) and their values replaced with
//! `[REDACTED]`.
//!
//! The rich error display reformats API error responses into a more readable
//! layout with status badges, timing, and the response body indented for
//! quick scanning.
//!
//! # Output format
//!
//! This module uses curl-style line prefixes:
//! - `>` -- outgoing request lines (method+URL, request headers, request body)
//! - `<` -- incoming response lines (response headers, response body)
//! - `*` -- connection metadata (HTTP status with timing)

use reqwest::header::HeaderMap;

use percent_encoding::percent_decode_str;

use crate::output::colorize;

/// Headers whose values are always fully redacted in debug output.
const REDACTED_HEADERS: &[&str] = &[
    "authorization",
    "www-authenticate",
    "x-api-key",
    "api-key",
    "apikey",
    "x-api-token",
    "x-auth-token",
    "auth-token",
    "cookie",
    "set-cookie",
    "proxy-authorization",
    "proxy-authenticate",
    "x-amz-security-token",
    "x-csrf-token",
    "x-xsrf-token",
    "x-session-token",
    "x-access-token",
];

// Note: The previous `BODY_SENSITIVE_KEYS` exact-match array has been replaced
// by the hybrid `is_sensitive_body_key` function below, which combines exact
// matches for short stems with substring matches for compound stems. This
// catches `new_password`, `id_token`, `private_key`, etc. without a growing
// denylist. See the function documentation for the rationale.

/// Maximum response body bytes to display in debug output (128 KiB).
const MAX_BODY_DISPLAY: usize = 128 * 1024;

/// Print a debug dump of the outgoing HTTP request to stderr.
///
/// Redacts sensitive headers (including any spec-declared custom auth header
/// names passed via `extra_sensitive_headers`), sensitive body keys, and
/// sensitive query parameters in the URL. Called just before `.send()` in
/// the executor.
///
/// Uses curl-style `>` prefix for request lines.
pub(crate) fn dump_request(
    method: &str,
    url: &str,
    headers: &HeaderMap,
    body: Option<&str>,
    extra_sensitive_headers: &[&str],
    extra_sensitive_query_params: &[&str],
) {
    let safe_url = redact_url_query(url, extra_sensitive_query_params);
    eprintln!();
    eprintln!(
        "{} {} {}",
        colorize(">", "36"),
        colorize(method, "1"),
        safe_url,
    );

    print_headers(">", headers, extra_sensitive_headers);

    if let Some(b) = body {
        if !b.is_empty() {
            eprintln!(">");
            let redacted = redact_body(b);
            print_body_preview(">", "Request body", &redacted);
        }
    }
    eprintln!(">");
}

/// Print a debug dump of a GraphQL request to stderr.
///
/// Unlike the generic [`dump_request`], this function understands the GraphQL
/// body structure and formats it for readability:
/// - `query` is shown as raw multi-line GraphQL text (not a JSON-escaped string)
/// - `variables` are pretty-printed JSON with sensitive key redaction
///
/// Uses curl-style `>` prefix for request lines. GraphQL always POSTs so the
/// method is hardcoded; the URL is shown and sanitized.
pub(crate) fn dump_graphql_request(
    url: &str,
    headers: &HeaderMap,
    query: &str,
    variables: &serde_json::Value,
    extra_sensitive_headers: &[&str],
) {
    // GraphQL requests never carry auth in query params.
    let safe_url = redact_url_query(url, &[]);
    eprintln!();
    eprintln!(
        "{} {} {}",
        colorize(">", "36"),
        colorize("POST", "1"),
        safe_url,
    );

    print_headers(">", headers, extra_sensitive_headers);

    // Query: show as raw GraphQL text, not a JSON-escaped string.
    let query_trimmed = query.trim();
    if !query_trimmed.is_empty() {
        eprintln!(">");
        eprintln!("> {}", colorize("GraphQL query:", "90"));
        for line in query_trimmed.lines() {
            eprintln!("> {line}");
        }
    }

    // Variables: pretty-print with sensitive key redaction.
    if let serde_json::Value::Object(map) = variables {
        if !map.is_empty() {
            let mut vars = variables.clone();
            redact_json_value(&mut vars);
            if let Ok(pretty) = serde_json::to_string_pretty(&vars) {
                eprintln!(">");
                print_body_preview(">", "GraphQL variables", &pretty);
            }
        }
    }
    eprintln!(">");
}

/// Print a debug dump of the HTTP response to stderr.
///
/// Includes status, timing, headers, and a truncated body preview.
/// Uses curl-style `*` prefix for status/timing and `<` for response lines.
pub(crate) fn dump_response(
    status: u16,
    latency_ms: u64,
    headers: &HeaderMap,
    body: &str,
    extra_sensitive_headers: &[&str],
) {
    let status_color = if status < 300 {
        "32" // green
    } else if status < 400 {
        "33" // yellow
    } else {
        "31" // red
    };

    eprintln!(
        "* {}",
        colorize(&format!("HTTP {status} ({latency_ms}ms)"), status_color),
    );

    print_headers("<", headers, extra_sensitive_headers);

    if !body.is_empty() {
        eprintln!("<");
        let redacted = redact_body(body);
        print_body_preview("<", "Response body", &redacted);
    }
    eprintln!();
}

/// Print a rich error display to stderr when `--debug` is active.
///
/// Augments the standard JSON error output with a formatted block showing
/// the HTTP status, error body (pretty-printed if JSON), and timing.
/// Uses curl-style `*` prefix for status/timing and `<` for response lines.
pub(crate) fn dump_error_response(
    status: u16,
    latency_ms: u64,
    headers: &HeaderMap,
    body: &str,
    extra_sensitive_headers: &[&str],
) {
    eprintln!(
        "* {}",
        colorize(&format!("HTTP {status} ({latency_ms}ms)"), "31"),
    );

    print_headers("<", headers, extra_sensitive_headers);

    if !body.is_empty() {
        eprintln!("<");
        let redacted = redact_body(body);
        print_body_preview("<", "Error body", &redacted);
    }
    eprintln!();
}

/// Print a streaming response note to stderr when the body cannot be buffered.
///
/// Used for binary downloads, SSE, and `x-fern-streaming` responses where the
/// body is consumed by the caller and cannot be dumped. Emits:
/// - a `*` line with the HTTP status (no latency)
/// - a `<` line per response header (sensitive headers are redacted)
/// - a final `<` line indicating the body is not buffered
pub(crate) fn dump_streaming_note(status: u16, headers: &HeaderMap, extra_sensitive_headers: &[&str]) {
    eprintln!(
        "* {}",
        colorize(&format!("HTTP {status}"), "36"),
    );

    print_headers("<", headers, extra_sensitive_headers);

    eprintln!("< [streaming response — body not buffered]");
}

/// Returns true if the header name is sensitive and should be redacted.
///
/// Checks the static denylist plus any spec-derived custom auth header names
/// (e.g., `X-Custom-Auth` from an `apiKey in: header` security scheme).
fn is_sensitive_header(name: &str, extra_sensitive: &[&str]) -> bool {
    if REDACTED_HEADERS.iter().any(|&h| h.eq_ignore_ascii_case(name)) {
        return true;
    }
    extra_sensitive.iter().any(|&h| h.eq_ignore_ascii_case(name))
}

/// Emit each header to stderr, prefixed with `line_prefix` (typically `">"` or
/// `"<"`), with sensitive values replaced by `[REDACTED]`.
fn print_headers(line_prefix: &str, headers: &HeaderMap, extra_sensitive: &[&str]) {
    for (name, value) in headers.iter() {
        let name_str = name.as_str();
        let display_value = if is_sensitive_header(name_str, extra_sensitive) {
            "[REDACTED]".to_string()
        } else {
            crate::output::sanitize_for_terminal(value.to_str().unwrap_or("<non-utf8>"))
        };
        eprintln!("{line_prefix} {}: {display_value}", colorize(name_str, "90"));
    }
}

/// Redact sensitive keys in a body string (request or response).
///
/// - JSON bodies: recursively walks the value tree and replaces any value
///   whose key matches [`is_sensitive_body_key`] (case-insensitive, hybrid
///   exact + substring strategy) with `"[REDACTED]"`.
/// - Form-encoded bodies (`key=value&...`): redacts values for matching keys.
/// - Other formats: returned unchanged.
pub(crate) fn redact_body(body: &str) -> String {
    // Try JSON first.
    if let Ok(mut parsed) = serde_json::from_str::<serde_json::Value>(body) {
        if parsed.is_object() || parsed.is_array() {
            redact_json_value(&mut parsed);
            return serde_json::to_string(&parsed).unwrap_or_else(|_| body.to_string());
        }
        // Bare scalars (null, bool, number, string) — nothing to redact.
        return body.to_string();
    }

    // Try form-encoded (`key=value&key2=value2`).
    if looks_like_form_encoded(body) {
        return redact_form_encoded(body);
    }

    // Unknown format — return as-is.
    body.to_string()
}

/// Recursively walk a JSON value and replace sensitive keys with `[REDACTED]`.
fn redact_json_value(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::Object(map) => {
            for (key, val) in map.iter_mut() {
                if is_sensitive_body_key(key) {
                    *val = serde_json::Value::String("[REDACTED]".to_string());
                } else {
                    redact_json_value(val);
                }
            }
        }
        serde_json::Value::Array(arr) => {
            for item in arr.iter_mut() {
                redact_json_value(item);
            }
        }
        _ => {}
    }
}

/// Case-insensitive check for sensitive body keys using a hybrid strategy.
///
/// **Exact matches** catch short stems that would over-match as substrings
/// (e.g., `"token"` alone should match, but we don't want `"tokenizer"` to
/// match — the substring list uses the longer `"token"` stem only in compound
/// key names like `access_token`).
///
/// **Substring matches** catch compound key names like `new_password`,
/// `id_token`, `private_key`, `password_confirmation`, etc. without needing
/// to enumerate every variant.
///
/// Note: keys like `password_hint` and `passwordless` will be flagged because
/// `"password"` is a substring. This is a defensible over-redaction — fields
/// with `password` in their name may carry secret-adjacent content, and
/// over-redacting in debug output is far safer than under-redacting.
fn is_sensitive_body_key(key: &str) -> bool {
    let k = key.to_ascii_lowercase();

    // Exact match for short stems that would over-match as substrings.
    const EXACT: &[&str] = &["token", "secret", "key", "session", "pwd", "jwt", "bearer", "cookie"];
    if EXACT.iter().any(|&e| e == k) {
        return true;
    }

    // Substring match for compound stems (catches new_password, id_token, etc.).
    //
    // `"token"`, `"secret"`, `"key"`, and `"session"` are intentionally absent
    // as bare substrings — they live in the EXACT list above. Using them as
    // substrings would over-match innocent keys like `tokenizer`, `secretary`,
    // `monkey`, and `session_count`. Compound key names use delimiter-bounded
    // patterns (`_token`, `token_`, `_secret`, `secret_`, `_key`, `key_`,
    // `_session`, `session_`) to catch `access_token`, `client_secret`,
    // `api_key`, `session_id`, etc. Hyphenated variants mirror the same pattern.
    const STEMS: &[&str] = &[
        "password",
        "passwd",
        "_secret",
        "secret_",
        "-secret",
        "secret-",
        "_token",
        "token_",
        "-token",
        "token-",
        "_key",
        "key_",
        "-key",
        "key-",
        "_session",
        "session_",
        "-session",
        "session-",
        "apikey",
        "apisecret",
        "api_key",
        "api-key",
        "private_key",
        "authorization",
        "credential",
    ];
    STEMS.iter().any(|s| k.contains(s))
}

/// Returns true if a URL query parameter name is sensitive and should be
/// redacted. Combines the body-key heuristic with extra spec-derived names
/// (e.g. from `apiKey in: query` security schemes).
fn is_sensitive_query_param(name: &str, extra: &[&str]) -> bool {
    is_sensitive_body_key(name) || extra.iter().any(|e| e.eq_ignore_ascii_case(name))
}

/// Redact embedded credentials and sensitive query parameters from a URL.
///
/// - Replaces `user:pass@host` credentials with `[REDACTED]@host`.
/// - Inspects each query pair and replaces the values of sensitive keys with
///   `[REDACTED]`. The `extra_sensitive_params` slice carries spec-derived
///   param names (e.g. from `apiKey in: query` security schemes) that
///   supplement the built-in heuristic.
///
/// Returns the URL unchanged if it isn't parseable.
pub(crate) fn redact_url_query(raw_url: &str, extra_sensitive_params: &[&str]) -> String {
    let Ok(mut url) = reqwest::Url::parse(raw_url) else {
        return raw_url.to_string();
    };

    // Redact embedded HTTP Basic credentials (`https://user:pass@host`).
    if url.password().is_some() || url.username() != "" {
        // Replacing credentials in a `Url` requires set_username/set_password,
        // which only succeed for non-cannot-be-a-base URLs — swallow errors.
        let _ = url.set_username("[REDACTED]");
        let _ = url.set_password(None);
    }

    if url.query().is_none() {
        return url.to_string();
    }
    let pairs: Vec<(String, String)> = url.query_pairs().into_owned().collect();
    let rebuilt: String = pairs
        .iter()
        .map(|(k, v)| {
            let val = if is_sensitive_query_param(k, extra_sensitive_params) {
                "[REDACTED]".to_string()
            } else {
                v.clone()
            };
            format!("{}={}", k, val)
        })
        .collect::<Vec<_>>()
        .join("&");
    url.set_query(if rebuilt.is_empty() { None } else { Some(&rebuilt) });
    url.to_string()
}

/// Heuristic: does the string look like `application/x-www-form-urlencoded`?
/// Checks for `key=value` pairs separated by `&`.
fn looks_like_form_encoded(body: &str) -> bool {
    // Must contain at least one `=` and no newlines (to distinguish from
    // plain text or multi-line payloads).
    !body.contains('\n') && body.contains('=') && body.split('&').all(|pair| {
        pair.contains('=') || pair.is_empty()
    })
}

/// Redact values for sensitive keys in a form-encoded string.
fn redact_form_encoded(body: &str) -> String {
    body.split('&')
        .map(|pair| {
            if let Some((key, _value)) = pair.split_once('=') {
                // Decode the key for matching (form keys may be percent-encoded).
                let decoded_key = percent_decode_str(key).decode_utf8_lossy();
                if is_sensitive_body_key(&decoded_key) {
                    format!("{key}=[REDACTED]")
                } else {
                    pair.to_string()
                }
            } else {
                pair.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("&")
}

/// Pretty-print a body preview to stderr, truncating if needed.
///
/// `line_prefix` is the curl-style prefix character: `">"` for request bodies,
/// `"<"` for response and error bodies. Each emitted line is prefixed with
/// `{line_prefix} `.
///
/// Attempts JSON pretty-printing for objects/arrays; falls back to raw text
/// for bare scalars (`null`, numbers, bools, bare strings) and non-JSON.
fn print_body_preview(line_prefix: &str, label: &str, body: &str) {
    let display = if body.len() > MAX_BODY_DISPLAY {
        let mut end = MAX_BODY_DISPLAY;
        while !body.is_char_boundary(end) {
            end -= 1;
        }
        &body[..end]
    } else {
        body
    };

    let formatted = if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(display) {
        if parsed.is_object() || parsed.is_array() {
            serde_json::to_string_pretty(&parsed).unwrap_or_else(|_| display.to_string())
        } else {
            // Bare JSON scalars — show raw text, not misleading pretty-print.
            display.to_string()
        }
    } else {
        display.to_string()
    };

    eprintln!("{line_prefix} {}:", colorize(label, "90"));
    for line in formatted.lines() {
        eprintln!("{line_prefix} {line}");
    }
    if body.len() > MAX_BODY_DISPLAY {
        eprintln!(
            "{line_prefix} ... ({} bytes total, truncated)",
            body.len()
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // -- Header redaction -----------------------------------------

    #[test]
    fn sensitive_headers_detected() {
        let no_extra: &[&str] = &[];
        assert!(is_sensitive_header("Authorization", no_extra));
        assert!(is_sensitive_header("authorization", no_extra));
        assert!(is_sensitive_header("X-Api-Key", no_extra));
        assert!(is_sensitive_header("x-api-key", no_extra));
        assert!(is_sensitive_header("X-Auth-Token", no_extra));
        assert!(is_sensitive_header("Cookie", no_extra));
        assert!(is_sensitive_header("Proxy-Authorization", no_extra));
        // Newly added static entries.
        assert!(is_sensitive_header("X-Amz-Security-Token", no_extra));
        assert!(is_sensitive_header("x-csrf-token", no_extra));
        assert!(is_sensitive_header("X-Session-Token", no_extra));
        assert!(is_sensitive_header("Set-Cookie", no_extra));
        assert!(is_sensitive_header("set-cookie", no_extra));
    }

    #[test]
    fn non_sensitive_headers_pass_through() {
        let no_extra: &[&str] = &[];
        assert!(!is_sensitive_header("Content-Type", no_extra));
        assert!(!is_sensitive_header("Accept", no_extra));
        assert!(!is_sensitive_header("X-Request-Id", no_extra));
        assert!(!is_sensitive_header("User-Agent", no_extra));
    }

    #[test]
    fn custom_auth_header_redacted() {
        let extra = &["X-Custom-Auth"];
        assert!(is_sensitive_header("X-Custom-Auth", extra));
        assert!(is_sensitive_header("x-custom-auth", extra));
        // Static denylist still works alongside custom.
        assert!(is_sensitive_header("authorization", extra));
        // Non-matching header is not redacted.
        assert!(!is_sensitive_header("Content-Type", extra));
    }

    // -- Body redaction: JSON -------------------------------------

    #[test]
    fn json_top_level_password_redacted() {
        let body = r#"{"username":"alice","password":"super-secret","client_secret":"xyz"}"#;
        let redacted = redact_body(body);
        let parsed: serde_json::Value = serde_json::from_str(&redacted).unwrap();
        assert_eq!(parsed["username"], "alice");
        assert_eq!(parsed["password"], "[REDACTED]");
        assert_eq!(parsed["client_secret"], "[REDACTED]");
    }

    #[test]
    fn json_nested_password_redacted() {
        let body = r#"{"user":{"password":"nested-secret","name":"bob"}}"#;
        let redacted = redact_body(body);
        let parsed: serde_json::Value = serde_json::from_str(&redacted).unwrap();
        assert_eq!(parsed["user"]["password"], "[REDACTED]");
        assert_eq!(parsed["user"]["name"], "bob");
    }

    #[test]
    fn json_case_insensitive_key_match() {
        let body = r#"{"Password":"upper","API_KEY":"k1","apiKey":"k2","Token":"t"}"#;
        let redacted = redact_body(body);
        let parsed: serde_json::Value = serde_json::from_str(&redacted).unwrap();
        assert_eq!(parsed["Password"], "[REDACTED]");
        assert_eq!(parsed["API_KEY"], "[REDACTED]");
        assert_eq!(parsed["apiKey"], "[REDACTED]");
        assert_eq!(parsed["Token"], "[REDACTED]");
    }

    #[test]
    fn json_array_with_sensitive_keys() {
        let body = r#"[{"password":"s1"},{"password":"s2","name":"c"}]"#;
        let redacted = redact_body(body);
        let parsed: serde_json::Value = serde_json::from_str(&redacted).unwrap();
        assert_eq!(parsed[0]["password"], "[REDACTED]");
        assert_eq!(parsed[1]["password"], "[REDACTED]");
        assert_eq!(parsed[1]["name"], "c");
    }

    #[test]
    fn json_all_sensitive_keys_redacted() {
        let body = r#"{
            "password":"p","client_secret":"cs","refresh_token":"rt",
            "access_token":"at","api_key":"ak","apikey":"ak2",
            "secret":"s","token":"t","safe_field":"ok"
        }"#;
        let redacted = redact_body(body);
        let parsed: serde_json::Value = serde_json::from_str(&redacted).unwrap();
        assert_eq!(parsed["password"], "[REDACTED]");
        assert_eq!(parsed["client_secret"], "[REDACTED]");
        assert_eq!(parsed["refresh_token"], "[REDACTED]");
        assert_eq!(parsed["access_token"], "[REDACTED]");
        assert_eq!(parsed["api_key"], "[REDACTED]");
        assert_eq!(parsed["apikey"], "[REDACTED]");
        assert_eq!(parsed["secret"], "[REDACTED]");
        assert_eq!(parsed["token"], "[REDACTED]");
        assert_eq!(parsed["safe_field"], "ok");
    }

    // -- Body redaction: form-encoded -----------------------------

    #[test]
    fn form_encoded_body_redaction() {
        let body = "username=alice&password=super-secret&client_secret=xyz";
        let redacted = redact_body(body);
        assert!(redacted.contains("username=alice"));
        assert!(redacted.contains("password=[REDACTED]"));
        assert!(redacted.contains("client_secret=[REDACTED]"));
        assert!(!redacted.contains("super-secret"));
        assert!(!redacted.contains("xyz"));
    }

    #[test]
    fn form_encoded_case_insensitive() {
        let body = "Password=upper&API_KEY=k1";
        let redacted = redact_body(body);
        assert!(redacted.contains("Password=[REDACTED]"));
        assert!(redacted.contains("API_KEY=[REDACTED]"));
    }

    // -- Body redaction: non-JSON, non-form -----------------------

    #[test]
    fn non_json_non_form_body_left_untouched() {
        let body = "Hello, this is plain text with no special structure.";
        let redacted = redact_body(body);
        assert_eq!(redacted, body);
    }

    #[test]
    fn multiline_body_not_treated_as_form() {
        let body = "line1\npassword=secret";
        let redacted = redact_body(body);
        // Multi-line body should not be treated as form-encoded.
        assert_eq!(redacted, body);
    }

    // -- Body preview: JSON pretty-print gates on object/array ----

    #[test]
    fn bare_json_scalar_not_pretty_printed() {
        // `null`, numbers, bools, and bare strings are valid JSON but
        // should be shown raw, not as misleading single-token output.
        let cases = vec!["null", "42", "true", r#""oops""#];
        for case in cases {
            // Just verify redact_body doesn't mangle it.
            let redacted = redact_body(case);
            assert_eq!(redacted, case);
        }
    }

    // -- Truncation -----------------------------------------------

    #[test]
    fn body_preview_truncation() {
        let long_body = "x".repeat(MAX_BODY_DISPLAY + 100);
        let mut end = MAX_BODY_DISPLAY;
        while !long_body.is_char_boundary(end) {
            end -= 1;
        }
        let display = &long_body[..end];
        assert_eq!(display.len(), MAX_BODY_DISPLAY);
    }

    #[test]
    fn body_preview_truncation_multibyte() {
        // Each euro sign is 3 bytes; boundary will fall mid-character.
        let long_body = "\u{20ac}".repeat(MAX_BODY_DISPLAY);
        let mut end = MAX_BODY_DISPLAY;
        while !long_body.is_char_boundary(end) {
            end -= 1;
        }
        let display = &long_body[..end];
        assert!(display.len() <= MAX_BODY_DISPLAY);
        assert!(std::str::from_utf8(display.as_bytes()).is_ok());
    }

    // -- Smoke: no panics -----------------------------------------

    #[test]
    fn dump_request_does_not_panic() {
        let mut headers = HeaderMap::new();
        headers.insert("content-type", "application/json".parse().unwrap());
        headers.insert("authorization", "Bearer secret123".parse().unwrap());
        dump_request(
            "POST",
            "https://api.example.com/v1/users",
            &headers,
            Some(r#"{"name":"test"}"#),
            &[],
            &[],
        );
    }

    #[test]
    fn dump_request_with_custom_auth_header() {
        let mut headers = HeaderMap::new();
        headers.insert("content-type", "application/json".parse().unwrap());
        headers.insert("x-custom-auth", "my-secret-key".parse().unwrap());
        // Without extra_sensitive_headers, the custom header is not redacted.
        // With it, it is.
        dump_request(
            "GET",
            "https://api.example.com/v1/me",
            &headers,
            None,
            &["X-Custom-Auth"],
            &[],
        );
    }

    #[test]
    fn dump_response_does_not_panic() {
        let mut headers = HeaderMap::new();
        headers.insert("content-type", "application/json".parse().unwrap());
        dump_response(200, 42, &headers, r#"{"id": 1}"#, &[]);
    }

    #[test]
    fn dump_error_response_does_not_panic() {
        let mut headers = HeaderMap::new();
        headers.insert("content-type", "application/json".parse().unwrap());
        dump_error_response(404, 15, &headers, r#"{"error": "not found"}"#, &[]);
    }

    // -- Gap 1: hybrid body-key matching (compound password variants) ---

    #[test]
    fn compound_password_keys_redacted() {
        for key in &[
            "new_password",
            "current_password",
            "old_password",
            "password_confirmation",
            "confirm_password",
        ] {
            assert!(
                is_sensitive_body_key(key),
                "`{key}` should be flagged as sensitive"
            );
        }
    }

    #[test]
    fn compound_token_keys_redacted() {
        for key in &["id_token", "access_token", "refresh_token", "bearer_token"] {
            assert!(
                is_sensitive_body_key(key),
                "`{key}` should be flagged as sensitive"
            );
        }
    }

    #[test]
    fn private_key_and_api_variants_redacted() {
        for key in &[
            "private_key",
            "private_key_jwt",
            "client_secret",
            "api_key",
            "apiKey",
            "API_KEY",
        ] {
            assert!(
                is_sensitive_body_key(key),
                "`{key}` should be flagged as sensitive (case-insensitive)"
            );
        }
    }

    #[test]
    fn short_exact_stems_redacted() {
        for key in &["pwd", "jwt", "bearer", "cookie", "token", "secret"] {
            assert!(
                is_sensitive_body_key(key),
                "`{key}` (exact short form) should be flagged as sensitive"
            );
        }
    }

    #[test]
    fn safe_keys_not_over_matched() {
        for key in &["username", "email", "id", "name", "count", "tokenizer", "secretary"] {
            assert!(
                !is_sensitive_body_key(key),
                "`{key}` should NOT be flagged as sensitive"
            );
        }
    }

    // password_hint and passwordless ARE flagged — documented defensive
    // over-redaction because "password" is a substring.
    #[test]
    fn password_adjacent_keys_defensively_redacted() {
        for key in &["password_hint", "passwordless"] {
            assert!(
                is_sensitive_body_key(key),
                "`{key}` contains 'password' substring; defensive over-redaction is expected"
            );
        }
    }

    // -- Gap 2: response body redaction ---------------------------

    #[test]
    fn redact_body_catches_response_tokens() {
        let body = r#"{"access_token":"REAL_TOKEN","refresh_token":"ALSO","other":"keep"}"#;
        let redacted = redact_body(body);
        let parsed: serde_json::Value = serde_json::from_str(&redacted).unwrap();
        assert_eq!(parsed["access_token"], "[REDACTED]");
        assert_eq!(parsed["refresh_token"], "[REDACTED]");
        assert_eq!(parsed["other"], "keep");
        assert!(
            !redacted.contains("REAL_TOKEN"),
            "cleartext token must not appear in redacted output"
        );
    }

    // -- Gap 3: URL query-string redaction ------------------------

    #[test]
    fn url_query_api_key_redacted() {
        let url = "https://api.example.com/v1/data?api_key=secret123&page=2";
        let safe = redact_url_query(url, &[]);
        assert!(safe.contains("api_key=%5BREDACTED%5D") || safe.contains("api_key=[REDACTED]"));
        assert!(safe.contains("page=2"));
        assert!(!safe.contains("secret123"));
    }

    #[test]
    fn url_query_password_redacted_page_preserved() {
        let url = "https://api.example.com/v1/data?password=foo&page=2";
        let safe = redact_url_query(url, &[]);
        assert!(!safe.contains("foo"), "password value should be redacted");
        assert!(safe.contains("page=2"));
    }

    #[test]
    fn url_query_no_query_unchanged() {
        let url = "https://api.example.com/v1/data";
        let safe = redact_url_query(url, &[]);
        assert_eq!(safe, url);
    }

    #[test]
    fn url_query_extra_spec_param_redacted() {
        // Simulates an ApiKeyQuery scheme with name "my_key".
        let url = "https://api.example.com/v1/data?my_key=s3cr3t&page=1";
        let safe = redact_url_query(url, &["my_key"]);
        assert!(!safe.contains("s3cr3t"), "extra spec param should be redacted");
        assert!(safe.contains("page=1"));
    }

    // -- New tests: curl-style format verification ----------------

    /// Verify that the source file does not contain box-drawing characters.
    #[test]
    fn no_box_drawing_characters_in_source() {
        // The source text of this file is embedded at compile time to assert
        // that no unicode box characters remain.
        const SOURCE: &str = include_str!("debug.rs");
        assert!(
            !SOURCE.contains('\u{2500}'),
            "unicode box character (U+2500) found in src/debug.rs — remove all box separators"
        );
    }

    // -- New tests: dump_streaming_note ---------------------------

    #[test]
    fn dump_streaming_note_does_not_panic() {
        let mut headers = HeaderMap::new();
        headers.insert("content-type", "text/event-stream".parse().unwrap());
        headers.insert("authorization", "Bearer token123".parse().unwrap());
        // Should not panic — auth header is redacted via static denylist.
        dump_streaming_note(200, &headers, &[]);
    }

    #[test]
    fn dump_streaming_note_no_panic_error_status() {
        let mut headers = HeaderMap::new();
        headers.insert("content-type", "application/octet-stream".parse().unwrap());
        dump_streaming_note(206, &headers, &[]);
    }

    #[test]
    fn dump_streaming_note_empty_headers_no_panic() {
        let headers = HeaderMap::new();
        dump_streaming_note(200, &headers, &[]);
    }

    // -- New headers aligned with TypeScript SDK ------------------

    #[test]
    fn new_sensitive_headers_detected() {
        for header in &[
            "www-authenticate",
            "api-key",
            "apikey",
            "x-api-token",
            "auth-token",
            "proxy-authenticate",
            "x-xsrf-token",
            "x-access-token",
        ] {
            assert!(
                is_sensitive_header(header, &[]),
                "`{header}` should be in the redacted-headers list"
            );
        }
    }

    // -- New body-key stems aligned with TypeScript SDK -----------

    #[test]
    fn key_and_session_exact_stems_redacted() {
        for key in &["key", "session"] {
            assert!(
                is_sensitive_body_key(key),
                "`{key}` (exact short form) should be flagged as sensitive"
            );
        }
    }

    #[test]
    fn hyphenated_compound_stems_redacted() {
        for key in &[
            "access-token",
            "auth-token",
            "api-key",
            "api-secret",
            "session-id",
        ] {
            assert!(
                is_sensitive_body_key(key),
                "`{key}` (hyphenated compound) should be flagged as sensitive"
            );
        }
    }

    #[test]
    fn apisecret_redacted() {
        assert!(is_sensitive_body_key("apisecret"));
        assert!(is_sensitive_body_key("APISECRET"));
    }

    #[test]
    fn safe_keys_not_over_matched_extended() {
        // Make sure new stems don't over-match
        for key in &["monkey", "donkey", "keyboard", "bucket", "socket"] {
            assert!(
                !is_sensitive_body_key(key),
                "`{key}` should NOT be flagged as sensitive"
            );
        }
    }

    // -- URL credential redaction ---------------------------------

    #[test]
    fn url_credentials_redacted() {
        let url = "https://user:hunter2@api.example.com/v1/data";
        let safe = redact_url_query(url, &[]);
        assert!(!safe.contains("hunter2"), "password should be redacted from URL");
        assert!(!safe.contains("user:"), "username should be redacted from URL");
        assert!(safe.contains("api.example.com"), "host should be preserved");
    }

    #[test]
    fn url_no_credentials_unchanged() {
        let url = "https://api.example.com/v1/data?page=2";
        let safe = redact_url_query(url, &[]);
        assert!(safe.contains("page=2"));
        assert!(!safe.contains("[REDACTED]"));
    }

    // -- dump_graphql_request: variable redaction -----------------

    /// `dump_graphql_request` must redact sensitive keys in `variables` while
    /// leaving non-sensitive keys intact. Tested via `redact_json_value`
    /// directly since the dump goes to stderr and is not easily capturable
    /// in unit tests. The wire tests cover the subprocess output.
    #[test]
    fn graphql_variables_password_key_redacted_before_dump() {
        use serde_json::json;
        let mut vars = json!({"username": "alice", "password": "s3cr3t", "page": 1});
        redact_json_value(&mut vars);
        assert_eq!(vars["username"], "alice", "non-sensitive key must be preserved");
        assert_eq!(vars["password"], "[REDACTED]", "password key must be redacted");
        assert_eq!(vars["page"], 1, "non-sensitive key must be preserved");
    }

    #[test]
    fn graphql_variables_nested_secret_redacted() {
        use serde_json::json;
        let mut vars = json!({"auth": {"client_secret": "tok", "scope": "read"}});
        redact_json_value(&mut vars);
        assert_eq!(vars["auth"]["client_secret"], "[REDACTED]");
        assert_eq!(vars["auth"]["scope"], "read");
    }

    #[test]
    fn dump_graphql_request_does_not_panic_with_empty_variables() {
        use serde_json::Value;
        let headers = HeaderMap::new();
        dump_graphql_request(
            "https://api.example.com/graphql",
            &headers,
            "query { ping }",
            &Value::Object(serde_json::Map::new()),
            &[],
        );
    }

    #[test]
    fn dump_graphql_request_does_not_panic_with_populated_variables() {
        use serde_json::json;
        let mut headers = HeaderMap::new();
        headers.insert("authorization", "Bearer tok".parse().unwrap());
        dump_graphql_request(
            "https://api.example.com/graphql",
            &headers,
            "query($id: ID!) { node(id: $id) { id name } }",
            &json!({"id": "n1", "password": "should-be-redacted"}),
            &[],
        );
    }
}
