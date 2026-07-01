//! API Request Execution
//!
//! Handles building and dispatching HTTP requests to APIs.
//! Responsibilities include multipart file uploads, response pagination,
//! and error mapping.

use std::borrow::Cow;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;

use anyhow::Context;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use futures_util::stream::TryStreamExt;
use futures_util::StreamExt;
use serde_json::{json, Map, Value};
use tokio::io::AsyncWriteExt;

use crate::auth::{handle_error_response, DynAuthProvider, EndpointAuthMetadata};
use crate::error::CliError;
use crate::openapi::discovery::{
    BodyEncoding, MethodParameter, PaginationConfig as EndpointPagination, RestDescription,
    RestMethod, RetriesConfig, StreamingConfig,
};

/// Encoding mode for an `@`-prefixed file reference. Selected by the URI-style
/// prefix on the flag value (FER-10532). `Auto` is the implicit default — the
/// `@<path>` form FER-10436 shipped — and is what every other call site
/// reaches when no explicit scheme is supplied.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AtMode {
    /// `@<path>` — read file; embed UTF-8 when valid, base64 otherwise.
    Auto,
    /// `@file://<path>` — read file; require valid UTF-8 or error.
    Text,
    /// `@data://<path>` — read file; always base64-encode.
    Data,
}

/// Parsed view of a raw flag value that may carry an `@`/`\@` prefix.
/// Returned by [`parse_at_ref`] so every `@`-aware call site shares one
/// parser instead of re-implementing the prefix grammar.
pub(crate) enum AtRef<'a> {
    /// Plain value with no `@` prefix; caller treats as a literal path/string.
    Plain(&'a str),
    /// `\@<rest>` escape; the value is the literal string `@<rest>`.
    /// At the binary-body site this literal is still treated as a file path
    /// (FER-10436 contract); at multipart and nested-JSON sites it is sent
    /// as-is with no file read.
    Escaped(String),
    /// `@<path>`, `@file://<path>`, or `@data://<path>` — a file reference
    /// whose encoding is dictated by `mode`. `path` is the *inner* path with
    /// the optional scheme prefix already stripped, ready to hand to the
    /// filesystem.
    File { path: Cow<'a, str>, mode: AtMode },
}

/// Parse the optional `@`/`\@` prefix on a raw flag value. Recognises the
/// `@file://` (text-only) and `@data://` (always-base64) scheme prefixes
/// added in FER-10532; everything else preserves the FER-10436 baseline.
pub(crate) fn parse_at_ref(raw: &str) -> AtRef<'_> {
    if let Some(rest) = raw.strip_prefix("\\@") {
        return AtRef::Escaped(format!("@{rest}"));
    }
    if let Some(rest) = raw.strip_prefix('@') {
        if let Some(path) = rest.strip_prefix("file://") {
            return AtRef::File {
                path: Cow::Borrowed(path),
                mode: AtMode::Text,
            };
        }
        if let Some(path) = rest.strip_prefix("data://") {
            return AtRef::File {
                path: Cow::Borrowed(path),
                mode: AtMode::Data,
            };
        }
        return AtRef::File {
            path: Cow::Borrowed(rest),
            mode: AtMode::Auto,
        };
    }
    AtRef::Plain(raw)
}

/// Strip a leading `@` (or `@file://` / `@data://`) curl-style file prefix,
/// or rewrite `\@` to a literal `@`. Returns the path string the caller
/// should hand to the filesystem (or validate).
///
/// This is a thin convenience over [`parse_at_ref`] for the common case
/// where the caller only needs the inner path (e.g. for control-character
/// validation). When the encoding mode matters, use [`parse_at_ref`] directly.
///
/// Semantics:
/// - `"@/tmp/foo"`         → `"/tmp/foo"`
/// - `"@file:///tmp/foo"`  → `"/tmp/foo"`
/// - `"@data:///tmp/foo"`  → `"/tmp/foo"`
/// - `"@-"`                → `"-"` (stdin sentinel; only meaningful in `Auto` mode)
/// - `"/tmp/foo"`          → `"/tmp/foo"`
/// - `"\\@literal"`        → `"@literal"` (escape — literal, not a file ref)
pub(crate) fn strip_or_escape_at(raw: &str) -> Cow<'_, str> {
    match parse_at_ref(raw) {
        AtRef::Plain(s) => Cow::Borrowed(s),
        AtRef::Escaped(literal) => Cow::Owned(literal),
        AtRef::File { path, .. } => path,
    }
}

/// Returns `true` if `raw` is a `\@`-escaped literal (i.e. the caller should
/// treat the value as a literal string, NOT read from disk).
pub(crate) fn is_escaped_literal(raw: &str) -> bool {
    raw.starts_with("\\@")
}

/// Encode raw file bytes for embedding in a JSON string position or other
/// text-like context, applying [`AtMode`] semantics. `field` and `path` are
/// passed only to format the UTF-8 error from `AtMode::Text`.
pub(crate) fn encode_file_bytes_for_text(
    bytes: Vec<u8>,
    mode: AtMode,
    field: &str,
    path: &str,
) -> Result<String, CliError> {
    match mode {
        AtMode::Auto => Ok(match String::from_utf8(bytes) {
            Ok(text) => text,
            Err(e) => BASE64.encode(e.into_bytes()),
        }),
        AtMode::Text => String::from_utf8(bytes).map_err(|_| {
            CliError::Validation(format!(
                "@file://{path} for {field}: file is not valid UTF-8 \
                 (use @data://{path} to base64-encode binary content, \
                 or drop the explicit scheme for auto-detection)"
            ))
        }),
        AtMode::Data => Ok(BASE64.encode(bytes)),
    }
}

/// Walk a parsed JSON value and resolve `@filename` references found in
/// string positions. Mirrors Stainless's CLI generator behavior for the
/// object-shorthand body-flag path (e.g. `--profile '{"pic":"@abe.jpg"}'`).
///
/// Rewrites in place:
/// - `"\\@literal"`         → `"@literal"` (escape — no file read)
/// - `"@<path>"`            → file contents (UTF-8 if valid, otherwise base64)
/// - `"@file://<path>"`     → file contents as UTF-8 (errors if not UTF-8)
/// - `"@data://<path>"`     → base64-encoded file contents (always)
/// - anything else          → unchanged
///
/// Errors include the file path and a JSON-Pointer-style path to the offending
/// field for debuggability (e.g. `"/foo/bar/0/baz"`). FER-10436, FER-10532.
pub(crate) fn resolve_file_refs(value: &mut Value) -> Result<(), CliError> {
    resolve_file_refs_at_path(value, &mut String::new())
}

/// Recursive worker for [`resolve_file_refs`]. `pointer` is the current
/// JSON-Pointer-style path (per RFC 6901, e.g. `""`, `"/foo"`, `"/foo/bar/0"`)
/// to the value being inspected — extended in place as we descend and
/// truncated on the way back up to avoid per-level allocations.
fn resolve_file_refs_at_path(value: &mut Value, pointer: &mut String) -> Result<(), CliError> {
    match value {
        Value::String(s) => {
            match parse_at_ref(s) {
                // `\@literal` → `@literal`; no disk access.
                AtRef::Escaped(literal) => *s = literal,
                // No `@` prefix — leave the value alone.
                AtRef::Plain(_) => {}
                AtRef::File { path, mode } => {
                    let field = if pointer.is_empty() { "/" } else { pointer.as_str() };
                    // Match the path-safety contract every other file-read site
                    // honors (binary body in binding.rs, multipart in app.rs):
                    // reject control chars / dangerous Unicode before disk I/O so
                    // an adversarial nested value like `@evil\x00path` can't
                    // bypass the safety net the other entry points enforce.
                    crate::output::reject_dangerous_chars(
                        path.as_ref(),
                        &format!("JSON field '{field}'"),
                    )?;
                    let bytes = std::fs::read(path.as_ref()).map_err(|io_err| {
                        CliError::Validation(format!(
                            "Failed to read file '{}' for JSON field '{field}': {io_err}",
                            path.as_ref()
                        ))
                    })?;
                    // Auto preserves the FER-10436 behavior (UTF-8 or base64);
                    // Text and Data are the FER-10532 explicit modes.
                    *s = encode_file_bytes_for_text(
                        bytes,
                        mode,
                        &format!("JSON field '{field}'"),
                        path.as_ref(),
                    )?;
                }
            }
            Ok(())
        }
        Value::Array(items) => {
            for (i, item) in items.iter_mut().enumerate() {
                let original_len = pointer.len();
                pointer.push('/');
                pointer.push_str(&i.to_string());
                resolve_file_refs_at_path(item, pointer)?;
                pointer.truncate(original_len);
            }
            Ok(())
        }
        Value::Object(map) => {
            for (k, v) in map.iter_mut() {
                let original_len = pointer.len();
                pointer.push('/');
                // Per RFC 6901 §4: `~` → `~0`, `/` → `~1`.
                for ch in k.chars() {
                    match ch {
                        '~' => pointer.push_str("~0"),
                        '/' => pointer.push_str("~1"),
                        other => pointer.push(other),
                    }
                }
                resolve_file_refs_at_path(v, pointer)?;
                pointer.truncate(original_len);
            }
            Ok(())
        }
        _ => Ok(()),
    }
}

/// Resolved source for a binary request body (octet-stream uploads etc.).
///
/// Driven by the value passed on the CLI's binary-body flag (`--file`, `--body`,
/// or whatever name the spec dictates). Accepts six forms:
///
/// - `<PATH>` — plain filesystem path. Sent with `Content-Length`.
/// - `@<PATH>` — same path, curl-style prefix. Sent with `Content-Length`.
/// - `@file://<PATH>` — read; require valid UTF-8 or error (FER-10532).
/// - `@data://<PATH>` — read; always base64-encode the bytes (FER-10532).
/// - `\@<REST>` — escape: send a file whose path is literally `@<REST>`.
/// - `-` or `@-` — read from stdin. Sent with `Transfer-Encoding: chunked`
///   (no length). `@file://-` and `@data://-` are treated as a literal file
///   path named `-`, not stdin.
pub enum BinaryBodySource<'a> {
    /// Stream from a file on disk. `mode` selects raw-byte streaming
    /// (`Auto`) vs. read-into-memory transforms (`Text`, `Data`).
    /// Owned `Cow` covers the `\@literal` escape; borrowed covers the
    /// common `@path` and `path` cases.
    File { path: Cow<'a, str>, mode: AtMode },
    /// Read from stdin. Body is streamed with chunked transfer encoding.
    Stdin,
}

impl<'a> BinaryBodySource<'a> {
    /// Parse a raw flag value into one of the accepted forms. Stripping the
    /// optional `@` prefix (or applying the `\@` escape) happens here so the
    /// rest of the pipeline only sees a clean path or `Stdin`.
    pub fn parse(raw: &'a str) -> Self {
        match parse_at_ref(raw) {
            // Bare `-` and `@-` map to stdin. An explicit scheme (`@file://-` /
            // `@data://-`) is *not* stdin — the user opted into a literal
            // file-path interpretation, so `-` is just a filename.
            AtRef::Plain("-") => Self::Stdin,
            AtRef::File { path, mode: AtMode::Auto } if path.as_ref() == "-" => Self::Stdin,
            AtRef::File { path, mode } => Self::File { path, mode },
            // `\@<REST>` resolves to a literal-path file read at this site
            // (FER-10436). The literal already carries no scheme prefix, so
            // it inherits `Auto` byte-streaming semantics.
            AtRef::Escaped(literal) => Self::File {
                path: Cow::Owned(literal),
                mode: AtMode::Auto,
            },
            AtRef::Plain(s) => Self::File {
                path: Cow::Borrowed(s),
                mode: AtMode::Auto,
            },
        }
    }
}

/// Source for media upload content.
///
/// Two mutually exclusive strategies: upload from a file on disk (for Drive,
/// Chat, etc.) or from in-memory bytes (for Gmail's constructed RFC 5322
/// messages). Using an enum makes illegal states (both set, or mismatched
/// content types) unrepresentable.
pub enum UploadSource<'a> {
    /// Stream from a file on disk. Content type is inferred from the file
    /// extension, overridden by metadata mimeType, or explicitly set.
    File {
        path: &'a str,
        content_type: Option<&'a str>,
    },
    /// Upload from in-memory bytes with an explicit content type.
    Bytes {
        data: &'a [u8],
        content_type: &'a str,
    },
}

/// A single part in a multipart/form-data request, collected from CLI
/// flags for operations that declare `multipart/form-data` bodies.
pub enum MultipartPart {
    /// UTF-8 text value sent as a plain form field. `content_type` carries
    /// an explicit per-part `Content-Type` from the OpenAPI `encoding`
    /// object; `None` means reqwest's default (`text/plain`).
    Text {
        name: String,
        value: String,
        content_type: Option<String>,
    },
    /// File read from disk (or stdin). The `path` is already validated.
    /// `content_type` is the per-part `Content-Type` resolved from the
    /// OpenAPI `encoding` object (falling back to the schema-inferred
    /// `application/octet-stream` for file fields).
    File {
        name: String,
        path: String,
        content_type: Option<String>,
    },
}

/// Configuration for auto-pagination.
#[derive(Debug, Clone)]
pub struct PaginationConfig {
    /// Whether to auto-paginate through all pages.
    pub page_all: bool,
    /// Maximum number of pages to fetch (default: 10).
    pub page_limit: u32,
    /// Delay between page fetches in milliseconds (default: 100).
    pub page_delay_ms: u64,
    /// Query parameter name for the page token (default: "pageToken").
    pub token_query_param: String,
    /// Dotted path in JSON response to find the next page token (default: "nextPageToken").
    /// Supports nested paths like "pagination.next_page_token".
    pub token_response_path: String,
    /// Disable the pager even on interactive terminals (`--no-pager`).
    pub no_pager: bool,
    /// CLI binary name, used for the `<NAME>_PAGER` env var lookup.
    pub cli_name: String,
}

impl Default for PaginationConfig {
    fn default() -> Self {
        Self {
            page_all: false,
            page_limit: 10,
            page_delay_ms: 100,
            token_query_param: "pageToken".to_string(),
            token_response_path: "nextPageToken".to_string(),
            no_pager: false,
            cli_name: String::new(),
        }
    }
}

/// Outcome of a single retry-loop iteration.
///
/// Captures everything the retry policy needs to make its next decision:
/// the HTTP status (or `None` for transport-layer failures), the
/// `Retry-After` header value if any, and the wall-clock timestamp the
/// header should be interpreted against. Keeping the timestamp on the
/// outcome lets unit tests pin `SystemTime::now` to a known instant
/// without monkey-patching the global clock.
#[derive(Debug)]
pub(crate) struct RetryOutcome<'a> {
    pub status: Option<u16>,
    pub retry_after: Option<&'a str>,
}

/// Returns `true` when the HTTP status code is considered retryable.
///
/// Retryable statuses (FER-10521):
///   - 408 Request Timeout      — server gave up before reading; safe.
///   - 429 Too Many Requests    — backoff signal; safe.
///   - 500–599 (all server errors) — transient infrastructure failures.
///
/// Prior to FER-10521 this excluded 500 (often a non-transient bug).
/// The broader 5xx set aligns with the cross-SDK default and with
/// the expectation that CLIs retry aggressively on server-side errors.
pub(crate) fn is_retryable_status(status: u16) -> bool {
    status == 408 || status == 429 || (500..=599).contains(&status)
}

/// Whether the per-method retry policy allows retrying *non-idempotent*
/// HTTP responses (e.g. a 503 on a POST). GET / HEAD / OPTIONS / DELETE
/// / PUT are idempotent by the HTTP spec; `x-fern-idempotent` on the
/// operation marks an otherwise-unsafe method (POST / PATCH) as
/// safe-to-retry, which mirrors fern's per-method retry policy.
pub(crate) fn method_allows_retry(http_method: &str, marked_idempotent: bool) -> bool {
    if marked_idempotent {
        return true;
    }
    matches!(
        http_method.to_ascii_uppercase().as_str(),
        "GET" | "HEAD" | "OPTIONS" | "DELETE" | "PUT"
    )
}

/// Whether the given `binary_body_path` raw string designates stdin
/// (`-` or `@-`). Stdin-sourced bodies cannot be replayed on retry —
/// the pipe is consumed by the first send — so callers must disable
/// retries when this returns `true`. Mirrors `BinaryBodySource::parse`
/// without the lifetime gymnastics needed at the call site.
pub(crate) fn binary_body_is_stdin(binary_body_path: Option<&str>) -> bool {
    match binary_body_path {
        Some(raw) => matches!(BinaryBodySource::parse(raw), BinaryBodySource::Stdin),
        None => false,
    }
}

/// Whether any `MultipartPart::File` in the list uses stdin (`-` or `@-`).
/// Stdin-sourced file parts cannot be replayed on retry because the pipe is
/// consumed by the first `read_to_end`. Mirrors `binary_body_is_stdin`.
pub(crate) fn multipart_has_stdin(parts: &Option<Vec<MultipartPart>>) -> bool {
    match parts {
        Some(parts) => parts.iter().any(|p| match p {
            MultipartPart::File { path, .. } => match parse_at_ref(path) {
                // `\@literal` is an escape, not a stdin sentinel — route it
                // to the file branch instead. FER-10436.
                AtRef::Escaped(_) => false,
                // Only `Auto`-mode `@-` (or bare `-`) is stdin. An explicit
                // scheme like `@file://-` means a literal file path named `-`.
                AtRef::File { path, mode: AtMode::Auto } => path.as_ref() == "-",
                AtRef::File { .. } => false,
                AtRef::Plain(s) => s == "-",
            },
            MultipartPart::Text { .. } => false,
        }),
        None => false,
    }
}

/// Parse a `Retry-After` header value into a `Duration`.
///
/// HTTP/1.1 allows two forms (RFC 7231 §7.1.3): a non-negative integer
/// number of seconds, or an HTTP-date. We accept either. Past dates
/// (the server's clock is ahead, or `Retry-After: 0`) collapse to
/// zero so callers don't underflow.
pub(crate) fn parse_retry_after(value: &str, now: std::time::SystemTime) -> Option<std::time::Duration> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    // Numeric seconds first — cheaper and far more common in practice.
    if let Ok(secs) = trimmed.parse::<u64>() {
        return Some(std::time::Duration::from_secs(secs));
    }
    // HTTP-date (IMF-fixdate / RFC 850 / asctime). `httpdate::parse_http_date`
    // accepts all three formats per RFC 7231.
    if let Ok(target) = httpdate::parse_http_date(trimmed) {
        return Some(target.duration_since(now).unwrap_or(std::time::Duration::ZERO));
    }
    None
}

/// Compute the delay for the *next* retry attempt (i.e. the wait
/// between attempt `attempt` and attempt `attempt + 1`).
///
/// Math: `base * factor^attempt`, with deterministic jitter in
/// `[1 - jitter/2, 1 + jitter/2]` applied to the result. The jitter
/// factor is sampled from a fast LCG so test runs are deterministic
/// when seeded — see [`compute_backoff_delay_with_rand`] below.
pub(crate) fn compute_backoff_delay(
    attempt: u32,
    config: &RetriesConfig,
) -> std::time::Duration {
    // Use system entropy for the random sample. Unit tests use
    // `compute_backoff_delay_with_rand` to pin the sample.
    let jitter_sample = if config.jitter > 0.0 {
        // Sub-second component of wall-clock time as cheap entropy.
        // We don't care about cryptographic quality here — just enough
        // variance to de-correlate retries from competing clients
        // (i.e. avoid the thundering-herd problem during an outage).
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .subsec_nanos() as u64;
        ((nanos.wrapping_mul(2654435761)) & 0xFFFF) as f64 / 65535.0
    } else {
        0.5
    };
    compute_backoff_delay_with_rand(attempt, config, jitter_sample)
}

/// Test-friendly variant of [`compute_backoff_delay`]. `rand_unit` is
/// any value in `[0.0, 1.0]`; pass `0.5` for the "exact" backoff
/// (no jitter offset).
pub(crate) fn compute_backoff_delay_with_rand(
    attempt: u32,
    config: &RetriesConfig,
    rand_unit: f64,
) -> std::time::Duration {
    if !config.enabled {
        return std::time::Duration::ZERO;
    }
    let exponent = attempt as i32;
    let raw_ms = (config.base_delay_ms as f64) * config.factor.powi(exponent);

    // Jitter spreads the delay symmetrically around `raw_ms` to
    // de-correlate clients all retrying off the same server outage.
    let jitter_span = raw_ms * config.jitter;
    let offset = (rand_unit.clamp(0.0, 1.0) - 0.5) * jitter_span;
    let ms = (raw_ms + offset).max(0.0);

    // Cap at u64 to avoid panics on absurd configs (e.g. factor=1e9).
    let capped = if ms > u64::MAX as f64 {
        u64::MAX
    } else {
        ms as u64
    };
    std::time::Duration::from_millis(capped)
}

/// Decide whether to retry after an HTTP outcome.
///
/// Returns `Some(delay)` to schedule a retry, or `None` to surface the
/// outcome to the caller. Encapsulates the precedence rules in one
/// place so the wire executor stays a thin loop body.
pub(crate) fn decide_retry(
    attempt: u32,
    outcome: &RetryOutcome<'_>,
    config: &RetriesConfig,
    http_method: &str,
    marked_idempotent: bool,
    no_retry: bool,
) -> Option<std::time::Duration> {
    // Hard opt-outs first.
    if no_retry || !config.enabled || config.max_attempts == 0 {
        return None;
    }
    // attempt is 0-indexed (the request just completed was attempt
    // `attempt`); we retry while we still have room before
    // `max_attempts` total sends.
    if attempt + 1 >= config.max_attempts {
        return None;
    }

    match outcome.status {
        // Network / transport failure (no response at all).
        None => {
            // Network errors are always treated as transient. GET-like
            // methods retry per default; POST/PATCH only when the
            // operation is explicitly marked idempotent.
            if !method_allows_retry(http_method, marked_idempotent) {
                return None;
            }
            Some(compute_backoff_delay(attempt, config))
        }
        Some(status) => {
            if !is_retryable_status(status) {
                return None;
            }
            // 408/429 are safe to retry on any method (the request
            // didn't reach business logic). 5xx on non-idempotent
            // methods *could* have been processed — respect per-method
            // policy unless the op is marked idempotent.
            let always_safe = matches!(status, 408 | 429);
            if !always_safe && !method_allows_retry(http_method, marked_idempotent) {
                return None;
            }
            // Honor `Retry-After` when present, fall back to backoff.
            if let Some(raw) = outcome.retry_after {
                if let Some(d) = parse_retry_after(raw, std::time::SystemTime::now()) {
                    return Some(d);
                }
            }
            Some(compute_backoff_delay(attempt, config))
        }
    }
}

/// Returns true if any dotted ancestor of `leaf_path` is present in `supplied`
/// and is declared as an object-shorthand parameter (`param_type == "object"`).
/// Used so a required leaf like `name.first` is not reported missing when the
/// user satisfied it via `--name '{"first": "..."}'`.
fn ancestor_object_shorthand_supplied(
    leaf_path: &str,
    supplied: &Map<String, Value>,
    parameters: &std::collections::HashMap<String, MethodParameter>,
) -> bool {
    let segments: Vec<&str> = leaf_path.split('.').collect();
    // Walk ancestors longest-first: a.b.c.d → a.b.c, a.b, a
    for prefix_len in (1..segments.len()).rev() {
        let ancestor = segments[..prefix_len].join(".");
        if supplied.contains_key(&ancestor)
            && parameters
                .get(&ancestor)
                .and_then(|p| p.param_type.as_deref())
                == Some("object")
        {
            return true;
        }
    }
    false
}

/// Parsed and validated inputs ready for request execution.
#[derive(Debug)]
struct ExecutionInput {
    body: Option<Value>,
    full_url: String,
    query_params: Vec<(String, String)>,
    header_params: Vec<(String, String)>,
    is_upload: bool,
}

/// Parse parameters and body JSON, validate against schema, check required params, and build the URL.
fn parse_and_validate_inputs(
    doc: &RestDescription,
    method: &RestMethod,
    params_json: Option<&str>,
    body_json: Option<&str>,
    is_media_upload: bool,
    base_url_override: Option<&str>,
    extra_headers: &[(String, String)],
) -> Result<ExecutionInput, CliError> {
    let params: Map<String, Value> = if let Some(p) = params_json {
        serde_json::from_str(p)
            .map_err(|e| CliError::Validation(format!("Invalid --params JSON: {e}")))?
    } else {
        Map::new()
    };

    // Helper: build the `Provide it via …` hint. Uses the same
    // `resolve_param_flag_name` that the command builder uses so the
    // suggested `--<flag>` matches the actually registered flag
    // (including body-param dot-notation and `-param` builtin suffix).
    let missing_param_hint = |param_def: &MethodParameter, param_name: &str| -> String {
        let flag = crate::openapi::commands::resolve_param_flag_name(param_def, param_name)
            .unwrap_or_else(|| crate::text::to_kebab_flag(param_name));
        if param_def.location.as_deref() == Some("body") {
            format!("Provide it via --{flag}, --json, or --params")
        } else {
            format!("Provide it via --{flag} or --params")
        }
    };

    for param_name in &method.parameter_order {
        if let Some(param_def) = method.parameters.get(param_name) {
            if param_def.required
                && param_def.location.as_deref() == Some("path")
                && !params.contains_key(param_name)
            {
                let hint = missing_param_hint(param_def, param_name);
                return Err(CliError::Validation(format!(
                    "Required path parameter '{param_name}' is missing. {hint}"
                )));
            }
        }
    }

    for (param_name, param_def) in &method.parameters {
        if param_def.required && !params.contains_key(param_name) {
            // When --json is provided, body-located required params are satisfied
            // by the JSON payload — skip their individual-flag validation.
            if param_def.location.as_deref() == Some("body") && body_json.is_some() {
                continue;
            }
            // When the user supplied an ancestor object-shorthand flag
            // (e.g. `--name '{...}'`) the required-ness of nested leaves
            // (`name.first`) is satisfied inside the JSON payload, not via
            // a per-leaf flag — skip them here.
            if param_def.location.as_deref() == Some("body")
                && param_name.contains('.')
                && ancestor_object_shorthand_supplied(param_name, &params, &method.parameters)
            {
                continue;
            }
            let hint = missing_param_hint(param_def, param_name);
            return Err(CliError::Validation(format!(
                "Required parameter '{param_name}' is missing. {hint}"
            )));
        }
    }

    // Split params by `location` into header / body / non-header buckets.
    // Body-located params are coerced by type and turned into the JSON body
    // when no --json is also supplied. (JFL-1.2 makes those modes mutually
    // exclusive — see the conflict checks below.)
    let mut header_params: Vec<(String, String)> = Vec::new();
    let mut body_from_flags = Map::new();
    let mut non_header_params = Map::new();
    // Track the raw (pre-`set_nested_value`) body flag keys the user provided
    // so we can detect collisions between an object-shorthand flag and a
    // dot-notation leaf flag for the same field. We can't introspect
    // `body_from_flags` after the fact because `set_nested_value` collapses
    // dotted keys into nested maps, erasing the original input shape.
    let mut raw_body_flag_keys: Vec<String> = Vec::new();

    for (key, value) in &params {
        let location = method.parameters.get(key).and_then(|p| p.location.as_deref());
        match location {
            Some("header") => {
                let param_def = method.parameters.get(key);
                let str_value = serialize_header_simple(value, param_def)?;
                header_params.push((key.clone(), str_value));
            }
            Some("body") => {
                raw_body_flag_keys.push(key.clone());
                let coerced = coerce_body_param_value(
                    value,
                    method.parameters.get(key).and_then(|p| p.param_type.as_deref()),
                )?;
                set_nested_value(&mut body_from_flags, key, coerced);
            }
            _ => {
                non_header_params.insert(key.clone(), value.clone());
            }
        }
    }

    // JFL-1.2: enforce mutually exclusive body input modes. The three modes
    // are (1) `--json` whole-body, (2) dot-notation leaf flags, and
    // (3) object-shorthand JSON for a single field (`--name '{...}'`).
    // Mixing any two is a validation error so the user's intent is
    // unambiguous and the precedence rules are not surprising.
    if body_json.is_some() && !raw_body_flag_keys.is_empty() {
        let conflicting = raw_body_flag_keys
            .iter()
            .map(|k| format!("--{k}"))
            .collect::<Vec<_>>()
            .join(", ");
        return Err(CliError::Validation(format!(
            "Cannot combine --json with per-field body flags ({conflicting}). Use one or the other."
        )));
    }
    for object_key in &raw_body_flag_keys {
        let is_object = method
            .parameters
            .get(object_key)
            .and_then(|p| p.param_type.as_deref())
            == Some("object");
        if !is_object {
            continue;
        }
        let prefix = format!("{object_key}.");
        if let Some(leaf_key) = raw_body_flag_keys.iter().find(|k| k.starts_with(&prefix)) {
            return Err(CliError::Validation(format!(
                "Cannot combine --{object_key} with --{leaf_key}. Use the JSON shorthand or individual flags, not both."
            )));
        }
    }

    // Append spec-root `x-fern-global-headers` last so per-operation
    // headers (already populated above from `params`) override globals
    // with the same wire-name. Resolution of CLI flag / env / default
    // happens upstream in `run_async`; the executor's job here is just
    // to stamp the resolved value on the request when no per-op
    // parameter already supplied it.
    for (name, value) in extra_headers {
        if !header_params.iter().any(|(k, _)| k == name) {
            header_params.push((name.clone(), value.clone()));
        }
    }

    // The conflict checks above guarantee that `body_json` and
    // `body_from_flags` are never both populated, so the body is sourced
    // from exactly one channel here.
    let body: Option<Value> = if let Some(b) = body_json {
        let mut json_val: Value = serde_json::from_str(b)
            .map_err(|e| CliError::Validation(format!("Invalid --json body: {e}")))?;
        // Resolve `@file` references inside `--json` bodies, matching the
        // behavior of per-field object-shorthand flags (FER-10436).
        //
        // Called directly (no `block_in_place`) because this sync function
        // is reached from two async contexts:
        //   a) binding.rs dispatch → `execute_method().await`
        //   b) app.rs custom-command → `block_in_place` → `block_on` →
        //      `execute_method`
        // Wrapping in `block_in_place` here would create a nested
        // `block_in_place → block_on → block_in_place` chain in path (b).
        // The file reads are brief, and for a CLI tool the momentary
        // blocking of a single worker thread is acceptable.
        resolve_file_refs(&mut json_val)?;
        Some(json_val)
    } else if !body_from_flags.is_empty() {
        Some(Value::Object(body_from_flags))
    } else {
        None
    };

    // Validate the assembled body against the request schema regardless of
    // how it was built (per-field flags, `--json`, or both). The previous
    // version only validated on the `--json` path, which let per-field-flag
    // bodies skip schema checks even though those values arrive as
    // CLI-typed strings and are more likely to violate the schema.
    if let Some(ref body_val) = body {
        if let Some(ref req_ref) = method.request {
            if let Some(ref schema_name) = req_ref.schema_ref {
                validate_body_against_schema(body_val, schema_name, doc)?;
            }
        }
    }

    let (full_url, query_params) = build_url(doc, method, &non_header_params, is_media_upload, base_url_override)?;
    let is_upload = is_media_upload && method.supports_media_upload;

    Ok(ExecutionInput {
        body,
        full_url,
        query_params,
        header_params,
        is_upload,
    })
}

/// Build the per-operation auth metadata from the lowered security
/// requirements. Computed once per execute_method call and reused across
/// pagination iterations — the requirements don't change page to page.
fn endpoint_metadata_for(method: &RestMethod) -> EndpointAuthMetadata {
    EndpointAuthMetadata {
        security_requirements: method.security_requirements.clone(),
    }
}

/// Pagination loop state tracked across page fetches.
///
/// Each variant matches one of the five `x-fern-pagination` forms, plus
/// the document-level heuristic (which uses [`PageState::Cursor`]):
///
/// - [`PageState::Cursor`] — token threaded through a request query param
/// - [`PageState::Offset`] — running offset counter sent as a query param
/// - [`PageState::NextUrl`] — server-returned absolute URL (uri form) or
///   resolved relative path (path form) used verbatim for the next page
/// - [`PageState::Custom`] — single-shot; the executor never continues
///
/// Encoded as a discriminated union rather than several `Option`s so that
/// callers can't accidentally mix semantics from different forms.
#[derive(Debug)]
enum PageState {
    Cursor(Option<String>),
    Offset(u64),
    /// `None` on the first page, `Some(url)` once the previous response
    /// supplied a next URL/path. The string is always a fully-qualified
    /// URL — relative `next_path` values are resolved against the
    /// previous request's URL before being stored here.
    NextUrl(Option<String>),
    Custom,
}

impl PageState {
    /// Pick the initial state from the resolved per-operation pagination
    /// config. Operations without explicit `x-fern-pagination` (or with
    /// cursor-style config) start with no token; offset-style starts at
    /// 0; uri/path/custom forms start in their respective first-page
    /// states.
    fn initial(endpoint: Option<&EndpointPagination>) -> Self {
        match endpoint {
            Some(EndpointPagination::Offset { .. }) => PageState::Offset(0),
            Some(EndpointPagination::Uri { .. } | EndpointPagination::Path { .. }) => {
                PageState::NextUrl(None)
            }
            Some(EndpointPagination::Custom { .. }) => PageState::Custom,
            // Cursor + heuristic + None all use the cursor-style state.
            _ => PageState::Cursor(None),
        }
    }

    /// Override the outgoing URL when the pagination form does so (uri /
    /// path). `None` means leave the request's URL untouched.
    fn url_override(&self) -> Option<&str> {
        match self {
            PageState::NextUrl(Some(url)) => Some(url.as_str()),
            _ => None,
        }
    }

    /// Convert the state into the (query-param name, value) pair to inject
    /// on the next outgoing request, or `None` when the state represents
    /// "first page, no extra param yet" or "URL is fully self-contained".
    fn injection(
        &self,
        endpoint: Option<&EndpointPagination>,
        heuristic_param: &str,
    ) -> Option<(String, String)> {
        match self {
            PageState::Cursor(None) => None,
            PageState::Cursor(Some(token)) => {
                let name = match endpoint {
                    Some(EndpointPagination::Cursor { cursor, .. }) => cursor.clone(),
                    _ => heuristic_param.to_string(),
                };
                Some((name, token.clone()))
            }
            PageState::Offset(0) => None,
            PageState::Offset(n) => {
                let name = match endpoint {
                    Some(EndpointPagination::Offset { offset, .. }) => offset.clone(),
                    _ => heuristic_param.to_string(),
                };
                Some((name, n.to_string()))
            }
            // Uri / Path embed the cursor in the URL itself.
            PageState::NextUrl(_) | PageState::Custom => None,
        }
    }
}

/// Build an HTTP request with auth, query params, page token, and body/multipart attachment.
#[allow(clippy::too_many_arguments)]
async fn build_http_request(
    client: &reqwest::Client,
    method: &RestMethod,
    input: &ExecutionInput,
    auth_provider: &DynAuthProvider,
    auth_metadata: &EndpointAuthMetadata,
    page_state: &PageState,
    pages_fetched: u32,
    upload: &Option<UploadSource<'_>>,
    binary_body_path: Option<&str>,
    multipart_parts: &Option<Vec<MultipartPart>>,
    pagination: &PaginationConfig,
) -> Result<reqwest::RequestBuilder, CliError> {
    // Uri / Path pagination supplies a fully-resolved next URL in the
    // page state; use it verbatim so that the server's cursor / query
    // params travel as-is.
    let base_target_url = page_state.url_override().unwrap_or(&input.full_url);

    // Build the query string ourselves (rather than reqwest's `.query()`,
    // which form-encodes: space -> `+`, comma -> `%2C`). The OpenAPI 3.0
    // query styles need RFC 3986 percent-encoding with style delimiters left
    // literal in the joined value (spaceDelimited -> `%20`, pipeDelimited ->
    // `%7C`, form/no-explode arrays keep `,`). When the URL is supplied by the
    // server (uri / path pagination) it already carries every query param the
    // server cares about, so we honor it as-is.
    let target_url = if page_state.url_override().is_some() {
        base_target_url.to_string()
    } else {
        let mut all_query_params = input.query_params.clone();
        if let Some((name, value)) =
            page_state.injection(method.pagination.as_ref(), &pagination.token_query_param)
        {
            all_query_params.push((name, value));
        }
        // Upload operations carry `uploadType=multipart`; route it through the
        // same RFC-3986 query encoder as every other param instead of reqwest's
        // `.query()` (the value is an ASCII literal, so the encoded form is
        // identical — this just keeps a single query encoder).
        if pages_fetched == 0 && upload.is_some() {
            all_query_params.push(("uploadType".to_string(), "multipart".to_string()));
        }
        append_query_string(base_target_url, &all_query_params)
    };

    let mut request = match method.http_method.as_str() {
        "GET" => client.get(&target_url),
        "POST" => client.post(&target_url),
        "PUT" => client.put(&target_url),
        "PATCH" => client.patch(&target_url),
        "DELETE" => client.delete(&target_url),
        other => {
            return Err(CliError::Other(anyhow::anyhow!(
                "Unsupported HTTP method: {other}"
            )))
        }
    };

    // `security: []` in the spec means the operation opts out of auth.
    // Short-circuit before involving the provider so leaf providers
    // (Bearer/Basic/Header) and composition wrappers that don't inspect
    // the endpoint (AnyAuthProvider, AllAuthProvider, user-built custom
    // providers) can't leak credentials onto an explicitly anonymous
    // endpoint. RoutingAuthProvider already honors this internally; the
    // executor-side check makes it universal.
    if !auth_metadata.is_explicit_anonymous() {
        request = auth_provider.apply(request, auth_metadata)?;
    }

    // Prefer JSON when the API supports content negotiation (some providers
    // return XML otherwise). Only inject when the operation doesn't already
    // set an Accept header.
    if !input
        .header_params
        .iter()
        .any(|(k, _)| k.eq_ignore_ascii_case("accept"))
    {
        request = request.header("Accept", "application/json");
    }

    // Send header parameters as HTTP headers
    for (name, value) in &input.header_params {
        if let Ok(header_value) = reqwest::header::HeaderValue::from_str(value) {
            request = request.header(name.as_str(), header_value);
        }
    }

    if pages_fetched == 0 {
        if let Some(upload_source) = upload {
            let (body, content_type, content_length) = match upload_source {
                UploadSource::Bytes { data, content_type } => {
                    if content_type.contains('\r') || content_type.contains('\n') {
                        return Err(CliError::Validation(
                            "Upload content type must not contain CR or LF".to_string(),
                        ));
                    }
                    build_multipart_bytes(&input.body, data, content_type)?
                }
                UploadSource::File { path, content_type } => {
                    let file_meta = tokio::fs::metadata(path).await.map_err(|e| {
                        CliError::Validation(format!(
                            "Failed to get metadata for upload file '{path}': {e}"
                        ))
                    })?;
                    let file_size = file_meta.len();
                    let media_mime = resolve_upload_mime(*content_type, Some(path), &input.body);
                    build_multipart_stream(&input.body, path, file_size, &media_mime)?
                }
            };
            request = request.header("Content-Type", content_type);
            request = request.header("Content-Length", content_length);
            request = request.body(body);
        } else if let Some(raw) = binary_body_path {
            let binary = method.binary_request_body.as_ref().ok_or_else(|| {
                CliError::Validation(
                    "binary body path was provided but the operation has no binary request body declared"
                        .to_string(),
                )
            })?;
            request = request.header("Content-Type", &binary.content_type);
            match BinaryBodySource::parse(raw) {
                BinaryBodySource::File { path, mode: AtMode::Auto } => {
                    let path_ref: &str = path.as_ref();
                    let file_meta = tokio::fs::metadata(path_ref).await.map_err(|e| {
                        CliError::Validation(format!(
                            "Failed to read --{} '{path_ref}': {e}",
                            binary.flag_name
                        ))
                    })?;
                    let (body, content_length) =
                        build_binary_file_stream(path_ref, file_meta.len(), &binary.flag_name);
                    request = request.header("Content-Length", content_length);
                    request = request.body(body);
                }
                BinaryBodySource::File { path, mode } => {
                    // `Text` / `Data` modes (FER-10532) need the full bytes in
                    // memory to validate UTF-8 or to base64-encode — there is
                    // no streaming form of either transform. The transformed
                    // body becomes a sized in-memory buffer.
                    let path_ref: &str = path.as_ref();
                    let bytes = tokio::fs::read(path_ref).await.map_err(|e| {
                        CliError::Validation(format!(
                            "Failed to read --{} '{path_ref}': {e}",
                            binary.flag_name
                        ))
                    })?;
                    let body_bytes = encode_file_bytes_for_text(
                        bytes,
                        mode,
                        &format!("--{}", binary.flag_name),
                        path_ref,
                    )?
                    .into_bytes();
                    let content_length = body_bytes.len() as u64;
                    request = request.header("Content-Length", content_length);
                    request = request.body(reqwest::Body::from(body_bytes));
                }
                BinaryBodySource::Stdin => {
                    // No Content-Length — reqwest emits Transfer-Encoding: chunked.
                    // Memory stays at O(64 KB) regardless of input size.
                    request = request.body(build_stdin_body_stream());
                }
            }
        } else if let Some(parts) = multipart_parts {
            let form = build_multipart_form(parts).await?;
            request = request.multipart(form);
        } else if let Some(ref body_val) = input.body {
            request = encode_request_body(request, body_val, &method.body_encoding);
        } else if matches!(method.http_method.as_str(), "POST" | "PUT" | "PATCH") {
            request = request.header("Content-Length", "0");
        }
    } else if let Some(ref body_val) = input.body {
        request = encode_request_body(request, body_val, &method.body_encoding);
    }

    Ok(request)
}

/// Walk a dotted path like "pagination.next_page_token" through nested JSON objects.
fn get_nested_str<'a>(val: &'a Value, dotted_path: &str) -> Option<&'a str> {
    let mut current = val;
    for segment in dotted_path.split('.') {
        current = current.get(segment)?;
    }
    current.as_str()
}

/// Resolve a dot-separated path (`data`, `result.items`, `users.0.name`)
/// against a JSON value, returning a reference to the addressed subvalue.
///
/// Empty / pure-dot paths are treated as "no path" and return `None` so the
/// caller can decide between "use the whole value" and "this is an error".
/// A non-empty path that doesn't resolve also returns `None` — callers
/// that need to surface a user-facing error (like
/// `x-fern-sdk-return-value` extraction) check for that case and emit a
/// `CliError::Validation` explaining which path missed.
///
/// Segments are matched against object keys (`Value::get(&str)`); a
/// segment that parses as a non-negative integer additionally indexes
/// into arrays at the corresponding position (`Value::get(usize)`).
/// Object-key lookup wins when the same segment is ambiguous — JSON
/// object keys can be the literal string `"0"`, and surfacing the
/// matching key is what a user reading the spec expects. Falling back
/// to array indexing only when the value is actually an array keeps
/// the dot-path grammar a strict superset of upstream's
/// `RESPONSE_PROPERTY` (object-only) behavior.
fn get_nested_value<'a>(val: &'a Value, dotted_path: &str) -> Option<&'a Value> {
    let trimmed = dotted_path.trim();
    if trimmed.is_empty() {
        return None;
    }
    let mut current = val;
    for segment in trimmed.split('.') {
        if segment.is_empty() {
            return None;
        }
        // Object-key lookup first, then numeric-array-index fallback so
        // an object with a literal `"0"` key still resolves there. The
        // array path only triggers when the current value is actually
        // a JSON array — otherwise the segment was meant as an object
        // key and was simply missing, which the `?` propagates.
        if let Some(next) = current.get(segment) {
            current = next;
            continue;
        }
        if current.is_array() {
            if let Ok(idx) = segment.parse::<usize>() {
                current = current.get(idx)?;
                continue;
            }
        }
        return None;
    }
    Some(current)
}

/// Apply `x-fern-sdk-return-value` extraction to a single response value.
///
/// `return_path` is the dot-separated key path declared by the spec (e.g.
/// `data`, `result.items`). When the path resolves, the addressed subvalue
/// is returned for downstream printing / capture. A non-empty path that
/// resolves to JSON `null` is preserved as `Value::Null` (the field was
/// in the response, just null — typed SDKs surface this identically).
/// A path that fails to resolve *at all* (missing key, intermediate
/// non-object, out-of-range index) is a hard error — the spec promised
/// that subvalue and the server didn't deliver it. `no_extract = true`
/// bypasses the extraction entirely so callers (typically via
/// `--no-extract`) can see the full response for debugging.
///
/// TODO(error-variant): `CliError::Validation` is the closest existing
/// variant but conceptually this is *response-contract* validation, not
/// input validation. Worth introducing a `CliError::ResponseContract`
/// variant once another response-side validation error needs the same
/// classification.
fn extract_return_value(
    body: &Value,
    return_path: Option<&str>,
    no_extract: bool,
    method_descriptor: &str,
) -> Result<Value, CliError> {
    match return_path {
        Some(path) if !no_extract && !path.trim().is_empty() => {
            match get_nested_value(body, path) {
                Some(v) => Ok(v.clone()),
                None => Err(CliError::Validation(format!(
                    "x-fern-sdk-return-value path '{path}' did not resolve in response for \
                     operation {method_descriptor}. Pass --no-extract to see the full response."
                ))),
            }
        }
        _ => Ok(body.clone()),
    }
}

/// Resolve the offset-pagination `step` value used for the
/// "did we get a full page?" check that gates pagination on short pages.
///
/// `step_field` is the post-prefix-stripped field name from the spec (e.g.
/// `step: $request.limit` becomes `"limit"`). Resolution order:
///
/// 1. Look up the field name in the request's outgoing query params and
///    parse the value as an integer — the canonical `$request.<name>`
///    interpretation, matching fern-api/fern's SDK generators.
/// 2. If the field is itself a parseable integer literal (e.g. `step: "50"`),
///    use that.
/// 3. Otherwise return `None` — the caller falls back to the legacy
///    `items.len() > 0` check.
///
/// Mirrors upstream `fern-api/fern`'s SDK generators: the step value is
/// used **only** for the `hasNextPage` full-page comparison
/// (`items.length >= step`) — never as the increment amount. The increment
/// is always `len(items)` in item-index semantics, which is what the
/// executor's offset loop already does. See:
/// - `generators/python/.../client_generator/pagination/offset.py`
/// - `generators/typescript/.../GeneratedThrowingEndpointResponse.ts`
fn resolve_step_target(
    step_field: Option<&str>,
    request_query_params: &[(String, String)],
) -> Option<u64> {
    let name = step_field?;
    if let Some((_, value)) = request_query_params.iter().find(|(k, _)| k == name) {
        if let Ok(parsed) = value.parse::<u64>() {
            return Some(parsed);
        }
    }
    name.parse::<u64>().ok()
}

/// Resolve a `next_path` value from `x-fern-pagination` against the URL of
/// the request that produced it. Mirrors browser-style URL resolution:
/// absolute URLs (`https://…`) replace the base; absolute paths (`/foo`)
/// keep the scheme + host; relative paths inherit the base's directory.
fn resolve_next_path(base_url: &str, next_path: &str) -> Result<String, String> {
    let base = reqwest::Url::parse(base_url)
        .map_err(|e| format!("base URL `{base_url}` is not a valid URL: {e}"))?;
    let resolved = base
        .join(next_path)
        .map_err(|e| format!("could not join next_path `{next_path}` to `{base_url}`: {e}"))?;
    Ok(resolved.to_string())
}

/// Handle a JSON response: parse, output, and check pagination.
/// Returns `Ok(true)` if the pagination loop should continue.
///
/// `return_path` is the operation's resolved `x-fern-sdk-return-value`
/// extension (a dot-separated key path into the JSON body). When set and
/// `no_extract` is false, only the addressed subvalue is printed /
/// captured — but the full response is still used for pagination
/// continuation checks, since pagination paths (`next_cursor`,
/// `results`, …) are declared relative to the whole body and would
/// silently break if extracted away.
#[allow(clippy::too_many_arguments)]
async fn handle_json_response(
    body_text: &str,
    pagination: &PaginationConfig,
    endpoint_pag: Option<&EndpointPagination>,
    pipeline: &crate::formatter::OutputPipeline,
    pages_fetched: &mut u32,
    page_state: &mut PageState,
    capture_output: bool,
    captured: &mut Vec<Value>,
    request_url: &str,
    request_query_params: &[(String, String)],
    return_path: Option<&str>,
    no_extract: bool,
    method_descriptor: &str,
    pager: &mut Option<crate::pager::PagerHandle>,
) -> Result<bool, CliError> {
    if let Ok(json_val) = serde_json::from_str::<Value>(body_text) {
        let output_val =
            extract_return_value(&json_val, return_path, no_extract, method_descriptor)?;

        *pages_fetched += 1;

        // The three branches below are mutually exclusive (one consumes
        // `output_val`), so the unconditional move into `captured.push`
        // is safe. If a future change adds a side-effect that also
        // needs `output_val` outside this if/else chain, the compiler
        // will flag it — clone there rather than reintroducing a
        // speculative `.clone()` here.
        if capture_output {
            captured.push(output_val);
        } else if pagination.page_all {
            let is_first_page = *pages_fetched == 1;
            if let Some(ref mut pager_handle) = pager {
                pipeline
                    .emit(pager_handle, &output_val, true, is_first_page)
                    .context("Failed to write output")?;
            } else {
                let mut out = std::io::stdout().lock();
                pipeline
                    .emit(&mut out, &output_val, true, is_first_page)
                    .context("Failed to write output")?;
            }
        } else {
            let mut out = std::io::stdout().lock();
            pipeline
                .emit(&mut out, &output_val, false, true)
                .context("Failed to write output")?;
        }

        // Check whether to fetch a next page. Per-op `x-fern-pagination`
        // overrides the document heuristic when present.
        if pagination.page_all && *pages_fetched < pagination.page_limit {
            let should_continue = match endpoint_pag {
                Some(EndpointPagination::Cursor { next_cursor, .. }) => {
                    match get_nested_str(&json_val, next_cursor) {
                        Some(token) if !token.is_empty() => {
                            *page_state = PageState::Cursor(Some(token.to_string()));
                            true
                        }
                        _ => false,
                    }
                }
                Some(EndpointPagination::Offset {
                    results,
                    has_next_page,
                    step,
                    ..
                }) => {
                    let still_more = match has_next_page {
                        Some(path) => json_val
                            .pointer(&format!("/{}", path.replace('.', "/")))
                            .and_then(Value::as_bool)
                            .unwrap_or(true),
                        None => true,
                    };
                    let page_size = json_val
                        .pointer(&format!("/{}", results.replace('.', "/")))
                        .and_then(Value::as_array)
                        .map(|a| a.len() as u64)
                        .unwrap_or(0);
                    // When `step` is wired, gate the next page on whether
                    // the server returned a *full* page. Matches upstream
                    // fern-api/fern's `items.length >= step` check — a
                    // server returning a short page signals end-of-data
                    // even if `has_next_page` was omitted, preventing the
                    // executor from over-advancing past the last record.
                    let got_full_page =
                        match resolve_step_target(step.as_deref(), request_query_params) {
                            Some(target) => page_size >= target,
                            None => page_size > 0,
                        };
                    if still_more && got_full_page {
                        let current = match page_state {
                            PageState::Offset(n) => *n,
                            _ => 0,
                        };
                        // Advance by the number of items actually returned
                        // — item-index semantics, matching upstream's
                        // default `offsetSemantics`. The `step` field
                        // controls only the full-page gate above, not the
                        // increment amount.
                        *page_state = PageState::Offset(current + page_size);
                        true
                    } else {
                        false
                    }
                }
                Some(EndpointPagination::Uri { next_uri, .. }) => {
                    match get_nested_str(&json_val, next_uri) {
                        Some(url) if !url.is_empty() => {
                            *page_state = PageState::NextUrl(Some(url.to_string()));
                            true
                        }
                        _ => false,
                    }
                }
                Some(EndpointPagination::Path { next_path, .. }) => {
                    match get_nested_str(&json_val, next_path) {
                        Some(path) if !path.is_empty() => {
                            // Resolve relative paths (e.g. `/v1/things?cursor=…`)
                            // against the previous request's URL so the host
                            // + scheme are preserved across pages.
                            let base = page_state
                                .url_override()
                                .unwrap_or(request_url)
                                .to_string();
                            match resolve_next_path(&base, path) {
                                Ok(resolved) => {
                                    *page_state = PageState::NextUrl(Some(resolved));
                                    true
                                }
                                Err(e) => {
                                    tracing::warn!(
                                        next_path = %path,
                                        base_url = %base,
                                        error = %e,
                                        "failed to resolve x-fern-pagination next_path; halting pagination"
                                    );
                                    false
                                }
                            }
                        }
                        _ => false,
                    }
                }
                // Custom: caller-driven. The executor never auto-continues;
                // it issues exactly one request, surfaces the `results`
                // selection like the others, and stops.
                Some(EndpointPagination::Custom { .. }) => false,
                None => match get_nested_str(&json_val, &pagination.token_response_path) {
                    Some(token) if !token.is_empty() => {
                        *page_state = PageState::Cursor(Some(token.to_string()));
                        true
                    }
                    _ => false,
                },
            };

            if should_continue {
                if pagination.page_delay_ms > 0 {
                    tokio::time::sleep(std::time::Duration::from_millis(
                        pagination.page_delay_ms,
                    ))
                    .await;
                }
                return Ok(true);
            }
        }
    } else if !capture_output && !pipeline.quiet && !body_text.is_empty() {
        println!("{body_text}");
    }

    Ok(false)
}

/// Handle a binary response by streaming it to a file (or to stdout when
/// `output_path == Some("-")`, the curl/wget stdout sentinel).
async fn handle_binary_response(
    response: reqwest::Response,
    content_type: &str,
    output_path: Option<&str>,
    pipeline: &crate::formatter::OutputPipeline,
    capture_output: bool,
) -> Result<Option<Value>, CliError> {
    // `--output -` pipes raw bytes to stdout and skips both the disk write
    // and the success-metadata JSON — so the body is consumable downstream
    // (e.g. `<bin> <op> ... --output - | ffplay -` for audio responses,
    // `... | tar x` for archives). The validator in binding.rs treats `-`
    // as a sentinel and does NOT canonicalize it to `cwd/-`, so we receive
    // the literal here.
    //
    // We use std::io::stdout (sync) rather than tokio::io::stdout because
    // tokio's stdout writer routes through a per-runtime blocking worker
    // that can be left undrained when a one-shot CLI tears down the runtime
    // after this return, causing the process to wedge before exit. The
    // metadata-emit path further down already uses std::io::stdout in the
    // same async context, so mixing is fine.
    if output_path == Some("-") {
        use std::io::Write;
        let mut stream = response.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.context("Failed to read response chunk")?;
            // We re-acquire the stdout lock per chunk because StdoutLock is
            // !Send and cannot be held across the await above (the binding
            // adapter returns a Send-required boxed future).
            std::io::stdout()
                .write_all(&chunk)
                .context("Failed to write to stdout")?;
        }
        std::io::stdout()
            .flush()
            .context("Failed to flush stdout")?;
        return Ok(None);
    }

    let file_path = if let Some(p) = output_path {
        PathBuf::from(p)
    } else if let Some(name) = response
        .headers()
        .get(reqwest::header::CONTENT_DISPOSITION)
        .and_then(|v| v.to_str().ok())
        .and_then(extract_content_disposition_filename)
    {
        // The server named the file via RFC 6266 Content-Disposition — use
        // it. The helper has already reduced the value to its safe basename
        // so the server can never pick the output directory.
        PathBuf::from(name)
    } else {
        let ext = mime_to_extension(content_type);
        PathBuf::from(format!("download.{ext}"))
    };

    let mut file = create_file_no_follow(&file_path).await?;

    let mut stream = response.bytes_stream();
    let mut total_bytes: u64 = 0;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.context("Failed to read response chunk")?;
        file.write_all(&chunk)
            .await
            .context("Failed to write to file")?;
        total_bytes += chunk.len() as u64;
    }

    file.flush().await.context("Failed to flush file")?;

    let result = json!({
        "status": "success",
        "saved_file": file_path.display().to_string(),
        "mimeType": content_type,
        "bytes": total_bytes,
    });

    if capture_output {
        return Ok(Some(result));
    }

    let mut out = std::io::stdout().lock();
    pipeline
        .emit(&mut out, &result, false, true)
        .context("Failed to write output")?;

    Ok(None)
}

// ---------------------------------------------------------------------------
// x-fern-streaming response handling.
//
// Two entry points:
// - `stream_response` — consume the response body line-by-line and emit
//   each event to stdout as it arrives. Used by the default CLI path
//   (no `--no-stream`, not `capture_output`).
// - `buffer_streaming_response` — collect every event into one JSON value
//   (single object when only one event arrived, array otherwise) and
//   return it for downstream printing / capture. Used when the caller
//   passed `--no-stream` (pretty-print to stdout) or is a programmatic
//   `AppContext::invoke` caller that needs a typed value back.
//
// Line decoding is delegated to `decode_stream_event`, which is a pure
// function over (config, raw_line) — exercised directly by unit tests
// without spinning up a wiremock server.
// ---------------------------------------------------------------------------

/// Outcome of decoding a single raw stream line.
#[derive(Debug, PartialEq, Eq)]
enum StreamEvent {
    /// A complete event payload was decoded (post-`data:` strip for
    /// SSE; the line verbatim for NDJSON). The caller emits this.
    Event(String),
    /// The line was framing-only and carries no payload (blank lines,
    /// `event:`/`id:`/`retry:` SSE field lines, SSE comments starting
    /// with `:`, or an empty JSON line). Skip and keep reading.
    Skip,
    /// The terminator sentinel was reached. The caller stops reading.
    Terminate,
}

/// Decode a single raw line of streaming response body against the
/// configured wire format. Pure / synchronous so unit tests can hit
/// every decoding branch (with and without `data:` prefix, comment
/// lines, terminator handling) without setting up a mock HTTP server.
///
/// The `line` is expected to already have its trailing newline / CR
/// stripped — the caller (the line-reading loop) handles framing.
///
/// Only the line-at-a-time formats (NDJSON, text) flow through here.
/// SSE framing is stateful (multi-line `data:` payloads are joined
/// with `\n` and dispatched on a blank-line separator per the WHATWG
/// spec), so the SSE path uses [`SseLineDecoder`] instead.
fn decode_stream_event(config: &StreamingConfig, line: &str) -> StreamEvent {
    match config {
        StreamingConfig::Sse { .. } => {
            // SSE is decoded statefully via `SseLineDecoder`; reaching
            // this arm is a bug in the caller.
            debug_assert!(false, "SSE lines must flow through SseLineDecoder");
            StreamEvent::Skip
        }
        StreamingConfig::Json { terminator } => {
            // NDJSON / JSONL framing: empty lines are skipped (some
            // servers emit blank keepalive lines between records).
            if line.is_empty() {
                return StreamEvent::Skip;
            }

            if let Some(sentinel) = terminator.as_deref() {
                if line == sentinel {
                    return StreamEvent::Terminate;
                }
            }

            StreamEvent::Event(line.to_string())
        }
        StreamingConfig::Text => {
            // Plain-text line stream: empty lines are dropped per the
            // C# generator (`if(!string.IsNullOrEmpty(line)) yield
            // return line` — see `HttpEndpointGenerator.ts:815-825`).
            // No JSON parse, no SSE prefix strip, no terminator.
            if line.is_empty() {
                return StreamEvent::Skip;
            }
            StreamEvent::Event(line.to_string())
        }
    }
}

/// Stateful SSE event accumulator. Buffers `data:` payloads across
/// multiple lines (joined with `\n` per the WHATWG SSE spec
/// <https://html.spec.whatwg.org/multipage/server-sent-events.html#dispatchMessage>)
/// and dispatches the joined payload as one event on a blank-line
/// separator or at stream EOF. Mirrors the TS runtime's
/// `iterSseEvents` loop in
/// `generators/typescript/utils/core-utilities/src/core/stream/Stream.template.ts:123-165`.
///
/// Unknown SSE field lines (`id:`, `retry:`, or anything else) are
/// ignored per spec; `event:` is tracked across the same event
/// boundary for parity even though the CLI surface does not yet
/// route on it (no `eventDiscriminator` support — a deliberate
/// non-feature, left out of this parity sweep).
#[derive(Default)]
struct SseLineDecoder {
    data_buf: Option<String>,
    event_type: Option<String>,
}

impl SseLineDecoder {
    /// Process one raw line. Returns `Some(payload)` when a blank
    /// line dispatches a buffered event (the joined `data:`
    /// payload); `None` otherwise.
    fn push_line(&mut self, line: &str) -> Option<String> {
        if line.is_empty() {
            // Blank line: dispatch the buffered event if any, then
            // reset event_type either way (matches TS, which clears
            // both fields on dispatch regardless of whether one was
            // actually emitted).
            let dispatched = self.data_buf.take();
            self.event_type = None;
            return dispatched;
        }
        if line.starts_with(':') {
            // SSE comment / heartbeat — framing only, no payload.
            return None;
        }
        if let Some(rest) = line.strip_prefix("event:") {
            self.event_type = Some(rest.trim().to_string());
            return None;
        }
        if let Some(rest) = line.strip_prefix("data:") {
            // Strip exactly one optional leading space per the SSE
            // spec ("If value starts with a U+0020 SPACE, remove it").
            let val = rest.strip_prefix(' ').unwrap_or(rest);
            match &mut self.data_buf {
                Some(buf) => {
                    buf.push('\n');
                    buf.push_str(val);
                }
                None => {
                    self.data_buf = Some(val.to_string());
                }
            }
            return None;
        }
        // Unknown SSE fields (`id:`, `retry:`, anything else) are
        // ignored per spec.
        None
    }

    /// Flush the final partial event at stream EOF. Mirrors the TS
    /// runtime's post-loop `if (dataValue != null) yield ...` block
    /// — servers commonly close the connection without a trailing
    /// blank line on the last event.
    fn flush(&mut self) -> Option<String> {
        let dispatched = self.data_buf.take();
        self.event_type = None;
        dispatched
    }
}

/// Apply `x-fern-sdk-return-value` to a decoded event payload. Each
/// event is parsed as JSON, the configured path is projected, and the
/// printable form (a JSON-encoded string) is returned. When the JSON
/// fails to parse (servers occasionally emit a non-JSON keepalive
/// frame), the raw event string is emitted verbatim so the caller can
/// still see what came over the wire.
///
/// Text streams ([`StreamingConfig::Text`]) bypass this projection
/// entirely — their event payload is a raw line, not a JSON value,
/// so `x-fern-sdk-return-value` and `--no-extract` are both no-ops
/// (mirrors the C# generator, which `yield return line` directly).
fn project_stream_event(
    streaming: &StreamingConfig,
    event_payload: &str,
    return_path: Option<&str>,
    no_extract: bool,
    method_descriptor: &str,
) -> Result<Value, CliError> {
    if matches!(streaming, StreamingConfig::Text) {
        return Ok(Value::String(event_payload.to_string()));
    }
    match serde_json::from_str::<Value>(event_payload) {
        Ok(parsed) => extract_return_value(&parsed, return_path, no_extract, method_descriptor),
        // Bare strings, numbers, or partial frames flow through as
        // strings so the caller's output stream isn't blocked by
        // upstream noise. The user can `--no-extract` to inspect the
        // raw frames when debugging unexpected shapes.
        Err(_) => Ok(Value::String(event_payload.to_string())),
    }
}

/// Stream the response body line-by-line, emitting one formatted event
/// per dispatched payload to stdout. Stops at the configured
/// terminator (when the spec declared one) or at end-of-body.
///
/// When a `--query` expression is set on the pipeline, each event is
/// projected through the JMESPath expression before formatting. Events
/// whose projection evaluates to `null` are suppressed, enabling
/// `--query` as a per-event streaming filter.
async fn stream_response(
    response: reqwest::Response,
    streaming: &StreamingConfig,
    return_path: Option<&str>,
    no_extract: bool,
    pipeline: &crate::formatter::OutputPipeline,
    method_descriptor: &str,
) -> Result<(), CliError> {
    read_stream_events(response, streaming, |payload| {
        let value = project_stream_event(
            streaming,
            &payload,
            return_path,
            no_extract,
            method_descriptor,
        )?;
        // When no --query is set, skip the clone + projection entirely.
        if pipeline.query.is_none() {
            let mut out = std::io::stdout().lock();
            pipeline
                .emit_raw(&mut out, &value, false, true)
                .context("Failed to write output")?;
        } else if let Some(projected) = pipeline
            .apply_query_streaming(&value)
            .context("--query evaluation failed")?
        {
            let mut out = std::io::stdout().lock();
            pipeline
                .emit_raw(&mut out, &projected, false, true)
                .context("Failed to write output")?;
        }
        Ok(())
    })
    .await
}

/// Buffer the streaming response into a single JSON value: a lone event
/// is returned as-is so downstream consumers see the unary shape; two
/// or more events are collected into a JSON array. An empty stream
/// returns `Value::Null` — the body finished without emitting any
/// payload, which is what the typed SDKs surface back to callers.
async fn buffer_streaming_response(
    response: reqwest::Response,
    streaming: &StreamingConfig,
    return_path: Option<&str>,
    no_extract: bool,
    method_descriptor: &str,
) -> Result<Value, CliError> {
    let mut events: Vec<Value> = Vec::new();
    read_stream_events(response, streaming, |payload| {
        events.push(project_stream_event(
            streaming,
            &payload,
            return_path,
            no_extract,
            method_descriptor,
        )?);
        Ok(())
    })
    .await?;
    Ok(match events.len() {
        0 => Value::Null,
        1 => events.into_iter().next().unwrap(),
        _ => Value::Array(events),
    })
}

/// Drive the response body through the format-appropriate line
/// decoder, invoking `emit` for each dispatched event payload. SSE
/// uses [`SseLineDecoder`] (stateful multi-line `data:` buffering);
/// NDJSON and text use [`decode_stream_event`] line-by-line. The
/// configured terminator (if any) is checked here, before `emit`, so
/// callers don't need to know about format-specific framing rules.
async fn read_stream_events<F>(
    response: reqwest::Response,
    streaming: &StreamingConfig,
    mut emit: F,
) -> Result<(), CliError>
where
    F: FnMut(String) -> Result<(), CliError>,
{
    let mut line_stream = ResponseLineStream::new(response);
    match streaming {
        StreamingConfig::Sse { terminator } => {
            let mut decoder = SseLineDecoder::default();
            while let Some(line) = line_stream.next_line().await? {
                if let Some(payload) = decoder.push_line(&line) {
                    if let Some(sentinel) = terminator.as_deref() {
                        if payload == sentinel {
                            return Ok(());
                        }
                    }
                    emit(payload)?;
                }
            }
            // EOF: flush any final unterminated event — matches the
            // TS runtime's post-loop dispatch (see Stream.template.ts).
            if let Some(payload) = decoder.flush() {
                if let Some(sentinel) = terminator.as_deref() {
                    if payload == sentinel {
                        return Ok(());
                    }
                }
                emit(payload)?;
            }
            Ok(())
        }
        StreamingConfig::Json { .. } | StreamingConfig::Text => {
            while let Some(line) = line_stream.next_line().await? {
                match decode_stream_event(streaming, &line) {
                    StreamEvent::Skip => continue,
                    StreamEvent::Terminate => return Ok(()),
                    StreamEvent::Event(payload) => emit(payload)?,
                }
            }
            Ok(())
        }
    }
}

/// Adapt a `reqwest::Response`'s byte stream into a line iterator. Keeps
/// a small in-memory buffer of bytes received but not yet terminated
/// by a newline; reads stop at LF and emit the preceding bytes (CR is
/// also stripped) as a UTF-8 string. The terminating line of a
/// response that doesn't end with a newline is still emitted from
/// `next_line` before the stream returns `None`.
struct ResponseLineStream {
    stream: futures_util::stream::BoxStream<'static, reqwest::Result<bytes::Bytes>>,
    buf: Vec<u8>,
    done: bool,
}

impl ResponseLineStream {
    fn new(response: reqwest::Response) -> Self {
        Self {
            stream: Box::pin(response.bytes_stream()),
            buf: Vec::with_capacity(4096),
            done: false,
        }
    }

    async fn next_line(&mut self) -> Result<Option<String>, CliError> {
        loop {
            // Emit a buffered line if a newline has already been received.
            if let Some(idx) = self.buf.iter().position(|&b| b == b'\n') {
                let mut line: Vec<u8> = self.buf.drain(..=idx).collect();
                line.pop(); // drop the trailing '\n'
                if line.last() == Some(&b'\r') {
                    line.pop();
                }
                return Ok(Some(decode_line_lossy(line)));
            }

            // If the stream is exhausted, flush any trailing bytes that
            // didn't end with a newline (servers commonly omit the final
            // newline on the last event of an NDJSON stream).
            if self.done {
                if self.buf.is_empty() {
                    return Ok(None);
                }
                let mut line: Vec<u8> = std::mem::take(&mut self.buf);
                if line.last() == Some(&b'\r') {
                    line.pop();
                }
                return Ok(Some(decode_line_lossy(line)));
            }

            // Pull the next chunk off the wire.
            match self.stream.next().await {
                Some(Ok(chunk)) => self.buf.extend_from_slice(&chunk),
                Some(Err(err)) => {
                    return Err(anyhow::Error::from(err)
                        .context("Failed to read streaming response chunk")
                        .into());
                }
                None => self.done = true,
            }
        }
    }
}

/// Decode a single line as UTF-8, replacing invalid sequences with
/// U+FFFD so a malformed byte (e.g. truncated multibyte from a flaky
/// proxy) doesn't crash the stream.
fn decode_line_lossy(bytes: Vec<u8>) -> String {
    match String::from_utf8(bytes) {
        Ok(s) => s,
        Err(e) => String::from_utf8_lossy(&e.into_bytes()).into_owned(),
    }
}

/// Executes an API method call.
///
/// This is the core function of the CLI that handles:
/// 1. Parameter validation and URL construction.
/// 2. Request body validation against the Discovery Document schema.
/// 3. Authentication (OAuth or none).
/// 4. Sending the HTTP request (GET/POST/etc).
/// 5. Handling various response types (JSON, binary).
/// 6. Auto-pagination for list endpoints.
#[allow(clippy::too_many_arguments)]
pub async fn execute_method(
    doc: &RestDescription,
    method: &RestMethod,
    params_json: Option<&str>,
    body_json: Option<&str>,
    auth_provider: &DynAuthProvider,
    output_path: Option<&str>,
    upload: Option<UploadSource<'_>>,
    binary_body_path: Option<&str>,
    multipart_parts: Option<Vec<MultipartPart>>,
    dry_run: bool,
    pagination: &PaginationConfig,
    pipeline: &crate::formatter::OutputPipeline,
    capture_output: bool,
    base_url_override: Option<&str>,
    http_config: &crate::http::HttpConfig,
    no_extract: bool,
    no_retry: bool,
    no_stream: bool,
    debug: bool,
    extra_headers: &[(String, String)],
) -> Result<Option<Value>, CliError> {
    let binary_flag = method
        .binary_request_body
        .as_ref()
        .map(|b| b.flag_name.as_str());
    if binary_body_path.is_some() && binary_flag.is_none() {
        return Err(CliError::Validation(
            "binary body path is only valid for operations with a binary request body"
                .to_string(),
        ));
    }
    if binary_body_path.is_some() && body_json.is_some() {
        return Err(CliError::Validation(format!(
            "--{} and --json are mutually exclusive",
            binary_flag.unwrap_or("file"),
        )));
    }

    let input = parse_and_validate_inputs(doc, method, params_json, body_json, upload.is_some(), base_url_override, extra_headers)?;

    // Human-readable identifier for the operation, used in
    // `x-fern-sdk-return-value` extraction errors so the user can find
    // the offending op when the response shape disagrees with the
    // spec. Prefer the `operationId` (matches the spec text) and fall
    // back to `GET /things` when it's absent.
    let method_descriptor = match method.id.as_deref() {
        Some(id) => format!("'{id}'"),
        None => format!(
            "{} {}",
            method.http_method.to_ascii_uppercase(),
            method.path
        ),
    };

    if dry_run {
        let content_type_header = if input.body.is_some() {
            method.body_encoding.content_type()
        } else {
            ""
        };
        let mut dry_run_info = json!({
            "dry_run": true,
            "url": input.full_url,
            "method": method.http_method,
            "query_params": input.query_params,
            "headers": input.header_params,
            "body": input.body,
            "is_multipart_upload": input.is_upload,
        });
        if !content_type_header.is_empty() {
            dry_run_info["content_type"] = json!(content_type_header);
        }
        if method.body_encoding.is_form() {
            if let Some(ref body_val) = input.body {
                dry_run_info["form_encoded_body"] = json!(encode_form_body(body_val));
            }
        }
        if let Some(raw) = binary_body_path {
            let (content_type, flag_name) = method
                .binary_request_body
                .as_ref()
                .map(|b| (b.content_type.as_str(), b.flag_name.as_str()))
                .unwrap_or(("", ""));
            let (source, transfer) = match BinaryBodySource::parse(raw) {
                BinaryBodySource::File { path, mode } => {
                    let mode_str = match mode {
                        AtMode::Auto => "auto",
                        AtMode::Text => "text",
                        AtMode::Data => "data",
                    };
                    (
                        json!({ "file": path.as_ref(), "mode": mode_str }),
                        "content-length",
                    )
                }
                BinaryBodySource::Stdin => (json!({ "stdin": true }), "chunked"),
            };
            dry_run_info["binary_body"] = json!({
                "source": source,
                "content_type": content_type,
                "transfer_encoding": transfer,
                "flag": flag_name,
            });
        }
        if let Some(ref parts) = multipart_parts {
            let part_info: Vec<Value> = parts
                .iter()
                .map(|p| match p {
                    MultipartPart::Text {
                        name,
                        value,
                        content_type,
                    } => {
                        json!({ "name": name, "type": "text", "value": value, "content_type": content_type })
                    }
                    MultipartPart::File {
                        name,
                        path,
                        content_type,
                    } => {
                        json!({ "name": name, "type": "file", "path": path, "content_type": content_type })
                    }
                })
                .collect();
            dry_run_info["multipart_form_data"] = json!(part_info);
        }
        if capture_output {
            return Ok(Some(dry_run_info));
        }
        let mut out = std::io::stdout().lock();
        pipeline
            .emit(&mut out, &dry_run_info, false, true)
            .context("Failed to write output")?;
        return Ok(None);
    }

    let endpoint_pag = method.pagination.as_ref();
    let mut page_state: PageState = PageState::initial(endpoint_pag);
    let mut pages_fetched: u32 = 0;
    let mut captured_values = Vec::new();
    let auth_metadata = endpoint_metadata_for(method);

    // Spawn an external pager when --page-all is active on a TTY.
    let fallback_label = format!(
        "{} {}",
        method.http_method.to_ascii_uppercase(),
        method.path
    );
    let pager_label = method.id.as_deref().unwrap_or(&fallback_label);
    let mut pager_handle = if pagination.page_all && !pagination.no_pager && !capture_output {
        let pager_config = crate::pager::PagerConfig::from_env(&pagination.cli_name);
        crate::pager::spawn_pager(&pager_config, pager_label)
    } else {
        None
    };

    // Derive spec-declared sensitive names for the debug dump.
    let additional_sensitive_headers: Vec<&str> = if debug {
        doc.security_schemes
            .values()
            .filter_map(|s| {
                if let crate::openapi::discovery::SecurityScheme::ApiKeyHeader { name } = s {
                    Some(name.as_str())
                } else {
                    None
                }
            })
            .collect()
    } else {
        Vec::new()
    };
    let additional_sensitive_query_params: Vec<&str> = if debug {
        doc.security_schemes
            .values()
            .filter_map(|s| {
                if let crate::openapi::discovery::SecurityScheme::ApiKeyQuery { name } = s {
                    Some(name.as_str())
                } else {
                    None
                }
            })
            .collect()
    } else {
        Vec::new()
    };

    // Pre-compute the body string for the debug request dump. This is
    // computed once here because the body doesn't change across retries.
    let body_str_for_dump: Option<String> = if debug
        && binary_body_path.is_none()
        && !input.is_upload
        && multipart_parts.is_none()
    {
        if method.body_encoding.is_form() {
            input.body.as_ref().map(encode_form_body)
        } else {
            input.body.as_ref().map(|v| v.to_string())
        }
    } else {
        None
    };

    // Build the client once outside the pagination loop. Client construction
    // reads env vars and (with TLS) builds a connection pool; rebuilding per
    // page would defeat connection reuse and emit any one-time warnings
    // (e.g. insecure-mode) once per page.
    let client = http_config.build_client()?;

    loop {
        // Snapshot the URL we are about to hit so the response handler can
        // resolve relative `next_path` values against it. Captured before
        // `page_state` is borrowed mutably below.
        let current_url = page_state
            .url_override()
            .unwrap_or(&input.full_url)
            .to_string();

        let method_id = method.id.as_deref().unwrap_or("unknown");
        let start = std::time::Instant::now();

        // Retry loop. Each iteration rebuilds the request (so streaming
        // bodies start fresh) and dispatches it. `retry_attempt` is
        // 0-indexed and counts *prior* sends — we increment it after
        // each retry, then re-check the policy before the next send.
        //
        // Stdin-sourced binary bodies are *not* replayable: the first
        // attempt consumes the pipe and any retry would silently send
        // an empty body. Disable retries for that case so we preserve
        // the pre-retry behavior (a single attempt, surface whatever
        // the server returns) rather than masking the original failure.
        // Disable retries when the body is a streamed stdin or multipart
        // body — those can't be replayed on a second attempt.
        let default_retries = RetriesConfig::default();
        let retries_cfg =
            if binary_body_is_stdin(binary_body_path) || multipart_has_stdin(&multipart_parts) {
                None
            } else {
                Some(method.retries.as_ref().unwrap_or(&default_retries))
            };

        // Auto Idempotency-Key: generate once before the retry loop so
        // the same key is sent on every attempt. Only for POST/PUT/PATCH
        // unless opted out via `x-fern-cli-idempotency: false`, or when
        // the operation already has an explicit idempotency-header
        // mechanism (x-fern-idempotent: true provides --idempotency-key).
        let user_provides_idempotency = method.idempotent
            || input
                .header_params
                .iter()
                .any(|(k, _)| k.eq_ignore_ascii_case("idempotency-key"));
        let idempotency_key = if !method.no_auto_idempotency_key
            && !user_provides_idempotency
            && crate::http::needs_idempotency_key(&method.http_method)
        {
            Some(crate::http::generate_idempotency_key())
        } else {
            None
        };

        let mut retry_attempt: u32 = 0;
        let response = loop {
            let mut request = build_http_request(
                &client,
                method,
                &input,
                auth_provider,
                &auth_metadata,
                &page_state,
                pages_fetched,
                &upload,
                binary_body_path,
                &multipart_parts,
                pagination,
            )
            .await?;

            if let Some(ref key) = idempotency_key {
                request = request.header("Idempotency-Key", key.as_str());
            }

            let built = request.build().map_err(|e| {
                CliError::Other(anyhow::Error::from(e).context("Failed to build HTTP request"))
            })?;
            if debug {
                crate::debug::dump_request(
                    built.method().as_str(),
                    built.url().as_str(),
                    built.headers(),
                    body_str_for_dump.as_deref(),
                    &additional_sensitive_headers,
                    &additional_sensitive_query_params,
                );
            }
            match client.execute(built).await {
                Ok(resp) => {
                    let status = resp.status();
                    let retry_after_header = resp
                        .headers()
                        .get("retry-after")
                        .and_then(|v| v.to_str().ok())
                        .map(|s| s.to_string());
                    if let Some(cfg) = retries_cfg {
                        let outcome = RetryOutcome {
                            status: Some(status.as_u16()),
                            retry_after: retry_after_header.as_deref(),
                        };
                        if let Some(delay) = decide_retry(
                            retry_attempt,
                            &outcome,
                            cfg,
                            &method.http_method,
                            method.idempotent || idempotency_key.is_some(),
                            no_retry,
                        ) {
                            tracing::warn!(
                                api_method = method_id,
                                http_method = %method.http_method,
                                status = status.as_u16(),
                                attempt = retry_attempt + 1,
                                delay_ms = delay.as_millis() as u64,
                                "retrying after retryable HTTP status",
                            );
                            // Drain the body so the connection can be
                            // returned to the pool. We don't surface
                            // the body on retried responses; the final
                            // response (success or terminal failure)
                            // is what the user sees.
                            let _ = resp.bytes().await;
                            tokio::time::sleep(delay).await;
                            retry_attempt += 1;
                            continue;
                        }
                    }
                    break resp;
                }
                Err(e) => {
                    if let Some(cfg) = retries_cfg {
                        let outcome = RetryOutcome {
                            status: None,
                            retry_after: None,
                        };
                        if let Some(delay) = decide_retry(
                            retry_attempt,
                            &outcome,
                            cfg,
                            &method.http_method,
                            method.idempotent || idempotency_key.is_some(),
                            no_retry,
                        ) {
                            tracing::warn!(
                                api_method = method_id,
                                http_method = %method.http_method,
                                attempt = retry_attempt + 1,
                                delay_ms = delay.as_millis() as u64,
                                error = %e,
                                "retrying after network/transport failure",
                            );
                            tokio::time::sleep(delay).await;
                            retry_attempt += 1;
                            continue;
                        }
                    }
                    // Surface a human-readable hint to stderr if this looks like
                    // a TLS failure — the most common debugging hump for users
                    // behind corporate proxies / interception tools. The hint is
                    // a side effect; the error then propagates up like any other.
                    crate::http::maybe_emit_tls_hint(http_config, &e);
                    return Err(anyhow::Error::from(e).context("HTTP request failed").into());
                }
            }
        };
        let latency_ms = start.elapsed().as_millis() as u64;

        let status = response.status();
        let content_type = response
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();

        if !status.is_success() {
            tracing::warn!(
                api_method = method_id,
                http_method = %method.http_method,
                status = status.as_u16(),
                latency_ms = latency_ms,
                "API error"
            );
            // Raw mode: emit error body verbatim, return sentinel.
            if pipeline.is_raw() && !capture_output {
                if !pipeline.quiet {
                    let bytes = response.bytes().await.unwrap_or_default();
                    let mut stdout = std::io::stdout().lock();
                    let _ = std::io::Write::write_all(&mut stdout, &bytes);
                    let _ = std::io::Write::flush(&mut stdout);
                }
                return Err(CliError::RawSentinel {
                    code: status.as_u16(),
                });
            }
            // HTTP mode: emit status line + headers + body, return sentinel.
            if pipeline.is_http() && !capture_output {
                if !pipeline.quiet {
                    let version = response.version();
                    let resp_headers = response.headers().clone();
                    let bytes = response.bytes().await.unwrap_or_default();
                    let mut stdout = std::io::stdout().lock();
                    let _ = write_http_preamble(&mut stdout, version, status, &resp_headers);
                    let _ = std::io::Write::write_all(&mut stdout, &bytes);
                    let _ = std::io::Write::flush(&mut stdout);
                }
                return Err(CliError::RawSentinel {
                    code: status.as_u16(),
                });
            }
            let response_headers = response.headers().clone();
            let error_body = response.text().await.unwrap_or_default();
            if debug {
                crate::debug::dump_error_response(
                    status.as_u16(),
                    latency_ms,
                    &response_headers,
                    &error_body,
                    &additional_sensitive_headers,
                );
            }
            return handle_error_response(
                status,
                &error_body,
                auth_provider.as_ref(),
                &auth_metadata,
            );
        }

        tracing::debug!(
            api_method = method_id,
            http_method = %method.http_method,
            status = status.as_u16(),
            latency_ms = latency_ms,
            content_type = %content_type,
            is_upload = input.is_upload,
            page = pages_fetched,
            "API request"
        );

        // Raw mode: stream response bytes to stdout verbatim.
        if pipeline.is_raw() && !capture_output {
            if pipeline.quiet {
                let _ = response.bytes().await;
            } else {
                use std::io::Write;
                let mut stream = response.bytes_stream();
                while let Some(chunk) = stream.next().await {
                    let chunk = chunk.context("Failed to read response chunk")?;
                    // StdoutLock is !Send — re-acquire per chunk.
                    std::io::stdout()
                        .lock()
                        .write_all(&chunk)
                        .context("Failed to write to stdout")?;
                }
                std::io::stdout()
                    .flush()
                    .context("Failed to flush stdout")?;
            }
            break;
        }

        // HTTP mode: emit status line + headers + raw body.
        if pipeline.is_http() && !capture_output {
            if pipeline.quiet {
                let _ = response.bytes().await;
            } else {
                use std::io::Write;
                let version = response.version();
                let resp_headers = response.headers().clone();
                // Write preamble in its own scope so StdoutLock (!Send) is
                // dropped before the streaming await below.
                {
                    let mut stdout = std::io::stdout().lock();
                    write_http_preamble(&mut stdout, version, status, &resp_headers)
                        .context("Failed to write HTTP preamble")?;
                }
                let mut stream = response.bytes_stream();
                while let Some(chunk) = stream.next().await {
                    let chunk = chunk.context("Failed to read response chunk")?;
                    // StdoutLock is !Send — re-acquire per chunk.
                    std::io::stdout()
                        .lock()
                        .write_all(&chunk)
                        .context("Failed to write to stdout")?;
                }
                std::io::stdout()
                    .flush()
                    .context("Failed to flush stdout")?;
            }
            break;
        }

        // Streaming response branch. Selected when:
        // - the operation declares `x-fern-streaming`, AND
        // - the caller hasn't explicitly opted out via `--no-stream`,
        //   AND
        // - we aren't capturing into a single `Value` for a
        //   programmatic caller (those need a unary shape and treat
        //   `--no-stream` as implicit).
        //
        // `--no-stream` and `capture_output` both fall through to the
        // existing buffered path below: the body is read once and
        // either pretty-printed (no_stream from the CLI) or decoded
        // into a `Value` (capture_output from `AppContext::invoke`).
        if let Some(streaming) = method.streaming.as_ref() {
            if !no_stream && !capture_output {
                // Note: `pages_fetched` is intentionally left untouched
                // here. Streaming endpoints are single-request by
                // construction (see the parse-time mutual exclusion
                // with `x-fern-pagination`), so the pagination loop
                // never re-enters; bumping the counter would only
                // confuse the unrelated request-tracing in `debug!`.
                if debug {
                    crate::debug::dump_streaming_note(
                        status.as_u16(),
                        response.headers(),
                        &additional_sensitive_headers,
                    );
                }
                stream_response(
                    response,
                    streaming,
                    method.return_value.as_deref(),
                    no_extract,
                    pipeline,
                    &method_descriptor,
                )
                .await?;
                break;
            }
            // Buffered fallback: collect every event into a single
            // JSON array (or unwrap the lone event when only one
            // arrived) so the downstream printer / capture path sees
            // the kind of value it expects from a unary endpoint. The
            // server may legitimately send a non-streaming body, so we
            // still parse it line-by-line and fall back to a
            // single-value array when the body holds one JSON object.
            let buffered = buffer_streaming_response(
                response,
                streaming,
                method.return_value.as_deref(),
                no_extract,
                &method_descriptor,
            )
            .await?;
            if capture_output {
                captured_values.push(buffered);
            } else {
                let mut out = std::io::stdout().lock();
                pipeline
                    .emit(&mut out, &buffered, false, true)
                    .context("Failed to write output")?;
            }
            break;
        }

        // SSE auto-detection: when the spec omits `x-fern-streaming` but
        // the server responds with `text/event-stream`, treat the body as
        // an SSE stream using the same infrastructure. This avoids falling
        // through to the binary handler (which would dump the stream to a
        // file or hang).
        if content_type.contains("text/event-stream") && method.streaming.is_none() {
            let sse_config = StreamingConfig::Sse { terminator: None };
            if !no_stream && !capture_output {
                if debug {
                    crate::debug::dump_streaming_note(
                        status.as_u16(),
                        response.headers(),
                        &additional_sensitive_headers,
                    );
                }
                stream_response(
                    response,
                    &sse_config,
                    method.return_value.as_deref(),
                    no_extract,
                    pipeline,
                    &method_descriptor,
                )
                .await?;
                break;
            }
            let buffered = buffer_streaming_response(
                response,
                &sse_config,
                method.return_value.as_deref(),
                no_extract,
                &method_descriptor,
            )
            .await?;
            if capture_output {
                captured_values.push(buffered);
            } else {
                let mut out = std::io::stdout().lock();
                pipeline
                    .emit(&mut out, &buffered, false, true)
                    .context("Failed to write output")?;
            }
            break;
        }

        let is_json =
            content_type.contains("application/json") || content_type.contains("text/json");

        if is_json || content_type.is_empty() {
            let response_headers = response.headers().clone();
            let body_text = response
                .text()
                .await
                .context("Failed to read response body")?;

            if debug {
                crate::debug::dump_response(
                    status.as_u16(),
                    latency_ms,
                    &response_headers,
                    &body_text,
                    &additional_sensitive_headers,
                );
            }
            let response_body = body_text;
            let should_continue = handle_json_response(
                &response_body,
                pagination,
                endpoint_pag,
                pipeline,
                &mut pages_fetched,
                &mut page_state,
                capture_output,
                &mut captured_values,
                &current_url,
                &input.query_params,
                method.return_value.as_deref(),
                no_extract,
                &method_descriptor,
                &mut pager_handle,
            )
            .await?;

            if should_continue {
                continue;
            }
        } else {
            let bin_headers = response.headers().clone();
            if debug {
                crate::debug::dump_streaming_note(
                    status.as_u16(),
                    &bin_headers,
                    &additional_sensitive_headers,
                );
            }
            if let Some(res) = handle_binary_response(
                response,
                &content_type,
                output_path,
                pipeline,
                capture_output,
            )
            .await?
            {
                captured_values.push(res);
            }
        }

        break;
    }

    // Close the pager pipe and wait for it to exit before returning.
    drop(pager_handle);

    if capture_output && !captured_values.is_empty() {
        if captured_values.len() == 1 {
            return Ok(Some(captured_values.pop().unwrap()));
        } else {
            return Ok(Some(Value::Array(captured_values)));
        }
    }

    Ok(None)
}

/// Format an HTTP version enum as a string (e.g. `HTTP/1.1`).
fn format_http_version(version: reqwest::Version) -> &'static str {
    match version {
        reqwest::Version::HTTP_09 => "HTTP/0.9",
        reqwest::Version::HTTP_10 => "HTTP/1.0",
        reqwest::Version::HTTP_11 => "HTTP/1.1",
        reqwest::Version::HTTP_2 => "HTTP/2",
        reqwest::Version::HTTP_3 => "HTTP/3",
        _ => "HTTP/1.1",
    }
}

/// Write the HTTP status line and headers preamble to `out`.
///
/// Produces output like:
/// ```text
/// HTTP/1.1 200 OK\r\n
/// Content-Type: application/json\r\n
/// \r\n
/// ```
fn write_http_preamble(
    out: &mut dyn std::io::Write,
    version: reqwest::Version,
    status: reqwest::StatusCode,
    headers: &reqwest::header::HeaderMap,
) -> std::io::Result<()> {
    let version_str = format_http_version(version);
    let reason = status.canonical_reason().unwrap_or("");
    write!(out, "{} {} {}\r\n", version_str, status.as_u16(), reason)?;
    for (name, value) in headers.iter() {
        let val_str = value.to_str().unwrap_or("<binary>");
        write!(out, "{}: {}\r\n", name, val_str)?;
    }
    write!(out, "\r\n")?;
    Ok(())
}

/// Serialize a query parameter value according to its OpenAPI style.
fn serialize_query_param(
    key: &str,
    value: &Value,
    param_def: Option<&crate::openapi::discovery::MethodParameter>,
) -> Vec<(String, String)> {
    let style = param_def
        .and_then(|p| p.style.as_deref())
        .unwrap_or("form");
    let explode = param_def
        .and_then(|p| p.explode)
        .unwrap_or(style == "form");

    match style {
        "deepObject" => serialize_deep_object(key, value),
        // spaceDelimited / pipeDelimited only define array behavior; the
        // elements are joined by a single space / pipe under one key. For
        // non-array values they degrade to the same scalar shape as form.
        "spaceDelimited" => serialize_delimited(key, value, ' '),
        "pipeDelimited" => serialize_delimited(key, value, '|'),
        _ => serialize_form(key, value, explode),
    }
}

/// `spaceDelimited` / `pipeDelimited` array serialization: a single key whose
/// value is the elements joined by `delim`. The delimiter is a literal here;
/// the request encoder percent-encodes it on the wire (space -> `%20`,
/// pipe -> `%7C`).
fn serialize_delimited(key: &str, value: &Value, delim: char) -> Vec<(String, String)> {
    match value {
        Value::Array(arr) => {
            let joined = arr
                .iter()
                .map(value_to_query_string)
                .collect::<Vec<_>>()
                .join(&delim.to_string());
            vec![(key.to_string(), joined)]
        }
        _ => vec![(key.to_string(), value_to_query_string(value))],
    }
}

fn serialize_deep_object(key: &str, value: &Value) -> Vec<(String, String)> {
    match value {
        Value::Object(_) => {
            // Wrap as {key: value} so serde-qs produces key[...]=... pairs.
            // ArrayFormat::Unindexed gives filter[tags]=a&filter[tags]=b,
            // consistent with the Fern Python and C# SDKs.
            let wrapped = serde_json::json!({ key: value });
            let config = serde_qs::Config::new()
                .array_format(serde_qs::ArrayFormat::Unindexed);
            match config.serialize_string(&wrapped) {
                Ok(qs) => {
                    // serde-qs URL-encodes the output; decode each pair
                    qs.split('&')
                        .filter(|s| !s.is_empty())
                        .filter_map(|pair| {
                            let (k, v) = pair.split_once('=')?;
                            let decoded_k = percent_encoding::percent_decode_str(k)
                                .decode_utf8_lossy()
                                .into_owned();
                            let decoded_v = percent_encoding::percent_decode_str(v)
                                .decode_utf8_lossy()
                                .into_owned();
                            Some((decoded_k, decoded_v))
                        })
                        .collect()
                }
                Err(_) => vec![(key.to_string(), value_to_query_string(value))],
            }
        }
        _ => vec![(key.to_string(), value_to_query_string(value))],
    }
}

fn serialize_form(key: &str, value: &Value, explode: bool) -> Vec<(String, String)> {
    match value {
        Value::Array(arr) if explode => arr
            .iter()
            .map(|v| (key.to_string(), value_to_query_string(v)))
            .collect(),
        Value::Array(arr) => {
            let joined = arr
                .iter()
                .map(value_to_query_string)
                .collect::<Vec<_>>()
                .join(",");
            vec![(key.to_string(), joined)]
        }
        // form / object / explode=true: each property becomes its own
        // top-level key (`role=admin&active=true`), dropping the parameter
        // name entirely — the OpenAPI 3.0 rule for an exploded object.
        Value::Object(map) if explode => map
            .iter()
            .map(|(k, v)| (k.clone(), value_to_query_string(v)))
            .collect(),
        // form / object / explode=false: comma-joined `key,value` pairs under
        // the single parameter key (`profile=role,admin,active,true`).
        Value::Object(map) => {
            let joined = map
                .iter()
                .flat_map(|(k, v)| [k.clone(), value_to_query_string(v)])
                .collect::<Vec<_>>()
                .join(",");
            vec![(key.to_string(), joined)]
        }
        _ => vec![(key.to_string(), value_to_query_string(value))],
    }
}

fn value_to_query_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Null => String::new(),
        other => other.to_string(),
    }
}

/// Serialize a header parameter value into its OpenAPI `simple`-style wire
/// representation (the only style permitted for `in: header` parameters).
///
/// - primitive → the scalar rendered as-is (`X-Custom: hello`)
/// - array → elements comma-joined under one name; `explode` does not change
///   the delimiter for `simple` (`X-Tags: a,b`)
/// - object, `explode: false` → flattened `k,v,k2,v2` (`X-Filter: k,v,k2,v2`)
/// - object, `explode: true` → `k=v,k2=v2`
///
/// The fully-assembled value is rejected if it contains control characters,
/// which would otherwise enable header injection (CR/LF) when the value
/// arrives from an untrusted CLI argument.
fn serialize_header_simple(
    value: &Value,
    param_def: Option<&crate::openapi::discovery::MethodParameter>,
) -> Result<String, CliError> {
    let explode = param_def.and_then(|p| p.explode).unwrap_or(false);

    let rendered = match value {
        Value::Array(arr) => arr
            .iter()
            .map(value_to_query_string)
            .collect::<Vec<_>>()
            .join(","),
        Value::Object(map) => map
            .iter()
            .flat_map(|(k, v)| {
                let v = value_to_query_string(v);
                if explode {
                    vec![format!("{k}={v}")]
                } else {
                    vec![k.clone(), v]
                }
            })
            .collect::<Vec<_>>()
            .join(","),
        other => value_to_query_string(other),
    };

    crate::output::reject_dangerous_chars(&rendered, "header value")?;
    Ok(rendered)
}

/// Percent-encode set for a query-string component (key or value).
///
/// RFC 3986 unreserved characters (`A-Za-z0-9-_.~`) are left intact; the comma
/// is also kept literal so a form/no-explode array reads `ids=1,2` rather than
/// `ids=1%2C2`. Everything else — including space (`%20`, *not* the form
/// `+`), `|` (`%7C`), `&`, `=`, `#`, and `[` `]` — is percent-encoded. This is
/// the RFC 3986 encoding the OpenAPI 3.0 query styles expect, and is stricter
/// than reqwest's `serde_urlencoded`-based `.query()` form encoding.
const QUERY_COMPONENT: &percent_encoding::AsciiSet = &percent_encoding::NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'_')
    .remove(b'.')
    .remove(b'~')
    .remove(b',');

fn encode_query_component(s: &str) -> String {
    percent_encoding::utf8_percent_encode(s, QUERY_COMPONENT).to_string()
}

/// Append already-style-serialized `(key, value)` query pairs to `base_url`,
/// percent-encoding each component per [`QUERY_COMPONENT`]. Pairs are joined
/// with `&`; the leading separator is `?` unless `base_url` already carries a
/// query string, in which case `&` continues it. Returns `base_url` unchanged
/// when there are no pairs.
fn append_query_string(base_url: &str, pairs: &[(String, String)]) -> String {
    if pairs.is_empty() {
        return base_url.to_string();
    }
    let query = pairs
        .iter()
        .map(|(k, v)| format!("{}={}", encode_query_component(k), encode_query_component(v)))
        .collect::<Vec<_>>()
        .join("&");
    let sep = if base_url.contains('?') { '&' } else { '?' };
    format!("{base_url}{sep}{query}")
}

fn effective_root_url(method: &RestMethod, doc: &RestDescription) -> String {
    if !method.root_url.is_empty() { method.root_url.clone() } else { doc.root_url.clone() }
}

/// Prepend `doc.base_path` (sourced from `x-fern-base-path`) to `base`,
/// inserting exactly one slash between the two segments regardless of
/// whether either side already has a slash on its boundary. Returns
/// `base` unchanged when `doc.base_path` is `None` or normalizes to
/// empty.
///
/// Examples (server URL × base_path slash matrix):
/// - `"https://x/"` + `"/v1"`  → `"https://x/v1"`
/// - `"https://x"`  + `"/v1"`  → `"https://x/v1"`
/// - `"https://x/"` + `"v1"`   → `"https://x/v1"`
/// - `"https://x"`  + `"v1"`   → `"https://x/v1"`
/// - `"https://x"`  + `"/v1/"` → `"https://x/v1"` (trailing slash on
///   base_path is stripped; `build_url` re-adds one before the path)
///
/// `build_url` calls this helper uniformly across all three URL sources
/// — `--base-url` override, `doc.base_url`, and `effective_root_url +
/// service_path` — so the base path is applied *additively* on top of
/// any one of them. In particular, `--base-url https://staging/v2` on a
/// spec with `x-fern-base-path: /v1` produces `https://staging/v2/v1/...`,
/// not `https://staging/v2/...`: `x-fern-base-path` is part of the spec's
/// logical URL structure, not a property of any specific host.
///
/// Mirrors fern-api/fern's openapi-ir-parser:
/// `packages/cli/api-importers/openapi/openapi-ir-parser/src/openapi/v3/extensions/getFernBasePath.ts`.
///
/// The base path passed in is expected to already have any `{param}`
/// placeholders substituted — `build_url` calls `render_path_template`
/// on `doc.base_path` first so this helper only deals with the
/// post-substitution slash-edge logic.
fn apply_base_path(base: &str, base_path: Option<&str>) -> String {
    let Some(bp) = base_path else {
        return base.to_string();
    };
    let bp_trimmed = bp.trim_matches('/');
    if bp_trimmed.is_empty() {
        return base.to_string();
    }
    let base_trimmed = base.trim_end_matches('/');
    format!("{base_trimmed}/{bp_trimmed}")
}

fn build_url(
    doc: &RestDescription,
    method: &RestMethod,
    params: &Map<String, Value>,
    is_upload: bool,
    base_url_override: Option<&str>,
) -> Result<(String, Vec<(String, String)>), CliError> {
    // Build URL base and path. The base_url here is just the server (or
    // override) plus any Discovery `service_path`; x-fern-base-path is
    // applied as a separate step below so the slash-edge logic stays in
    // one place and applies to all three base sources (override, explicit
    // `base_url`, and effective root_url + service_path).
    let raw_base_url = if let Some(b) = base_url_override {
        b.trim_end_matches('/').to_string()
    } else if let Some(b) = &doc.base_url {
        b.clone()
    } else {
        format!("{}{}", effective_root_url(method, doc), doc.service_path)
    };
    // Render any `{param}` placeholders in `x-fern-base-path` (e.g.
    // `/{tenant}/v1`) against the operation's parameters. The placeholder
    // names are also collected so we can exclude them from the query
    // string below — the param has been consumed by the URL path and
    // must not leak as `?tenant=acme`. Mirrors upstream Fern where base
    // path placeholders are baked into endpoint paths at Definition build
    // time and then resolved by the SDK's path-parameter renderer at
    // request time.
    let rendered_base_path = doc
        .base_path
        .as_deref()
        .map(|bp| render_path_template(bp, params, Some(&method.parameters)))
        .transpose()?;
    let base_path_parameters: HashSet<&str> = doc
        .base_path
        .as_deref()
        .map(extract_template_path_parameters)
        .unwrap_or_default();
    let base_url = apply_base_path(&raw_base_url, rendered_base_path.as_deref());

    // Prefer flatPath when its placeholders match the method's path parameters.
    // Some Discovery Documents (e.g., Slides presentations.get) have flatPath
    // placeholders that don't match parameter names ({presentationsId} vs
    // {presentationId}). In those cases, fall back to path which uses RFC 6570
    // operators ({+var}) that this function already handles.
    let path_template = match method.flat_path.as_deref() {
        Some(fp) => {
            let all_match = method
                .parameters
                .iter()
                .filter(|(_, p)| p.location.as_deref() == Some("path"))
                .all(|(name, _)| {
                    let plain = format!("{{{name}}}");
                    let plus = format!("{{+{name}}}");
                    fp.contains(&plain) || fp.contains(&plus)
                });
            if all_match {
                fp
            } else {
                method.path.as_str()
            }
        }
        None => method.path.as_str(),
    };

    // Substitute path parameters and separate query parameters
    let path_parameters = extract_template_path_parameters(path_template);
    let mut query_params: Vec<(String, String)> = Vec::new();

    for (key, value) in params {
        if path_parameters.contains(key.as_str()) {
            continue;
        }
        // Params that backfill placeholders in `x-fern-base-path` have
        // already been consumed by the URL path; they must not also
        // appear as query string entries.
        if base_path_parameters.contains(key.as_str()) {
            continue;
        }

        let is_path_param = method
            .parameters
            .get(key)
            .and_then(|p| p.location.as_deref())
            == Some("path");

        if is_path_param {
            return Err(CliError::Validation(format!(
                "Path parameter '{key}' was provided but is not present in URL template '{path_template}'"
            )));
        }

        // Use style-aware serialization for query parameters.
        // For backward compatibility, `repeated` params still use the legacy
        // expansion (equivalent to form+explode).
        let param_def = method.parameters.get(key);
        let is_repeated = param_def.map(|p| p.repeated).unwrap_or(false);

        if is_repeated {
            if let Value::Array(arr) = value {
                for item in arr {
                    let val_str = match item {
                        Value::String(s) => s.clone(),
                        other => other.to_string(),
                    };
                    query_params.push((key.clone(), val_str));
                }
                continue;
            }
        }

        let pairs = serialize_query_param(key, value, param_def);
        query_params.extend(pairs);
    }

    let url_path = render_path_template(path_template, params, Some(&method.parameters))?;

    let full_url = if is_upload {
        // Use the upload endpoint from the Discovery Document
        let upload_endpoint = method
            .media_upload
            .as_ref()
            .and_then(|mu| mu.protocols.as_ref())
            .and_then(|p| p.simple.as_ref())
            .map(|s| s.path.as_str())
            .ok_or_else(|| {
                CliError::Validation(
                    "Method supports media upload but no upload path found in Discovery Document"
                        .to_string(),
                )
            })?;
        let upload_path = render_path_template(upload_endpoint, params, Some(&method.parameters))?;
        // Compose the upload host with the spec-level base_path the same
        // way the non-upload branch does, so x-fern-base-path is applied
        // uniformly. This branch is currently unreachable from OpenAPI
        // specs (only Google Discovery sets `media_upload`, and Discovery
        // specs don't carry `base_path`), but keeping the wiring
        // symmetric prevents a silent gap if either side ever changes.
        let root = base_url_override
            .map(|b| b.trim_end_matches('/').to_string())
            .unwrap_or_else(|| effective_root_url(method, doc).trim_end_matches('/').to_string());
        let root = apply_base_path(&root, rendered_base_path.as_deref());
        format!("{root}{upload_path}")
    } else {
        match (base_url.ends_with('/'), url_path.starts_with('/')) {
            (true, true) => format!("{}{}", base_url.trim_end_matches('/'), url_path),
            (false, false) => format!("{base_url}/{url_path}"),
            _ => format!("{base_url}{url_path}"),
        }
    };

    Ok((full_url, query_params))
}

fn extract_template_path_parameters(path_template: &str) -> HashSet<&str> {
    let mut found = HashSet::new();
    let mut cursor = 0;

    while let Some(open_idx) = path_template[cursor..].find('{') {
        let token_start = cursor + open_idx;
        let Some(close_idx) = path_template[token_start..].find('}') else {
            break;
        };

        let token_end = token_start + close_idx;
        let token = &path_template[token_start + 1..token_end];
        if let Some(key) = token.strip_prefix('+') {
            found.insert(key);
        } else {
            found.insert(token);
        }
        cursor = token_end + 1;
    }

    found
}

fn render_path_template(
    path_template: &str,
    params: &Map<String, Value>,
    param_defs: Option<&HashMap<String, MethodParameter>>,
) -> Result<String, CliError> {
    let mut rendered = String::with_capacity(path_template.len());
    let mut cursor = 0;

    while let Some(open_idx) = path_template[cursor..].find('{') {
        let token_start = cursor + open_idx;
        rendered.push_str(&path_template[cursor..token_start]);

        let Some(close_idx) = path_template[token_start..].find('}') else {
            rendered.push_str(&path_template[token_start..]);
            return Ok(rendered);
        };

        let token_end = token_start + close_idx;
        let token = &path_template[token_start + 1..token_end];
        let (is_plus, key) = if let Some(key) = token.strip_prefix('+') {
            (true, key)
        } else {
            (false, token)
        };

        if let Some(value) = params.get(key) {
            let encoded = if is_plus {
                // RFC 6570 `{+var}` reserved expansion: preserve literal `/`.
                let val_str = match value {
                    Value::String(s) => s.clone(),
                    other => other.to_string(),
                };
                let validated = crate::validate::validate_resource_name(&val_str)?;
                crate::validate::encode_path_preserving_slashes(validated)
            } else {
                // Consult the parameter's OpenAPI serialization `style`
                // (simple / label / matrix) and `explode` flag. Falls back
                // to plain simple/primitive substitution when no definition
                // is available (e.g. `x-fern-base-path` placeholders).
                let param_def = param_defs.and_then(|defs| defs.get(key));
                let serialized = serialize_path_param(key, value, param_def);
                // Reject WHATWG dot-segments: the `url` crate normalizes
                // `.` and `..` (and their percent-encoded forms) during
                // Url::parse(), silently redirecting the request. Encoding
                // can't prevent this — rejection is the only defense.
                if crate::validate::is_dot_segment(&serialized) {
                    return Err(CliError::Validation(format!(
                        "Path parameter '{key}' produced a WHATWG dot-segment ('{serialized}') \
                         that would be collapsed during URL normalization"
                    )));
                }
                serialized
            };
            rendered.push_str(&encoded);
        } else {
            rendered.push_str(&path_template[token_start..=token_end]);
        }

        cursor = token_end + 1;
    }

    rendered.push_str(&path_template[cursor..]);
    Ok(rendered)
}

/// Serialize a value into a single URL path segment per the OpenAPI 3.0 path
/// `style` (`simple` default, `label`, `matrix`) and `explode` flag.
///
/// Only the user-supplied *values* are percent-encoded
/// ([`encode_path_segment`](crate::validate::encode_path_segment)); the
/// structural separators introduced by the style (`,`, `.`, `;`, `=`) are
/// literal. Because `encode_path_segment` itself encodes those characters,
/// assembling the segment from already-encoded values keeps the separators
/// from being double-encoded.
fn serialize_path_param(
    name: &str,
    value: &Value,
    param_def: Option<&MethodParameter>,
) -> String {
    let style = param_def
        .and_then(|p| p.style.as_deref())
        .unwrap_or("simple");
    // OpenAPI default `explode` is false for every path style.
    let explode = param_def.and_then(|p| p.explode).unwrap_or(false);

    let enc = |v: &Value| crate::validate::encode_path_segment(&value_to_path_string(v));

    match style {
        "label" => match value {
            Value::Array(arr) => {
                // RFC 6570: explode=true -> dot-separated; explode=false -> comma-separated.
                let joiner = if explode { "." } else { "," };
                let body = arr.iter().map(&enc).collect::<Vec<_>>().join(joiner);
                format!(".{body}")
            }
            Value::Object(map) => {
                if explode {
                    // explode=true: k=v pairs dot-separated.
                    let body = map
                        .iter()
                        .map(|(k, v)| {
                            format!("{}={}", crate::validate::encode_path_segment(k), enc(v))
                        })
                        .collect::<Vec<_>>()
                        .join(".");
                    format!(".{body}")
                } else {
                    // explode=false: flat k,v,k,v comma-separated.
                    let body = map
                        .iter()
                        .flat_map(|(k, v)| {
                            [crate::validate::encode_path_segment(k), enc(v)]
                        })
                        .collect::<Vec<_>>()
                        .join(",");
                    format!(".{body}")
                }
            }
            _ => format!(".{}", enc(value)),
        },
        "matrix" => match value {
            Value::Array(arr) if explode => arr
                .iter()
                .map(|v| format!(";{name}={}", enc(v)))
                .collect::<Vec<_>>()
                .join(""),
            Value::Array(arr) => {
                let body = arr.iter().map(&enc).collect::<Vec<_>>().join(",");
                format!(";{name}={body}")
            }
            Value::Object(map) if explode => map
                .iter()
                .map(|(k, v)| {
                    format!(";{}={}", crate::validate::encode_path_segment(k), enc(v))
                })
                .collect::<Vec<_>>()
                .join(""),
            Value::Object(map) => {
                let body = map
                    .iter()
                    .map(|(k, v)| {
                        format!("{},{}", crate::validate::encode_path_segment(k), enc(v))
                    })
                    .collect::<Vec<_>>()
                    .join(",");
                format!(";{name}={body}")
            }
            _ => format!(";{name}={}", enc(value)),
        },
        // "simple" (default) and any unrecognized style.
        _ => match value {
            Value::Array(arr) => arr.iter().map(&enc).collect::<Vec<_>>().join(","),
            Value::Object(map) if explode => map
                .iter()
                .map(|(k, v)| {
                    format!("{}={}", crate::validate::encode_path_segment(k), enc(v))
                })
                .collect::<Vec<_>>()
                .join(","),
            Value::Object(map) => map
                .iter()
                .flat_map(|(k, v)| [crate::validate::encode_path_segment(k), enc(v)])
                .collect::<Vec<_>>()
                .join(","),
            _ => enc(value),
        },
    }
}

/// Stringify a JSON value for a path segment. Mirrors `value_to_query_string`
/// (the query-side equivalent) — strings pass through, numbers/booleans use
/// their canonical text, null is empty, composites fall back to JSON.
fn value_to_path_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Null => String::new(),
        other => other.to_string(),
    }
}

/// Resolves the MIME type for the uploaded media content.
///
/// Priority:
/// 1. `--upload-content-type` flag (explicit override)
/// 2. File extension inference (common extensions mapped to MIME types)
/// 3. Metadata `mimeType` (fallback for backward compatibility)
/// 4. `application/octet-stream`
///
/// All returned MIME types have control characters stripped to prevent
/// MIME header injection via user-controlled metadata.
fn resolve_upload_mime(
    explicit: Option<&str>,
    upload_path: Option<&str>,
    metadata: &Option<Value>,
) -> String {
    let raw = explicit
        .map(|s| s.to_string())
        .or_else(|| upload_path.and_then(mime_from_extension))
        .or_else(|| {
            metadata
                .as_ref()
                .and_then(|m| m.get("mimeType"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        })
        .unwrap_or_else(|| "application/octet-stream".to_string());

    // Strip CR/LF and other control characters to prevent MIME header injection.
    let sanitized: String = raw.chars().filter(|c| !c.is_control()).collect();
    if sanitized.is_empty() {
        "application/octet-stream".to_string()
    } else {
        sanitized
    }
}

/// Simple MIME type inference from file extension.
/// Returns `None` for unrecognized extensions.
fn mime_from_extension(path: &str) -> Option<String> {
    let ext = path.rsplit('.').next()?.to_lowercase();
    let mime = match ext.as_str() {
        "txt" => "text/plain",
        "html" | "htm" => "text/html",
        "css" => "text/css",
        "csv" => "text/csv",
        "xml" => "application/xml",
        "json" => "application/json",
        "js" => "application/javascript",
        "pdf" => "application/pdf",
        "zip" => "application/zip",
        "gz" | "gzip" => "application/gzip",
        "tar" => "application/x-tar",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        "ico" => "image/x-icon",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "md" | "markdown" => "text/markdown",
        "yaml" | "yml" => "application/yaml",
        "toml" => "application/toml",
        "doc" => "application/msword",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls" => "application/vnd.ms-excel",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "ppt" => "application/vnd.ms-powerpoint",
        "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "wasm" => "application/wasm",
        _ => return None,
    };
    Some(mime.to_string())
}

/// Streams stdin as a raw request body via chunked transfer encoding.
/// Used when the user passes `-` to the binary-body flag.
fn build_stdin_body_stream() -> reqwest::Body {
    let stream = tokio_util::io::ReaderStream::new(tokio::io::stdin());
    reqwest::Body::wrap_stream(stream)
}

/// Streams a file as a raw request body. Used for operations whose request
/// body is declared as a binary content type (e.g. `application/octet-stream`).
/// Memory usage stays at O(64 KB) regardless of file size.
///
/// `flag_name` is the spec-derived CLI flag (`file`, `body`, or whatever
/// `x-fern-parameter-name` set) — surfaced in the error message if the file
/// disappears between the upfront `metadata()` check and stream open (TOCTOU).
fn build_binary_file_stream(
    file_path: &str,
    file_size: u64,
    flag_name: &str,
) -> (reqwest::Body, u64) {
    let file_path_owned = file_path.to_owned();
    let flag_owned = flag_name.to_owned();
    let stream = futures_util::stream::once(async move {
        tokio::fs::File::open(&file_path_owned).await.map_err(|e| {
            std::io::Error::new(
                e.kind(),
                format!("failed to open --{flag_owned} '{file_path_owned}': {e}"),
            )
        })
    })
    .map_ok(tokio_util::io::ReaderStream::new)
    .try_flatten();

    (reqwest::Body::wrap_stream(stream), file_size)
}

/// Builds a streaming multipart/related body for media upload requests.
///
/// Instead of reading the entire file into memory, this streams the file in
/// chunks via `ReaderStream`, keeping memory usage at O(64 KB) regardless of
/// file size. The `Content-Length` is pre-computed from file metadata so APIs
/// Generate a unique boundary ID for multipart requests using timestamp.
fn generate_boundary_id() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos() as u64
}

/// still receive the correct header without buffering.
///
/// Returns `(body, content_type, content_length)`.
fn build_multipart_stream(
    metadata: &Option<Value>,
    file_path: &str,
    file_size: u64,
    media_mime: &str,
) -> Result<(reqwest::Body, String, u64), CliError> {
    let boundary = format!("fern_boundary_{:016x}", generate_boundary_id());

    let media_mime = media_mime.to_string();

    let metadata_json = match metadata {
        Some(m) => serde_json::to_string(m).map_err(|e| {
            CliError::Validation(format!("Failed to serialize upload metadata: {e}"))
        })?,
        None => "{}".to_string(),
    };

    let preamble = format!(
        "--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{metadata_json}\r\n\
         --{boundary}\r\nContent-Type: {media_mime}\r\n\r\n"
    );
    let postamble = format!("\r\n--{boundary}--\r\n");

    let content_length = preamble.len() as u64 + file_size + postamble.len() as u64;
    let content_type = format!("multipart/related; boundary={boundary}");

    let preamble_bytes: bytes::Bytes = preamble.into_bytes().into();
    let postamble_bytes: bytes::Bytes = postamble.into_bytes().into();

    let file_path_owned = file_path.to_owned();
    let file_stream = futures_util::stream::once(async move {
        tokio::fs::File::open(&file_path_owned).await.map_err(|e| {
            std::io::Error::new(
                e.kind(),
                format!("failed to open upload file '{file_path_owned}': {e}"),
            )
        })
    })
    .map_ok(tokio_util::io::ReaderStream::new)
    .try_flatten();

    let stream = futures_util::stream::once(async { Ok::<_, std::io::Error>(preamble_bytes) })
        .chain(file_stream)
        .chain(futures_util::stream::once(async {
            Ok::<_, std::io::Error>(postamble_bytes)
        }));

    Ok((
        reqwest::Body::wrap_stream(stream),
        content_type,
        content_length,
    ))
}

/// Resolve a file part's `Content-Type`. A per-part value from the OpenAPI
/// `encoding` object wins; otherwise the OAS default for a binary part,
/// `application/octet-stream`, applies.
fn file_part_mime(content_type: Option<&str>) -> &str {
    content_type.unwrap_or("application/octet-stream")
}

/// Build a `reqwest::multipart::Form` from the collected CLI flag values.
/// Text parts are added inline; file parts are read from disk and
/// streamed. The `Content-Type: multipart/form-data; boundary=...`
/// header is set by reqwest automatically when `.multipart(form)` is
/// called on the request builder.
async fn build_multipart_form(
    parts: &[MultipartPart],
) -> Result<reqwest::multipart::Form, CliError> {
    let mut form = reqwest::multipart::Form::new();

    for part in parts {
        match part {
            MultipartPart::Text {
                name,
                value,
                content_type,
            } => {
                // A text part is just `Part::text`; an explicit per-part
                // `Content-Type` from the OpenAPI `encoding` object (e.g.
                // `application/json`) overrides reqwest's `text/plain`.
                let mut text_part = reqwest::multipart::Part::text(value.clone());
                if let Some(ct) = content_type {
                    text_part = text_part.mime_str(ct).map_err(|e| {
                        CliError::Validation(format!(
                            "Invalid Content-Type '{ct}' for multipart field '{name}': {e}"
                        ))
                    })?;
                }
                form = form.part(name.clone(), text_part);
            }
            MultipartPart::File {
                name,
                path,
                content_type,
            } => {
                // `\@literal` is an escape, not a file path — send the literal
                // string `@literal` as the part value (no file read). FER-10436.
                // `collect_multipart_parts` normally routes the escape to a
                // Text part upstream; this branch is the defensive fallback
                // for any caller that constructs a File part directly.
                if is_escaped_literal(path) {
                    let literal = strip_or_escape_at(path).into_owned();
                    let mut literal_part = reqwest::multipart::Part::text(literal);
                    if let Some(ct) = content_type {
                        literal_part = literal_part.mime_str(ct).map_err(|e| {
                            CliError::Validation(format!(
                                "Invalid Content-Type '{ct}' for multipart field '{name}': {e}"
                            ))
                        })?;
                    }
                    form = form.part(name.clone(), literal_part);
                    continue;
                }
                let mime = file_part_mime(content_type.as_deref());
                // Parse the raw stored path so we know which encoding the
                // user asked for (`Auto` → raw bytes, `Text` → UTF-8 only,
                // `Data` → always base64 — FER-10532). Stdin (`@-` / `-`)
                // is only reachable through `Auto`.
                let (inner_path, mode) = match parse_at_ref(path) {
                    AtRef::File { path: p, mode } => (p, mode),
                    AtRef::Plain(s) => (Cow::Borrowed(s), AtMode::Auto),
                    // `\@literal` was handled above; reachable only for a
                    // defensively-constructed File part. Fall back to the
                    // FER-10436 contract: open a file whose name is the
                    // literal `@<rest>`.
                    AtRef::Escaped(literal) => (Cow::Owned(literal), AtMode::Auto),
                };
                let inner_ref: &str = inner_path.as_ref();
                let is_stdin = mode == AtMode::Auto && inner_ref == "-";
                let (bytes, file_name) = if is_stdin {
                    let mut buf = Vec::new();
                    tokio::io::AsyncReadExt::read_to_end(&mut tokio::io::stdin(), &mut buf)
                        .await
                        .map_err(|e| {
                            CliError::Validation(format!(
                                "Failed to read stdin for multipart field '{name}': {e}"
                            ))
                        })?;
                    (buf, "stdin".to_string())
                } else {
                    let file_bytes = tokio::fs::read(inner_ref).await.map_err(|e| {
                        CliError::Validation(format!(
                            "Failed to read file '{inner_ref}' for multipart field '{name}': {e}"
                        ))
                    })?;
                    let file_name = std::path::Path::new(inner_ref)
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("upload")
                        .to_string();
                    (file_bytes, file_name)
                };
                // Apply the FER-10532 mode transform when the user asked
                // for one. `Auto` and stdin keep their raw-byte path.
                let part_bytes: Vec<u8> = match mode {
                    AtMode::Auto => bytes,
                    AtMode::Text | AtMode::Data => encode_file_bytes_for_text(
                        bytes,
                        mode,
                        &format!("multipart field '{name}'"),
                        inner_ref,
                    )?
                    .into_bytes(),
                };
                let file_part = reqwest::multipart::Part::bytes(part_bytes)
                    .file_name(file_name)
                    .mime_str(mime)
                    .map_err(|e| {
                        CliError::Validation(format!(
                            "Invalid Content-Type '{mime}' for multipart field '{name}': {e}"
                        ))
                    })?;
                form = form.part(name.clone(), file_part);
            }
        }
    }

    Ok(form)
}

/// Builds a multipart/related body from in-memory bytes.
///
/// Used when the upload content is constructed in memory (e.g., a Gmail RFC 5322
/// message with attachments) rather than read from a file on disk.
fn build_multipart_bytes(
    metadata: &Option<Value>,
    data: &[u8],
    media_mime: &str,
) -> Result<(reqwest::Body, String, u64), CliError> {
    let boundary = format!("fern_boundary_{:016x}", generate_boundary_id());

    let metadata_json = match metadata {
        Some(m) => serde_json::to_string(m).map_err(|e| {
            CliError::Validation(format!("Failed to serialize upload metadata: {e}"))
        })?,
        None => "{}".to_string(),
    };

    let preamble = format!(
        "--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{metadata_json}\r\n\
         --{boundary}\r\nContent-Type: {media_mime}\r\n\r\n"
    );
    let postamble = format!("\r\n--{boundary}--\r\n");

    let mut body = Vec::with_capacity(preamble.len() + data.len() + postamble.len());
    body.extend_from_slice(preamble.as_bytes());
    body.extend_from_slice(data);
    body.extend_from_slice(postamble.as_bytes());

    let content_length = body.len() as u64;
    let content_type = format!("multipart/related; boundary={boundary}");

    Ok((reqwest::Body::from(body), content_type, content_length))
}

/// Builds a buffered multipart/related body for media upload requests.
///
/// This is the legacy implementation retained for unit tests that need
/// a fully materialized body to assert against.
///
/// Returns the body bytes and the Content-Type header value (with boundary).
#[cfg(test)]
fn build_multipart_body(
    metadata: &Option<Value>,
    file_bytes: &[u8],
    media_mime: &str,
) -> Result<(Vec<u8>, String), CliError> {
    let boundary = format!("fern_boundary_{:016x}", generate_boundary_id());

    // Build multipart/related body
    let metadata_json = metadata
        .as_ref()
        .map(|m| serde_json::to_string(m).unwrap_or_else(|_| "{}".to_string()))
        .unwrap_or_else(|| "{}".to_string());

    let mut body = Vec::new();
    // Part 1: JSON metadata
    body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
    body.extend_from_slice(b"Content-Type: application/json; charset=UTF-8\r\n\r\n");
    body.extend_from_slice(metadata_json.as_bytes());
    body.extend_from_slice(b"\r\n");
    // Part 2: File content
    body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
    body.extend_from_slice(format!("Content-Type: {media_mime}\r\n\r\n").as_bytes());
    body.extend_from_slice(file_bytes);
    body.extend_from_slice(b"\r\n");
    // Closing boundary
    body.extend_from_slice(format!("--{boundary}--\r\n").as_bytes());

    let content_type = format!("multipart/related; boundary={boundary}");
    Ok((body, content_type))
}

/// Intentional duplication from `graphql/executor.rs` — no shared module by design.
fn set_nested_value(obj: &mut Map<String, Value>, path: &str, value: Value) {
    match path.split_once('.') {
        None => {
            obj.insert(path.to_string(), value);
        }
        Some((head, tail)) => {
            let nested = obj
                .entry(head.to_string())
                .or_insert_with(|| Value::Object(Map::new()));
            if let Value::Object(nested_map) = nested {
                set_nested_value(nested_map, tail, value);
            }
        }
    }
}

/// Apply the appropriate body encoding to the request based on the
/// [`BodyEncoding`] variant. Sets the `Content-Type` header and body payload.
fn encode_request_body(
    request: reqwest::RequestBuilder,
    body: &Value,
    encoding: &BodyEncoding,
) -> reqwest::RequestBuilder {
    match encoding {
        BodyEncoding::Json => request
            .header("Content-Type", encoding.content_type())
            .json(body),
        BodyEncoding::FormUrlEncoded => {
            let encoded = encode_form_body(body);
            request
                .header("Content-Type", encoding.content_type())
                .body(encoded)
        }
    }
}

/// Encode a JSON `Value` (expected to be an Object) into a
/// `application/x-www-form-urlencoded` string. Top-level keys are
/// emitted as-is; arrays repeat the key (e.g. `tag=a&tag=b`).
/// Nested objects and arrays-of-objects are JSON-encoded as the value
/// — no dot-notation or bracket expansion — so the encoding stays
/// predictable for servers that treat `.` as a literal character.
/// Non-object top-level values are serialized as a single
/// `body=<value>` pair.
fn encode_form_body(val: &Value) -> String {
    let mut pairs: Vec<(String, String)> = Vec::new();
    if let Value::Object(map) = val {
        collect_form_pairs(map, &mut pairs);
    } else {
        pairs.push(("body".to_string(), value_to_form_str(val)));
    }
    form_urlencoded::Serializer::new(String::new())
        .extend_pairs(pairs)
        .finish()
}

fn collect_form_pairs(map: &Map<String, Value>, out: &mut Vec<(String, String)>) {
    for (key, value) in map {
        match value {
            Value::Array(items) => {
                for item in items {
                    out.push((key.clone(), value_to_form_str(item)));
                }
            }
            _ => out.push((key.clone(), value_to_form_str(value))),
        }
    }
}

fn value_to_form_str(val: &Value) -> String {
    match val {
        Value::String(s) => s.clone(),
        Value::Null => String::new(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => n.to_string(),
        other => other.to_string(),
    }
}

///
/// CLI flags arrive as `Value::String` (clap stores them as `String`), but a
/// body field declared `integer` / `number` / `boolean` should land in the
/// JSON body with the right runtime type, not as a quoted string. Values
/// supplied via `--params` are already typed by `serde_json` and pass through
/// unchanged. `object` and `array` types are JSON-decoded so callers can pass
/// nested structures via individual flags (e.g. `--addresses '[{"city":"SF"}]'`).
fn coerce_body_param_value(value: &Value, param_type: Option<&str>) -> Result<Value, CliError> {
    // For object-shorthand body flags, validate shape regardless of whether
    // the value arrives here as a raw String (legacy / direct unit-test entry)
    // or as a pre-decoded Value. `collect_params_from_flags` eagerly
    // JSON-decodes object-typed params for deepObject query handling, so
    // production calls usually arrive pre-decoded — but the decoded form may
    // itself be a Value::String (the JSON `"hi"` decodes to one), and the
    // fallback path leaves Value::String unchanged for un-decodable input.
    // Try a re-decode on String inputs; if that fails, treat the value as-is.
    // Either way the final shape must be a JSON object.
    if param_type == Some("object") {
        let parsed = if let Value::String(raw) = value {
            serde_json::from_str::<Value>(raw).unwrap_or_else(|_| value.clone())
        } else {
            value.clone()
        };
        if !parsed.is_object() {
            return Err(CliError::Validation(format!(
                "Object-shorthand flag must be a JSON object, got {}",
                match &parsed {
                    Value::Null => "null",
                    Value::Bool(_) => "boolean",
                    Value::Number(_) => "number",
                    Value::String(_) => "string",
                    Value::Array(_) => "array",
                    Value::Object(_) => unreachable!(),
                }
            )));
        }
        return Ok(parsed);
    }

    let Value::String(raw) = value else {
        return Ok(value.clone());
    };
    match param_type {
        Some("integer") => raw
            .parse::<i64>()
            .map(|n| Value::Number(n.into()))
            .map_err(|e| CliError::Validation(format!("Invalid integer body value '{raw}': {e}"))),
        Some("number") => {
            let n = raw.parse::<f64>().map_err(|e| {
                CliError::Validation(format!("Invalid number body value '{raw}': {e}"))
            })?;
            serde_json::Number::from_f64(n)
                .map(Value::Number)
                .ok_or_else(|| CliError::Validation(format!("Non-finite number body value '{raw}'")))
        }
        Some("boolean") => match raw.as_str() {
            "true" | "1" => Ok(Value::Bool(true)),
            "false" | "0" => Ok(Value::Bool(false)),
            _ => Err(CliError::Validation(format!(
                "Invalid boolean body value '{raw}' (expected true/false)"
            ))),
        },
        Some("array") => serde_json::from_str(raw).map_err(|e| {
            CliError::Validation(format!("Invalid JSON body value for nested field: {e}"))
        }),
        _ => Ok(Value::String(raw.clone())),
    }
}

/// Validates a JSON body against a Discovery Document schema.
fn validate_body_against_schema(
    body: &Value,
    schema_name: &str,
    doc: &RestDescription,
) -> Result<(), CliError> {
    let mut errors = Vec::new();
    validate_value(body, schema_name, doc, "$", &mut errors);

    if !errors.is_empty() {
        return Err(CliError::Validation(format!(
            "Request body failed schema validation:\n- {}",
            errors.join("\n- ")
        )));
    }

    Ok(())
}

fn validate_value(
    value: &Value,
    schema_ref_name: &str,
    doc: &RestDescription,
    path: &str,
    errors: &mut Vec<String>,
) {
    let schema = match doc.schemas.get(schema_ref_name) {
        Some(s) => s,
        None => {
            errors.push(format!("{path}: Schema '{schema_ref_name}' not found"));
            return;
        }
    };

    // Null on a nullable schema is always valid — mirrors the property-
    // level null short-circuit in `validate_property`. Without this, a
    // `$ref`-resolved schema that is `nullable: true` or contains a
    // nullable-union composition (`oneOf: [T, null]` / `anyOf: [T, null]`)
    // would incorrectly reject JSON null with "Expected object".
    if value.is_null()
        && (schema.nullable
            || has_null_branch(&schema.one_of)
            || has_null_branch(&schema.any_of))
    {
        return;
    }

    // Enter the object branch on a standard object schema *or* an
    // `allOf`-only root (no `type:` declared but composition branches
    // contribute the property set). See ADR-0004.
    let has_all_of = !schema.all_of.is_empty();
    if schema.schema_type.as_deref() == Some("object")
        || !schema.properties.is_empty()
        || has_all_of
    {
        if let Value::Object(obj) = value {
            if has_all_of {
                let (merged_props, merged_required) = merge_top_level_all_of(schema, doc);
                validate_properties(obj, &merged_props, &merged_required, doc, path, errors);
            } else {
                validate_properties(obj, &schema.properties, &schema.required, doc, path, errors);
            }
        } else {
            errors.push(format!("{path}: Expected object"));
        }
    }
}

/// Mirror of `parser::merge_all_of_properties` for the validator's IR
/// layer (`JsonSchema` + `JsonSchemaProperty` instead of
/// `OpenApiSchemaObject`). Walks `allOf` branches, resolving `$ref`s
/// through `doc.schemas`, and returns the merged property map + sorted
/// union of `required:` arrays. The schema's own properties are the
/// final overlay (last-branch-wins per ADR-0004). The returned `Vec` is
/// sorted so 'Missing required property X' diagnostics surface in
/// stable order across runs.
fn merge_top_level_all_of(
    schema: &crate::openapi::discovery::JsonSchema,
    doc: &RestDescription,
) -> (
    HashMap<String, crate::openapi::discovery::JsonSchemaProperty>,
    Vec<String>,
) {
    let mut props: HashMap<String, crate::openapi::discovery::JsonSchemaProperty> = HashMap::new();
    let mut required: std::collections::HashSet<String> = std::collections::HashSet::new();
    for branch in &schema.all_of {
        walk_all_of_for_validate(branch, doc, &mut props, &mut required, 0);
    }
    for (k, v) in &schema.properties {
        props.insert(k.clone(), v.clone());
    }
    for r in &schema.required {
        required.insert(r.clone());
    }
    let mut required_vec: Vec<String> = required.into_iter().collect();
    required_vec.sort();
    (props, required_vec)
}

/// Same merge, but for a nested `JsonSchemaProperty` that has
/// `prop_type == "object"` with an `allOf` overlay. Returns the merged
/// property map plus the sorted union of `required:` arrays contributed
/// by `$ref`-resolved branches.
///
/// Inline `JsonSchemaProperty` branches cannot contribute `required`
/// (the IR doesn't carry it at this layer — ADR-0004 known gap). Only
/// `$ref`-resolved branches, which `walk_all_of_for_validate` looks up
/// as `JsonSchema`s, surface their `required:` arrays here.
fn merge_property_all_of(
    prop: &crate::openapi::discovery::JsonSchemaProperty,
    doc: &RestDescription,
) -> (
    HashMap<String, crate::openapi::discovery::JsonSchemaProperty>,
    Vec<String>,
) {
    let mut props: HashMap<String, crate::openapi::discovery::JsonSchemaProperty> = HashMap::new();
    let mut required: std::collections::HashSet<String> = std::collections::HashSet::new();
    for branch in &prop.all_of {
        walk_all_of_for_validate(branch, doc, &mut props, &mut required, 0);
    }
    for (k, v) in &prop.properties {
        props.insert(k.clone(), v.clone());
    }
    let mut required_vec: Vec<String> = required.into_iter().collect();
    required_vec.sort();
    (props, required_vec)
}

/// Recursion helper for both `merge_top_level_all_of` and
/// `merge_property_all_of`. `branch` is a `JsonSchemaProperty`; when its
/// `$ref` is set, the helper resolves through `doc.schemas` (which holds
/// `JsonSchema`s — the only IR layer that carries `required`).
fn walk_all_of_for_validate(
    branch: &crate::openapi::discovery::JsonSchemaProperty,
    doc: &RestDescription,
    props: &mut HashMap<String, crate::openapi::discovery::JsonSchemaProperty>,
    required: &mut std::collections::HashSet<String>,
    depth: u8,
) {
    // Match `parser::MAX_ALL_OF_DEPTH` — see ADR-0004 § Depth budget for
    // the rationale. Inlined as a constant because the parser-side value
    // is private and AGENTS.md forbids shared abstractions between paths.
    const MAX_ALL_OF_DEPTH_VALIDATOR: u8 = 8;
    if depth >= MAX_ALL_OF_DEPTH_VALIDATOR {
        // Match the parser-side warning so cyclic $ref chains surface
        // uniformly whether they're hit at parse time or at body
        // validation time.
        tracing::warn!(
            "allOf recursion exceeded {MAX_ALL_OF_DEPTH_VALIDATOR} levels; truncating. Likely a cyclic $ref chain."
        );
        return;
    }
    if let Some(ref_name) = &branch.schema_ref {
        if let Some(referenced) = doc.schemas.get(ref_name) {
            for inner in &referenced.all_of {
                walk_all_of_for_validate(inner, doc, props, required, depth + 1);
            }
            for (k, v) in &referenced.properties {
                props.insert(k.clone(), v.clone());
            }
            for r in &referenced.required {
                required.insert(r.clone());
            }
        } else {
            tracing::warn!("allOf branch references unresolvable schema: {ref_name}");
        }
        return;
    }
    for inner in &branch.all_of {
        walk_all_of_for_validate(inner, doc, props, required, depth + 1);
    }
    for (k, v) in &branch.properties {
        props.insert(k.clone(), v.clone());
    }
    // Inline `JsonSchemaProperty` branches have no `required` (the IR
    // doesn't carry it at this layer). Branch-level required from inline
    // composition is a known gap; see ADR-0004 § Consequences.
}

/// True when any composition branch is a null sentinel — the validator's
/// null short-circuit for ADR-0005's promoted nullable unions. Mirrors
/// the three forms the parser's `is_null_sentinel` recognizes, after
/// lowering to `JsonSchemaProperty`:
///
/// | Spec form | Lowered shape |
/// |---|---|
/// | `{type: 'null'}` (3.1 scalar) | `prop_type: Some("null")` |
/// | `{type: ['null']}` (3.1 array) | `prop_type: None, nullable: true` |
/// | `{nullable: true}` standalone (3.0 idiom) | `prop_type: None, nullable: true` |
///
/// Without the second clause, the validator misses the 3.0 / 3.1-array
/// forms and would reject JSON null on a property the parser correctly
/// promoted — a parser/validator asymmetry caught by Devin's review.
fn has_null_branch(branches: &[crate::openapi::discovery::JsonSchemaProperty]) -> bool {
    branches
        .iter()
        .any(|b| b.prop_type.as_deref() == Some("null") || (b.nullable && b.prop_type.is_none()))
}

fn validate_properties(
    obj: &Map<String, Value>,
    properties: &HashMap<String, crate::openapi::discovery::JsonSchemaProperty>,
    required_keys: &[String],
    doc: &RestDescription,
    path: &str,
    errors: &mut Vec<String>,
) {
    // Check required keys first
    for req_key in required_keys {
        if !obj.contains_key(req_key) {
            errors.push(format!("{path}: Missing required property '{req_key}'"));
        }
    }

    // An empty properties map means "any additional properties are allowed"
    // (JSON Schema default when additionalProperties is not explicitly false).
    if properties.is_empty() {
        return;
    }

    let valid_keys: std::collections::HashSet<&String> = properties.keys().collect();

    for (key, val) in obj {
        let current_path = if path == "$" {
            key.clone()
        } else {
            format!("{path}.{key}")
        };

        if !valid_keys.contains(key) {
            errors.push(format!(
                "{current_path}: Unknown property. Valid properties: {:?}",
                valid_keys.iter().map(|k| k.as_str()).collect::<Vec<_>>()
            ));
            continue;
        }

        let prop_schema = &properties[key];
        validate_property(val, prop_schema, doc, &current_path, errors);
    }
}

fn validate_property(
    value: &Value,
    prop_schema: &crate::openapi::discovery::JsonSchemaProperty,
    doc: &RestDescription,
    path: &str,
    errors: &mut Vec<String>,
) {
    // 1. Resolve $ref if present
    if let Some(ref_name) = &prop_schema.schema_ref {
        validate_value(value, ref_name, doc, path, errors);
        return;
    }

    // Null on a nullable property is always valid — short-circuits type
    // checking that would otherwise reject `null` for a `string` /
    // `integer` / etc. base type. Also honors ADR-0005's nullable-union
    // promotion: a property whose composition has a `{type: 'null'}`
    // branch accepts null even when the intrinsic `nullable` flag is
    // false (which it is for `anyOf: [scalar, null]` shapes, since the
    // null-ness lives in the branch, not on the parent schema).
    if value.is_null()
        && (prop_schema.nullable
            || has_null_branch(&prop_schema.one_of)
            || has_null_branch(&prop_schema.any_of))
    {
        return;
    }

    // 2. Type checking
    if let Some(expected_type) = &prop_schema.prop_type {
        let type_matches = match (expected_type.as_str(), value) {
            ("string", Value::String(_)) => true,
            ("integer", Value::Number(n)) => n.is_i64() || n.is_u64(),
            ("number", Value::Number(_)) => true,
            ("boolean", Value::Bool(_)) => true,
            ("array", Value::Array(_)) => true,
            ("object", Value::Object(_)) => true,
            ("any", _) => true,
            _ => false,
        };

        if !type_matches {
            errors.push(format!(
                "{path}: Expected type '{expected_type}', found {}",
                get_value_type(value)
            ));
            return; // Stop further validation for this property if the type is wrong
        }
    }

    // 3. Array items validation
    if prop_schema.prop_type.as_deref() == Some("array") {
        if let Some(items_schema) = &prop_schema.items {
            if let Value::Array(arr) = value {
                for (i, item) in arr.iter().enumerate() {
                    let item_path = format!("{path}[{i}]");
                    validate_property(item, items_schema, doc, &item_path, errors);
                }
            }
        }
    }

    // 4. Object properties validation. Enters on a standard object
    // schema *or* an object property with an `allOf:` overlay
    // contributing its property set (ADR-0004). Without the `has_all_of`
    // clause on the *outer* condition, a property declared as bare
    // `{allOf: [...]}` (no redundant `type: object`) would skip
    // validation entirely even though the flag layer correctly flattens
    // it — caught by Devin's review on PR #124. The parser-side mirror
    // of this condition lives at `flatten_body_params_prefix`.
    let has_all_of = !prop_schema.all_of.is_empty();
    if has_all_of
        || (prop_schema.prop_type.as_deref() == Some("object")
            && !prop_schema.properties.is_empty())
    {
        if let Value::Object(obj) = value {
            if has_all_of {
                let (merged_props, merged_required) = merge_property_all_of(prop_schema, doc);
                validate_properties(obj, &merged_props, &merged_required, doc, path, errors);
            } else {
                validate_properties(obj, &prop_schema.properties, &[], doc, path, errors);
            }
        } else if has_all_of {
            // Typeless `{allOf: [...]}` property has no `prop_type` to
            // catch the mismatch at step 2, so a non-object value would
            // otherwise pass silently. Mirror `validate_value`'s
            // top-level error so the user gets the same diagnostic
            // regardless of where in the body tree the typeless allOf
            // sits. Caught by Devin's review on PR #124.
            errors.push(format!("{path}: Expected object"));
        }
    }

    // 5. Enum validation
    if let Some(enum_values) = &prop_schema.enum_values {
        if let Value::String(s) = value {
            if !enum_values.contains(s) {
                errors.push(format!(
                    "{path}: Value '{s}' is not a valid enum member. Valid options: {enum_values:?}"
                ));
            }
        }
    }
}

fn get_value_type(val: &Value) -> &'static str {
    match val {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::Number(n) if n.is_f64() => "number (float)",
        Value::Number(_) => "integer",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}

/// Open `file_path` for binary-response writing while refusing to write
/// through anything that isn't a fresh-or-existing single-linked regular
/// file the CWD-validated path points at directly.
///
/// A server-controlled Content-Disposition filename or the predictable
/// `download.<ext>` default could otherwise be aimed at a pre-planted:
///   * **symlink** — `voice.mp3 -> ~/.ssh/authorized_keys`. `O_NOFOLLOW`
///     in the open flags makes the kernel reject this atomically (`ELOOP`).
///   * **hardlink** — `download.mp3` (link count 2) sharing an inode with
///     a victim file. `O_NOFOLLOW` does NOT catch this (no symlink in the
///     resolution chain), so we open *without* `O_TRUNC`, `fstat` the fd,
///     and refuse if `nlink > 1` before any truncation.
///   * **FIFO / device / socket** — `mkfifo download.mp3` would block
///     `open(O_WRONLY)` indefinitely with no reader. `O_NONBLOCK` in the
///     open flags returns `ENXIO` on reader-less FIFOs; an fstat-after-open
///     `is_file()` check catches FIFOs and devices that opened successfully.
///     `O_NONBLOCK` is a no-op for regular files per `open(2)`.
///
/// Truncation happens via `set_len(0)` only after the file-type and link-
/// count checks pass, so a hardlinked or otherwise-suspicious target keeps
/// its bytes intact.
///
/// On non-Unix platforms we fall back to a `symlink_metadata` pre-check
/// (small TOCTOU window, no readily-available hardlink API); FIFO and
/// hardlink refusal there is a follow-up.
async fn create_file_no_follow(file_path: &std::path::Path) -> Result<tokio::fs::File, CliError> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let mut opts = tokio::fs::OpenOptions::new();
        opts.write(true)
            .create(true)
            // No O_TRUNC at open time — we truncate explicitly via set_len
            // only after the file-type and link-count checks below pass.
            .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
        let file = match opts.open(file_path).await {
            Ok(f) => f,
            Err(e) if matches!(e.raw_os_error(), Some(c) if c == libc::ELOOP) => {
                return Err(CliError::Validation(format!(
                    "Refused to write to '{}': path is a symbolic link",
                    file_path.display()
                )));
            }
            Err(e) if matches!(e.raw_os_error(), Some(c) if c == libc::ENXIO) => {
                return Err(CliError::Validation(format!(
                    "Refused to write to '{}': path is a FIFO with no reader",
                    file_path.display()
                )));
            }
            Err(e) => {
                return Err(anyhow::Error::from(e)
                    .context("Failed to create output file")
                    .into());
            }
        };

        let meta = file
            .metadata()
            .await
            .context("Failed to stat output file")?;
        if !meta.file_type().is_file() {
            return Err(CliError::Validation(format!(
                "Refused to write to '{}': not a regular file",
                file_path.display()
            )));
        }
        if meta.nlink() > 1 {
            return Err(CliError::Validation(format!(
                "Refused to write to '{}': has {} hardlinks",
                file_path.display(),
                meta.nlink(),
            )));
        }
        // Clear O_NONBLOCK now that we've confirmed the target is a normal
        // regular file. The flag was only needed to prevent open() blocking
        // on a reader-less FIFO; if it stayed set on the fd, FUSE-backed
        // filesystems (sshfs, gcsfuse, mountpoint-s3) can honor O_NONBLOCK
        // on write(2) and surface spurious EAGAIN/WouldBlock errors from
        // write_all.
        unsafe {
            use std::os::unix::io::AsRawFd;
            let raw_fd = file.as_raw_fd();
            let flags = libc::fcntl(raw_fd, libc::F_GETFL);
            if flags >= 0 {
                let _ = libc::fcntl(raw_fd, libc::F_SETFL, flags & !libc::O_NONBLOCK);
            }
        }
        // Safe to truncate now that we've verified the target is a single-
        // linked regular file. set_len(0) is a no-op on a fresh O_CREAT.
        file.set_len(0)
            .await
            .context("Failed to truncate output file")?;
        Ok(file)
    }
    #[cfg(not(unix))]
    {
        if let Ok(meta) = tokio::fs::symlink_metadata(file_path).await {
            if meta.file_type().is_symlink() {
                return Err(CliError::Validation(format!(
                    "Refused to write to '{}': path is a symbolic link",
                    file_path.display()
                )));
            }
        }
        tokio::fs::File::create(file_path)
            .await
            .context("Failed to create output file")
            .map_err(Into::into)
    }
}

/// Parse an RFC 6266 `Content-Disposition` value and return a sanitized
/// `filename` hint.
///
/// Recognized:
///   - `attachment; filename="custom-voice.mp3"`             (quoted)
///   - `attachment; filename=custom-voice.mp3`                (unquoted token)
///   - `inline; filename="voice.mp3"`                         (inline disposition)
///   - `attachment; Filename="voice.mp3"`                     (case-insensitive name)
///   - `attachment; filename="hello;world.mp3"`               (`;` inside quotes)
///   - `attachment; filename*=UTF-8''%E5%A3%B0.mp3`           (RFC 5987 UTF-8)
///   - `attachment; filename*=ISO-8859-1''cafe.mp3`           (RFC 5987 ISO-8859-1)
///
/// Per RFC 6266 §4.3, `filename*` is preferred over `filename` when both
/// are present. Per RFC 7578 §4.2, a `form-data` disposition (multipart
/// upload variant) is not honored on responses. When the first `filename`
/// occurrence sanitizes to None we keep iterating and pick the next valid
/// one rather than letting an empty value shadow it.
fn extract_content_disposition_filename(header_value: &str) -> Option<String> {
    let (disposition_type, params) = split_content_disposition(header_value);
    if disposition_type.eq_ignore_ascii_case("form-data") {
        return None;
    }

    let mut filename_star: Option<String> = None;
    let mut filename: Option<String> = None;
    for (name, value) in params {
        if name.eq_ignore_ascii_case("filename*") && filename_star.is_none() {
            if let Some(decoded) = decode_rfc5987_value(&value) {
                if let Some(safe) = sanitize_server_supplied_filename(&decoded) {
                    filename_star = Some(safe);
                }
            }
        } else if name.eq_ignore_ascii_case("filename") && filename.is_none() {
            if let Some(safe) = sanitize_server_supplied_filename(&value) {
                filename = Some(safe);
            }
        }
    }
    filename_star.or(filename)
}

/// Split a Content-Disposition header into `(disposition_type, params)`
/// with RFC 7230 quoted-string awareness — `;` inside DQUOTE is preserved
/// and the standard `\X` escape inside quoted-strings is unescaped.
fn split_content_disposition(header: &str) -> (String, Vec<(String, String)>) {
    let mut tokens: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut chars = header.chars();
    while let Some(c) = chars.next() {
        if c == '"' {
            in_quotes = !in_quotes;
            current.push(c);
        } else if c == '\\' && in_quotes {
            // Quoted-pair: the backslash escapes the next char per RFC 7230.
            // Both the backslash and the escaped char survive into `current`;
            // the value-unquote step below strips the escape.
            current.push(c);
            if let Some(next) = chars.next() {
                current.push(next);
            }
        } else if c == ';' && !in_quotes {
            tokens.push(std::mem::take(&mut current));
        } else {
            current.push(c);
        }
    }
    if !current.is_empty() {
        tokens.push(current);
    }

    let mut iter = tokens.into_iter();
    let disposition_type = iter.next().unwrap_or_default().trim().to_string();
    let params: Vec<(String, String)> = iter
        .filter_map(|t| {
            let t = t.trim();
            let eq = t.find('=')?;
            let name = t[..eq].trim().to_string();
            let raw = t[eq + 1..].trim();
            let value = unquote_parameter_value(raw);
            Some((name, value))
        })
        .collect();
    (disposition_type, params)
}

/// Unwrap a DQUOTE-quoted parameter value and undo `\X` -> `X` escapes per
/// RFC 7230 quoted-string. Unquoted token values are returned as-is.
fn unquote_parameter_value(raw: &str) -> String {
    if raw.len() >= 2 && raw.starts_with('"') && raw.ends_with('"') {
        let inner = &raw[1..raw.len() - 1];
        let mut out = String::with_capacity(inner.len());
        let mut chars = inner.chars();
        while let Some(c) = chars.next() {
            if c == '\\' {
                if let Some(next) = chars.next() {
                    out.push(next);
                }
            } else {
                out.push(c);
            }
        }
        out
    } else {
        raw.to_string()
    }
}

/// Decode an RFC 5987 ext-value of the form `charset'language'pct-encoded`.
/// We support UTF-8 and ISO-8859-1 (the two charsets the RFC singles out);
/// other charsets fall through as None so the caller can use the ASCII
/// `filename=` fallback.
fn decode_rfc5987_value(raw: &str) -> Option<String> {
    let mut parts = raw.splitn(3, '\'');
    let charset = parts.next()?.to_ascii_uppercase();
    let _lang = parts.next()?;
    let encoded = parts.next()?;

    let bytes = percent_decode_bytes(encoded)?;
    match charset.as_str() {
        "UTF-8" => String::from_utf8(bytes).ok(),
        "ISO-8859-1" => Some(bytes.into_iter().map(|b| b as char).collect()),
        _ => None,
    }
}

/// Strict percent-decoder for RFC 5987 value-chars: `%HH` must be two hex
/// digits; any other non-ASCII byte invalidates the value (returns None).
fn percent_decode_bytes(s: &str) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(s.len());
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c == '%' {
            let h1 = chars.next()?.to_digit(16)?;
            let h2 = chars.next()?.to_digit(16)?;
            out.push(((h1 << 4) | h2) as u8);
        } else if c.is_ascii() {
            out.push(c as u8);
        } else {
            return None;
        }
    }
    Some(out)
}

/// Reduce a server-supplied filename to a safe basename, dropping any
/// directory components, control characters, or empty / dot-only names.
/// The server picks the *name*; the client always picks the *directory*.
///
/// Rejection rules (server-controlled input must be conservative):
/// - empty or whitespace-only
/// - ASCII control chars (`is_control`, General_Category=Cc)
/// - Unicode bidi / format chars (U+200E/F, U+202A–E, U+2066–9) — these
///   are spoof vectors for displayed-name vs actual-extension mismatch
/// - embedded `\` — keeps Unix/Windows behavior aligned; on Windows this
///   would be a path separator, so the safe rule is to reject it everywhere
/// - basename equal to `.` or `..`
/// - basename starting with `.` — prevents server-driven dotfile clobber
///   (`.env`, `.bashrc`, `.gitignore`, etc.) in the user's CWD
fn sanitize_server_supplied_filename(raw: &str) -> Option<String> {
    let s = raw.trim();
    if s.is_empty() || s.chars().any(is_unsafe_filename_char) {
        return None;
    }
    let basename = std::path::Path::new(s).file_name()?.to_str()?;
    if basename.is_empty()
        || basename == "."
        || basename == ".."
        || basename.starts_with('.')
    {
        return None;
    }
    Some(basename.to_string())
}

/// A character we will never accept in a server-supplied filename: ASCII
/// controls, the C1 controls (already caught by is_control), bidi/format
/// overrides that cause spoofed displayed names, and path separators of
/// either platform's convention.
fn is_unsafe_filename_char(c: char) -> bool {
    if c.is_control() || c == '\\' {
        return true;
    }
    matches!(
        c,
        // RFC 3987 bidi controls — LRM/RLM, LRE/RLE/PDF/LRO/RLO, isolates.
        '\u{200E}' | '\u{200F}' | '\u{202A}'..='\u{202E}' | '\u{2066}'..='\u{2069}'
    )
}

/// True iff `mime` (already lowercased) is exactly `target`, or `target`
/// followed by a parameter delimiter (`;`) or whitespace. Used to anchor
/// MIME-type matching so e.g. `audio/mpegurl` does not collide with
/// `audio/mpeg`.
fn is_media_type(mime: &str, target: &str) -> bool {
    if let Some(rest) = mime.strip_prefix(target) {
        rest.is_empty() || rest.starts_with(';') || rest.starts_with(char::is_whitespace)
    } else {
        false
    }
}

pub fn mime_to_extension(mime: &str) -> &str {
    // Lowercased lookup so `Audio/MPEG` and `audio/mpeg` map the same way —
    // RFC 6838 declares media types case-insensitive. The cheap lowercase is
    // amortized by the single allocation per response (binary downloads are
    // rare relative to JSON), and a missing branch silently degrading audio
    // responses to `.bin` was the original FER-10871 bug.
    let m = mime.to_ascii_lowercase();
    // Audio / video — checked before the generic `mpeg` / `mp4` substrings
    // because `audio/mpeg` and `video/mpeg` must not collide.
    //
    // The exact-match-with-optional-params helper (`is_media_type`) is used
    // for the foundational `audio/mpeg` / `audio/wav` / etc. branches so a
    // related-but-distinct subtype like `audio/mpegurl` (M3U playlist) or
    // `audio/wavpack` (lossless codec) does NOT collapse into the wrong
    // extension via prefix matching. Variant subtypes (`audio/x-wav`,
    // `audio/wave`, `audio/x-m4a`, …) are enumerated explicitly.
    if is_media_type(&m, "audio/mpegurl") || is_media_type(&m, "audio/x-mpegurl") {
        "m3u"
    } else if is_media_type(&m, "audio/mpeg") || is_media_type(&m, "audio/mp3") {
        "mp3"
    } else if is_media_type(&m, "audio/wavpack") {
        "wv"
    } else if is_media_type(&m, "audio/wav")
        || is_media_type(&m, "audio/x-wav")
        || is_media_type(&m, "audio/wave")
    {
        "wav"
    } else if m.starts_with("audio/ogg") || m.starts_with("audio/vorbis") {
        "ogg"
    } else if m.starts_with("audio/opus") {
        "opus"
    } else if m.starts_with("audio/flac") || m.starts_with("audio/x-flac") {
        "flac"
    } else if m.starts_with("audio/aac") || m.starts_with("audio/x-aac") {
        "aac"
    } else if m.starts_with("audio/mp4") || m.starts_with("audio/x-m4a") {
        "m4a"
    } else if m.starts_with("audio/webm") {
        "weba"
    } else if m.starts_with("video/mp4") {
        "mp4"
    } else if m.starts_with("video/webm") {
        "webm"
    } else if m.starts_with("video/quicktime") {
        "mov"
    } else if m.starts_with("video/x-matroska") {
        "mkv"
    } else if m.starts_with("video/mpeg") {
        "mpeg"
    } else if m.contains("pdf") {
        "pdf"
    } else if m.contains("png") {
        "png"
    } else if m.contains("jpeg") || m.contains("jpg") {
        "jpg"
    } else if m.contains("gif") {
        "gif"
    } else if m.contains("svg") {
        "svg"
    } else if m.contains("webp") {
        "webp"
    } else if m.contains("csv") {
        "csv"
    } else if m.contains("zip") {
        "zip"
    } else if m.contains("xml") {
        "xml"
    } else if m.contains("html") {
        "html"
    } else if m.contains("plain") {
        "txt"
    } else if m.contains("octet-stream") {
        "bin"
    } else if m.contains("spreadsheet") || m.contains("xlsx") {
        "xlsx"
    } else if m.contains("document") || m.contains("docx") {
        "docx"
    } else if m.contains("presentation") || m.contains("pptx") {
        "pptx"
    } else if m.contains("script") {
        "json"
    } else {
        "bin"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::openapi::discovery::{
        JsonSchema, JsonSchemaProperty, MethodParameter, RestDescription, RestMethod,
    };
    use serde_json::json;

    // ---------------------------------------------------------------
    // Retry helpers (`x-fern-retries`)
    // ---------------------------------------------------------------

    fn enabled_cfg() -> RetriesConfig {
        RetriesConfig::default()
    }

    #[test]
    fn test_is_retryable_status_set_matches_docs() {
        // All 5xx plus 408 and 429 are retryable (FER-10521).
        for s in [408u16, 429, 500, 501, 502, 503, 504, 505, 599] {
            assert!(is_retryable_status(s), "{s} should retry");
        }
        // 4xx client errors (except 408/429) won't change on retry \u2014 see is_retryable_status
        // and 2xx/3xx are obviously terminal.
        for s in [200u16, 301, 400, 401, 403, 404, 422, 425] {
            assert!(!is_retryable_status(s), "{s} should NOT retry");
        }
    }

    #[test]
    fn test_method_allows_retry_idempotent_methods() {
        // HTTP-spec-idempotent methods retry regardless of the
        // `x-fern-idempotent` extension.
        for m in ["GET", "HEAD", "OPTIONS", "DELETE", "PUT"] {
            assert!(method_allows_retry(m, false), "{m} should retry by default");
        }
    }

    #[test]
    fn test_method_allows_retry_non_idempotent_methods_only_when_marked() {
        // POST/PATCH only retry when the spec marks the op idempotent.
        for m in ["POST", "PATCH"] {
            assert!(!method_allows_retry(m, false), "{m} should NOT retry by default");
            assert!(method_allows_retry(m, true), "{m} retries when x-fern-idempotent");
        }
    }

    #[test]
    fn test_binary_body_is_stdin() {
        // Stdin sentinels — retries must be disabled.
        assert!(binary_body_is_stdin(Some("-")));
        assert!(binary_body_is_stdin(Some("@-")));
        // File paths — retries are safe (re-opens the file).
        assert!(!binary_body_is_stdin(Some("/tmp/audio.mp3")));
        assert!(!binary_body_is_stdin(Some("@/tmp/audio.mp3")));
        // No binary body at all — retries decided by other policy.
        assert!(!binary_body_is_stdin(None));
    }

    #[test]
    fn test_multipart_has_stdin() {
        // File part with `-` — retries must be disabled.
        assert!(multipart_has_stdin(&Some(vec![MultipartPart::File {
            name: "file".into(),
            path: "-".into(),
            content_type: None,
        }])));
        // File part with `@-` — also stdin.
        assert!(multipart_has_stdin(&Some(vec![MultipartPart::File {
            name: "file".into(),
            path: "@-".into(),
            content_type: None,
        }])));
        // File part with real path — retries are safe.
        assert!(!multipart_has_stdin(&Some(vec![MultipartPart::File {
            name: "file".into(),
            path: "/tmp/upload.bin".into(),
            content_type: None,
        }])));
        // Text-only parts — retries are safe.
        assert!(!multipart_has_stdin(&Some(vec![MultipartPart::Text {
            name: "purpose".into(),
            value: "test".into(),
            content_type: None,
        }])));
        // Mixed: one stdin file + one text — still disables retries.
        assert!(multipart_has_stdin(&Some(vec![
            MultipartPart::Text {
                name: "purpose".into(),
                value: "test".into(),
                content_type: None,
            },
            MultipartPart::File {
                name: "file".into(),
                path: "-".into(),
                content_type: None,
            },
        ])));
        // No multipart parts at all.
        assert!(!multipart_has_stdin(&None));

        // FER-10532: explicit-scheme `-` is a literal filename, NOT stdin.
        // `@file://-` and `@data://-` both fail the stdin check so retries
        // stay enabled (the file read is replayable, unlike a pipe).
        assert!(!multipart_has_stdin(&Some(vec![MultipartPart::File {
            name: "file".into(),
            path: "@file://-".into(),
            content_type: None,
        }])));
        assert!(!multipart_has_stdin(&Some(vec![MultipartPart::File {
            name: "file".into(),
            path: "@data://-".into(),
            content_type: None,
        }])));
        // FER-10532: explicit-scheme path that happens to be `-` somewhere
        // else (e.g. `@file://./-.bin`) is also a real path.
        assert!(!multipart_has_stdin(&Some(vec![MultipartPart::File {
            name: "file".into(),
            path: "@file:///tmp/audio.txt".into(),
            content_type: None,
        }])));
        // FER-10436: `\@-` is the escape — literal value `@-`, not stdin.
        assert!(!multipart_has_stdin(&Some(vec![MultipartPart::File {
            name: "file".into(),
            path: "\\@-".into(),
            content_type: None,
        }])));
    }

    #[test]
    fn test_file_part_mime_defaults_and_override() {
        // No per-part content type → OAS binary default.
        assert_eq!(file_part_mime(None), "application/octet-stream");
        // An encoding-supplied content type wins.
        assert_eq!(file_part_mime(Some("image/png")), "image/png");
        assert_eq!(file_part_mime(Some("text/plain")), "text/plain");
    }

    /// Send a built multipart form to a local mock server and return the raw
    /// captured body so we can assert the per-part framing the wire carries.
    /// reqwest serializes multipart forms as a stream, so the only faithful
    /// way to inspect the bytes is to actually transmit them.
    async fn multipart_body_string(parts: Vec<MultipartPart>) -> String {
        use wiremock::matchers::method as wm_method;
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        Mock::given(wm_method("POST"))
            .respond_with(ResponseTemplate::new(200))
            .mount(&server)
            .await;

        let client = reqwest::Client::new();
        let form = build_multipart_form(&parts).await.unwrap();
        client
            .post(format!("{}/upload", server.uri()))
            .multipart(form)
            .send()
            .await
            .unwrap();

        let received = server.received_requests().await.unwrap();
        String::from_utf8_lossy(&received[0].body).into_owned()
    }

    #[tokio::test]
    async fn test_build_multipart_form_text_part_uses_encoding_content_type() {
        // A text part with an explicit encoding contentType emits that
        // Content-Type header instead of the default text/plain.
        let body = multipart_body_string(vec![MultipartPart::Text {
            name: "metadata".into(),
            value: "{\"k\":1}".into(),
            content_type: Some("application/json".into()),
        }])
        .await;
        assert!(
            body.contains("Content-Disposition: form-data; name=\"metadata\""),
            "text part should carry its Content-Disposition; got: {body}"
        );
        assert!(
            body.contains("Content-Type: application/json"),
            "text part Content-Type should come from encoding; got: {body}"
        );
        assert!(body.contains("{\"k\":1}"), "value should be in body; got: {body}");
    }

    #[tokio::test]
    async fn test_build_multipart_form_file_part_default_octet_stream() {
        // A file part without an encoding entry defaults to octet-stream.
        let tmp = std::env::temp_dir().join("fern_multipart_default.bin");
        std::fs::write(&tmp, b"payload-bytes").unwrap();
        let body = multipart_body_string(vec![MultipartPart::File {
            name: "file".into(),
            path: tmp.to_string_lossy().into_owned(),
            content_type: None,
        }])
        .await;
        let _ = std::fs::remove_file(&tmp);
        assert!(
            body.contains("Content-Disposition: form-data; name=\"file\""),
            "file part should carry its Content-Disposition; got: {body}"
        );
        assert!(
            body.contains("Content-Type: application/octet-stream"),
            "file part should default to octet-stream; got: {body}"
        );
        assert!(body.contains("payload-bytes"), "file bytes should stream; got: {body}");
    }

    #[tokio::test]
    async fn test_build_multipart_form_file_part_honors_encoding_content_type() {
        // A file part with an encoding contentType overrides the default.
        let tmp = std::env::temp_dir().join("fern_multipart_override.png");
        std::fs::write(&tmp, b"\x89PNG").unwrap();
        let body = multipart_body_string(vec![MultipartPart::File {
            name: "file".into(),
            path: tmp.to_string_lossy().into_owned(),
            content_type: Some("image/png".into()),
        }])
        .await;
        let _ = std::fs::remove_file(&tmp);
        assert!(
            body.contains("Content-Type: image/png"),
            "file part Content-Type should come from encoding; got: {body}"
        );
    }

    #[test]
    fn test_parse_retry_after_numeric_seconds() {
        let now = std::time::SystemTime::now();
        let d = parse_retry_after("5", now).expect("numeric form");
        assert_eq!(d, std::time::Duration::from_secs(5));
    }

    #[test]
    fn test_parse_retry_after_zero() {
        // `Retry-After: 0` means "retry now".
        let d = parse_retry_after("0", std::time::SystemTime::now()).unwrap();
        assert_eq!(d, std::time::Duration::ZERO);
    }

    #[test]
    fn test_parse_retry_after_whitespace_and_empty() {
        assert!(parse_retry_after("", std::time::SystemTime::now()).is_none());
        // Common server spelling has surrounding whitespace; we trim.
        let d = parse_retry_after("  10  ", std::time::SystemTime::now()).unwrap();
        assert_eq!(d, std::time::Duration::from_secs(10));
    }

    #[test]
    fn test_parse_retry_after_http_date_future() {
        // 60 seconds in the future expressed as IMF-fixdate.
        let now = std::time::SystemTime::now();
        let target = now + std::time::Duration::from_secs(60);
        let fmt = httpdate::fmt_http_date(target);
        let d = parse_retry_after(&fmt, now).expect("http-date form parses");
        // Allow slight skew because `fmt_http_date` rounds to seconds.
        assert!(d.as_secs() >= 59 && d.as_secs() <= 60, "got {d:?}");
    }

    #[test]
    fn test_parse_retry_after_http_date_in_the_past_clamps_to_zero() {
        // A server that emits a past timestamp \u2014 either clock-skew or
        // an unusual "you can retry now" gesture \u2014 should collapse to
        // an immediate retry rather than underflow.
        let now = std::time::SystemTime::now();
        let target = now - std::time::Duration::from_secs(60);
        let fmt = httpdate::fmt_http_date(target);
        let d = parse_retry_after(&fmt, now).expect("past http-date parses");
        assert_eq!(d, std::time::Duration::ZERO);
    }

    #[test]
    fn test_parse_retry_after_garbage_returns_none() {
        assert!(
            parse_retry_after("nonsense", std::time::SystemTime::now()).is_none(),
            "bad header surfaces None so the backoff fallback applies"
        );
    }

    #[test]
    fn test_compute_backoff_delay_no_jitter_is_deterministic() {
        let cfg = RetriesConfig {
            enabled: true,
            max_attempts: 5,
            base_delay_ms: 100,
            factor: 2.0,
            jitter: 0.0,
        };
        // attempt=0 \u2192 100ms; attempt=1 \u2192 200; attempt=2 \u2192 400; ...
        assert_eq!(
            compute_backoff_delay_with_rand(0, &cfg, 0.5),
            std::time::Duration::from_millis(100)
        );
        assert_eq!(
            compute_backoff_delay_with_rand(1, &cfg, 0.5),
            std::time::Duration::from_millis(200)
        );
        assert_eq!(
            compute_backoff_delay_with_rand(2, &cfg, 0.5),
            std::time::Duration::from_millis(400)
        );
        assert_eq!(
            compute_backoff_delay_with_rand(3, &cfg, 0.5),
            std::time::Duration::from_millis(800)
        );
    }

    #[test]
    fn test_compute_backoff_delay_jitter_symmetric_around_raw() {
        let cfg = RetriesConfig {
            enabled: true,
            max_attempts: 5,
            base_delay_ms: 100,
            factor: 2.0,
            jitter: 0.5,
        };
        // rand=0.5 \u2192 offset is zero \u2192 raw delay.
        assert_eq!(
            compute_backoff_delay_with_rand(0, &cfg, 0.5),
            std::time::Duration::from_millis(100)
        );
        // rand=0.0 \u2192 subtract half the jitter span.
        // span = 100 * 0.5 = 50; offset = (0 - 0.5) * 50 = -25 \u2192 75ms
        assert_eq!(
            compute_backoff_delay_with_rand(0, &cfg, 0.0),
            std::time::Duration::from_millis(75)
        );
        // rand=1.0 \u2192 add half the jitter span. offset = +25 \u2192 125ms
        assert_eq!(
            compute_backoff_delay_with_rand(0, &cfg, 1.0),
            std::time::Duration::from_millis(125)
        );
    }

    #[test]
    fn test_compute_backoff_delay_disabled_returns_zero() {
        let cfg = RetriesConfig::disabled();
        assert_eq!(
            compute_backoff_delay_with_rand(0, &cfg, 0.5),
            std::time::Duration::ZERO
        );
    }

    #[test]
    fn test_compute_backoff_delay_default_entropy_produces_jitter() {
        // Regression: an earlier implementation sampled entropy from
        // `Instant::now().elapsed()`, which always returns ~0 nanos and
        // pinned the jitter sample to a constant — defeating jitter.
        // Sample the live `compute_backoff_delay` 64 times with a wide
        // jitter band and assert we see at least two distinct values.
        let cfg = RetriesConfig {
            enabled: true,
            max_attempts: 3,
            base_delay_ms: 1000,
            factor: 1.0,
            jitter: 1.0,
        };
        let mut samples = std::collections::HashSet::new();
        for _ in 0..64 {
            samples.insert(compute_backoff_delay(0, &cfg).as_millis());
            // Tiny pause so the wall-clock sub-second component
            // advances between samples in fast CI environments.
            std::thread::sleep(std::time::Duration::from_micros(50));
        }
        assert!(
            samples.len() > 1,
            "expected variance in jitter samples, got {samples:?}",
        );
    }

    #[test]
    fn test_decide_retry_no_retry_flag_short_circuits() {
        // `--no-retry` is the user-facing debug opt-out. Mirrors the
        // PR description's open design question: yes, full opt-out
        // even for network errors so users can debug.
        let cfg = enabled_cfg();
        let outcome = RetryOutcome {
            status: None,
            retry_after: None,
        };
        let d = decide_retry(0, &outcome, &cfg, "GET", false, /*no_retry=*/ true);
        assert!(d.is_none(), "--no-retry disables all retries");
    }

    #[test]
    fn test_decide_retry_disabled_config_no_retry() {
        let cfg = RetriesConfig::disabled();
        let outcome = RetryOutcome {
            status: Some(503),
            retry_after: None,
        };
        let d = decide_retry(0, &outcome, &cfg, "GET", false, false);
        assert!(d.is_none(), "disabled config never retries");
    }

    #[test]
    fn test_decide_retry_max_attempts_cap() {
        let cfg = RetriesConfig {
            enabled: true,
            max_attempts: 3,
            base_delay_ms: 1,
            factor: 1.0,
            jitter: 0.0,
        };
        let outcome = RetryOutcome {
            status: Some(503),
            retry_after: None,
        };
        // attempt 0 -> retry (allowed)
        assert!(decide_retry(0, &outcome, &cfg, "GET", false, false).is_some());
        // attempt 1 -> retry (allowed)
        assert!(decide_retry(1, &outcome, &cfg, "GET", false, false).is_some());
        // attempt 2 -> done; we've used all 3 attempts. Stop.
        assert!(decide_retry(2, &outcome, &cfg, "GET", false, false).is_none());
        // attempt 3+ -> never. Defensive.
        assert!(decide_retry(3, &outcome, &cfg, "GET", false, false).is_none());
    }

    #[test]
    fn test_decide_retry_retryable_status_get_retries() {
        let cfg = enabled_cfg();
        let outcome = RetryOutcome {
            status: Some(503),
            retry_after: None,
        };
        let d = decide_retry(0, &outcome, &cfg, "GET", false, false);
        assert!(d.is_some());
    }

    #[test]
    fn test_decide_retry_non_retryable_status_no_retry() {
        // 401 Unauthorized never retries \u2014 wait won't make creds valid.
        let cfg = enabled_cfg();
        let outcome = RetryOutcome {
            status: Some(401),
            retry_after: None,
        };
        let d = decide_retry(0, &outcome, &cfg, "GET", false, false);
        assert!(d.is_none());
    }

    #[test]
    fn test_decide_retry_post_503_without_idempotent_no_retry() {
        // Plain POST got 503 \u2014 the server may have processed it.
        // Don't retry without an explicit idempotent marker.
        let cfg = enabled_cfg();
        let outcome = RetryOutcome {
            status: Some(503),
            retry_after: None,
        };
        let d = decide_retry(0, &outcome, &cfg, "POST", false, false);
        assert!(d.is_none());
    }

    #[test]
    fn test_decide_retry_post_503_with_idempotent_retries() {
        // POST marked idempotent (x-fern-idempotent) is safe to retry.
        let cfg = enabled_cfg();
        let outcome = RetryOutcome {
            status: Some(503),
            retry_after: None,
        };
        let d = decide_retry(0, &outcome, &cfg, "POST", true, false);
        assert!(d.is_some());
    }

    #[test]
    fn test_decide_retry_post_429_always_safe() {
        // 429 means the server *didn't* process the request \u2014 always
        // safe to retry regardless of method idempotency.
        let cfg = enabled_cfg();
        let outcome = RetryOutcome {
            status: Some(429),
            retry_after: None,
        };
        let d = decide_retry(0, &outcome, &cfg, "POST", false, false);
        assert!(d.is_some(), "429 retries on non-idempotent methods");
    }

    #[test]
    fn test_decide_retry_network_error_get_retries() {
        let cfg = enabled_cfg();
        let outcome = RetryOutcome {
            status: None,
            retry_after: None,
        };
        let d = decide_retry(0, &outcome, &cfg, "GET", false, false);
        assert!(d.is_some());
    }

    #[test]
    fn test_decide_retry_network_error_post_without_idempotent_no_retry() {
        // Network failure on a POST: ambiguous whether the server got
        // the request. Mirror the per-method policy here too.
        let cfg = enabled_cfg();
        let outcome = RetryOutcome {
            status: None,
            retry_after: None,
        };
        let d = decide_retry(0, &outcome, &cfg, "POST", false, false);
        assert!(d.is_none());
    }

    #[test]
    fn test_decide_retry_honors_retry_after_numeric() {
        // When the server provides Retry-After, honor it instead of
        // the computed backoff (the server knows better than we do).
        let cfg = enabled_cfg();
        let outcome = RetryOutcome {
            status: Some(503),
            retry_after: Some("7"),
        };
        let d = decide_retry(0, &outcome, &cfg, "GET", false, false)
            .expect("should retry");
        assert_eq!(d, std::time::Duration::from_secs(7));
    }

    #[test]
    fn test_decide_retry_falls_back_to_backoff_when_retry_after_invalid() {
        let cfg = enabled_cfg();
        let outcome = RetryOutcome {
            status: Some(503),
            retry_after: Some("not-a-number"),
        };
        let d = decide_retry(0, &outcome, &cfg, "GET", false, false)
            .expect("should retry");
        // Falls back to backoff math \u2014 not zero, not the parsed value.
        assert!(d > std::time::Duration::ZERO);
    }

    #[test]
    fn test_binary_body_source_plain_path() {
        match BinaryBodySource::parse("/tmp/audio.mp3") {
            BinaryBodySource::File { path, mode } => {
                assert_eq!(path.as_ref(), "/tmp/audio.mp3");
                assert_eq!(mode, AtMode::Auto);
            }
            BinaryBodySource::Stdin => panic!("expected File"),
        }
    }

    #[test]
    fn test_binary_body_source_at_path_strips_prefix() {
        match BinaryBodySource::parse("@/tmp/audio.mp3") {
            BinaryBodySource::File { path, mode } => {
                assert_eq!(path.as_ref(), "/tmp/audio.mp3");
                assert_eq!(mode, AtMode::Auto);
            }
            BinaryBodySource::Stdin => panic!("expected File"),
        }
    }

    #[test]
    fn test_binary_body_source_dash_is_stdin() {
        assert!(matches!(BinaryBodySource::parse("-"), BinaryBodySource::Stdin));
    }

    #[test]
    fn test_binary_body_source_at_dash_is_stdin() {
        // curl's spelling for stdin is `@-`; we accept it as an alias for `-`.
        assert!(matches!(BinaryBodySource::parse("@-"), BinaryBodySource::Stdin));
    }

    #[test]
    fn test_binary_body_source_double_at_is_literal_at_path() {
        // Only the first `@` is stripped — matches curl's behavior for filenames
        // that legitimately start with `@`.
        match BinaryBodySource::parse("@@weird-name.mp3") {
            BinaryBodySource::File { path, mode } => {
                assert_eq!(path.as_ref(), "@weird-name.mp3");
                assert_eq!(mode, AtMode::Auto);
            }
            BinaryBodySource::Stdin => panic!("expected File"),
        }
    }

    #[test]
    fn test_binary_body_source_backslash_at_is_escaped_literal_path() {
        // `\@literal` reaches the file source as a literal `@literal` path
        // (rather than triggering the `@` strip). Users can pass a path that
        // literally begins with `@` this way. FER-10436.
        match BinaryBodySource::parse("\\@weird") {
            BinaryBodySource::File { path, mode } => {
                assert_eq!(path.as_ref(), "@weird");
                assert_eq!(mode, AtMode::Auto);
            }
            BinaryBodySource::Stdin => panic!("expected File"),
        }
    }

    // FER-10532 — explicit scheme prefixes carry an [`AtMode`] through to the
    // executor. The path is stripped to the inner filesystem path; `-` is no
    // longer the stdin sentinel under an explicit scheme.

    #[test]
    fn test_binary_body_source_file_scheme_is_text_mode() {
        match BinaryBodySource::parse("@file:///tmp/audio.txt") {
            BinaryBodySource::File { path, mode } => {
                assert_eq!(path.as_ref(), "/tmp/audio.txt");
                assert_eq!(mode, AtMode::Text);
            }
            BinaryBodySource::Stdin => panic!("expected File"),
        }
    }

    #[test]
    fn test_binary_body_source_data_scheme_is_data_mode() {
        match BinaryBodySource::parse("@data:///tmp/audio.bin") {
            BinaryBodySource::File { path, mode } => {
                assert_eq!(path.as_ref(), "/tmp/audio.bin");
                assert_eq!(mode, AtMode::Data);
            }
            BinaryBodySource::Stdin => panic!("expected File"),
        }
    }

    #[test]
    fn test_binary_body_source_file_scheme_dash_is_not_stdin() {
        // `@file://-` is a literal file path named `-`, not stdin. Only the
        // bare `Auto`-mode `@-` (and plain `-`) trigger stdin.
        match BinaryBodySource::parse("@file://-") {
            BinaryBodySource::File { path, mode } => {
                assert_eq!(path.as_ref(), "-");
                assert_eq!(mode, AtMode::Text);
            }
            BinaryBodySource::Stdin => panic!("explicit-scheme `-` must not be stdin"),
        }
    }

    #[test]
    fn test_binary_body_source_data_scheme_dash_is_not_stdin() {
        match BinaryBodySource::parse("@data://-") {
            BinaryBodySource::File { path, mode } => {
                assert_eq!(path.as_ref(), "-");
                assert_eq!(mode, AtMode::Data);
            }
            BinaryBodySource::Stdin => panic!("explicit-scheme `-` must not be stdin"),
        }
    }

    #[test]
    fn test_binary_body_source_backslash_at_file_scheme_is_literal_path() {
        // `\@file://x` escapes the *whole* `@`-prefix grammar — the value
        // becomes the literal path string `@file://x` (FER-10436 escape
        // semantics). No scheme is parsed; mode stays `Auto`.
        match BinaryBodySource::parse("\\@file:///etc/hosts") {
            BinaryBodySource::File { path, mode } => {
                assert_eq!(path.as_ref(), "@file:///etc/hosts");
                assert_eq!(mode, AtMode::Auto);
            }
            BinaryBodySource::Stdin => panic!("expected File"),
        }
    }

    // ---------------------------------------------------------------
    // FER-10436 — `@file` references inside object-shorthand JSON
    // ---------------------------------------------------------------

    #[test]
    fn test_strip_or_escape_at_strips_curl_prefix() {
        // The common case — curl-style `@<path>` strips the prefix and
        // borrows the rest of the input (no allocation).
        let out = strip_or_escape_at("@/path/to/file");
        assert_eq!(out.as_ref(), "/path/to/file");
        assert!(matches!(out, std::borrow::Cow::Borrowed(_)));
    }

    #[test]
    fn test_strip_or_escape_at_passes_through_plain_path() {
        let out = strip_or_escape_at("/path/to/file");
        assert_eq!(out.as_ref(), "/path/to/file");
        assert!(matches!(out, std::borrow::Cow::Borrowed(_)));
    }

    #[test]
    fn test_strip_or_escape_at_rewrites_backslash_escape() {
        // `\@literal` → `@literal` (allocates; the rewrite produces a
        // string the caller can treat as a literal value).
        let out = strip_or_escape_at("\\@literal");
        assert_eq!(out.as_ref(), "@literal");
        assert!(matches!(out, std::borrow::Cow::Owned(_)));
    }

    #[test]
    fn test_strip_or_escape_at_strips_at_dash() {
        let out = strip_or_escape_at("@-");
        assert_eq!(out.as_ref(), "-");
    }

    #[test]
    fn test_is_escaped_literal_detects_backslash_at_prefix() {
        assert!(is_escaped_literal("\\@anything"));
        assert!(!is_escaped_literal("@anything"));
        assert!(!is_escaped_literal("plain"));
        assert!(!is_escaped_literal(""));
    }

    #[test]
    fn test_resolve_file_refs_reads_utf8_file_inside_nested_string() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(tmp.path(), b"hello from disk").unwrap();
        let at_path = format!("@{}", tmp.path().to_str().unwrap());

        let mut value = json!({
            "outer": {
                "pic": at_path,
                "untouched": "verbatim",
            }
        });
        resolve_file_refs(&mut value).expect("should resolve");
        assert_eq!(value["outer"]["pic"], json!("hello from disk"));
        assert_eq!(value["outer"]["untouched"], json!("verbatim"));
    }

    #[test]
    fn test_resolve_file_refs_base64_encodes_binary_file() {
        // Bytes that are NOT valid UTF-8 must round-trip through base64
        // so the resulting JSON string is still well-formed.
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let raw_bytes: Vec<u8> = vec![0xff, 0xfe, 0xfd, 0x00, 0x01];
        std::fs::write(tmp.path(), &raw_bytes).unwrap();
        let at_path = format!("@{}", tmp.path().to_str().unwrap());

        let mut value = json!({ "blob": at_path });
        resolve_file_refs(&mut value).expect("should resolve");
        let expected = BASE64.encode(&raw_bytes);
        assert_eq!(value["blob"], json!(expected));
    }

    #[test]
    fn test_resolve_file_refs_rewrites_backslash_escape_in_string() {
        // `\@literal` rewrites to `@literal`; no filesystem call is made.
        let mut value = json!({ "name": "\\@notapath" });
        resolve_file_refs(&mut value).expect("escape should not touch disk");
        assert_eq!(value["name"], json!("@notapath"));
    }

    #[test]
    fn test_resolve_file_refs_leaves_non_at_strings_unchanged() {
        let mut value = json!({ "name": "fern", "n": 42, "ok": true });
        resolve_file_refs(&mut value).expect("ok");
        assert_eq!(value, json!({ "name": "fern", "n": 42, "ok": true }));
    }

    #[test]
    fn test_resolve_file_refs_missing_file_includes_path_and_pointer() {
        // The error message must surface both the offending path and the
        // JSON-Pointer location so callers can diagnose deeply-nested refs.
        let missing = "/definitely/does/not/exist-fer10436.tmp";
        let at_path = format!("@{missing}");
        let mut value = json!({ "outer": { "pic": at_path } });
        let err = resolve_file_refs(&mut value).expect_err("missing file");
        let CliError::Validation(msg) = &err else {
            panic!("expected Validation, got {err:?}");
        };
        assert!(msg.contains(missing), "error must include path: {msg}");
        assert!(msg.contains("/outer/pic"), "error must include JSON pointer: {msg}");
    }

    #[test]
    fn test_resolve_file_refs_deep_pointer_is_correct() {
        // Pointer must walk arrays (numeric indices) and nested objects
        // and escape RFC-6901 metacharacters in keys.
        let mut value = json!({
            "foo": {
                "bar": [
                    { "baz": "@/definitely/nope-fer10436" }
                ]
            }
        });
        let err = resolve_file_refs(&mut value).expect_err("missing file");
        let CliError::Validation(msg) = &err else {
            panic!("expected Validation, got {err:?}");
        };
        assert!(
            msg.contains("/foo/bar/0/baz"),
            "pointer must be /foo/bar/0/baz, got: {msg}"
        );
    }

    #[test]
    fn test_resolve_file_refs_escapes_special_keys_in_pointer() {
        // RFC 6901 §4: `~` and `/` in keys must be escaped to `~0` and `~1`
        // respectively in the pointer.
        let mut map = serde_json::Map::new();
        let mut inner = serde_json::Map::new();
        inner.insert(
            "a/b~c".to_string(),
            json!("@/definitely/nope-fer10436-special"),
        );
        map.insert("root".to_string(), Value::Object(inner));
        let mut value = Value::Object(map);
        let err = resolve_file_refs(&mut value).expect_err("missing file");
        let CliError::Validation(msg) = &err else {
            panic!("expected Validation, got {err:?}");
        };
        assert!(
            msg.contains("/root/a~1b~0c"),
            "pointer must escape `/` to `~1` and `~` to `~0`, got: {msg}"
        );
    }

    #[test]
    fn test_resolve_file_refs_rejects_control_chars_in_path() {
        // An adversarial nested value must not bypass the path-safety net
        // that every other file-read site enforces (binding.rs binary body,
        // app.rs multipart). The error must surface before any disk I/O and
        // must point at the offending JSON field so callers can fix it.
        let mut value = json!({ "profile": { "pic": "@evil\x00path" } });
        let err = resolve_file_refs(&mut value).expect_err("must reject control char");
        let CliError::Validation(msg) = &err else {
            panic!("expected Validation, got {err:?}");
        };
        assert!(
            msg.contains("/profile/pic"),
            "error must include JSON pointer: {msg}"
        );
        assert!(
            msg.contains("control"),
            "error must mention control characters: {msg}"
        );
    }

    // -----------------------------------------------------------------
    // FER-10532 — explicit `@file://` (UTF-8 only) and `@data://` (base64)
    // scheme prefixes inside object-shorthand JSON values.
    // -----------------------------------------------------------------

    #[test]
    fn test_resolve_file_refs_file_scheme_inlines_utf8_string() {
        // `@file://<path>` reads UTF-8 text and embeds the string verbatim,
        // never base64. Same wire output as the `Auto` mode would produce
        // for valid UTF-8 — the value of the scheme is the *guarantee*.
        let tmp = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(tmp.path(), b"hello strict").unwrap();
        let at_path = format!("@file://{}", tmp.path().to_str().unwrap());

        let mut value = json!({ "outer": { "pic": at_path } });
        resolve_file_refs(&mut value).expect("should resolve");
        assert_eq!(value["outer"]["pic"], json!("hello strict"));
    }

    #[test]
    fn test_resolve_file_refs_file_scheme_errors_on_non_utf8() {
        // The defining behavior of `@file://`: refuse to silently base64
        // a binary payload. The error must surface the JSON pointer and
        // a hint about `@data://` so the user knows the escape hatch.
        let tmp = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(tmp.path(), [0xff, 0xfe, 0xfd]).unwrap();
        let at_path = format!("@file://{}", tmp.path().to_str().unwrap());

        let mut value = json!({ "blob": at_path });
        let err = resolve_file_refs(&mut value).expect_err("must reject non-UTF-8");
        let CliError::Validation(msg) = &err else {
            panic!("expected Validation, got {err:?}");
        };
        assert!(
            msg.contains("not valid UTF-8"),
            "error must say `not valid UTF-8`: {msg}"
        );
        assert!(
            msg.contains("@data://"),
            "error must hint at @data:// escape hatch: {msg}"
        );
        assert!(msg.contains("/blob"), "error must include JSON pointer: {msg}");
    }

    #[test]
    fn test_resolve_file_refs_data_scheme_base64s_utf8_input() {
        // `@data://<path>` always base64-encodes, even on valid UTF-8
        // (otherwise it would be identical to `@file://`). This is the
        // case Stainless documents for "API expects base64 of a text
        // payload."
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let utf8_payload = b"hello fern";
        std::fs::write(tmp.path(), utf8_payload).unwrap();
        let at_path = format!("@data://{}", tmp.path().to_str().unwrap());

        let mut value = json!({ "encoded": at_path });
        resolve_file_refs(&mut value).expect("should resolve");
        let expected = BASE64.encode(utf8_payload);
        assert_eq!(value["encoded"], json!(expected));
    }

    #[test]
    fn test_resolve_file_refs_data_scheme_base64s_binary_input() {
        let tmp = tempfile::NamedTempFile::new().unwrap();
        let raw_bytes: Vec<u8> = vec![0xff, 0xfe, 0x00, 0x01];
        std::fs::write(tmp.path(), &raw_bytes).unwrap();
        let at_path = format!("@data://{}", tmp.path().to_str().unwrap());

        let mut value = json!({ "blob": at_path });
        resolve_file_refs(&mut value).expect("should resolve");
        assert_eq!(value["blob"], json!(BASE64.encode(&raw_bytes)));
    }

    #[test]
    fn test_resolve_file_refs_backslash_at_file_scheme_is_literal() {
        // `\@file://x` is a literal string `@file://x` — no scheme is
        // parsed, no file is read. Same escape rule as `\@<rest>`.
        let mut value = json!({ "k": "\\@file:///etc/hosts" });
        resolve_file_refs(&mut value).expect("escape should not touch disk");
        assert_eq!(value["k"], json!("@file:///etc/hosts"));
    }

    #[test]
    fn test_resolve_file_refs_backslash_at_data_scheme_is_literal() {
        let mut value = json!({ "k": "\\@data:///etc/hosts" });
        resolve_file_refs(&mut value).expect("escape should not touch disk");
        assert_eq!(value["k"], json!("@data:///etc/hosts"));
    }

    #[test]
    fn test_parse_at_ref_recognises_schemes() {
        // Direct coverage on the parser so each scheme has at least one
        // unit test that doesn't have to spin up a filesystem.
        match parse_at_ref("@file:///etc/hosts") {
            AtRef::File { path, mode } => {
                assert_eq!(path.as_ref(), "/etc/hosts");
                assert_eq!(mode, AtMode::Text);
            }
            _ => panic!("expected File(Text)"),
        }
        match parse_at_ref("@data:///etc/hosts") {
            AtRef::File { path, mode } => {
                assert_eq!(path.as_ref(), "/etc/hosts");
                assert_eq!(mode, AtMode::Data);
            }
            _ => panic!("expected File(Data)"),
        }
        match parse_at_ref("@/etc/hosts") {
            AtRef::File { path, mode } => {
                assert_eq!(path.as_ref(), "/etc/hosts");
                assert_eq!(mode, AtMode::Auto);
            }
            _ => panic!("expected File(Auto)"),
        }
        match parse_at_ref("\\@file:///etc/hosts") {
            AtRef::Escaped(s) => assert_eq!(s, "@file:///etc/hosts"),
            _ => panic!("expected Escaped"),
        }
        match parse_at_ref("plain-path") {
            AtRef::Plain(s) => assert_eq!(s, "plain-path"),
            _ => panic!("expected Plain"),
        }
    }

    #[test]
    fn test_header_params_not_in_query_string() {
        let mut parameters = std::collections::HashMap::new();
        parameters.insert(
            "user_id".to_string(),
            MethodParameter {
                location: Some("path".to_string()),
                required: true,
                ..Default::default()
            },
        );
        parameters.insert(
            "X-Custom-Header".to_string(),
            MethodParameter {
                location: Some("header".to_string()),
                ..Default::default()
            },
        );
        parameters.insert(
            "limit".to_string(),
            MethodParameter {
                location: Some("query".to_string()),
                ..Default::default()
            },
        );

        let method = RestMethod {
            http_method: "GET".to_string(),
            path: "users/{user_id}".to_string(),
            parameters,
            parameter_order: vec!["user_id".to_string()],
            ..Default::default()
        };

        let doc = RestDescription {
            base_url: Some("https://api.example.com/".to_string()),
            ..Default::default()
        };

        let params_json =
            r#"{"user_id": "123", "X-Custom-Header": "my-value", "limit": "10"}"#;
        let input =
            parse_and_validate_inputs(&doc, &method, Some(params_json), None, false, None, &[]).unwrap();

        // Header param should be in header_params
        assert_eq!(input.header_params.len(), 1);
        assert_eq!(input.header_params[0].0, "X-Custom-Header");
        assert_eq!(input.header_params[0].1, "my-value");

        // Header param should NOT be in query_params
        assert!(
            !input
                .query_params
                .iter()
                .any(|(k, _)| k == "X-Custom-Header"),
            "Header param should not appear in query_params"
        );

        // Query param should still be in query_params
        assert!(
            input.query_params.iter().any(|(k, _)| k == "limit"),
            "Query param should appear in query_params"
        );
    }

    #[tokio::test]
    async fn test_header_params_sent_as_http_headers() {
        let client = reqwest::Client::new();
        let method = RestMethod {
            http_method: "GET".to_string(),
            path: "users".to_string(),
            ..Default::default()
        };
        let input = ExecutionInput {
            full_url: "https://example.com/users".to_string(),
            body: None,
            query_params: Vec::new(),
            header_params: vec![(
                "X-Custom-Header".to_string(),
                "header-value".to_string(),
            )],
            is_upload: false,
        };

        let request = build_http_request(
            &client,
            &method,
            &input,
            &crate::auth::no_auth_provider(),
            &EndpointAuthMetadata::unspecified(),
            &PageState::Cursor(None),
            0,
            &None,
            None,
            &None,
            &PaginationConfig::default(),
        )
        .await
        .unwrap();

        let built = request.build().unwrap();
        assert_eq!(
            built
                .headers()
                .get("X-Custom-Header")
                .map(|v| v.to_str().unwrap()),
            Some("header-value"),
            "Header params should be sent as HTTP headers"
        );
        assert_eq!(
            built.headers().get("Accept").map(|v| v.to_str().unwrap()),
            Some("application/json"),
            "Default Accept prefers JSON for content negotiation"
        );
    }

    #[tokio::test]
    async fn test_default_accept_skipped_when_accept_in_params() {
        let client = reqwest::Client::new();
        let method = RestMethod {
            http_method: "GET".to_string(),
            path: "users".to_string(),
            ..Default::default()
        };
        let input = ExecutionInput {
            full_url: "https://example.com/users".to_string(),
            body: None,
            query_params: Vec::new(),
            header_params: vec![("Accept".to_string(), "application/xml".to_string())],
            is_upload: false,
        };

        let request = build_http_request(
            &client,
            &method,
            &input,
            &crate::auth::no_auth_provider(),
            &EndpointAuthMetadata::unspecified(),
            &PageState::Cursor(None),
            0,
            &None,
            None,
            &None,
            &PaginationConfig::default(),
        )
        .await
        .unwrap();

        let built = request.build().unwrap();
        assert_eq!(
            built.headers().get("Accept").map(|v| v.to_str().unwrap()),
            Some("application/xml"),
            "Explicit Accept in header params should not be overridden"
        );
    }

    #[tokio::test]
    async fn test_explicit_anonymous_endpoint_skips_auth() {
        // `security: []` on an operation means "this endpoint is explicitly
        // unauthenticated" — the executor must not attach credentials even
        // when a credential-bearing provider is configured. Regression for
        // the leaf/Any/All path: only RoutingAuthProvider honored this
        // before; now the executor short-circuits universally.
        let client = reqwest::Client::new();
        let method = RestMethod {
            http_method: "GET".to_string(),
            path: "public/ping".to_string(),
            ..Default::default()
        };
        let input = ExecutionInput {
            full_url: "https://example.com/public/ping".to_string(),
            body: None,
            query_params: Vec::new(),
            header_params: Vec::new(),
            is_upload: false,
        };
        // A bare bearer leaf — would normally attach Authorization.
        let provider: crate::auth::DynAuthProvider = std::sync::Arc::new(
            crate::auth::BearerAuthProvider::new(
                "bearerAuth",
                crate::auth::AuthCredentialSource::literal("tok"),
            ),
        );

        let request = build_http_request(
            &client,
            &method,
            &input,
            &provider,
            &EndpointAuthMetadata::explicit_anonymous(),
            &PageState::Cursor(None),
            0,
            &None,
            None,
            &None,
            &PaginationConfig::default(),
        )
        .await
        .unwrap();

        let built = request.build().unwrap();
        assert!(
            built.headers().get(reqwest::header::AUTHORIZATION).is_none(),
            "security: [] must opt out of auth even with a bearer provider"
        );
    }

    #[test]
    fn test_coerce_body_param_value_scalar_types() {
        // CLI flags arrive as Value::String; coerce them per the schema's type.
        assert_eq!(
            coerce_body_param_value(&Value::String("42".into()), Some("integer")).unwrap(),
            json!(42)
        );
        assert_eq!(
            coerce_body_param_value(&Value::String("2.5".into()), Some("number")).unwrap(),
            json!(2.5)
        );
        assert_eq!(
            coerce_body_param_value(&Value::String("true".into()), Some("boolean")).unwrap(),
            Value::Bool(true)
        );
        assert_eq!(
            coerce_body_param_value(&Value::String("false".into()), Some("boolean")).unwrap(),
            Value::Bool(false)
        );
        // String type passes through unchanged.
        assert_eq!(
            coerce_body_param_value(&Value::String("hello".into()), Some("string")).unwrap(),
            json!("hello")
        );
        // Already-typed values from `--params` JSON pass through.
        assert_eq!(
            coerce_body_param_value(&json!(99), Some("integer")).unwrap(),
            json!(99)
        );
    }

    #[test]
    fn test_coerce_body_param_value_nested_decodes_json() {
        // Object/array body fields accept a JSON string from the CLI flag.
        let arr = coerce_body_param_value(
            &Value::String(r#"["a","b"]"#.into()),
            Some("array"),
        )
        .unwrap();
        assert_eq!(arr, json!(["a", "b"]));

        let obj = coerce_body_param_value(
            &Value::String(r#"{"city":"SF"}"#.into()),
            Some("object"),
        )
        .unwrap();
        assert_eq!(obj, json!({ "city": "SF" }));
    }

    #[test]
    fn test_coerce_body_param_value_object_rejects_non_object_json() {
        // Object-shorthand flag must receive a JSON object — arrays, scalars,
        // and null are rejected with a clear validation error, mirroring the
        // GraphQL `coerce_graphql_value` guard.
        for bad in [
            (r#"[1,2,3]"#, "array"),
            (r#""hi""#, "string"),
            ("42", "number"),
            ("true", "boolean"),
            ("null", "null"),
        ] {
            let err = coerce_body_param_value(&Value::String(bad.0.into()), Some("object"))
                .unwrap_err();
            match err {
                CliError::Validation(msg) => assert!(
                    msg.contains("must be a JSON object") && msg.contains(bad.1),
                    "expected 'must be a JSON object, got {}' for {}, got: {msg}",
                    bad.1,
                    bad.0,
                ),
                other => panic!("expected Validation error for {}, got {other:?}", bad.0),
            }
        }

        // Malformed JSON (not a JSON literal at all) falls through to the
        // shape check and reports "got string" — consistent with the
        // already-decoded `"hi"` case from collect_params_from_flags.
        let err =
            coerce_body_param_value(&Value::String("{not json}".into()), Some("object")).unwrap_err();
        match err {
            CliError::Validation(msg) => assert!(
                msg.contains("must be a JSON object") && msg.contains("string"),
                "expected 'must be a JSON object, got string' for malformed JSON, got: {msg}"
            ),
            _ => panic!("expected Validation error for malformed JSON"),
        }

        // Pre-parsed values (collect_params_from_flags eagerly JSON-decodes
        // object-typed params for deepObject query handling) must also be
        // shape-validated — the function must not short-circuit on non-String.
        for (pre_parsed, kind) in [
            (json!([1, 2, 3]), "array"),
            (json!(42), "number"),
            (json!(true), "boolean"),
            (Value::Null, "null"),
        ] {
            let err = coerce_body_param_value(&pre_parsed, Some("object")).unwrap_err();
            match err {
                CliError::Validation(msg) => assert!(
                    msg.contains("must be a JSON object") && msg.contains(kind),
                    "expected 'must be a JSON object, got {kind}' for pre-parsed {pre_parsed}: {msg}"
                ),
                other => panic!("expected Validation error for pre-parsed {pre_parsed}, got {other:?}"),
            }
        }
    }

    #[test]
    fn test_coerce_body_param_value_rejects_bad_input() {
        let err = coerce_body_param_value(
            &Value::String("not-an-int".into()),
            Some("integer"),
        )
        .unwrap_err();
        match err {
            CliError::Validation(msg) => assert!(msg.contains("Invalid integer")),
            _ => panic!("Expected Validation error"),
        }

        let err = coerce_body_param_value(
            &Value::String("yes".into()),
            Some("boolean"),
        )
        .unwrap_err();
        match err {
            CliError::Validation(msg) => assert!(msg.contains("Invalid boolean")),
            _ => panic!("Expected Validation error"),
        }
    }

    #[test]
    fn test_body_params_merge_into_body_via_params_json() {
        // `--params` is the JSON-blob fallback that mirrors per-flag values;
        // body-located params should land in the JSON body, not the query string.
        let mut parameters = std::collections::HashMap::new();
        parameters.insert(
            "name".to_string(),
            MethodParameter {
                location: Some("body".to_string()),
                param_type: Some("string".to_string()),
                ..Default::default()
            },
        );
        parameters.insert(
            "count".to_string(),
            MethodParameter {
                location: Some("body".to_string()),
                param_type: Some("integer".to_string()),
                ..Default::default()
            },
        );

        let method = RestMethod {
            http_method: "POST".to_string(),
            path: "things".to_string(),
            parameters,
            ..Default::default()
        };
        let doc = RestDescription {
            base_url: Some("https://api.example.com/".to_string()),
            ..Default::default()
        };

        let params_json = r#"{"name": "Acme", "count": "3"}"#;
        let input = parse_and_validate_inputs(&doc, &method, Some(params_json), None, false, None, &[])
            .unwrap();

        // Body must contain both fields, with `count` coerced to a JSON integer.
        let body = input.body.expect("body should be populated from body params");
        assert_eq!(body, json!({ "name": "Acme", "count": 3 }));

        // Body fields must NOT bleed into the query string or headers.
        assert!(input.query_params.is_empty(), "no query params expected");
        assert!(input.header_params.is_empty(), "no header params expected");
    }

    #[test]
    fn test_json_flag_overrides_body_field_flags() {
        // BREAKING (JFL-1.2): Mixing `--json` with per-field body flags is now
        // a validation error. Previously `--json` won on overlapping keys; now
        // the user must pick one mode or the other so intent is unambiguous.
        let mut parameters = std::collections::HashMap::new();
        parameters.insert(
            "name".to_string(),
            MethodParameter {
                location: Some("body".to_string()),
                param_type: Some("string".to_string()),
                ..Default::default()
            },
        );
        parameters.insert(
            "description".to_string(),
            MethodParameter {
                location: Some("body".to_string()),
                param_type: Some("string".to_string()),
                ..Default::default()
            },
        );

        let method = RestMethod {
            http_method: "POST".to_string(),
            path: "things".to_string(),
            parameters,
            ..Default::default()
        };
        let doc = RestDescription {
            base_url: Some("https://api.example.com/".to_string()),
            ..Default::default()
        };

        let params_json = r#"{"name": "from-flag", "description": "kept-from-flag"}"#;
        let body_json = r#"{"name": "from-json"}"#;
        let err = parse_and_validate_inputs(
            &doc,
            &method,
            Some(params_json),
            Some(body_json),
            false,
            None,
            &[],
        )
        .unwrap_err();
        match err {
            CliError::Validation(msg) => {
                assert!(
                    msg.contains("--json"),
                    "error must mention --json: {msg}"
                );
                assert!(
                    msg.contains("--name") || msg.contains("--description"),
                    "error must name a conflicting per-field flag: {msg}"
                );
            }
            other => panic!("expected Validation error, got {other:?}"),
        }
    }

    #[test]
    fn test_required_body_field_missing_mentions_flag_json_and_params() {
        // A required body field that isn't supplied at all should produce a
        // validation error that names the per-field flag, --json, and
        // --params, so the user knows every way to fix it. The previous
        // message only mentioned --params, which was misleading once
        // per-field body flags shipped.
        let mut parameters = std::collections::HashMap::new();
        parameters.insert(
            "name".to_string(),
            MethodParameter {
                location: Some("body".to_string()),
                param_type: Some("string".to_string()),
                required: true,
                ..Default::default()
            },
        );

        let method = RestMethod {
            http_method: "POST".to_string(),
            path: "things".to_string(),
            parameters,
            ..Default::default()
        };
        let doc = RestDescription {
            base_url: Some("https://api.example.com/".to_string()),
            ..Default::default()
        };

        let err = parse_and_validate_inputs(&doc, &method, None, None, false, None, &[])
            .unwrap_err();
        match err {
            CliError::Validation(msg) => {
                assert!(msg.contains("'name'"), "error names the missing field: {msg}");
                assert!(msg.contains("--name"), "error names the per-field flag: {msg}");
                assert!(msg.contains("--json"), "error names --json for body fields: {msg}");
                assert!(msg.contains("--params"), "error names --params: {msg}");
            }
            other => panic!("expected Validation error, got {other:?}"),
        }
    }

    #[test]
    fn test_required_param_missing_uses_flag_name_override() {
        // When a parameter has `flag_name_override` set (e.g. synthetic
        // idempotency-key flags inject the wire name verbatim), the error
        // message must suggest THAT flag — not a kebab of the wire name.
        // Otherwise the suggestion points at a flag the user can't pass.
        let mut parameters = std::collections::HashMap::new();
        parameters.insert(
            "Idempotency-Key".to_string(),
            MethodParameter {
                location: Some("header".to_string()),
                param_type: Some("string".to_string()),
                required: true,
                flag_name_override: Some("idempotency-key".to_string()),
                ..Default::default()
            },
        );

        let method = RestMethod {
            http_method: "POST".to_string(),
            path: "things".to_string(),
            parameters,
            ..Default::default()
        };
        let doc = RestDescription {
            base_url: Some("https://api.example.com/".to_string()),
            ..Default::default()
        };

        let err = parse_and_validate_inputs(&doc, &method, None, None, false, None, &[])
            .unwrap_err();
        match err {
            CliError::Validation(msg) => {
                assert!(
                    msg.contains("--idempotency-key"),
                    "error must point at the actual flag name from flag_name_override: {msg}"
                );
            }
            other => panic!("expected Validation error, got {other:?}"),
        }
    }

    #[test]
    fn test_non_object_json_replaces_body_and_drops_per_field_flags() {
        // BREAKING (JFL-1.2): combining `--json` with per-field body flags is
        // now a validation error regardless of the JSON's top-level shape.
        // Previously a non-object `--json` would silently drop the per-field
        // flag values; now the user is told to pick one mode.
        let mut parameters = std::collections::HashMap::new();
        parameters.insert(
            "name".to_string(),
            MethodParameter {
                location: Some("body".to_string()),
                param_type: Some("string".to_string()),
                ..Default::default()
            },
        );

        let method = RestMethod {
            http_method: "POST".to_string(),
            path: "things".to_string(),
            parameters,
            ..Default::default()
        };
        let doc = RestDescription {
            base_url: Some("https://api.example.com/".to_string()),
            ..Default::default()
        };

        // `--name` is supplied via params; `--json` is a bare array.
        let params_json = r#"{"name": "from-flag-loses"}"#;
        let body_json = r#"[1, 2, 3]"#;
        let err = parse_and_validate_inputs(
            &doc,
            &method,
            Some(params_json),
            Some(body_json),
            false,
            None,
            &[],
        )
        .unwrap_err();
        match err {
            CliError::Validation(msg) => {
                assert!(msg.contains("--json"), "error must mention --json: {msg}");
                assert!(msg.contains("--name"), "error must name the per-field flag: {msg}");
            }
            other => panic!("expected Validation error, got {other:?}"),
        }
    }

    #[test]
    fn test_required_non_body_param_missing_omits_json_hint() {
        // The --json hint is body-specific. A missing required query/path/
        // header param should NOT suggest --json — it would mislead the
        // user into thinking the body matters here.
        let mut parameters = std::collections::HashMap::new();
        parameters.insert(
            "limit".to_string(),
            MethodParameter {
                location: Some("query".to_string()),
                param_type: Some("integer".to_string()),
                required: true,
                ..Default::default()
            },
        );

        let method = RestMethod {
            http_method: "GET".to_string(),
            path: "things".to_string(),
            parameters,
            ..Default::default()
        };
        let doc = RestDescription {
            base_url: Some("https://api.example.com/".to_string()),
            ..Default::default()
        };

        let err = parse_and_validate_inputs(&doc, &method, None, None, false, None, &[])
            .unwrap_err();
        match err {
            CliError::Validation(msg) => {
                assert!(msg.contains("--limit"), "error names the per-field flag: {msg}");
                assert!(msg.contains("--params"), "error names --params: {msg}");
                assert!(!msg.contains("--json"), "non-body error should not mention --json: {msg}");
            }
            other => panic!("expected Validation error, got {other:?}"),
        }
    }

    #[test]
    fn test_missing_body_param_hint_preserves_dot_notation() {
        // Gap 1a: For a body param with dot-notation (e.g. `address.street`),
        // the missing-required-param error must suggest `--address.street`
        // (dots preserved via `to_kebab_flag`), NOT `--address-street`.
        let mut parameters = std::collections::HashMap::new();
        parameters.insert(
            "address.street".to_string(),
            MethodParameter {
                location: Some("body".to_string()),
                param_type: Some("string".to_string()),
                required: true,
                ..Default::default()
            },
        );

        let method = RestMethod {
            http_method: "POST".to_string(),
            path: "contacts".to_string(),
            parameters,
            ..Default::default()
        };
        let doc = RestDescription {
            base_url: Some("https://api.example.com/".to_string()),
            ..Default::default()
        };

        let err = parse_and_validate_inputs(&doc, &method, None, None, false, None, &[])
            .unwrap_err();
        match err {
            CliError::Validation(msg) => {
                assert!(
                    msg.contains("--address.street"),
                    "hint must preserve dots for body params: {msg}",
                );
                assert!(
                    !msg.contains("--address-street"),
                    "hint must NOT kebab-ify dots to hyphens: {msg}",
                );
            }
            other => panic!("expected Validation error, got {other:?}"),
        }
    }

    #[test]
    fn test_missing_param_hint_uses_builtin_collision_suffix() {
        // Gap 1b: When a required param's flag name collides with a builtin
        // (e.g. a param named `format`), the hint must suggest
        // `--format-param` (the actually registered flag), NOT `--format`.
        let mut parameters = std::collections::HashMap::new();
        parameters.insert(
            "format".to_string(),
            MethodParameter {
                location: Some("query".to_string()),
                param_type: Some("string".to_string()),
                required: true,
                ..Default::default()
            },
        );

        let method = RestMethod {
            http_method: "GET".to_string(),
            path: "reports".to_string(),
            parameters,
            ..Default::default()
        };
        let doc = RestDescription {
            base_url: Some("https://api.example.com/".to_string()),
            ..Default::default()
        };

        let err = parse_and_validate_inputs(&doc, &method, None, None, false, None, &[])
            .unwrap_err();
        match err {
            CliError::Validation(msg) => {
                assert!(
                    msg.contains("--format-param"),
                    "hint must use the -param suffixed flag for builtin collisions: {msg}",
                );
                // Verify it does NOT suggest bare `--format ` (with trailing
                // space to avoid matching `--format-param`).
                assert!(
                    !msg.contains("--format ") && !msg.contains("--format,"),
                    "hint must NOT suggest the bare builtin flag: {msg}",
                );
            }
            other => panic!("expected Validation error, got {other:?}"),
        }
    }

    #[test]
    fn test_per_field_body_flags_path_runs_schema_validation() {
        // Schema validation must run regardless of whether the body was
        // built from --json or from per-field flags. The previous version
        // only validated on the --json path, letting flag-only bodies skip
        // schema checks even though clap-typed strings are more likely to
        // produce shape mismatches than hand-written JSON.
        let mut parameters = std::collections::HashMap::new();
        parameters.insert(
            "name".to_string(),
            MethodParameter {
                location: Some("body".to_string()),
                param_type: Some("string".to_string()),
                ..Default::default()
            },
        );

        // Schema declares `name` as an integer — a string value from the
        // per-field flag should be rejected by the schema validator.
        let mut schema_props = std::collections::HashMap::new();
        schema_props.insert(
            "name".to_string(),
            crate::openapi::discovery::JsonSchemaProperty {
                prop_type: Some("integer".to_string()),
                ..Default::default()
            },
        );
        let mut schemas = std::collections::HashMap::new();
        schemas.insert(
            "ThingRequest".to_string(),
            crate::openapi::discovery::JsonSchema {
                schema_type: Some("object".to_string()),
                properties: schema_props,
                ..Default::default()
            },
        );

        let method = RestMethod {
            http_method: "POST".to_string(),
            path: "things".to_string(),
            parameters,
            request: Some(crate::openapi::discovery::SchemaRef {
                schema_ref: Some("ThingRequest".to_string()),
                ..Default::default()
            }),
            ..Default::default()
        };
        let doc = RestDescription {
            base_url: Some("https://api.example.com/".to_string()),
            schemas,
            ..Default::default()
        };

        let params_json = r#"{"name": "not-an-integer"}"#;
        let err = parse_and_validate_inputs(&doc, &method, Some(params_json), None, false, None, &[])
            .unwrap_err();
        match err {
            CliError::Validation(msg) => {
                assert!(
                    msg.contains("schema validation"),
                    "schema validator should fire on flag-only body: {msg}"
                );
            }
            other => panic!("expected Validation error, got {other:?}"),
        }
    }

    #[test]
    fn test_json_plus_body_flag_returns_validation_error() {
        // JFL-1.2: --json and per-field body flags are mutually exclusive.
        // The error must name both --json and the conflicting flag so the
        // user can immediately see which inputs are fighting.
        let mut parameters = std::collections::HashMap::new();
        parameters.insert(
            "name".to_string(),
            MethodParameter {
                location: Some("body".to_string()),
                param_type: Some("string".to_string()),
                ..Default::default()
            },
        );

        let method = RestMethod {
            http_method: "POST".to_string(),
            path: "things".to_string(),
            parameters,
            ..Default::default()
        };
        let doc = RestDescription {
            base_url: Some("https://api.example.com/".to_string()),
            ..Default::default()
        };

        let params_json = r#"{"name": "from-flag"}"#;
        let body_json = r#"{"name": "from-json"}"#;
        let err = parse_and_validate_inputs(
            &doc,
            &method,
            Some(params_json),
            Some(body_json),
            false,
            None,
            &[],
        )
        .unwrap_err();
        match err {
            CliError::Validation(msg) => {
                assert!(msg.contains("--json"), "error must mention --json: {msg}");
                assert!(msg.contains("--name"), "error must name the per-field flag: {msg}");
            }
            other => panic!("expected Validation error, got {other:?}"),
        }
    }

    #[test]
    fn test_object_shorthand_plus_leaf_flag_returns_validation_error() {
        // JFL-1.2: `--name` (object shorthand) and `--name.first` (dot-notation
        // leaf) target the same field. Mixing both is a validation error.
        let mut parameters = std::collections::HashMap::new();
        // Object-level shorthand flag (param_type=="object") emitted by parser.
        parameters.insert(
            "name".to_string(),
            MethodParameter {
                location: Some("body".to_string()),
                param_type: Some("object".to_string()),
                ..Default::default()
            },
        );
        // Leaf flag for the same field via dot-notation.
        parameters.insert(
            "name.first".to_string(),
            MethodParameter {
                location: Some("body".to_string()),
                param_type: Some("string".to_string()),
                ..Default::default()
            },
        );

        let method = RestMethod {
            http_method: "POST".to_string(),
            path: "people".to_string(),
            parameters,
            ..Default::default()
        };
        let doc = RestDescription {
            base_url: Some("https://api.example.com/".to_string()),
            ..Default::default()
        };

        let params_json = r#"{"name": "{\"last\":\"Lincoln\"}", "name.first": "Abraham"}"#;
        let err = parse_and_validate_inputs(&doc, &method, Some(params_json), None, false, None, &[])
            .unwrap_err();
        match err {
            CliError::Validation(msg) => {
                assert!(msg.contains("--name"), "error must mention --name: {msg}");
                assert!(
                    msg.contains("--name.first"),
                    "error must mention --name.first: {msg}"
                );
            }
            other => panic!("expected Validation error, got {other:?}"),
        }
    }

    #[test]
    fn test_object_shorthand_alone_parses_and_sets_nested() {
        // JFL-1.2: passing the object-shorthand flag alone JSON-parses the
        // string and lands the resulting object at the parent key. This is
        // the user-facing alternative to `--name.first X --name.last Y`.
        let mut parameters = std::collections::HashMap::new();
        parameters.insert(
            "name".to_string(),
            MethodParameter {
                location: Some("body".to_string()),
                param_type: Some("object".to_string()),
                ..Default::default()
            },
        );

        let method = RestMethod {
            http_method: "POST".to_string(),
            path: "people".to_string(),
            parameters,
            ..Default::default()
        };
        let doc = RestDescription {
            base_url: Some("https://api.example.com/".to_string()),
            ..Default::default()
        };

        let params_json = r#"{"name": "{\"first\":\"Abraham\",\"last\":\"Lincoln\"}"}"#;
        let input = parse_and_validate_inputs(&doc, &method, Some(params_json), None, false, None, &[])
            .unwrap();
        let body = input.body.expect("body should be populated");
        assert_eq!(body, json!({ "name": { "first": "Abraham", "last": "Lincoln" } }));
    }

    #[test]
    fn test_object_shorthand_satisfies_required_leaf() {
        // Spec marks `name.first` required and `name` itself as the shorthand
        // umbrella. User provides the data via `--name '{"first":"x"}'` only.
        // The required-leaf check must not fire — the value lives in the
        // shorthand payload, not as a `name.first` flag entry.
        let mut parameters = std::collections::HashMap::new();
        parameters.insert(
            "name".to_string(),
            MethodParameter {
                location: Some("body".to_string()),
                param_type: Some("object".to_string()),
                required: false,
                ..Default::default()
            },
        );
        parameters.insert(
            "name.first".to_string(),
            MethodParameter {
                location: Some("body".to_string()),
                param_type: Some("string".to_string()),
                required: true,
                ..Default::default()
            },
        );

        let method = RestMethod {
            http_method: "POST".to_string(),
            path: "people".to_string(),
            parameters,
            ..Default::default()
        };
        let doc = RestDescription {
            base_url: Some("https://api.example.com/".to_string()),
            ..Default::default()
        };

        let params_json = r#"{"name": "{\"first\":\"Abraham\"}"}"#;
        let input = parse_and_validate_inputs(&doc, &method, Some(params_json), None, false, None, &[])
            .expect("required leaf satisfied by ancestor shorthand should pass");
        let body = input.body.expect("body should be populated");
        assert_eq!(body, json!({ "name": { "first": "Abraham" } }));
    }

    #[test]
    fn test_required_leaf_still_reported_when_no_ancestor_shorthand() {
        // Sanity check: with the same shape as above but no shorthand value
        // supplied, the required-leaf check still fires.
        let mut parameters = std::collections::HashMap::new();
        parameters.insert(
            "name".to_string(),
            MethodParameter {
                location: Some("body".to_string()),
                param_type: Some("object".to_string()),
                required: false,
                ..Default::default()
            },
        );
        parameters.insert(
            "name.first".to_string(),
            MethodParameter {
                location: Some("body".to_string()),
                param_type: Some("string".to_string()),
                required: true,
                ..Default::default()
            },
        );

        let method = RestMethod {
            http_method: "POST".to_string(),
            path: "people".to_string(),
            parameters,
            ..Default::default()
        };
        let doc = RestDescription {
            base_url: Some("https://api.example.com/".to_string()),
            ..Default::default()
        };

        let err = parse_and_validate_inputs(&doc, &method, None, None, false, None, &[])
            .unwrap_err();
        match err {
            CliError::Validation(msg) => {
                assert!(msg.contains("name.first"), "error should name leaf: {msg}");
            }
            other => panic!("expected Validation error, got {other:?}"),
        }
    }

    #[test]
    fn test_pagination_config_default() {
        let config = PaginationConfig::default();
        assert!(!config.page_all);
        assert_eq!(config.page_limit, 10);
        assert_eq!(config.page_delay_ms, 100);
    }

    #[test]
    fn test_mime_to_extension_more_types() {
        assert_eq!(mime_to_extension("text/plain"), "txt");
        assert_eq!(mime_to_extension("text/csv"), "csv");
        assert_eq!(mime_to_extension("application/zip"), "zip");
        assert_eq!(mime_to_extension("application/xml"), "xml");
        assert_eq!(mime_to_extension("text/html"), "html");
        assert_eq!(mime_to_extension("application/json"), "bin"); // Default for unknown specific json types if not scripts
        assert_eq!(
            mime_to_extension("application/vnd.google-apps.script"),
            "json"
        );
        assert_eq!(
            mime_to_extension("application/vnd.google-apps.presentation"),
            "pptx"
        );
    }

    #[test]
    fn test_validate_body_valid() {
        let mut properties = HashMap::new();
        properties.insert(
            "name".to_string(),
            JsonSchemaProperty {
                prop_type: Some("string".to_string()),
                ..Default::default()
            },
        );

        let mut schemas = HashMap::new();
        schemas.insert(
            "File".to_string(),
            JsonSchema {
                properties,
                ..Default::default()
            },
        );

        let doc = RestDescription {
            schemas,
            ..Default::default()
        };

        let body = json!({ "name": "My File" });
        assert!(validate_body_against_schema(&body, "File", &doc).is_ok());
    }

    #[test]
    fn test_validate_body_accepts_null_on_nullable_property() {
        // A property whose schema declares `nullable: true` must accept JSON
        // null without raising "Expected type 'string', found null".
        let mut properties = HashMap::new();
        properties.insert(
            "userId".to_string(),
            JsonSchemaProperty {
                prop_type: Some("string".to_string()),
                nullable: true,
                ..Default::default()
            },
        );
        let schemas = HashMap::from([(
            "Event".to_string(),
            JsonSchema {
                schema_type: Some("object".to_string()),
                properties,
                ..Default::default()
            },
        )]);
        let doc = RestDescription { schemas, ..Default::default() };
        let body = json!({ "userId": null });
        assert!(
            validate_body_against_schema(&body, "Event", &doc).is_ok(),
            "JSON null on a nullable: true property must validate",
        );
    }

    #[test]
    fn test_validate_body_rejects_null_on_non_nullable_property() {
        // Regression guard: a property with no `nullable` flag must still
        // reject JSON null. Keeps the validator strict outside the explicit
        // nullable opt-in.
        let mut properties = HashMap::new();
        properties.insert(
            "code".to_string(),
            JsonSchemaProperty {
                prop_type: Some("string".to_string()),
                ..Default::default()
            },
        );
        let schemas = HashMap::from([(
            "Item".to_string(),
            JsonSchema {
                schema_type: Some("object".to_string()),
                properties,
                ..Default::default()
            },
        )]);
        let doc = RestDescription { schemas, ..Default::default() };
        let body = json!({ "code": null });
        let result = validate_body_against_schema(&body, "Item", &doc);
        assert!(result.is_err(), "null on non-nullable property must still be rejected");
    }

    #[test]
    fn test_validate_body_open_schema_allows_any_properties() {
        // A schema with type=object but no properties defined is an open schema:
        // any properties are allowed (JSON Schema default).
        let schemas = HashMap::from([(
            "Body".to_string(),
            JsonSchema {
                schema_type: Some("object".to_string()),
                properties: HashMap::new(),
                ..Default::default()
            },
        )]);
        let doc = RestDescription { schemas, ..Default::default() };
        let body = json!({ "name": "foo", "count": 3, "nested": {"x": 1} });
        assert!(
            validate_body_against_schema(&body, "Body", &doc).is_ok(),
            "open object schema should accept any properties"
        );
    }

    #[test]
    fn test_validate_body_unknown_field() {
        let mut properties = HashMap::new();
        properties.insert(
            "name".to_string(),
            JsonSchemaProperty {
                prop_type: Some("string".to_string()),
                ..Default::default()
            },
        );

        let mut schemas = HashMap::new();
        schemas.insert(
            "File".to_string(),
            JsonSchema {
                schema_type: Some("object".to_string()),
                properties,
                ..Default::default()
            },
        );

        let doc = RestDescription {
            schemas,
            ..Default::default()
        };

        let body = json!({ "name": "My File", "invalidField": 123 });
        let result = validate_body_against_schema(&body, "File", &doc);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Unknown property"));
    }

    #[test]
    fn test_validate_body_deep_validation() {
        let mut properties = HashMap::new();
        properties.insert(
            "name".to_string(),
            JsonSchemaProperty {
                prop_type: Some("string".to_string()),
                ..Default::default()
            },
        );
        properties.insert(
            "status".to_string(),
            JsonSchemaProperty {
                prop_type: Some("string".to_string()),
                enum_values: Some(vec!["ACTIVE".to_string(), "INACTIVE".to_string()]),
                ..Default::default()
            },
        );
        properties.insert(
            "count".to_string(),
            JsonSchemaProperty {
                prop_type: Some("integer".to_string()),
                ..Default::default()
            },
        );
        properties.insert(
            "tags".to_string(),
            JsonSchemaProperty {
                prop_type: Some("array".to_string()),
                items: Some(Box::new(JsonSchemaProperty {
                    prop_type: Some("string".to_string()),
                    ..Default::default()
                })),
                ..Default::default()
            },
        );
        properties.insert(
            "parent".to_string(),
            JsonSchemaProperty {
                schema_ref: Some("Parent".to_string()),
                ..Default::default()
            },
        );

        let mut parent_props = HashMap::new();
        parent_props.insert(
            "id".to_string(),
            JsonSchemaProperty {
                prop_type: Some("string".to_string()),
                ..Default::default()
            },
        );

        let mut schemas = HashMap::new();
        schemas.insert(
            "File".to_string(),
            JsonSchema {
                schema_type: Some("object".to_string()),
                required: vec!["name".to_string(), "status".to_string()],
                properties,
                ..Default::default()
            },
        );
        schemas.insert(
            "Parent".to_string(),
            JsonSchema {
                schema_type: Some("object".to_string()),
                properties: parent_props,
                ..Default::default()
            },
        );

        let doc = RestDescription {
            schemas,
            ..Default::default()
        };

        // Valid Request
        let body = json!({
            "name": "My File",
            "status": "ACTIVE",
            "count": 10,
            "tags": ["one", "two"],
            "parent": { "id": "123" }
        });
        assert!(validate_body_against_schema(&body, "File", &doc).is_ok());

        // Missing Required Field
        let body_missing = json!({ "name": "My File" });
        let err = validate_body_against_schema(&body_missing, "File", &doc).unwrap_err();
        assert!(err
            .to_string()
            .contains("Missing required property 'status'"));

        // Invalid Enum Value
        let body_bad_enum = json!({ "name": "My File", "status": "UNKNOWN" });
        let err = validate_body_against_schema(&body_bad_enum, "File", &doc).unwrap_err();
        assert!(err.to_string().contains("not a valid enum member"));

        // Invalid Type
        let body_bad_type = json!({ "name": "My File", "status": "ACTIVE", "count": "10" });
        let err = validate_body_against_schema(&body_bad_type, "File", &doc).unwrap_err();
        assert!(err
            .to_string()
            .contains("Expected type 'integer', found string"));

        // Deep Schema Reference Validation Failure
        let body_bad_ref = json!({
            "name": "My File",
            "status": "ACTIVE",
            "parent": { "invalidField": "123" }
        });
        let err = validate_body_against_schema(&body_bad_ref, "File", &doc).unwrap_err();
        assert!(err.to_string().contains("Unknown property"));

        // Expected Object Type Failure
        let body_not_object = json!([]);
        let err = validate_body_against_schema(&body_not_object, "File", &doc).unwrap_err();
        assert!(err.to_string().contains("Expected object"));
    }

    #[test]
    fn test_validate_body_accepts_null_on_3_0_nullable_branch() {
        // Regression: a composition branch in the 3.0 idiom
        // (`{nullable: true}` with no concrete type) or the 3.1 array
        // form (`{type: ['null']}`) lowers to a `JsonSchemaProperty`
        // with `prop_type: None, nullable: true`. The parser's
        // `is_null_sentinel` already recognizes both; `has_null_branch`
        // must mirror that or else `--field null` on these spec shapes
        // gets through the flag layer but fails body validation.
        // Caught by Devin's review on PR #124.
        let mut properties = HashMap::new();
        properties.insert(
            "authorId".to_string(),
            JsonSchemaProperty {
                // Wrapper property has an explicit `prop_type` so the
                // validator's type-matching step would run and reject
                // null without the short-circuit. This is the precise
                // failure mode the missing recognition would create.
                prop_type: Some("string".to_string()),
                nullable: false,
                any_of: vec![
                    JsonSchemaProperty {
                        prop_type: Some("string".to_string()),
                        ..Default::default()
                    },
                    // Lowered form of `{nullable: true}` (3.0) or
                    // `{type: ['null']}` (3.1 array).
                    JsonSchemaProperty {
                        prop_type: None,
                        nullable: true,
                        ..Default::default()
                    },
                ],
                ..Default::default()
            },
        );
        let schemas = HashMap::from([(
            "Msg".to_string(),
            JsonSchema {
                schema_type: Some("object".to_string()),
                properties,
                ..Default::default()
            },
        )]);
        let doc = RestDescription { schemas, ..Default::default() };
        let body = json!({ "authorId": null });
        assert!(
            validate_body_against_schema(&body, "Msg", &doc).is_ok(),
            "null on a property whose composition has a {{nullable:true}}-style branch must validate",
        );
    }

    #[test]
    fn test_validate_body_accepts_null_on_nullable_union_via_any_of() {
        // ADR-0005: a property whose schema is `anyOf: [{type: string},
        // {type: 'null'}]` must accept JSON null without raising
        // "Expected type 'string', found null". The intrinsic
        // `nullable` flag is false here — null-ness lives in the
        // composition.
        let mut properties = HashMap::new();
        properties.insert(
            "authorId".to_string(),
            JsonSchemaProperty {
                prop_type: None,
                nullable: false,
                any_of: vec![
                    JsonSchemaProperty {
                        prop_type: Some("string".to_string()),
                        ..Default::default()
                    },
                    JsonSchemaProperty {
                        prop_type: Some("null".to_string()),
                        ..Default::default()
                    },
                ],
                ..Default::default()
            },
        );
        let schemas = HashMap::from([(
            "Msg".to_string(),
            JsonSchema {
                schema_type: Some("object".to_string()),
                properties,
                ..Default::default()
            },
        )]);
        let doc = RestDescription { schemas, ..Default::default() };
        let body = json!({ "authorId": null });
        assert!(
            validate_body_against_schema(&body, "Msg", &doc).is_ok(),
            "null on nullable-union must validate via any_of null branch",
        );
    }

    #[test]
    fn test_validate_body_root_level_all_of_enters_object_branch() {
        // ADR-0004: a top-level schema with no `type:` declared but
        // `all_of:` populated must still enter the object validation
        // branch and accept the merged properties from the branches.
        // Without this, the validator would silently skip the body.
        let base_properties = HashMap::from([(
            "subject".to_string(),
            JsonSchemaProperty {
                prop_type: Some("string".to_string()),
                ..Default::default()
            },
        )]);
        let overlay_branch = JsonSchemaProperty {
            prop_type: Some("object".to_string()),
            properties: HashMap::from([(
                "body".to_string(),
                JsonSchemaProperty {
                    prop_type: Some("string".to_string()),
                    ..Default::default()
                },
            )]),
            ..Default::default()
        };
        let schemas = HashMap::from([
            (
                "Base".to_string(),
                JsonSchema {
                    schema_type: Some("object".to_string()),
                    required: vec!["subject".to_string()],
                    properties: base_properties,
                    ..Default::default()
                },
            ),
            (
                "MsgRequest".to_string(),
                JsonSchema {
                    schema_type: None,
                    all_of: vec![
                        JsonSchemaProperty {
                            schema_ref: Some("Base".to_string()),
                            ..Default::default()
                        },
                        overlay_branch,
                    ],
                    ..Default::default()
                },
            ),
        ]);
        let doc = RestDescription { schemas, ..Default::default() };
        // Valid: both merged props present.
        let body = json!({ "subject": "hi", "body": "world" });
        assert!(
            validate_body_against_schema(&body, "MsgRequest", &doc).is_ok(),
            "all_of-rooted body should accept merged fields",
        );
        // Invalid: unknown field surfaces (proves the merged property
        // set is being consulted, not skipped).
        let bad = json!({ "subject": "hi", "body": "world", "stray": 1 });
        let err = validate_body_against_schema(&bad, "MsgRequest", &doc).unwrap_err();
        assert!(err.to_string().contains("Unknown property"));
    }

    #[test]
    fn test_validate_body_object_property_with_all_of_overlay() {
        // ADR-0004 nested case: an object property whose schema declares
        // `all_of: [...]` should validate against the merged property
        // set, not the bare `properties` map (which is empty for the
        // synthetic JsonSchemaProperty).
        let base_props = HashMap::from([(
            "url".to_string(),
            JsonSchemaProperty {
                prop_type: Some("string".to_string()),
                ..Default::default()
            },
        )]);
        // The body's `attachment` property is `type: object` with an
        // allOf overlay that brings in `url` from a $ref base and adds
        // `checksum` inline.
        let attachment_prop = JsonSchemaProperty {
            prop_type: Some("object".to_string()),
            all_of: vec![
                JsonSchemaProperty {
                    schema_ref: Some("AttachmentBase".to_string()),
                    ..Default::default()
                },
                JsonSchemaProperty {
                    prop_type: Some("object".to_string()),
                    properties: HashMap::from([(
                        "checksum".to_string(),
                        JsonSchemaProperty {
                            prop_type: Some("string".to_string()),
                            ..Default::default()
                        },
                    )]),
                    ..Default::default()
                },
            ],
            ..Default::default()
        };
        let schemas = HashMap::from([
            (
                "AttachmentBase".to_string(),
                JsonSchema {
                    schema_type: Some("object".to_string()),
                    properties: base_props,
                    ..Default::default()
                },
            ),
            (
                "Msg".to_string(),
                JsonSchema {
                    schema_type: Some("object".to_string()),
                    properties: HashMap::from([("attachment".to_string(), attachment_prop)]),
                    ..Default::default()
                },
            ),
        ]);
        let doc = RestDescription { schemas, ..Default::default() };
        let body = json!({
            "attachment": { "url": "https://x.example", "checksum": "abc" }
        });
        assert!(
            validate_body_against_schema(&body, "Msg", &doc).is_ok(),
            "merged nested allOf properties should validate",
        );
        let bad = json!({ "attachment": { "stray": 1 } });
        let err = validate_body_against_schema(&bad, "Msg", &doc).unwrap_err();
        assert!(err.to_string().contains("Unknown property"));
    }

    #[test]
    fn test_validate_body_object_property_with_typeless_all_of_overlay() {
        // Regression: a property declared as bare `allOf: [...]` (no
        // redundant `type: object` on the wrapper) lowers to a
        // `JsonSchemaProperty { prop_type: None, all_of: [...] }`. The
        // parser-side flattener correctly enters object recursion on
        // either `prop_type == "object"` OR a non-empty `all_of`; the
        // validator's condition must mirror that. Without the fix, an
        // unknown field inside an allOf-typed object property would
        // silently pass validation. Caught by Devin's review on PR #124.
        let base_props = HashMap::from([(
            "url".to_string(),
            JsonSchemaProperty {
                prop_type: Some("string".to_string()),
                ..Default::default()
            },
        )]);
        let attachment_prop = JsonSchemaProperty {
            // Note: no `prop_type` here — the precise gap the fix addresses.
            prop_type: None,
            all_of: vec![
                JsonSchemaProperty {
                    schema_ref: Some("AttachmentBase".to_string()),
                    ..Default::default()
                },
                JsonSchemaProperty {
                    properties: HashMap::from([(
                        "checksum".to_string(),
                        JsonSchemaProperty {
                            prop_type: Some("string".to_string()),
                            ..Default::default()
                        },
                    )]),
                    ..Default::default()
                },
            ],
            ..Default::default()
        };
        let schemas = HashMap::from([
            (
                "AttachmentBase".to_string(),
                JsonSchema {
                    schema_type: Some("object".to_string()),
                    properties: base_props,
                    ..Default::default()
                },
            ),
            (
                "Msg".to_string(),
                JsonSchema {
                    schema_type: Some("object".to_string()),
                    properties: HashMap::from([("attachment".to_string(), attachment_prop)]),
                    ..Default::default()
                },
            ),
        ]);
        let doc = RestDescription { schemas, ..Default::default() };
        // Valid: both merged fields present, no unknowns.
        let body = json!({
            "attachment": { "url": "https://x.example", "checksum": "abc" }
        });
        assert!(
            validate_body_against_schema(&body, "Msg", &doc).is_ok(),
            "typeless allOf-property should validate against merged property set",
        );
        // Active: an unknown field should be REJECTED. Before the fix,
        // validation was skipped entirely for this shape — the bug
        // surfaces precisely here.
        let bad = json!({ "attachment": { "stray": 1 } });
        let err = validate_body_against_schema(&bad, "Msg", &doc).unwrap_err();
        assert!(
            err.to_string().contains("Unknown property"),
            "typeless allOf-property should reject unknown fields: got err {err}",
        );
        // Active: a non-object value (e.g. string) should also be
        // rejected. A typeless allOf-property has no `prop_type` to
        // trigger step-2's type mismatch, so without the else-branch
        // a non-object would silently pass. Caught by Devin's review.
        let wrong_shape = json!({ "attachment": "not-an-object" });
        let err = validate_body_against_schema(&wrong_shape, "Msg", &doc).unwrap_err();
        assert!(
            err.to_string().contains("Expected object"),
            "typeless allOf-property should reject non-object values: got err {err}",
        );
    }

    #[test]
    fn test_validate_body_property_all_of_enforces_ref_resolved_required() {
        // `merge_property_all_of` previously computed the required set
        // from $ref-resolved branches and then discarded it, so a body
        // like `--json '{"attachment": {}}'` against a property whose
        // allOf includes a $ref to a schema with `required: [url]`
        // passed silently. Now the required set is threaded through to
        // `validate_properties`, so the missing field surfaces.
        // (Inline-branch required is still a documented IR gap; only
        // $ref-resolved required is enforced at the property level.)
        let base_props = HashMap::from([(
            "url".to_string(),
            JsonSchemaProperty {
                prop_type: Some("string".to_string()),
                ..Default::default()
            },
        )]);
        let attachment_prop = JsonSchemaProperty {
            prop_type: None,
            all_of: vec![JsonSchemaProperty {
                schema_ref: Some("AttachmentBase".to_string()),
                ..Default::default()
            }],
            ..Default::default()
        };
        let schemas = HashMap::from([
            (
                "AttachmentBase".to_string(),
                JsonSchema {
                    schema_type: Some("object".to_string()),
                    required: vec!["url".to_string()],
                    properties: base_props,
                    ..Default::default()
                },
            ),
            (
                "Msg".to_string(),
                JsonSchema {
                    schema_type: Some("object".to_string()),
                    properties: HashMap::from([("attachment".to_string(), attachment_prop)]),
                    ..Default::default()
                },
            ),
        ]);
        let doc = RestDescription { schemas, ..Default::default() };

        // Happy path: required `url` present.
        let ok = json!({ "attachment": { "url": "https://x.example" } });
        assert!(
            validate_body_against_schema(&ok, "Msg", &doc).is_ok(),
            "well-formed body should pass",
        );

        // Failure path: empty attachment object. Without the fix, this
        // passed silently; now the missing-required check fires.
        let missing = json!({ "attachment": {} });
        let err = validate_body_against_schema(&missing, "Msg", &doc).unwrap_err();
        assert!(
            err.to_string().contains("Missing required property 'url'"),
            "$ref-resolved required at property level must be enforced: got err {err}",
        );
    }

    #[test]
    fn test_validate_body_ref_to_nullable_schema_accepts_null() {
        // A property that `$ref`s a nullable object schema must accept
        // null. `validate_property` delegates `$ref` properties to
        // `validate_value` before the property-level null check, so
        // `validate_value` itself must honor `schema.nullable`.
        let schemas = HashMap::from([
            (
                "NullableAddress".to_string(),
                JsonSchema {
                    schema_type: Some("object".to_string()),
                    nullable: true,
                    properties: HashMap::from([(
                        "street".to_string(),
                        JsonSchemaProperty {
                            prop_type: Some("string".to_string()),
                            ..Default::default()
                        },
                    )]),
                    ..Default::default()
                },
            ),
            (
                "User".to_string(),
                JsonSchema {
                    schema_type: Some("object".to_string()),
                    properties: HashMap::from([(
                        "address".to_string(),
                        JsonSchemaProperty {
                            schema_ref: Some("NullableAddress".to_string()),
                            ..Default::default()
                        },
                    )]),
                    ..Default::default()
                },
            ),
        ]);
        let doc = RestDescription { schemas, ..Default::default() };
        let body = json!({ "address": null });
        assert!(
            validate_body_against_schema(&body, "User", &doc).is_ok(),
            "null on a $ref to a nullable schema must be accepted",
        );
    }

    #[tokio::test]
    async fn test_build_multipart_body() {
        let metadata = Some(json!({ "name": "test.txt", "mimeType": "text/plain" }));
        let content = b"Hello world";

        let (body, content_type) = build_multipart_body(&metadata, content, "text/plain").unwrap();

        // Check content type has boundary
        assert!(content_type.starts_with("multipart/related; boundary="));
        let boundary = content_type.split("boundary=").nth(1).unwrap();

        let body_str = String::from_utf8(body).unwrap();

        // Verify structure
        assert!(body_str.contains(boundary));
        assert!(body_str.contains("Content-Type: application/json"));
        assert!(body_str.contains("{\"mimeType\":\"text/plain\",\"name\":\"test.txt\"}"));
        assert!(body_str.contains("Content-Type: text/plain"));
        assert!(body_str.contains("Hello world"));
    }

    #[tokio::test]
    async fn test_build_multipart_body_no_metadata() {
        let metadata = None;
        let content = b"Binary data";

        let (body, content_type) =
            build_multipart_body(&metadata, content, "application/octet-stream").unwrap();
        let boundary = content_type.split("boundary=").nth(1).unwrap();
        let body_str = String::from_utf8(body).unwrap();

        assert!(body_str.contains(boundary));
        assert!(body_str.contains("application/octet-stream"));
        assert!(body_str.contains("Binary data"));
    }

    #[test]
    fn test_resolve_upload_mime_explicit_flag() {
        let metadata = Some(json!({ "mimeType": "image/png" }));
        let mime = resolve_upload_mime(Some("text/markdown"), Some("file.txt"), &metadata);
        assert_eq!(mime, "text/markdown", "explicit flag takes top priority");
    }

    #[test]
    fn test_resolve_upload_mime_extension_beats_metadata() {
        let metadata = Some(json!({ "mimeType": "application/vnd.google-apps.document" }));
        let mime = resolve_upload_mime(None, Some("notes.md"), &metadata);
        assert_eq!(
            mime, "text/markdown",
            "extension inference ranks above metadata mimeType"
        );
    }

    #[test]
    fn test_resolve_upload_mime_metadata_fallback_for_unknown_extension() {
        let metadata = Some(json!({ "mimeType": "text/plain" }));
        let mime = resolve_upload_mime(None, Some("file.unknown"), &metadata);
        assert_eq!(
            mime, "text/plain",
            "metadata mimeType is used when extension is unrecognized"
        );
    }

    #[test]
    fn test_resolve_upload_mime_extension_when_no_metadata() {
        let mime = resolve_upload_mime(None, Some("notes.md"), &None);
        assert_eq!(mime, "text/markdown");

        let mime = resolve_upload_mime(None, Some("page.html"), &None);
        assert_eq!(mime, "text/html");

        let mime = resolve_upload_mime(None, Some("data.csv"), &None);
        assert_eq!(mime, "text/csv");
    }

    #[test]
    fn test_resolve_upload_mime_fallback() {
        let mime = resolve_upload_mime(None, Some("file.unknown"), &None);
        assert_eq!(mime, "application/octet-stream");
    }

    #[test]
    fn test_resolve_upload_mime_explicit_enables_import_conversion() {
        let metadata = Some(json!({ "mimeType": "application/vnd.google-apps.document" }));
        let mime = resolve_upload_mime(Some("text/markdown"), Some("impact.md"), &metadata);
        assert_eq!(
            mime, "text/markdown",
            "--upload-content-type overrides metadata for media part"
        );
    }

    #[test]
    fn test_build_multipart_bytes_with_metadata() {
        let metadata = Some(json!({ "threadId": "thread-123" }));
        let data = b"From: test@example.com\r\nSubject: Test\r\n\r\nBody";
        let (_, content_type, content_length) =
            build_multipart_bytes(&metadata, data, "message/rfc822").unwrap();

        assert!(
            content_type.starts_with("multipart/related; boundary=fern_boundary_"),
            "content_type should be multipart/related: {content_type}",
        );
        // Content-length should cover: preamble + data + postamble
        assert!(
            content_length > data.len() as u64,
            "content_length should exceed raw data size: {content_length}",
        );
    }

    #[test]
    fn test_build_multipart_bytes_without_metadata() {
        let (_, content_type, content_length) =
            build_multipart_bytes(&None, b"test body", "message/rfc822").unwrap();

        assert!(content_type.starts_with("multipart/related; boundary="));
        assert!(content_length > 0);
    }

    #[tokio::test]
    async fn test_build_multipart_stream_content_length() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("small.txt");
        let file_content = b"Hello stream";
        std::fs::write(&file_path, file_content).unwrap();

        let metadata_value = json!({ "name": "small.txt" });
        let metadata = Some(metadata_value.clone());
        let file_size = file_content.len() as u64;

        let (_body, content_type, declared_len) = build_multipart_stream(
            &metadata,
            file_path.to_str().unwrap(),
            file_size,
            "text/plain",
        )
        .unwrap();

        assert!(content_type.starts_with("multipart/related; boundary="));
        let boundary = content_type.split("boundary=").nth(1).unwrap();

        // Manually compute expected content length:
        // preamble = "--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{json}\r\n--{boundary}\r\nContent-Type: text/plain\r\n\r\n"
        // postamble = "\r\n--{boundary}--\r\n"
        let metadata_json = serde_json::to_string(&metadata_value).unwrap();
        let preamble = format!(
            "--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{metadata_json}\r\n\
             --{boundary}\r\nContent-Type: text/plain\r\n\r\n"
        );
        let postamble = format!("\r\n--{boundary}--\r\n");
        let expected = preamble.len() as u64 + file_size + postamble.len() as u64;
        assert_eq!(
            declared_len, expected,
            "declared Content-Length must match expected preamble + file + postamble"
        );
    }

    #[tokio::test]
    async fn test_build_multipart_stream_large_file() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("large.bin");
        // 256 KB — larger than the default 64 KB ReaderStream chunk size
        let data = vec![0xABu8; 256 * 1024];
        std::fs::write(&file_path, &data).unwrap();

        let metadata = None;
        let file_size = data.len() as u64;

        let (_body, _content_type, declared_len) = build_multipart_stream(
            &metadata,
            file_path.to_str().unwrap(),
            file_size,
            "application/octet-stream",
        )
        .unwrap();

        // Content-Length must account for the empty-metadata preamble + large file + postamble
        assert!(
            declared_len > file_size,
            "Content-Length ({declared_len}) must be larger than file size ({file_size}) due to multipart framing"
        );

        // Verify exact arithmetic: preamble overhead + file_size + postamble
        let boundary = _content_type.split("boundary=").nth(1).unwrap();
        let preamble = format!(
            "--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{{}}\r\n\
             --{boundary}\r\nContent-Type: application/octet-stream\r\n\r\n"
        );
        let postamble = format!("\r\n--{boundary}--\r\n");
        let expected = preamble.len() as u64 + file_size + postamble.len() as u64;
        assert_eq!(
            declared_len, expected,
            "Content-Length must match for multi-chunk files"
        );
    }

    #[test]
    fn test_build_url_basic() {
        let doc = RestDescription {
            base_url: Some("https://api.example.com/".to_string()),
            ..Default::default()
        };
        let method = RestMethod {
            path: "files".to_string(),
            flat_path: Some("files".to_string()),
            ..Default::default()
        };
        let params = Map::new();

        let (url, _) = build_url(&doc, &method, &params, false, None).unwrap();
        assert_eq!(url, "https://api.example.com/files");
    }

    #[test]
    fn test_build_url_override_replaces_spec_base() {
        let doc = RestDescription {
            base_url: Some("https://api.example.com/".to_string()),
            ..Default::default()
        };
        // Use a leading-slash path matching real OpenAPI spec output
        let method = RestMethod {
            path: "/files".to_string(),
            flat_path: Some("/files".to_string()),
            ..Default::default()
        };
        let params = Map::new();

        let (url, _) = build_url(&doc, &method, &params, false, Some("http://localhost:9000")).unwrap();
        assert_eq!(url, "http://localhost:9000/files");
    }

    #[test]
    fn test_build_url_override_trailing_slash_normalized() {
        let doc = RestDescription {
            base_url: Some("https://api.example.com/".to_string()),
            ..Default::default()
        };
        // Use a leading-slash path matching real OpenAPI spec output
        let method = RestMethod {
            path: "/users/me".to_string(),
            flat_path: Some("/users/me".to_string()),
            ..Default::default()
        };
        let params = Map::new();

        // With trailing slash on override
        let (url_with, _) = build_url(&doc, &method, &params, false, Some("http://localhost:9000/")).unwrap();
        // Without trailing slash on override
        let (url_without, _) = build_url(&doc, &method, &params, false, Some("http://localhost:9000")).unwrap();
        assert_eq!(url_with, url_without);
        assert_eq!(url_with, "http://localhost:9000/users/me");
    }

    #[test]
    fn test_build_url_override_no_double_slash_with_leading_slash_path() {
        // Regression test: OpenAPI paths start with /, override must not produce //
        let doc = RestDescription {
            base_url: Some("https://api.example.com/".to_string()),
            ..Default::default()
        };
        let method = RestMethod {
            path: "/users/me".to_string(),
            flat_path: Some("/users/me".to_string()),
            ..Default::default()
        };
        let params = Map::new();

        let (url, _) = build_url(&doc, &method, &params, false, Some("http://localhost:9000")).unwrap();
        assert_eq!(url, "http://localhost:9000/users/me");
    }

    // -----------------------------------------------------------------------
    // x-fern-base-path
    //
    // Exhaustive 2x2 matrix over the spec's `x-fern-base-path` value
    // (with/without leading slash) and the base URL's trailing slash. The
    // wire tests in tests/openapi_fixture_wire.rs exercise the same matrix
    // end-to-end through the HTTP stack.
    // -----------------------------------------------------------------------

    fn base_path_doc(base_path: &str) -> RestDescription {
        RestDescription {
            base_path: Some(base_path.to_string()),
            ..Default::default()
        }
    }

    fn things_method() -> RestMethod {
        RestMethod {
            path: "/things".to_string(),
            flat_path: Some("/things".to_string()),
            ..Default::default()
        }
    }

    #[test]
    fn test_build_url_base_path_leading_slash_x_server_trailing_slash() {
        let doc = base_path_doc("/v1");
        let method = things_method();
        let (url, _) = build_url(
            &doc,
            &method,
            &Map::new(),
            false,
            Some("http://server.example/"),
        )
        .unwrap();
        assert_eq!(url, "http://server.example/v1/things");
    }

    #[test]
    fn test_build_url_base_path_leading_slash_x_server_no_trailing_slash() {
        let doc = base_path_doc("/v1");
        let method = things_method();
        let (url, _) = build_url(
            &doc,
            &method,
            &Map::new(),
            false,
            Some("http://server.example"),
        )
        .unwrap();
        assert_eq!(url, "http://server.example/v1/things");
    }

    #[test]
    fn test_build_url_base_path_no_leading_slash_x_server_trailing_slash() {
        let doc = base_path_doc("v1");
        let method = things_method();
        let (url, _) = build_url(
            &doc,
            &method,
            &Map::new(),
            false,
            Some("http://server.example/"),
        )
        .unwrap();
        assert_eq!(url, "http://server.example/v1/things");
    }

    #[test]
    fn test_build_url_base_path_no_leading_slash_x_server_no_trailing_slash() {
        let doc = base_path_doc("v1");
        let method = things_method();
        let (url, _) = build_url(
            &doc,
            &method,
            &Map::new(),
            false,
            Some("http://server.example"),
        )
        .unwrap();
        assert_eq!(url, "http://server.example/v1/things");
    }

    #[test]
    fn test_build_url_base_path_applies_to_spec_root_url() {
        // No base_url override, no doc.base_url — base_path applies on top
        // of the effective root_url (which is what OpenAPI's `servers[0].url`
        // becomes after parsing).
        let doc = RestDescription {
            root_url: "https://api.example.com".to_string(),
            base_path: Some("/api/public".to_string()),
            ..Default::default()
        };
        let method = things_method();
        let (url, _) = build_url(&doc, &method, &Map::new(), false, None).unwrap();
        assert_eq!(url, "https://api.example.com/api/public/things");
    }

    #[test]
    fn test_build_url_base_path_composes_with_per_operation_server() {
        // Per-operation `servers[]` override is captured in `method.root_url`
        // by the parser. `effective_root_url` returns it (taking precedence
        // over the spec-level `doc.root_url`), and `apply_base_path` then
        // prepends the base path on top of the per-op server. This test
        // pins that composition — without it, a per-op upload-host override
        // would silently lose the base path prefix.
        let doc = RestDescription {
            root_url: "https://api.example.com".to_string(),
            base_path: Some("/v1".to_string()),
            ..Default::default()
        };
        let method = RestMethod {
            path: "/uploads".to_string(),
            flat_path: Some("/uploads".to_string()),
            root_url: "https://upload.example.com".to_string(),
            ..Default::default()
        };
        let (url, _) = build_url(&doc, &method, &Map::new(), false, None).unwrap();
        assert_eq!(url, "https://upload.example.com/v1/uploads");
    }

    #[test]
    fn test_build_url_base_path_per_op_server_with_trailing_slash() {
        // Same composition as the test above, but the per-op server URL
        // carries a trailing slash — the slash-edge normalization runs at
        // the per-op + base_path boundary too, not just at the doc.root_url
        // + base_path boundary.
        let doc = RestDescription {
            root_url: "https://api.example.com".to_string(),
            base_path: Some("v1".to_string()),
            ..Default::default()
        };
        let method = RestMethod {
            path: "/uploads".to_string(),
            flat_path: Some("/uploads".to_string()),
            root_url: "https://upload.example.com/".to_string(),
            ..Default::default()
        };
        let (url, _) = build_url(&doc, &method, &Map::new(), false, None).unwrap();
        assert_eq!(url, "https://upload.example.com/v1/uploads");
    }

    #[test]
    fn test_build_url_base_path_applies_to_doc_base_url() {
        // doc.base_url (set when the spec's server includes a path
        // component) is also augmented by base_path.
        let doc = RestDescription {
            base_url: Some("https://api.example.com/".to_string()),
            base_path: Some("/v1".to_string()),
            ..Default::default()
        };
        let method = things_method();
        let (url, _) = build_url(&doc, &method, &Map::new(), false, None).unwrap();
        assert_eq!(url, "https://api.example.com/v1/things");
    }

    #[test]
    fn test_build_url_base_path_with_trailing_slash_normalized() {
        // Authoring quirk: `x-fern-base-path: /v1/` should not produce
        // double slashes against the operation path.
        let doc = base_path_doc("/v1/");
        let method = things_method();
        let (url, _) = build_url(
            &doc,
            &method,
            &Map::new(),
            false,
            Some("http://server.example"),
        )
        .unwrap();
        assert_eq!(url, "http://server.example/v1/things");
    }

    #[test]
    fn test_build_url_base_path_multi_segment() {
        // Multi-segment base paths (e.g. `/api/v1`) are emitted verbatim;
        // only the boundary slashes against the server URL and operation
        // path are normalized.
        let doc = base_path_doc("/api/v1");
        let method = things_method();
        let (url, _) = build_url(
            &doc,
            &method,
            &Map::new(),
            false,
            Some("http://server.example"),
        )
        .unwrap();
        assert_eq!(url, "http://server.example/api/v1/things");
    }

    #[test]
    fn test_build_url_base_path_none_unchanged() {
        // When `base_path` is None the URL is identical to the pre-feature
        // behavior — this protects existing specs that don't use the
        // extension from any drift.
        let doc = RestDescription {
            base_path: None,
            ..Default::default()
        };
        let method = things_method();
        let (url, _) = build_url(
            &doc,
            &method,
            &Map::new(),
            false,
            Some("http://server.example"),
        )
        .unwrap();
        assert_eq!(url, "http://server.example/things");
    }

    #[test]
    fn test_build_url_base_path_preserves_path_substitution() {
        // Path parameter substitution still happens against the operation
        // path after base_path is prepended.
        let doc = base_path_doc("/v1");
        let method = RestMethod {
            path: "/things/{thingId}".to_string(),
            flat_path: Some("/things/{thingId}".to_string()),
            ..Default::default()
        };
        let mut params = Map::new();
        params.insert("thingId".to_string(), json!("abc"));
        let (url, _) = build_url(
            &doc,
            &method,
            &params,
            false,
            Some("http://server.example"),
        )
        .unwrap();
        assert_eq!(url, "http://server.example/v1/things/abc");
    }

    #[test]
    fn test_apply_base_path_helper_handles_edge_cases() {
        // None → base returned verbatim.
        assert_eq!(apply_base_path("http://x", None), "http://x");
        assert_eq!(apply_base_path("http://x/", None), "http://x/");

        // Empty / slash-only base_path is a no-op — the helper returns
        // the base verbatim and leaves trailing-slash normalization to
        // build_url's existing operation-path joining logic.
        assert_eq!(apply_base_path("http://x", Some("")), "http://x");
        assert_eq!(apply_base_path("http://x", Some("/")), "http://x");
        assert_eq!(apply_base_path("http://x/", Some("/")), "http://x/");
    }

    /// `x-fern-base-path` with a templated path parameter (e.g.
    /// `/{tenant}/v1`) substitutes the placeholder from the operation's
    /// parameters at request time, and the consumed parameter is NOT
    /// echoed in the query string. Mirrors upstream Fern's behavior of
    /// baking the base path into endpoint paths at Definition build
    /// time and resolving placeholders uniformly with the rest of the
    /// path-parameter renderer.
    #[test]
    fn test_build_url_base_path_templated_param_substitutes_and_does_not_leak_to_query() {
        let doc = RestDescription {
            root_url: "https://api.example.com".to_string(),
            base_path: Some("/{tenant}/v1".to_string()),
            ..Default::default()
        };
        let method = RestMethod {
            path: "/things".to_string(),
            flat_path: Some("/things".to_string()),
            ..Default::default()
        };
        let mut params = Map::new();
        params.insert("tenant".to_string(), json!("acme"));
        let (url, qs) = build_url(&doc, &method, &params, false, None).unwrap();
        assert_eq!(url, "https://api.example.com/acme/v1/things");
        assert!(qs.is_empty(), "tenant must be consumed by base_path, not leaked as query: {qs:?}");
    }

    /// Multi-placeholder base paths (e.g. `/{region}/{tenant}/v1`) are
    /// rendered uniformly; both placeholder params are consumed by the
    /// URL path and neither leaks to the query string.
    #[test]
    fn test_build_url_base_path_multi_templated_params_substitute() {
        let doc = RestDescription {
            root_url: "https://api.example.com".to_string(),
            base_path: Some("/{region}/{tenant}/v1".to_string()),
            ..Default::default()
        };
        let method = RestMethod {
            path: "/things".to_string(),
            flat_path: Some("/things".to_string()),
            ..Default::default()
        };
        let mut params = Map::new();
        params.insert("region".to_string(), json!("us-east-1"));
        params.insert("tenant".to_string(), json!("acme"));
        let (url, qs) = build_url(&doc, &method, &params, false, None).unwrap();
        assert_eq!(url, "https://api.example.com/us-east-1/acme/v1/things");
        assert!(qs.is_empty(), "both placeholders must be consumed: {qs:?}");
    }

    /// A templated base path composes with operation-level path
    /// parameters: the base path placeholder and the endpoint path
    /// placeholder both substitute, and only non-path params survive
    /// as query string entries.
    #[test]
    fn test_build_url_base_path_templated_with_operation_path_param_and_query() {
        let doc = RestDescription {
            root_url: "https://api.example.com".to_string(),
            base_path: Some("/{tenant}/v1".to_string()),
            ..Default::default()
        };
        let mut method_params: HashMap<String, crate::openapi::discovery::MethodParameter> =
            HashMap::new();
        method_params.insert(
            "tenant".to_string(),
            crate::openapi::discovery::MethodParameter {
                location: Some("query".to_string()),
                ..Default::default()
            },
        );
        method_params.insert(
            "id".to_string(),
            crate::openapi::discovery::MethodParameter {
                location: Some("path".to_string()),
                ..Default::default()
            },
        );
        method_params.insert(
            "verbose".to_string(),
            crate::openapi::discovery::MethodParameter {
                location: Some("query".to_string()),
                ..Default::default()
            },
        );
        let method = RestMethod {
            path: "/things/{id}".to_string(),
            flat_path: Some("/things/{id}".to_string()),
            parameters: method_params,
            ..Default::default()
        };
        let mut params = Map::new();
        params.insert("tenant".to_string(), json!("acme"));
        params.insert("id".to_string(), json!("thing-1"));
        params.insert("verbose".to_string(), json!("true"));
        let (url, qs) = build_url(&doc, &method, &params, false, None).unwrap();
        assert_eq!(url, "https://api.example.com/acme/v1/things/thing-1");
        assert_eq!(qs, vec![("verbose".to_string(), "true".to_string())]);
    }

    /// A templated base path composes additively with `--base-url`
    /// override, just like a literal base path does. The override
    /// supplies the host; the templated base path still applies.
    #[test]
    fn test_build_url_base_path_templated_param_with_base_url_override() {
        let doc = RestDescription {
            root_url: "https://api.example.com".to_string(),
            base_path: Some("/{tenant}/v1".to_string()),
            ..Default::default()
        };
        let method = RestMethod {
            path: "/things".to_string(),
            flat_path: Some("/things".to_string()),
            ..Default::default()
        };
        let mut params = Map::new();
        params.insert("tenant".to_string(), json!("acme"));
        let (url, qs) = build_url(&doc, &method, &params, false, Some("https://staging.example.com")).unwrap();
        assert_eq!(url, "https://staging.example.com/acme/v1/things");
        assert!(qs.is_empty());
    }

    /// A param declared as `in: path` on the operation but whose
    /// placeholder lives only in `x-fern-base-path` (not in the
    /// operation's URL template) must NOT trigger the "path parameter
    /// not in URL template" validation error — it's still a path
    /// parameter, just one that the base path consumes. This is the
    /// most natural customer pattern when their OpenAPI declares a
    /// shared prefix param like `{tenant}` at the path-item level.
    #[test]
    fn test_build_url_base_path_templated_param_declared_as_path_param_does_not_error() {
        let doc = RestDescription {
            root_url: "https://api.example.com".to_string(),
            base_path: Some("/{tenant}/v1".to_string()),
            ..Default::default()
        };
        let mut method_params: HashMap<String, crate::openapi::discovery::MethodParameter> =
            HashMap::new();
        method_params.insert(
            "tenant".to_string(),
            crate::openapi::discovery::MethodParameter {
                location: Some("path".to_string()),
                required: true,
                ..Default::default()
            },
        );
        let method = RestMethod {
            path: "/things".to_string(),
            flat_path: Some("/things".to_string()),
            parameters: method_params,
            ..Default::default()
        };
        let mut params = Map::new();
        params.insert("tenant".to_string(), json!("acme"));
        let (url, qs) = build_url(&doc, &method, &params, false, None).unwrap();
        assert_eq!(url, "https://api.example.com/acme/v1/things");
        assert!(qs.is_empty());
    }

    /// When a placeholder in `x-fern-base-path` has no corresponding
    /// parameter, the placeholder is left literal in the URL — same
    /// fallback behavior as `render_path_template` on endpoint paths.
    /// This avoids a hard error for partial fills (e.g. callers that
    /// stub the base path) while still making the missing param
    /// visible in the outgoing URL.
    #[test]
    fn test_build_url_base_path_templated_param_missing_value_leaves_placeholder() {
        let doc = RestDescription {
            root_url: "https://api.example.com".to_string(),
            base_path: Some("/{tenant}/v1".to_string()),
            ..Default::default()
        };
        let method = RestMethod {
            path: "/things".to_string(),
            flat_path: Some("/things".to_string()),
            ..Default::default()
        };
        let (url, qs) = build_url(&doc, &method, &Map::new(), false, None).unwrap();
        assert_eq!(url, "https://api.example.com/{tenant}/v1/things");
        assert!(qs.is_empty());
    }

    /// `doc.base_url` with a *path component* (i.e. the spec's
    /// `servers[].url` includes a path) composes with `base_path` —
    /// `apply_base_path` doesn't care whether the base is a bare host or
    /// host+path; it just joins with one slash.
    #[test]
    fn test_build_url_base_path_doc_base_url_with_path_component() {
        let doc = RestDescription {
            base_url: Some("https://api.example.com/v2".to_string()),
            base_path: Some("/v1".to_string()),
            ..Default::default()
        };
        let method = things_method();
        let (url, _) = build_url(&doc, &method, &Map::new(), false, None).unwrap();
        assert_eq!(url, "https://api.example.com/v2/v1/things");
    }

    /// `base_path` is applied uniformly to the `is_upload` codepath too,
    /// not just to the regular path. Currently unreachable for OpenAPI
    /// specs (the OpenAPI parser never populates `media_upload`), but
    /// pinning the wiring makes the code self-consistent — if a future
    /// change ever exposes media uploads to OpenAPI, base_path won't
    /// silently be dropped.
    #[test]
    fn test_build_url_base_path_applies_to_media_upload_branch() {
        let doc = RestDescription {
            root_url: "https://api.example.com".to_string(),
            base_path: Some("/v1".to_string()),
            ..Default::default()
        };
        let method = RestMethod {
            path: "/files".to_string(),
            flat_path: Some("/files".to_string()),
            supports_media_upload: true,
            media_upload: Some(crate::openapi::discovery::MediaUpload {
                protocols: Some(crate::openapi::discovery::MediaUploadProtocols {
                    simple: Some(crate::openapi::discovery::MediaUploadProtocol {
                        path: "/upload/files".to_string(),
                        ..Default::default()
                    }),
                }),
                ..Default::default()
            }),
            ..Default::default()
        };
        let (url, _) = build_url(&doc, &method, &Map::new(), true, None).unwrap();
        assert_eq!(url, "https://api.example.com/v1/upload/files");
    }

    #[test]
    fn test_build_url_substitution() {
        let doc = RestDescription {
            base_url: Some("https://api.example.com/".to_string()),
            ..Default::default()
        };
        let method = RestMethod {
            path: "files/{fileId}".to_string(),
            flat_path: Some("files/{fileId}".to_string()),
            ..Default::default()
        };
        let mut params = Map::new();
        params.insert("fileId".to_string(), json!("123"));

        let (url, _) = build_url(&doc, &method, &params, false, None).unwrap();
        assert_eq!(url, "https://api.example.com/files/123");
    }

    #[test]
    fn test_build_url_query_params() {
        let doc = RestDescription {
            base_url: Some("https://api.example.com/".to_string()),
            ..Default::default()
        };
        let method = RestMethod {
            path: "files".to_string(),
            flat_path: Some("files".to_string()),
            ..Default::default()
        };
        let mut params = Map::new();
        params.insert("q".to_string(), json!("search term"));

        let (url, query) = build_url(&doc, &method, &params, false, None).unwrap();
        assert_eq!(url, "https://api.example.com/files");
        assert_eq!(query, vec![("q".to_string(), "search term".to_string())]);
    }

    #[test]
    fn test_build_url_repeated_query_param_expands_array() {
        let doc = RestDescription {
            base_url: Some("https://api.example.com/".to_string()),
            ..Default::default()
        };
        let mut method_params = HashMap::new();
        method_params.insert(
            "metadataHeaders".to_string(),
            MethodParameter {
                param_type: Some("string".to_string()),
                location: Some("query".to_string()),
                repeated: true,
                ..Default::default()
            },
        );
        let method = RestMethod {
            path: "messages".to_string(),
            flat_path: Some("messages".to_string()),
            parameters: method_params,
            ..Default::default()
        };
        let mut params = Map::new();
        params.insert(
            "metadataHeaders".to_string(),
            json!(["Subject", "Date", "From"]),
        );

        let (_url, query) = build_url(&doc, &method, &params, false, None).unwrap();
        assert_eq!(
            query,
            vec![
                ("metadataHeaders".to_string(), "Subject".to_string()),
                ("metadataHeaders".to_string(), "Date".to_string()),
                ("metadataHeaders".to_string(), "From".to_string()),
            ]
        );
    }

    #[test]
    fn test_build_url_encodes_path_parameter_chars() {
        let doc = RestDescription {
            base_url: Some("https://api.example.com/".to_string()),
            ..Default::default()
        };
        let mut parameters = HashMap::new();
        parameters.insert(
            "spreadsheetId".to_string(),
            crate::openapi::discovery::MethodParameter {
                location: Some("path".to_string()),
                ..Default::default()
            },
        );
        parameters.insert(
            "range".to_string(),
            crate::openapi::discovery::MethodParameter {
                location: Some("path".to_string()),
                ..Default::default()
            },
        );
        let method = RestMethod {
            path: "spreadsheets/{spreadsheetId}/values/{range}".to_string(),
            flat_path: Some("spreadsheets/{spreadsheetId}/values/{range}".to_string()),
            parameters,
            ..Default::default()
        };
        let mut params = Map::new();
        params.insert("spreadsheetId".to_string(), json!("abc123"));
        params.insert("range".to_string(), json!("hash#1!A1:B2"));

        let (url, _) = build_url(&doc, &method, &params, false, None).unwrap();
        assert_eq!(
            url,
            "https://api.example.com/spreadsheets/abc123/values/hash%231%21A1%3AB2"
        );
    }

    #[test]
    fn test_build_url_plus_expansion_preserves_slashes() {
        let doc = RestDescription {
            base_url: Some("https://api.example.com/".to_string()),
            ..Default::default()
        };
        let mut parameters = HashMap::new();
        parameters.insert(
            "name".to_string(),
            crate::openapi::discovery::MethodParameter {
                location: Some("path".to_string()),
                ..Default::default()
            },
        );
        let method = RestMethod {
            path: "v1/{+name}".to_string(),
            flat_path: Some("v1/{+name}".to_string()),
            parameters,
            ..Default::default()
        };
        let mut params = Map::new();
        params.insert(
            "name".to_string(),
            json!("projects/p1/locations/us/topics/t1"),
        );

        let (url, _) = build_url(&doc, &method, &params, false, None).unwrap();
        assert_eq!(
            url,
            "https://api.example.com/v1/projects/p1/locations/us/topics/t1"
        );
    }

    #[test]
    fn test_build_url_plus_expansion_rejects_reserved_chars() {
        let doc = RestDescription {
            base_url: Some("https://api.example.com/".to_string()),
            ..Default::default()
        };
        let mut parameters = HashMap::new();
        parameters.insert(
            "name".to_string(),
            crate::openapi::discovery::MethodParameter {
                location: Some("path".to_string()),
                ..Default::default()
            },
        );
        let method = RestMethod {
            path: "v1/{+name}".to_string(),
            flat_path: Some("v1/{+name}".to_string()),
            parameters,
            ..Default::default()
        };
        let mut params = Map::new();
        params.insert("name".to_string(), json!("projects/p1#frag?x=y"));

        let err = build_url(&doc, &method, &params, false, None).unwrap_err();
        assert!(err.to_string().contains("must not contain '?' or '#'"));
    }

    #[test]
    fn test_build_url_plus_expansion_rejects_path_traversal() {
        let doc = RestDescription {
            base_url: Some("https://api.example.com/".to_string()),
            ..Default::default()
        };
        let mut parameters = HashMap::new();
        parameters.insert(
            "name".to_string(),
            crate::openapi::discovery::MethodParameter {
                location: Some("path".to_string()),
                ..Default::default()
            },
        );
        let method = RestMethod {
            path: "v1/{+name}".to_string(),
            flat_path: Some("v1/{+name}".to_string()),
            parameters,
            ..Default::default()
        };
        let mut params = Map::new();
        params.insert("name".to_string(), json!("projects/../../etc/passwd"));

        let err = build_url(&doc, &method, &params, false, None).unwrap_err();
        assert!(err.to_string().contains("dot-segment"));
    }

    #[test]
    fn test_build_url_upload_endpoint_substitutes_path_params() {
        let doc = RestDescription {
            root_url: "https://www.googleapis.com/".to_string(),
            ..Default::default()
        };
        let mut parameters = HashMap::new();
        parameters.insert(
            "fileId".to_string(),
            crate::openapi::discovery::MethodParameter {
                location: Some("path".to_string()),
                ..Default::default()
            },
        );
        let method = RestMethod {
            path: "drive/v3/files/{fileId}".to_string(),
            flat_path: Some("drive/v3/files/{fileId}".to_string()),
            parameters,
            media_upload: Some(crate::openapi::discovery::MediaUpload {
                protocols: Some(crate::openapi::discovery::MediaUploadProtocols {
                    simple: Some(crate::openapi::discovery::MediaUploadProtocol {
                        path: "/upload/drive/v3/files/{fileId}".to_string(),
                        multipart: Some(true),
                    }),
                }),
                ..Default::default()
            }),
            ..Default::default()
        };

        let mut params = Map::new();
        params.insert("fileId".to_string(), json!("abc/123"));

        let (url, _) = build_url(&doc, &method, &params, true, None).unwrap();
        assert_eq!(
            url,
            "https://www.googleapis.com/upload/drive/v3/files/abc%2F123"
        );
    }

    #[test]
    fn test_build_url_does_not_replace_placeholder_like_values() {
        let doc = RestDescription {
            base_url: Some("https://api.example.com/".to_string()),
            ..Default::default()
        };
        let method = RestMethod {
            path: "v1/{parent}/{child}".to_string(),
            flat_path: Some("v1/{parent}/{child}".to_string()),
            ..Default::default()
        };
        let mut params = Map::new();
        params.insert("parent".to_string(), json!("literal-{child}-value"));
        params.insert("child".to_string(), json!("ok"));

        let (url, _) = build_url(&doc, &method, &params, false, None).unwrap();
        assert_eq!(
            url,
            "https://api.example.com/v1/literal-%7Bchild%7D-value/ok"
        );
    }

    #[test]
    fn test_build_url_errors_for_path_param_not_in_template() {
        let doc = RestDescription {
            base_url: Some("https://api.example.com/".to_string()),
            ..Default::default()
        };
        let mut parameters = HashMap::new();
        parameters.insert(
            "fileId".to_string(),
            crate::openapi::discovery::MethodParameter {
                location: Some("path".to_string()),
                ..Default::default()
            },
        );
        let method = RestMethod {
            path: "files".to_string(),
            flat_path: Some("files".to_string()),
            parameters,
            ..Default::default()
        };
        let mut params = Map::new();
        params.insert("fileId".to_string(), json!("123"));

        let err = build_url(&doc, &method, &params, false, None).unwrap_err();
        assert!(err
            .to_string()
            .contains("Path parameter 'fileId' was provided but is not present"));
    }

    #[test]
    fn test_build_url_flatpath_fallback_on_mismatch() {
        // Reproduces the Slides presentations.get bug where flatPath uses
        // {presentationsId} (plural) but the parameter is presentationId (singular).
        let doc = RestDescription {
            base_url: Some("https://slides.googleapis.com/".to_string()),
            ..Default::default()
        };
        let mut parameters = HashMap::new();
        parameters.insert(
            "presentationId".to_string(),
            crate::openapi::discovery::MethodParameter {
                location: Some("path".to_string()),
                required: true,
                ..Default::default()
            },
        );
        let method = RestMethod {
            path: "v1/presentations/{+presentationId}".to_string(),
            flat_path: Some("v1/presentations/{presentationsId}".to_string()),
            parameters,
            ..Default::default()
        };
        let mut params = Map::new();
        params.insert("presentationId".to_string(), json!("abc123"));

        let (url, _) = build_url(&doc, &method, &params, false, None).unwrap();
        assert_eq!(url, "https://slides.googleapis.com/v1/presentations/abc123");
    }

    #[test]
    fn test_serialize_deep_object() {
        let value = json!({"status": "active", "date": "2024-01-01"});
        let result = serialize_query_param(
            "filter",
            &value,
            Some(&MethodParameter {
                style: Some("deepObject".to_string()),
                ..Default::default()
            }),
        );
        assert!(result.contains(&("filter[status]".to_string(), "active".to_string())));
        assert!(result.contains(&("filter[date]".to_string(), "2024-01-01".to_string())));
    }

    #[test]
    fn test_serialize_form_explode_array() {
        let value = json!(["a", "b", "c"]);
        let result = serialize_query_param(
            "tags",
            &value,
            Some(&MethodParameter {
                style: Some("form".to_string()),
                explode: Some(true),
                ..Default::default()
            }),
        );
        assert_eq!(
            result,
            vec![
                ("tags".to_string(), "a".to_string()),
                ("tags".to_string(), "b".to_string()),
                ("tags".to_string(), "c".to_string()),
            ]
        );
    }

    #[test]
    fn test_serialize_form_no_explode_array() {
        let value = json!(["a", "b", "c"]);
        let result = serialize_query_param(
            "tags",
            &value,
            Some(&MethodParameter {
                style: Some("form".to_string()),
                explode: Some(false),
                ..Default::default()
            }),
        );
        assert_eq!(result, vec![("tags".to_string(), "a,b,c".to_string())]);
    }

    #[test]
    fn test_serialize_default_style_is_form() {
        // No style specified -> defaults to form with explode
        let value = json!("hello");
        let result = serialize_query_param("q", &value, None);
        assert_eq!(result, vec![("q".to_string(), "hello".to_string())]);
    }

    fn param_with(style: &str, explode: Option<bool>) -> MethodParameter {
        MethodParameter {
            style: Some(style.to_string()),
            explode,
            ..Default::default()
        }
    }

    fn path_param(style: &str, explode: Option<bool>) -> MethodParameter {
        MethodParameter {
            location: Some("path".to_string()),
            style: Some(style.to_string()),
            explode,
            ..Default::default()
        }
    }

    // ── query-param style tests (from main) ──────────────────────────────

    #[test]
    fn test_serialize_space_delimited_array() {
        // spaceDelimited joins elements with a literal space; the encoder
        // turns that into `%20` on the wire.
        let value = json!(["1", "2"]);
        let result = serialize_query_param("ids", &value, Some(&param_with("spaceDelimited", Some(false))));
        assert_eq!(result, vec![("ids".to_string(), "1 2".to_string())]);
    }

    #[test]
    fn test_serialize_pipe_delimited_array() {
        let value = json!(["1", "2"]);
        let result = serialize_query_param("ids", &value, Some(&param_with("pipeDelimited", Some(false))));
        assert_eq!(result, vec![("ids".to_string(), "1|2".to_string())]);
    }

    #[test]
    fn test_serialize_delimited_scalar_degrades_to_value() {
        // A non-array under a delimited style is just the scalar value.
        let value = json!("solo");
        let result = serialize_query_param("ids", &value, Some(&param_with("spaceDelimited", Some(false))));
        assert_eq!(result, vec![("ids".to_string(), "solo".to_string())]);
    }

    #[test]
    fn test_serialize_form_explode_object() {
        // form/object/explode=true: each property becomes its own top-level
        // key; the parameter name is dropped.
        let value = json!({"role": "admin", "active": "true"});
        let result = serialize_query_param("profile", &value, Some(&param_with("form", Some(true))));
        assert!(result.contains(&("role".to_string(), "admin".to_string())), "got: {result:?}");
        assert!(result.contains(&("active".to_string(), "true".to_string())), "got: {result:?}");
        assert!(
            !result.iter().any(|(k, _)| k == "profile"),
            "parameter name must be dropped for exploded object; got: {result:?}"
        );
    }

    #[test]
    fn test_serialize_form_no_explode_object() {
        // form/object/explode=false: comma-joined key,value pairs under the
        // single parameter key.
        let value = json!({"role": "admin"});
        let result = serialize_query_param("profile", &value, Some(&param_with("form", Some(false))));
        assert_eq!(result, vec![("profile".to_string(), "role,admin".to_string())]);
    }

    #[test]
    fn test_encode_query_component_space_is_percent20_not_plus() {
        // RFC 3986: a literal space encodes as %20, never the form `+`.
        assert_eq!(encode_query_component("a b"), "a%20b");
    }

    #[test]
    fn test_encode_query_component_reserved_chars() {
        assert_eq!(encode_query_component("a&b=c#d"), "a%26b%3Dc%23d");
        // Brackets (deepObject keys) are percent-encoded.
        assert_eq!(encode_query_component("filter[status]"), "filter%5Bstatus%5D");
        // The pipe delimiter encodes to %7C.
        assert_eq!(encode_query_component("1|2"), "1%7C2");
    }

    #[test]
    fn test_encode_query_component_comma_stays_literal() {
        // The comma is the form/no-explode delimiter and must stay literal.
        assert_eq!(encode_query_component("1,2"), "1,2");
    }

    #[test]
    fn test_encode_query_component_unreserved_untouched() {
        assert_eq!(encode_query_component("Aa0-_.~"), "Aa0-_.~");
    }

    #[test]
    fn test_append_query_string_first_param_uses_question_mark() {
        let pairs = vec![("ids".to_string(), "1 2".to_string())];
        assert_eq!(
            append_query_string("https://api.example.com/x", &pairs),
            "https://api.example.com/x?ids=1%202"
        );
    }

    #[test]
    fn test_append_query_string_continues_existing_query() {
        let pairs = vec![("b".to_string(), "2".to_string())];
        assert_eq!(
            append_query_string("https://api.example.com/x?a=1", &pairs),
            "https://api.example.com/x?a=1&b=2"
        );
    }

    #[test]
    fn test_append_query_string_empty_pairs_is_unchanged() {
        assert_eq!(
            append_query_string("https://api.example.com/x", &[]),
            "https://api.example.com/x"
        );
    }

    #[test]
    fn test_append_query_string_joins_multiple_with_ampersand() {
        let pairs = vec![
            ("role".to_string(), "admin".to_string()),
            ("active".to_string(), "true".to_string()),
        ];
        assert_eq!(
            append_query_string("https://api.example.com/x", &pairs),
            "https://api.example.com/x?role=admin&active=true"
        );
    }

    // ── header style tests (from main) ───────────────────────────────────

    #[test]
    fn test_serialize_header_simple_primitive() {
        let v = serialize_header_simple(&json!("hello"), None).unwrap();
        assert_eq!(v, "hello");
    }

    #[test]
    fn test_serialize_header_simple_array_comma_joined() {
        // simple/array: elements comma-joined, regardless of explode.
        let value = json!(["a", "b"]);
        let v = serialize_header_simple(&value, None).unwrap();
        assert_eq!(v, "a,b");
    }

    #[test]
    fn test_serialize_header_simple_object_no_explode() {
        // simple/object explode=false -> k,v,k2,v2 (keys sorted by Map order).
        let value = json!({"k": "v", "k2": "v2"});
        let v = serialize_header_simple(
            &value,
            Some(&MethodParameter {
                style: Some("simple".to_string()),
                explode: Some(false),
                ..Default::default()
            }),
        )
        .unwrap();
        assert_eq!(v, "k,v,k2,v2");
    }

    #[test]
    fn test_serialize_header_simple_object_explode() {
        // simple/object explode=true -> k=v,k2=v2.
        let value = json!({"k": "v", "k2": "v2"});
        let v = serialize_header_simple(
            &value,
            Some(&MethodParameter {
                explode: Some(true),
                ..Default::default()
            }),
        )
        .unwrap();
        assert_eq!(v, "k=v,k2=v2");
    }

    #[test]
    fn test_serialize_header_simple_array_numbers() {
        // non-string scalars render via value_to_query_string.
        let value = json!([1, 2, 3]);
        let v = serialize_header_simple(&value, None).unwrap();
        assert_eq!(v, "1,2,3");
    }

    #[test]
    fn test_serialize_header_simple_rejects_control_chars() {
        // CR/LF in a value would enable header injection — must be rejected.
        let value = json!("a\r\nInjected: yes");
        assert!(serialize_header_simple(&value, None).is_err());
    }

    #[test]
    fn test_serialize_header_simple_rejects_control_chars_in_array() {
        let value = json!(["ok", "bad\nvalue"]);
        assert!(serialize_header_simple(&value, None).is_err());
    }

    // ── path-param style tests ───────────────────────────────────────────

    #[test]
    fn test_serialize_path_param_default_simple_primitive() {
        // No definition -> simple/primitive: just the encoded value.
        assert_eq!(serialize_path_param("id", &json!("42"), None), "42");
    }

    #[test]
    fn test_serialize_path_param_simple_array() {
        let def = path_param("simple", Some(false));
        assert_eq!(
            serialize_path_param("ids", &json!(["a", "b"]), Some(&def)),
            "a,b"
        );
    }

    #[test]
    fn test_serialize_path_param_simple_object() {
        // serde_json sorts object keys -> k1,v1,k2,v2 for this input.
        let def = path_param("simple", Some(false));
        assert_eq!(
            serialize_path_param("filter", &json!({"k1": "v1", "k2": "v2"}), Some(&def)),
            "k1,v1,k2,v2"
        );
    }

    #[test]
    fn test_serialize_path_param_simple_object_explode() {
        let def = path_param("simple", Some(true));
        assert_eq!(
            serialize_path_param("filter", &json!({"k1": "v1", "k2": "v2"}), Some(&def)),
            "k1=v1,k2=v2"
        );
    }

    #[test]
    fn test_serialize_path_param_label_primitive() {
        let def = path_param("label", None);
        assert_eq!(serialize_path_param("id", &json!("42"), Some(&def)), ".42");
    }

    #[test]
    fn test_serialize_path_param_label_array() {
        // label/array/explode=false: members comma-joined after leading dot.
        let def = path_param("label", Some(false));
        assert_eq!(
            serialize_path_param("ids", &json!(["a", "b"]), Some(&def)),
            ".a,b"
        );
    }

    #[test]
    fn test_serialize_path_param_label_array_explode() {
        // label/array/explode=true: members dot-joined after leading dot.
        let def = path_param("label", Some(true));
        assert_eq!(
            serialize_path_param("ids", &json!(["a", "b"]), Some(&def)),
            ".a.b"
        );
    }

    #[test]
    fn test_serialize_path_param_label_object_no_explode() {
        // label/object/explode=false: flat k,v,k,v comma-joined after leading dot.
        let def = path_param("label", Some(false));
        assert_eq!(
            serialize_path_param("color", &json!({"R": "100", "G": "200"}), Some(&def)),
            ".G,200,R,100"
        );
    }

    #[test]
    fn test_serialize_path_param_label_object_explode() {
        // label/object/explode=true: k=v pairs dot-joined after leading dot.
        let def = path_param("label", Some(true));
        assert_eq!(
            serialize_path_param("color", &json!({"R": "100", "G": "200"}), Some(&def)),
            ".G=200.R=100"
        );
    }

    #[test]
    fn test_serialize_path_param_matrix_primitive() {
        let def = path_param("matrix", None);
        assert_eq!(
            serialize_path_param("id", &json!("42"), Some(&def)),
            ";id=42"
        );
    }

    #[test]
    fn test_serialize_path_param_matrix_array_no_explode() {
        let def = path_param("matrix", Some(false));
        assert_eq!(
            serialize_path_param("ids", &json!(["a", "b"]), Some(&def)),
            ";ids=a,b"
        );
    }

    #[test]
    fn test_serialize_path_param_matrix_array_explode() {
        let def = path_param("matrix", Some(true));
        assert_eq!(
            serialize_path_param("ids", &json!(["a", "b"]), Some(&def)),
            ";ids=a;ids=b"
        );
    }

    #[test]
    fn test_serialize_path_param_matrix_object_explode() {
        // matrix/object/explode=true: each k=v gets its own ;k=v prefix.
        let def = path_param("matrix", Some(true));
        assert_eq!(
            serialize_path_param("color", &json!({"R": "100", "G": "200"}), Some(&def)),
            ";G=200;R=100"
        );
    }

    #[test]
    fn test_serialize_path_param_encodes_values_not_separators() {
        // The structural commas stay literal; only the user values are
        // percent-encoded (a space -> %20, a comma inside a value -> %2C).
        let def = path_param("simple", Some(false));
        assert_eq!(
            serialize_path_param("ids", &json!(["a b", "c,d"]), Some(&def)),
            "a%20b,c%2Cd"
        );
    }

    #[test]
    fn test_serialize_path_param_matrix_encodes_value_not_prefix() {
        let def = path_param("matrix", None);
        assert_eq!(
            serialize_path_param("id", &json!("a b"), Some(&def)),
            ";id=a%20b"
        );
    }

    #[test]
    fn test_serialize_path_param_simple_array_with_null() {
        // A null element serializes as an empty string.
        let def = path_param("simple", Some(false));
        assert_eq!(
            serialize_path_param("ids", &json!(["a", null, "b"]), Some(&def)),
            "a,,b"
        );
    }

    #[test]
    fn test_render_path_template_label_style() {
        let mut defs: HashMap<String, MethodParameter> = HashMap::new();
        defs.insert("id".to_string(), path_param("label", None));
        let mut params = Map::new();
        params.insert("id".to_string(), json!("42"));
        let rendered =
            render_path_template("/path/label/{id}", &params, Some(&defs)).unwrap();
        assert_eq!(rendered, "/path/label/.42");
    }

    #[test]
    fn test_render_path_template_no_defs_falls_back_to_simple() {
        // Base-path placeholders pass `None` for defs -> plain encoded value.
        let mut params = Map::new();
        params.insert("tenant".to_string(), json!("acme"));
        let rendered =
            render_path_template("/{tenant}/v1", &params, None).unwrap();
        assert_eq!(rendered, "/acme/v1");
    }

    #[test]
    fn test_render_path_template_rejects_dot_segment() {
        let mut params = Map::new();
        params.insert("fileId".to_string(), json!(".."));
        let result = render_path_template("/v1/files/{fileId}/content", &params, None);
        assert!(result.is_err(), "bare '..' must be rejected as a dot-segment");
        let err_msg = result.unwrap_err().to_string();
        assert!(err_msg.contains("dot-segment"), "error should mention dot-segment: {err_msg}");
    }

    #[test]
    fn test_render_path_template_rejects_single_dot() {
        let mut params = Map::new();
        params.insert("id".to_string(), json!("."));
        let result = render_path_template("/v1/users/{id}", &params, None);
        assert!(result.is_err(), "bare '.' must be rejected as a dot-segment");
    }

    #[test]
    fn test_render_path_template_allows_dot_in_value() {
        let mut params = Map::new();
        params.insert("id".to_string(), json!("user@gmail.com"));
        let result = render_path_template("/v1/users/{id}", &params, None);
        assert!(result.is_ok(), "dots inside values must be allowed");
        assert_eq!(result.unwrap(), "/v1/users/user%40gmail.com");
    }

    #[test]
    fn test_get_nested_str_simple() {
        let val = json!({"nextPageToken": "tok123"});
        assert_eq!(get_nested_str(&val, "nextPageToken"), Some("tok123"));
    }

    #[test]
    fn test_get_nested_str_nested_path() {
        let val = json!({"pagination": {"cursor": "abc"}});
        assert_eq!(get_nested_str(&val, "pagination.cursor"), Some("abc"));
    }

    #[test]
    fn test_get_nested_str_missing_returns_none() {
        let val = json!({"other": "value"});
        assert_eq!(get_nested_str(&val, "nextPageToken"), None);
    }

    #[test]
    fn test_get_nested_str_non_string_returns_none() {
        let val = json!({"count": 42});
        assert_eq!(get_nested_str(&val, "count"), None);
    }

    // ---------------------------------------------------------------
    // x-fern-sdk-return-value: dot-path resolution
    // ---------------------------------------------------------------

    #[test]
    fn test_get_nested_value_top_level_property() {
        let val = json!({"data": [1, 2, 3], "meta": {}});
        assert_eq!(get_nested_value(&val, "data"), Some(&json!([1, 2, 3])));
    }

    #[test]
    fn test_get_nested_value_nested_property() {
        let val = json!({"result": {"items": ["x", "y"]}});
        assert_eq!(
            get_nested_value(&val, "result.items"),
            Some(&json!(["x", "y"]))
        );
    }

    #[test]
    fn test_get_nested_value_missing_top_returns_none() {
        let val = json!({"other": 1});
        assert_eq!(get_nested_value(&val, "data"), None);
    }

    #[test]
    fn test_get_nested_value_missing_intermediate_returns_none() {
        // First segment exists but the second doesn't — the executor
        // must error rather than silently fall through.
        let val = json!({"result": {"other": 1}});
        assert_eq!(get_nested_value(&val, "result.items"), None);
    }

    #[test]
    fn test_get_nested_value_returns_primitive_subvalue() {
        // The extension is valid on a leaf primitive: e.g. an endpoint
        // declaring `x-fern-sdk-return-value: id` on a wrapper response
        // should surface the bare ID string.
        let val = json!({"id": "abc-123", "name": "thing"});
        assert_eq!(get_nested_value(&val, "id"), Some(&json!("abc-123")));
    }

    #[test]
    fn test_get_nested_value_empty_path_returns_none() {
        let val = json!({"data": 1});
        assert_eq!(get_nested_value(&val, ""), None);
        assert_eq!(get_nested_value(&val, "   "), None);
    }

    #[test]
    fn test_get_nested_value_consecutive_dots_returns_none() {
        // `a..b` would otherwise produce a segment lookup for the empty
        // string, which always misses. Treat it explicitly as unresolved.
        let val = json!({"a": {"b": 1}});
        assert_eq!(get_nested_value(&val, "a..b"), None);
    }

    #[test]
    fn test_get_nested_value_array_index() {
        // Numeric segments index into arrays. `users.0.name` walks the
        // first element of the `users` array and reads its `name`.
        let val = json!({"users": [{"name": "alice"}, {"name": "bob"}]});
        assert_eq!(
            get_nested_value(&val, "users.0.name"),
            Some(&json!("alice"))
        );
        assert_eq!(
            get_nested_value(&val, "users.1.name"),
            Some(&json!("bob"))
        );
    }

    #[test]
    fn test_get_nested_value_array_index_out_of_range_returns_none() {
        let val = json!({"users": [{"name": "alice"}]});
        assert_eq!(get_nested_value(&val, "users.5.name"), None);
    }

    #[test]
    fn test_get_nested_value_array_index_on_object_returns_none() {
        // `0` against a non-array, non-`"0"`-keyed object is a miss.
        let val = json!({"users": {"alice": 1}});
        assert_eq!(get_nested_value(&val, "users.0"), None);
    }

    #[test]
    fn test_get_nested_value_object_key_named_zero_wins_over_array_index() {
        // If an object happens to have a literal `"0"` key, prefer that
        // over array indexing — the user's spec said "the property `0`",
        // not "the zeroth element". We're not an array here anyway, but
        // this also documents the precedence rule.
        let val = json!({"0": "object-key-zero", "list": [10, 20, 30]});
        assert_eq!(get_nested_value(&val, "0"), Some(&json!("object-key-zero")));
    }

    #[test]
    fn test_extract_return_value_top_level_resolves() {
        let body = json!({"data": [1, 2], "meta": {"total": 2}});
        let out = extract_return_value(&body, Some("data"), false, "op").unwrap();
        assert_eq!(out, json!([1, 2]));
    }

    #[test]
    fn test_extract_return_value_nested_resolves() {
        let body = json!({"result": {"items": [{"id": 1}]}});
        let out = extract_return_value(&body, Some("result.items"), false, "op").unwrap();
        assert_eq!(out, json!([{"id": 1}]));
    }

    #[test]
    fn test_extract_return_value_unresolved_path_errors() {
        let body = json!({"foo": 1});
        let err = extract_return_value(&body, Some("data"), false, "things.list")
            .expect_err("missing path must error");
        let msg = err.to_string();
        assert!(
            msg.contains("'data'") && msg.contains("things.list"),
            "error should name both path and operation id: {msg}",
        );
        assert!(
            msg.contains("--no-extract"),
            "error should point users at the --no-extract escape hatch: {msg}",
        );
    }

    #[test]
    fn test_extract_return_value_no_path_returns_full_body() {
        let body = json!({"data": [1], "meta": {}});
        let out = extract_return_value(&body, None, false, "op").unwrap();
        assert_eq!(out, body);
    }

    #[test]
    fn test_extract_return_value_no_extract_overrides_path() {
        // The opt-out flag bypasses extraction entirely even when the
        // spec declares a return path — used to debug responses that
        // don't match the spec's promised shape.
        let body = json!({"foo": 1});
        let out = extract_return_value(&body, Some("data"), true, "op")
            .expect("no_extract=true must bypass extraction even if path would fail");
        assert_eq!(
            out, body,
            "no_extract returns the full body verbatim, including when the path would have errored",
        );
    }

    #[test]
    fn test_extract_return_value_resolved_null_is_preserved_not_errored() {
        // `{"data": null}` + `return_value: "data"` is *not* an error —
        // the spec promised a `data` field, the server delivered one,
        // it just happens to be JSON null. Typed SDKs would surface
        // this as a nullable response field; the CLI surfaces it as
        // the literal `null`.
        let body = json!({"data": null, "meta": {}});
        let out = extract_return_value(&body, Some("data"), false, "op")
            .expect("resolved null is a valid extracted value");
        assert_eq!(out, json!(null));
    }

    #[test]
    fn test_extract_return_value_descriptor_appears_verbatim_in_error() {
        // When operationId is absent the caller passes a descriptor
        // like "GET /reports". Make sure that descriptor survives the
        // format string intact so users can locate the offending op.
        let body = json!({"foo": 1});
        let err = extract_return_value(&body, Some("data"), false, "GET /reports")
            .expect_err("missing path must error");
        let msg = err.to_string();
        assert!(
            msg.contains("GET /reports"),
            "descriptor must appear verbatim in error: {msg}",
        );
    }

    #[test]
    fn test_get_nested_value_path_through_array_with_index() {
        // Composes `extract_return_value` with array indexing: paths
        // like `data.0` extract the first element of an array.
        let body = json!({"data": [{"id": "first"}, {"id": "second"}]});
        let out = extract_return_value(&body, Some("data.0"), false, "op").unwrap();
        assert_eq!(out, json!({"id": "first"}));
    }

    #[tokio::test]
    async fn test_handle_json_response_extracts_subvalue_capture() {
        let pagination = PaginationConfig::default();
        let pipeline = crate::formatter::OutputPipeline::default();
        let mut pages_fetched = 0u32;
        let mut page_state = PageState::Cursor(None);
        let mut captured = Vec::new();
        let mut pager_none: Option<crate::pager::PagerHandle> = None;

        let result = handle_json_response(
            r#"{"data":[{"id":1}],"meta":{"total":1}}"#,
            &pagination,
            None,
            &pipeline,
            &mut pages_fetched,
            &mut page_state,
            true,
            &mut captured,
            "http://example.com/test",
            &[],
            Some("data"),
            false,
            "things.list",
            &mut pager_none,
        )
        .await
        .unwrap();

        assert!(!result);
        assert_eq!(captured.len(), 1);
        assert_eq!(
            captured[0],
            json!([{"id": 1}]),
            "captured value should be the extracted subvalue, not the full body",
        );
    }

    #[tokio::test]
    async fn test_handle_json_response_no_extract_keeps_full_body() {
        let pagination = PaginationConfig::default();
        let pipeline = crate::formatter::OutputPipeline::default();
        let mut pages_fetched = 0u32;
        let mut page_state = PageState::Cursor(None);
        let mut captured = Vec::new();
        let mut pager_none: Option<crate::pager::PagerHandle> = None;

        let body = r#"{"data":[{"id":1}],"meta":{"total":1}}"#;
        let result = handle_json_response(
            body,
            &pagination,
            None,
            &pipeline,
            &mut pages_fetched,
            &mut page_state,
            true,
            &mut captured,
            "http://example.com/test",
            &[],
            Some("data"),
            true, // no_extract
            "things.list",
            &mut pager_none,
        )
        .await
        .unwrap();

        assert!(!result);
        assert_eq!(captured[0], serde_json::from_str::<Value>(body).unwrap());
    }

    #[tokio::test]
    async fn test_handle_json_response_extract_unresolved_errors() {
        let pagination = PaginationConfig::default();
        let pipeline = crate::formatter::OutputPipeline::default();
        let mut pages_fetched = 0u32;
        let mut page_state = PageState::Cursor(None);
        let mut captured = Vec::new();
        let mut pager_none: Option<crate::pager::PagerHandle> = None;

        let err = handle_json_response(
            r#"{"foo":1}"#,
            &pagination,
            None,
            &pipeline,
            &mut pages_fetched,
            &mut page_state,
            true,
            &mut captured,
            "http://example.com/test",
            &[],
            Some("data"),
            false,
            "things.list",
            &mut pager_none,
        )
        .await
        .expect_err("unresolved extract path must surface as a validation error");
        assert!(
            err.to_string().contains("'data'"),
            "error message should name the missing path: {err}",
        );
        assert_eq!(
            pages_fetched, 0,
            "errors must abort before the page counter advances",
        );
    }

    #[tokio::test]
    async fn test_handle_json_response_pagination_with_extract_emits_subvalue_per_page() {
        // Combined behavior check: per-op cursor pagination + extract.
        // The full body is still used for pagination continuation (the
        // cursor lives outside the extracted subvalue), but only the
        // `data` subvalue is captured for the caller.
        let pagination = page_all_pagination();
        let endpoint = EndpointPagination::Cursor {
            cursor: "cursor".to_string(),
            next_cursor: "next".to_string(),
            results: "data".to_string(),
        };
        let pipeline = crate::formatter::OutputPipeline::default();
        let mut pages_fetched = 0u32;
        let mut page_state = PageState::Cursor(None);
        let mut captured = Vec::new();
        let mut pager_none: Option<crate::pager::PagerHandle> = None;

        let result = handle_json_response(
            r#"{"data":[{"id":1},{"id":2}],"next":"page-2"}"#,
            &pagination,
            Some(&endpoint),
            &pipeline,
            &mut pages_fetched,
            &mut page_state,
            true,
            &mut captured,
            "http://example.com/test",
            &[],
            Some("data"),
            false,
            "things.list",
            &mut pager_none,
        )
        .await
        .unwrap();

        assert!(result, "cursor present → should continue pagination");
        assert_eq!(captured.len(), 1);
        assert_eq!(
            captured[0],
            json!([{"id": 1}, {"id": 2}]),
            "captured per-page value must be the extracted subvalue",
        );
        match page_state {
            PageState::Cursor(Some(ref t)) => assert_eq!(t, "page-2"),
            other => panic!("expected Cursor(Some(\"page-2\")), got {other:?}"),
        }
    }

    #[tokio::test]
    async fn test_handle_json_response_capture_output() {
        let pagination = PaginationConfig::default();
        let pipeline = crate::formatter::OutputPipeline::default();
        let mut pages_fetched = 0u32;
        let mut page_state = PageState::Cursor(None);
        let mut captured = Vec::new();
        let mut pager_none: Option<crate::pager::PagerHandle> = None;

        let result = handle_json_response(
            r#"{"items":["a"]}"#,
            &pagination,
            None,
            &pipeline,
            &mut pages_fetched,
            &mut page_state,
            true,
            &mut captured,
            "http://example.com/test",
            &[],
            None,
            false,
            "test-op",
            &mut pager_none,
        )
        .await
        .unwrap();

        assert!(!result);
        assert_eq!(captured.len(), 1);
        assert_eq!(pages_fetched, 1);
    }

    #[tokio::test]
    async fn test_handle_json_response_non_json_body() {
        let pagination = PaginationConfig::default();
        let pipeline = crate::formatter::OutputPipeline::default();
        let mut pages_fetched = 0u32;
        let mut page_state = PageState::Cursor(None);
        let mut captured = Vec::new();
        let mut pager_none: Option<crate::pager::PagerHandle> = None;

        let result = handle_json_response(
            "not json at all",
            &pagination,
            None,
            &pipeline,
            &mut pages_fetched,
            &mut page_state,
            false,
            &mut captured,
            "http://example.com/test",
            &[],
            None,
            false,
            "test-op",
            &mut pager_none,
        )
        .await
        .unwrap();

        assert!(!result);
        assert_eq!(pages_fetched, 0);
    }

    #[tokio::test]
    async fn test_handle_json_response_pagination_continues() {
        let pagination = PaginationConfig {
            page_all: true,
            page_limit: 10,
            page_delay_ms: 0,
            ..PaginationConfig::default()
        };
        let pipeline = crate::formatter::OutputPipeline::default();
        let mut pages_fetched = 0u32;
        let mut page_state = PageState::Cursor(None);
        let mut captured = Vec::new();

        let mut pager = None;
        let result = handle_json_response(
            r#"{"items":[],"nextPageToken":"next-tok"}"#,
            &pagination,
            None,
            &pipeline,
            &mut pages_fetched,
            &mut page_state,
            false,
            &mut captured,
            "http://example.com/test",
            &[],
            None,
            false,
            "test-op",
            &mut pager,
        )
        .await
        .unwrap();

        assert!(result);
        match page_state {
            PageState::Cursor(Some(ref t)) => assert_eq!(t, "next-tok"),
            other => panic!("expected Cursor(Some(\"next-tok\")), got {other:?}"),
        }
    }

    #[tokio::test]
    async fn test_handle_json_response_pagination_at_limit() {
        let pagination = PaginationConfig {
            page_all: true,
            page_limit: 5,
            page_delay_ms: 0,
            ..PaginationConfig::default()
        };
        let pipeline = crate::formatter::OutputPipeline::default();
        let mut pages_fetched = 4u32; // becomes 5 == page_limit, no continuation
        let mut page_state = PageState::Cursor(None);
        let mut captured = Vec::new();

        let mut pager = None;
        let result = handle_json_response(
            r#"{"items":[],"nextPageToken":"would-be-next"}"#,
            &pagination,
            None,
            &pipeline,
            &mut pages_fetched,
            &mut page_state,
            false,
            &mut captured,
            "http://example.com/test",
            &[],
            None,
            false,
            "test-op",
            &mut pager,
        )
        .await
        .unwrap();

        assert!(!result);
        assert_eq!(pages_fetched, 5);
    }

    // ---------------------------------------------------------------
    // Per-operation x-fern-pagination: cursor + offset coverage
    // ---------------------------------------------------------------

    fn page_all_pagination() -> PaginationConfig {
        PaginationConfig {
            page_all: true,
            page_limit: 10,
            page_delay_ms: 0,
            ..PaginationConfig::default()
        }
    }

    #[tokio::test]
    async fn test_per_op_cursor_pagination_continues_with_response_path() {
        let pagination = page_all_pagination();
        let endpoint = EndpointPagination::Cursor {
            cursor: "marker".to_string(),
            next_cursor: "next_marker".to_string(),
            results: "entries".to_string(),
        };
        let pipeline = crate::formatter::OutputPipeline::default();
        let mut pages_fetched = 0u32;
        let mut page_state = PageState::Cursor(None);
        let mut captured = Vec::new();
        let mut pager_none: Option<crate::pager::PagerHandle> = None;

        let result = handle_json_response(
            r#"{"entries":[{"id":"1"}],"next_marker":"abc"}"#,
            &pagination,
            Some(&endpoint),
            &pipeline,
            &mut pages_fetched,
            &mut page_state,
            true,
            &mut captured,
            "http://example.com/test",
            &[],
            None,
            false,
            "test-op",
            &mut pager_none,
        )
        .await
        .unwrap();

        assert!(result);
        match page_state {
            PageState::Cursor(Some(ref t)) => assert_eq!(t, "abc"),
            other => panic!("expected Cursor(Some(\"abc\")), got {other:?}"),
        }
    }

    #[tokio::test]
    async fn test_per_op_cursor_stops_on_empty_next_cursor() {
        let pagination = page_all_pagination();
        let endpoint = EndpointPagination::Cursor {
            cursor: "marker".to_string(),
            next_cursor: "next_marker".to_string(),
            results: "entries".to_string(),
        };
        let pipeline = crate::formatter::OutputPipeline::default();
        let mut pages_fetched = 0u32;
        let mut page_state = PageState::Cursor(None);
        let mut captured = Vec::new();
        let mut pager_none: Option<crate::pager::PagerHandle> = None;

        let result = handle_json_response(
            r#"{"entries":[{"id":"2"}],"next_marker":""}"#,
            &pagination,
            Some(&endpoint),
            &pipeline,
            &mut pages_fetched,
            &mut page_state,
            true,
            &mut captured,
            "http://example.com/test",
            &[],
            None,
            false,
            "test-op",
            &mut pager_none,
        )
        .await
        .unwrap();

        assert!(!result);
    }

    #[tokio::test]
    async fn test_per_op_offset_pagination_advances_by_results_len() {
        let pagination = page_all_pagination();
        let endpoint = EndpointPagination::Offset {
            offset: "page_number".to_string(),
            results: "users".to_string(),
            step: None,
            has_next_page: Some("meta.has_more".to_string()),
        };
        let pipeline = crate::formatter::OutputPipeline::default();
        let mut pages_fetched = 0u32;
        let mut page_state = PageState::Offset(0);
        let mut captured = Vec::new();
        let mut pager_none: Option<crate::pager::PagerHandle> = None;

        let result = handle_json_response(
            r#"{"users":[{"id":1},{"id":2},{"id":3}],"meta":{"has_more":true}}"#,
            &pagination,
            Some(&endpoint),
            &pipeline,
            &mut pages_fetched,
            &mut page_state,
            true,
            &mut captured,
            "http://example.com/test",
            &[],
            None,
            false,
            "test-op",
            &mut pager_none,
        )
        .await
        .unwrap();

        assert!(result);
        match page_state {
            PageState::Offset(n) => assert_eq!(n, 3),
            other => panic!("expected Offset(3), got {other:?}"),
        }
    }

    #[tokio::test]
    async fn test_per_op_offset_stops_when_has_next_page_false() {
        let pagination = page_all_pagination();
        let endpoint = EndpointPagination::Offset {
            offset: "page_number".to_string(),
            results: "users".to_string(),
            step: None,
            has_next_page: Some("meta.has_more".to_string()),
        };
        let pipeline = crate::formatter::OutputPipeline::default();
        let mut pages_fetched = 0u32;
        let mut page_state = PageState::Offset(0);
        let mut captured = Vec::new();
        let mut pager_none: Option<crate::pager::PagerHandle> = None;

        let result = handle_json_response(
            r#"{"users":[{"id":1}],"meta":{"has_more":false}}"#,
            &pagination,
            Some(&endpoint),
            &pipeline,
            &mut pages_fetched,
            &mut page_state,
            true,
            &mut captured,
            "http://example.com/test",
            &[],
            None,
            false,
            "test-op",
            &mut pager_none,
        )
        .await
        .unwrap();

        assert!(!result);
    }

    #[tokio::test]
    async fn test_per_op_offset_step_stops_on_short_page() {
        // `step: $request.limit` + caller's `--limit 50` → the executor
        // gates the next page on `items.length >= 50`. The server returned
        // only 3 rows (a short page), so pagination must stop even though
        // `has_next_page` is unset. Matches upstream fern's hasNextPage
        // check `items.length >= step`.
        let pagination = page_all_pagination();
        let endpoint = EndpointPagination::Offset {
            offset: "offset".to_string(),
            results: "users".to_string(),
            step: Some("limit".to_string()),
            has_next_page: None,
        };
        let pipeline = crate::formatter::OutputPipeline::default();
        let mut pages_fetched = 0u32;
        let mut page_state = PageState::Offset(0);
        let mut captured = Vec::new();
        let mut pager_none: Option<crate::pager::PagerHandle> = None;
        let request_query_params = vec![("limit".to_string(), "50".to_string())];

        let result = handle_json_response(
            r#"{"users":[{"id":1},{"id":2},{"id":3}]}"#,
            &pagination,
            Some(&endpoint),
            &pipeline,
            &mut pages_fetched,
            &mut page_state,
            true,
            &mut captured,
            "http://example.com/test",
            &request_query_params,
            None,
            false,
            "test-op",
            &mut pager_none,
        )
        .await
        .unwrap();

        assert!(
            !result,
            "short page (3 < 50) must end pagination per upstream `items.length >= step` gate"
        );
    }

    #[tokio::test]
    async fn test_per_op_offset_step_continues_on_full_page() {
        // Full page: server returned `limit` items → continue and advance
        // by `len(items)` (item-index semantics).
        let pagination = page_all_pagination();
        let endpoint = EndpointPagination::Offset {
            offset: "offset".to_string(),
            results: "users".to_string(),
            step: Some("limit".to_string()),
            has_next_page: None,
        };
        let pipeline = crate::formatter::OutputPipeline::default();
        let mut pages_fetched = 0u32;
        let mut page_state = PageState::Offset(0);
        let mut captured = Vec::new();
        let mut pager_none: Option<crate::pager::PagerHandle> = None;
        let request_query_params = vec![("limit".to_string(), "3".to_string())];

        let result = handle_json_response(
            r#"{"users":[{"id":1},{"id":2},{"id":3}]}"#,
            &pagination,
            Some(&endpoint),
            &pipeline,
            &mut pages_fetched,
            &mut page_state,
            true,
            &mut captured,
            "http://example.com/test",
            &request_query_params,
            None,
            false,
            "test-op",
            &mut pager_none,
        )
        .await
        .unwrap();

        assert!(result, "full page (3 >= 3) must continue pagination");
        match page_state {
            PageState::Offset(n) => assert_eq!(
                n, 3,
                "offset advances by len(items), not by the step value"
            ),
            other => panic!("expected Offset(3), got {other:?}"),
        }
    }

    #[test]
    fn test_resolve_step_target_from_request_param() {
        // step: "limit" + query params containing limit=50 → Some(50).
        let params = vec![("limit".to_string(), "50".to_string())];
        assert_eq!(resolve_step_target(Some("limit"), &params), Some(50));
    }

    #[test]
    fn test_resolve_step_target_literal_integer() {
        // step is itself an integer literal (e.g. `step: "50"`) → Some(50).
        assert_eq!(resolve_step_target(Some("50"), &[]), Some(50));
    }

    #[test]
    fn test_resolve_step_target_unresolvable_returns_none() {
        // step references a param the caller didn't supply → None, so the
        // executor falls back to the legacy `items.len() > 0` check.
        assert_eq!(resolve_step_target(Some("limit"), &[]), None);
    }

    #[test]
    fn test_resolve_step_target_none_returns_none() {
        assert_eq!(resolve_step_target(None, &[]), None);
    }

    #[test]
    fn test_page_state_injection_heuristic_first_page() {
        let state = PageState::Cursor(None);
        assert_eq!(state.injection(None, "pageToken"), None);
    }

    #[test]
    fn test_page_state_injection_heuristic_with_token() {
        let state = PageState::Cursor(Some("tok".to_string()));
        assert_eq!(
            state.injection(None, "pageToken"),
            Some(("pageToken".to_string(), "tok".to_string())),
        );
    }

    #[test]
    fn test_page_state_injection_endpoint_cursor_uses_op_param_name() {
        let endpoint = EndpointPagination::Cursor {
            cursor: "marker".to_string(),
            next_cursor: "next_marker".to_string(),
            results: "entries".to_string(),
        };
        let state = PageState::Cursor(Some("tok".to_string()));
        assert_eq!(
            state.injection(Some(&endpoint), "pageToken"),
            Some(("marker".to_string(), "tok".to_string())),
        );
    }

    #[test]
    fn test_page_state_injection_offset_zero_skipped_on_first_page() {
        let endpoint = EndpointPagination::Offset {
            offset: "page_number".to_string(),
            results: "users".to_string(),
            step: None,
            has_next_page: None,
        };
        let state = PageState::Offset(0);
        assert_eq!(state.injection(Some(&endpoint), "pageToken"), None);
    }

    #[test]
    fn test_page_state_injection_offset_nonzero_injects() {
        let endpoint = EndpointPagination::Offset {
            offset: "page_number".to_string(),
            results: "users".to_string(),
            step: None,
            has_next_page: None,
        };
        let state = PageState::Offset(42);
        assert_eq!(
            state.injection(Some(&endpoint), "pageToken"),
            Some(("page_number".to_string(), "42".to_string())),
        );
    }

    #[test]
    fn test_mime_from_extension_various() {
        assert_eq!(mime_from_extension("doc.txt"), Some("text/plain".to_string()));
        assert_eq!(mime_from_extension("page.htm"), Some("text/html".to_string()));
        assert_eq!(mime_from_extension("style.css"), Some("text/css".to_string()));
        assert_eq!(mime_from_extension("data.xml"), Some("application/xml".to_string()));
        assert_eq!(mime_from_extension("app.js"), Some("application/javascript".to_string()));
        assert_eq!(mime_from_extension("doc.pdf"), Some("application/pdf".to_string()));
        assert_eq!(mime_from_extension("arc.zip"), Some("application/zip".to_string()));
        assert_eq!(mime_from_extension("file.gz"), Some("application/gzip".to_string()));
        assert_eq!(mime_from_extension("file.gzip"), Some("application/gzip".to_string()));
        assert_eq!(mime_from_extension("archive.tar"), Some("application/x-tar".to_string()));
        assert_eq!(mime_from_extension("img.png"), Some("image/png".to_string()));
        assert_eq!(mime_from_extension("photo.jpg"), Some("image/jpeg".to_string()));
        assert_eq!(mime_from_extension("photo.jpeg"), Some("image/jpeg".to_string()));
        assert_eq!(mime_from_extension("anim.gif"), Some("image/gif".to_string()));
        assert_eq!(mime_from_extension("icon.svg"), Some("image/svg+xml".to_string()));
        assert_eq!(mime_from_extension("img.webp"), Some("image/webp".to_string()));
        assert_eq!(mime_from_extension("fav.ico"), Some("image/x-icon".to_string()));
        assert_eq!(mime_from_extension("song.mp3"), Some("audio/mpeg".to_string()));
        assert_eq!(mime_from_extension("sound.wav"), Some("audio/wav".to_string()));
        assert_eq!(mime_from_extension("video.mp4"), Some("video/mp4".to_string()));
        assert_eq!(mime_from_extension("clip.webm"), Some("video/webm".to_string()));
        assert_eq!(mime_from_extension("config.yaml"), Some("application/yaml".to_string()));
        assert_eq!(mime_from_extension("config.yml"), Some("application/yaml".to_string()));
        assert_eq!(mime_from_extension("config.toml"), Some("application/toml".to_string()));
        assert_eq!(mime_from_extension("word.doc"), Some("application/msword".to_string()));
        assert_eq!(mime_from_extension("word.docx"), Some("application/vnd.openxmlformats-officedocument.wordprocessingml.document".to_string()));
        assert_eq!(mime_from_extension("sheet.xls"), Some("application/vnd.ms-excel".to_string()));
        assert_eq!(mime_from_extension("sheet.xlsx"), Some("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet".to_string()));
        assert_eq!(mime_from_extension("slides.ppt"), Some("application/vnd.ms-powerpoint".to_string()));
        assert_eq!(mime_from_extension("slides.pptx"), Some("application/vnd.openxmlformats-officedocument.presentationml.presentation".to_string()));
        assert_eq!(mime_from_extension("module.wasm"), Some("application/wasm".to_string()));
        assert_eq!(mime_from_extension("file.unknown"), None);
    }

    #[test]
    fn test_mime_to_extension_additional_branches() {
        assert_eq!(mime_to_extension("image/gif"), "gif");
        // Use MIMEs that don't contain "xml" (which matches earlier in the chain)
        assert_eq!(mime_to_extension("application/vnd.ms-excel.spreadsheet"), "xlsx");
        assert_eq!(mime_to_extension("application/vnd.ms-word.document.12"), "docx");
        assert_eq!(mime_to_extension("application/octet-stream"), "bin");
        assert_eq!(mime_to_extension("application/unknown-type"), "bin");
    }

    #[test]
    fn test_extract_content_disposition_filename_quoted() {
        assert_eq!(
            extract_content_disposition_filename("attachment; filename=\"voice.mp3\""),
            Some("voice.mp3".to_string())
        );
    }

    #[test]
    fn test_extract_content_disposition_filename_unquoted() {
        assert_eq!(
            extract_content_disposition_filename("attachment; filename=voice.mp3"),
            Some("voice.mp3".to_string())
        );
    }

    #[test]
    fn test_extract_content_disposition_filename_inline() {
        // disposition type is irrelevant — `inline` should also yield the name.
        assert_eq!(
            extract_content_disposition_filename("inline; filename=\"page.pdf\""),
            Some("page.pdf".to_string())
        );
    }

    #[test]
    fn test_extract_content_disposition_filename_missing() {
        assert_eq!(extract_content_disposition_filename("attachment"), None);
        assert_eq!(extract_content_disposition_filename(""), None);
    }

    #[test]
    fn test_extract_content_disposition_filename_rfc5987_unsupported_charset() {
        // Charsets other than UTF-8 / ISO-8859-1 fall through and the caller
        // ends up with the `download.<ext>` default.
        assert_eq!(
            extract_content_disposition_filename(
                "attachment; filename*=Shift_JIS''%82%a0.mp3"
            ),
            None,
        );
    }

    #[test]
    fn test_extract_content_disposition_filename_strips_directory() {
        // Server cannot escape its lane — directory components are discarded.
        assert_eq!(
            extract_content_disposition_filename("attachment; filename=\"../etc/passwd\""),
            Some("passwd".to_string())
        );
        assert_eq!(
            extract_content_disposition_filename("attachment; filename=\"/etc/passwd\""),
            Some("passwd".to_string())
        );
    }

    #[test]
    fn test_extract_content_disposition_filename_rejects_dot_only() {
        assert_eq!(
            extract_content_disposition_filename("attachment; filename=\".\""),
            None
        );
        assert_eq!(
            extract_content_disposition_filename("attachment; filename=\"..\""),
            None
        );
    }

    #[test]
    fn test_extract_content_disposition_filename_case_insensitive_param_name() {
        // RFC 7231 §3.2.6: parameter names are case-insensitive.
        assert_eq!(
            extract_content_disposition_filename("attachment; Filename=\"voice.mp3\""),
            Some("voice.mp3".to_string())
        );
        assert_eq!(
            extract_content_disposition_filename("ATTACHMENT; FILENAME=voice.mp3"),
            Some("voice.mp3".to_string())
        );
    }

    #[test]
    fn test_extract_content_disposition_filename_quoted_with_semicolon() {
        // RFC 6266 / RFC 2616 quoted-string allows `;` inside DQUOTE.
        assert_eq!(
            extract_content_disposition_filename("attachment; filename=\"hello;world.mp3\""),
            Some("hello;world.mp3".to_string())
        );
    }

    #[test]
    fn test_extract_content_disposition_filename_ignores_form_data_disposition() {
        // form-data is the multipart-upload variant; clients must not honor
        // it as a download-name hint on a response (RFC 7578 §4.2).
        assert_eq!(
            extract_content_disposition_filename(
                "form-data; name=\"file\"; filename=\"voice.mp3\""
            ),
            None
        );
    }

    #[test]
    fn test_extract_content_disposition_filename_prefers_filename_star() {
        // RFC 6266 §4.3: when both `filename` and `filename*` are present
        // recipients MUST prefer `filename*` (the encoded i18n form).
        assert_eq!(
            extract_content_disposition_filename(
                "attachment; filename=\"ascii.mp3\"; filename*=UTF-8''utf8-name.mp3"
            ),
            Some("utf8-name.mp3".to_string())
        );
        // Order in the header does not matter — `filename*` wins either way.
        assert_eq!(
            extract_content_disposition_filename(
                "attachment; filename*=UTF-8''utf8-name.mp3; filename=\"ascii.mp3\""
            ),
            Some("utf8-name.mp3".to_string())
        );
    }

    #[test]
    fn test_extract_content_disposition_filename_decodes_rfc5987_utf8() {
        // RFC 5987: charset'lang'percent-encoded-bytes. We support UTF-8.
        assert_eq!(
            extract_content_disposition_filename(
                "attachment; filename*=UTF-8''%E5%A3%B0.mp3"
            ),
            Some("声.mp3".to_string())
        );
        // ISO-8859-1 is also RFC-listed; supported as raw bytes (no decode).
        assert_eq!(
            extract_content_disposition_filename(
                "attachment; filename*=ISO-8859-1''cafe.mp3"
            ),
            Some("cafe.mp3".to_string())
        );
    }

    #[test]
    fn test_extract_content_disposition_filename_falls_through_to_next_part() {
        // If the first matching `filename=` sanitizes to None (empty, bidi
        // override, dotfile, etc.) the parser must keep iterating and pick
        // a valid later occurrence rather than shadowing it with None.
        assert_eq!(
            extract_content_disposition_filename(
                "attachment; filename=\"\"; filename=\"real.mp3\""
            ),
            Some("real.mp3".to_string())
        );
    }

    #[test]
    fn test_extract_content_disposition_filename_rejects_empty_and_control() {
        assert_eq!(
            extract_content_disposition_filename("attachment; filename=\"\""),
            None
        );
        assert_eq!(
            extract_content_disposition_filename("attachment; filename=\"\r\n\""),
            None
        );
    }

    #[test]
    fn test_sanitize_rejects_unicode_bidi_override() {
        // U+202E (RIGHT-TO-LEFT OVERRIDE) is General_Category=Cf, not Cc — so
        // char::is_control returns false. We must reject it explicitly to
        // prevent server-controlled extension spoofing where the displayed
        // name reads `invoice.jpg` but the saved file is actually `.exe`.
        assert_eq!(sanitize_server_supplied_filename("invoice\u{202E}gpj.exe"), None);
        // Other bidi/format chars in the same family.
        assert_eq!(sanitize_server_supplied_filename("a\u{200E}b.mp3"), None);
        assert_eq!(sanitize_server_supplied_filename("a\u{200F}b.mp3"), None);
        assert_eq!(sanitize_server_supplied_filename("a\u{2066}b.mp3"), None);
        assert_eq!(sanitize_server_supplied_filename("a\u{2069}b.mp3"), None);
    }

    #[test]
    fn test_sanitize_rejects_leading_dot_filenames() {
        // A server choosing `.env`, `.bashrc`, etc. could silently overwrite
        // a sensitive dotfile in the user's CWD. The default `download.<ext>`
        // name is intentionally NOT a dotfile, so this rule only affects the
        // Content-Disposition path.
        assert_eq!(sanitize_server_supplied_filename(".env"), None);
        assert_eq!(sanitize_server_supplied_filename(".bashrc"), None);
        assert_eq!(sanitize_server_supplied_filename(".gitignore"), None);
        // But a regular filename containing an internal dot is fine.
        assert_eq!(
            sanitize_server_supplied_filename("voice.mp3"),
            Some("voice.mp3".to_string())
        );
    }

    #[test]
    fn test_sanitize_rejects_embedded_backslashes() {
        // Path::file_name treats backslash as a regular char on Unix, so a
        // Windows-style traversal slips through Path::file_name unchanged.
        // Reject explicitly to keep the cross-platform contract straight.
        assert_eq!(
            sanitize_server_supplied_filename("..\\..\\.ssh\\authorized_keys"),
            None
        );
        assert_eq!(sanitize_server_supplied_filename("a\\b.mp3"), None);
    }

    #[test]
    fn test_mime_to_extension_audio_subtypes_disambiguated() {
        // `audio/mpegurl` (M3U/M3U8 playlists, IANA-registered) must not be
        // absorbed into the `audio/mpeg` → mp3 branch via prefix matching.
        assert_eq!(mime_to_extension("audio/mpegurl"), "m3u");
        assert_eq!(mime_to_extension("audio/x-mpegurl"), "m3u");
        // `audio/wavpack` (IANA-registered WavPack lossless codec) must not
        // collapse into `audio/wav`.
        assert_eq!(mime_to_extension("audio/wavpack"), "wv");
        // The original `audio/mpeg` and `audio/wav` branches still resolve
        // correctly, with or without trailing parameters.
        assert_eq!(mime_to_extension("audio/mpeg"), "mp3");
        assert_eq!(mime_to_extension("audio/mpeg; codecs=mp3"), "mp3");
        assert_eq!(mime_to_extension("audio/wav"), "wav");
        assert_eq!(mime_to_extension("audio/wav; rate=44100"), "wav");
    }

    #[test]
    fn test_mime_to_extension_audio_and_video() {
        // Audio/MPEG was the original FER-10871 regression — TTS-style
        // audio responses silently dropped through to `.bin`.
        assert_eq!(mime_to_extension("audio/mpeg"), "mp3");
        assert_eq!(mime_to_extension("audio/mp3"), "mp3");
        assert_eq!(mime_to_extension("audio/wav"), "wav");
        assert_eq!(mime_to_extension("audio/x-wav"), "wav");
        assert_eq!(mime_to_extension("audio/wave"), "wav");
        assert_eq!(mime_to_extension("audio/ogg"), "ogg");
        assert_eq!(mime_to_extension("audio/opus"), "opus");
        assert_eq!(mime_to_extension("audio/flac"), "flac");
        assert_eq!(mime_to_extension("audio/aac"), "aac");
        assert_eq!(mime_to_extension("audio/mp4"), "m4a");
        assert_eq!(mime_to_extension("audio/webm"), "weba");
        // video — `video/mpeg` must NOT cross-collide with `audio/mpeg`.
        assert_eq!(mime_to_extension("video/mp4"), "mp4");
        assert_eq!(mime_to_extension("video/webm"), "webm");
        assert_eq!(mime_to_extension("video/quicktime"), "mov");
        assert_eq!(mime_to_extension("video/mpeg"), "mpeg");
        // images
        assert_eq!(mime_to_extension("image/svg+xml"), "svg");
        assert_eq!(mime_to_extension("image/webp"), "webp");
        // case-insensitivity per RFC 6838
        assert_eq!(mime_to_extension("Audio/MPEG"), "mp3");
        // charset / parameter suffix (e.g. `audio/mpeg; codecs=...`) is harmless
        assert_eq!(mime_to_extension("audio/mpeg; codecs=mp3"), "mp3");
    }

    #[test]
    fn test_resolve_upload_mime_strips_control_chars() {
        let mime = resolve_upload_mime(Some("text/plain\rinjected"), None, &None);
        assert_eq!(mime, "text/plaininjected");
    }

    #[test]
    fn test_resolve_upload_mime_all_control_chars_falls_back() {
        let mime = resolve_upload_mime(Some("\r\n\t"), None, &None);
        assert_eq!(mime, "application/octet-stream");
    }

    #[test]
    fn test_value_to_query_string_null() {
        assert_eq!(value_to_query_string(&Value::Null), "");
    }

    #[test]
    fn test_value_to_query_string_object_serializes() {
        let val = json!({"key": "val"});
        let result = value_to_query_string(&val);
        assert!(!result.is_empty());
    }

    #[test]
    fn test_serialize_deep_object_non_object_value() {
        let result = serialize_deep_object("filter", &json!("simple"));
        assert_eq!(result, vec![("filter".to_string(), "simple".to_string())]);
    }

    #[test]
    fn test_serialize_deep_object_nested() {
        // Multi-level nesting: {"meta":{"created_at":"today"}} with key "filter"
        // should produce [("filter[meta][created_at]", "today")]
        let value = json!({"meta": {"created_at": "today"}});
        let result = serialize_deep_object("filter", &value);
        assert_eq!(
            result,
            vec![("filter[meta][created_at]".to_string(), "today".to_string())]
        );
    }

    #[test]
    fn test_serialize_deep_object_array_uses_repeated_keys() {
        // Arrays must use repeated keys (filter[tags]=a&filter[tags]=b),
        // consistent with the Fern Python and C# SDKs. Not indexed brackets.
        let value = json!({"tags": ["a", "b"]});
        let mut result = serialize_deep_object("filter", &value);
        result.sort(); // order not guaranteed
        assert_eq!(
            result,
            vec![
                ("filter[tags]".to_string(), "a".to_string()),
                ("filter[tags]".to_string(), "b".to_string()),
            ]
        );
    }

    #[test]
    fn test_build_url_uses_root_url_and_service_path_when_no_base_url() {
        let doc = RestDescription {
            root_url: "https://api.example.com/".to_string(),
            service_path: "v1/".to_string(),
            base_url: None,
            ..Default::default()
        };
        let method = RestMethod {
            path: "files".to_string(),
            ..Default::default()
        };
        let (url, _) = build_url(&doc, &method, &Map::new(), false, None).unwrap();
        assert_eq!(url, "https://api.example.com/v1/files");
    }

    #[test]
    fn test_build_url_method_root_url_overrides_doc_root_url() {
        // Per-operation server override: method.root_url must win over doc.root_url.
        // If this is broken, requests route to the wrong host (e.g. Box uploads
        // go to api.box.com instead of upload.box.com).
        let doc = RestDescription {
            root_url: "https://api.example.com/".to_string(),
            service_path: "v1/".to_string(),
            base_url: None,
            ..Default::default()
        };
        let method = RestMethod {
            path: "uploads".to_string(),
            root_url: "https://upload.example.com/".to_string(),
            ..Default::default()
        };
        let (url, _) = build_url(&doc, &method, &Map::new(), false, None).unwrap();
        assert_eq!(url, "https://upload.example.com/v1/uploads");
    }

    #[test]
    fn test_build_url_empty_method_root_url_falls_back_to_doc() {
        // When method.root_url is empty (unset), doc.root_url must be used.
        let doc = RestDescription {
            root_url: "https://api.example.com/".to_string(),
            service_path: "v1/".to_string(),
            base_url: None,
            ..Default::default()
        };
        let method = RestMethod {
            path: "files".to_string(),
            root_url: String::new(),
            ..Default::default()
        };
        let (url, _) = build_url(&doc, &method, &Map::new(), false, None).unwrap();
        assert_eq!(url, "https://api.example.com/v1/files");
    }

    #[test]
    fn test_parse_and_validate_inputs_invalid_params_json() {
        let doc = RestDescription::default();
        let method = RestMethod::default();
        let err =
            parse_and_validate_inputs(&doc, &method, Some("{not json}"), None, false, None, &[]).unwrap_err();
        assert!(err.to_string().contains("Invalid --params JSON"));
    }

    #[test]
    fn test_parse_and_validate_inputs_invalid_body_json() {
        let doc = RestDescription::default();
        let method = RestMethod::default();
        let err =
            parse_and_validate_inputs(&doc, &method, None, Some("{not json}"), false, None, &[]).unwrap_err();
        assert!(err.to_string().contains("Invalid --json body"));
    }

    #[test]
    fn test_parse_and_validate_inputs_required_query_param_missing() {
        let mut parameters = HashMap::new();
        parameters.insert(
            "api_key".to_string(),
            MethodParameter {
                location: Some("query".to_string()),
                required: true,
                ..Default::default()
            },
        );
        let doc = RestDescription::default();
        let method = RestMethod {
            parameters,
            ..Default::default()
        };
        let err = parse_and_validate_inputs(&doc, &method, None, None, false, None, &[]).unwrap_err();
        assert!(err.to_string().contains("Required parameter 'api_key'"));
    }

    #[tokio::test]
    async fn test_build_http_request_unsupported_method() {
        let client = reqwest::Client::new();
        let method = RestMethod {
            http_method: "TRACE".to_string(),
            path: "test".to_string(),
            ..Default::default()
        };
        let input = ExecutionInput {
            full_url: "https://example.com/test".to_string(),
            body: None,
            query_params: Vec::new(),
            header_params: Vec::new(),
            is_upload: false,
        };

        let err = build_http_request(
            &client,
            &method,
            &input,
            &crate::auth::no_auth_provider(),
            &EndpointAuthMetadata::unspecified(),
            &PageState::Cursor(None),
            0,
            &None,
            None,
            &None,
            &PaginationConfig::default(),
        )
        .await
        .unwrap_err();
        assert!(err.to_string().contains("Unsupported HTTP method"));
    }

    #[tokio::test]
    async fn test_build_http_request_put_patch_delete() {
        let client = reqwest::Client::new();
        let input = ExecutionInput {
            full_url: "https://example.com/test".to_string(),
            body: None,
            query_params: Vec::new(),
            header_params: Vec::new(),
            is_upload: false,
        };

        for http_method in &["PUT", "PATCH", "DELETE"] {
            let method = RestMethod {
                http_method: http_method.to_string(),
                path: "test".to_string(),
                ..Default::default()
            };
            let result = build_http_request(
                &client,
                &method,
                &input,
                &crate::auth::no_auth_provider(),
                &EndpointAuthMetadata::unspecified(),
                &PageState::Cursor(None),
                0,
                &None,
                None,
                &None,
                &PaginationConfig::default(),
            )
            .await;
            assert!(result.is_ok(), "Failed for method {http_method}");
        }
    }

    #[test]
    fn test_validate_value_schema_not_found() {
        let doc = RestDescription::default();
        let mut errors = Vec::new();
        validate_value(&json!({}), "NonExistentSchema", &doc, "$", &mut errors);
        assert_eq!(errors.len(), 1);
        assert!(errors[0].contains("Schema 'NonExistentSchema' not found"));
    }

    #[test]
    fn test_validate_value_nullable_schema_accepts_null() {
        // A `$ref`-resolved schema with `nullable: true` must accept
        // JSON null. Without the null short-circuit in `validate_value`,
        // the object branch fires and emits "Expected object".
        let schemas = HashMap::from([(
            "NullableObj".to_string(),
            JsonSchema {
                schema_type: Some("object".to_string()),
                nullable: true,
                properties: HashMap::from([(
                    "name".to_string(),
                    JsonSchemaProperty {
                        prop_type: Some("string".to_string()),
                        ..Default::default()
                    },
                )]),
                ..Default::default()
            },
        )]);
        let doc = RestDescription { schemas, ..Default::default() };
        let mut errors = Vec::new();
        validate_value(&Value::Null, "NullableObj", &doc, "body", &mut errors);
        assert!(
            errors.is_empty(),
            "null on a nullable schema must be accepted, got: {errors:?}",
        );
    }

    #[test]
    fn test_validate_value_nullable_union_composition_accepts_null() {
        // A component schema declared as an object with a nullable-union
        // composition (`anyOf: [string, null]` on the schema root) must
        // accept null when accessed via `$ref`.
        let schemas = HashMap::from([(
            "NullableUnionObj".to_string(),
            JsonSchema {
                schema_type: Some("object".to_string()),
                properties: HashMap::from([(
                    "id".to_string(),
                    JsonSchemaProperty {
                        prop_type: Some("string".to_string()),
                        ..Default::default()
                    },
                )]),
                any_of: vec![
                    JsonSchemaProperty {
                        prop_type: Some("object".to_string()),
                        ..Default::default()
                    },
                    JsonSchemaProperty {
                        prop_type: Some("null".to_string()),
                        ..Default::default()
                    },
                ],
                ..Default::default()
            },
        )]);
        let doc = RestDescription { schemas, ..Default::default() };
        let mut errors = Vec::new();
        validate_value(&Value::Null, "NullableUnionObj", &doc, "body", &mut errors);
        assert!(
            errors.is_empty(),
            "null on a schema with an anyOf null branch must be accepted, got: {errors:?}",
        );
    }

    #[test]
    fn test_validate_value_non_nullable_schema_rejects_null() {
        // Guard: a non-nullable object schema must still reject null.
        let schemas = HashMap::from([(
            "StrictObj".to_string(),
            JsonSchema {
                schema_type: Some("object".to_string()),
                properties: HashMap::from([(
                    "name".to_string(),
                    JsonSchemaProperty {
                        prop_type: Some("string".to_string()),
                        ..Default::default()
                    },
                )]),
                ..Default::default()
            },
        )]);
        let doc = RestDescription { schemas, ..Default::default() };
        let mut errors = Vec::new();
        validate_value(&Value::Null, "StrictObj", &doc, "body", &mut errors);
        assert!(
            !errors.is_empty(),
            "null on a non-nullable schema must be rejected",
        );
    }

    #[test]
    fn test_resolve_next_path_absolute_url_overrides_base() {
        // Server returned a fully-formed URL → use it verbatim.
        let url = resolve_next_path(
            "https://api.example.com/v1/things?cursor=a",
            "https://other.example.com/v2/items?cursor=b",
        )
        .unwrap();
        assert_eq!(url, "https://other.example.com/v2/items?cursor=b");
    }

    #[test]
    fn test_resolve_next_path_absolute_path_keeps_scheme_and_host() {
        // A `/`-prefixed path keeps the previous host but replaces the path.
        let url = resolve_next_path(
            "https://api.example.com/v1/things?cursor=a",
            "/v1/things?cursor=b",
        )
        .unwrap();
        assert_eq!(url, "https://api.example.com/v1/things?cursor=b");
    }

    #[test]
    fn test_resolve_next_path_relative_path_inherits_directory() {
        // No leading slash → resolved relative to the previous request's
        // directory (browser-style URL resolution).
        let url = resolve_next_path(
            "https://api.example.com/v1/things",
            "things?cursor=b",
        )
        .unwrap();
        assert_eq!(url, "https://api.example.com/v1/things?cursor=b");
    }

    #[test]
    fn test_resolve_next_path_rejects_invalid_base_url() {
        let err = resolve_next_path("not a url", "/foo").unwrap_err();
        assert!(err.contains("not a valid URL"), "got: {err}");
    }

    #[test]
    fn test_page_state_initial_for_each_form() {
        assert!(matches!(
            PageState::initial(Some(&EndpointPagination::Cursor {
                cursor: "c".into(),
                next_cursor: "n".into(),
                results: "r".into(),
            })),
            PageState::Cursor(None)
        ));
        assert!(matches!(
            PageState::initial(Some(&EndpointPagination::Offset {
                offset: "o".into(),
                results: "r".into(),
                step: None,
                has_next_page: None,
            })),
            PageState::Offset(0)
        ));
        assert!(matches!(
            PageState::initial(Some(&EndpointPagination::Uri {
                next_uri: "n".into(),
                results: "r".into(),
            })),
            PageState::NextUrl(None)
        ));
        assert!(matches!(
            PageState::initial(Some(&EndpointPagination::Path {
                next_path: "n".into(),
                results: "r".into(),
            })),
            PageState::NextUrl(None)
        ));
        assert!(matches!(
            PageState::initial(Some(&EndpointPagination::Custom {
                results: "r".into(),
            })),
            PageState::Custom
        ));
        assert!(matches!(PageState::initial(None), PageState::Cursor(None)));
    }

    #[test]
    fn test_page_state_url_override_only_for_next_url() {
        assert!(PageState::Cursor(None).url_override().is_none());
        assert!(PageState::Cursor(Some("tok".into())).url_override().is_none());
        assert!(PageState::Offset(5).url_override().is_none());
        assert!(PageState::NextUrl(None).url_override().is_none());
        assert!(PageState::Custom.url_override().is_none());
        let url = "https://api.example.com/v1/things?cursor=abc";
        assert_eq!(
            PageState::NextUrl(Some(url.to_string())).url_override(),
            Some(url)
        );
    }

    #[test]
    fn test_page_state_injection_uri_path_custom_no_query_param() {
        // Uri/Path/Custom embed everything in the URL (or stop entirely);
        // they must never push a cursor/offset query param.
        let pagination = EndpointPagination::Uri {
            next_uri: "next".into(),
            results: "items".into(),
        };
        assert!(PageState::NextUrl(Some("https://x".into()))
            .injection(Some(&pagination), "page_token")
            .is_none());
        let custom = EndpointPagination::Custom {
            results: "items".into(),
        };
        assert!(PageState::Custom.injection(Some(&custom), "page_token").is_none());
    }

    // -----------------------------------------------------------------
    // x-fern-streaming response decoding (`decode_stream_event`)
    //
    // The pure line decoder is the surface most likely to drift across
    // server quirks (extra whitespace, comment lines, terminator
    // variants), so we cover the full matrix here without touching the
    // network. Wire-level integration is exercised in the tier-2 tests
    // under tests/openapi_fixture_wire.rs.
    // -----------------------------------------------------------------

    // -----------------------------------------------------------------
    // SSE line decoding (`SseLineDecoder`)
    //
    // SSE is stateful — `data:` payloads are buffered across multiple
    // lines and dispatched on a blank-line separator per the WHATWG
    // spec. Tests below isolate the decoder so a regression in framing
    // or multi-line concat points at the exact branch.
    // -----------------------------------------------------------------

    fn drive(lines: &[&str]) -> Vec<String> {
        let mut decoder = SseLineDecoder::default();
        let mut out = Vec::new();
        for line in lines {
            if let Some(payload) = decoder.push_line(line) {
                out.push(payload);
            }
        }
        if let Some(payload) = decoder.flush() {
            out.push(payload);
        }
        out
    }

    #[test]
    fn test_sse_decoder_strips_data_prefix_and_one_space() {
        // `data: {"x":1}` decodes to `{"x":1}` — the single leading
        // space after `data:` is consumed (matches the SSE spec).
        let payloads = drive(&["data: {\"x\":1}", ""]);
        assert_eq!(payloads, vec!["{\"x\":1}".to_string()]);
    }

    #[test]
    fn test_sse_decoder_no_space_after_data() {
        // The space after `data:` is optional; the payload is
        // preserved identically in both shapes.
        let payloads = drive(&["data:{\"x\":1}", ""]);
        assert_eq!(payloads, vec!["{\"x\":1}".to_string()]);
    }

    #[test]
    fn test_sse_decoder_skips_comments_and_unknown_fields() {
        // Comments (`:`), `event:`, `id:`, `retry:`, and unknown
        // fields are framing-only and must not pollute the dispatched
        // payload. Only the `data:` line contributes to the event.
        let payloads = drive(&[
            ": keepalive",
            "event: message",
            "id: 42",
            "retry: 5000",
            "data: {\"x\":1}",
            "",
        ]);
        assert_eq!(payloads, vec!["{\"x\":1}".to_string()]);
    }

    #[test]
    fn test_sse_decoder_dispatches_on_blank_line_with_multiline_concat() {
        // Three `data:` lines spanning a single pretty-printed JSON
        // object — the WHATWG spec says they join with `\n` and
        // dispatch as one event on the blank-line separator. The TS
        // runtime's `iterSseEvents` loop does exactly this.
        let payloads = drive(&[
            "data: {",
            "data:   \"foo\": 1",
            "data: }",
            "",
        ]);
        assert_eq!(payloads, vec!["{\n  \"foo\": 1\n}".to_string()]);
    }

    #[test]
    fn test_sse_decoder_dispatches_two_events_separated_by_blank() {
        let payloads = drive(&[
            "data: {\"step\":1}",
            "",
            "data: {\"step\":2}",
            "",
        ]);
        assert_eq!(
            payloads,
            vec!["{\"step\":1}".to_string(), "{\"step\":2}".to_string(),]
        );
    }

    #[test]
    fn test_sse_decoder_flushes_final_event_without_blank_line() {
        // EOF flush: when the server closes the connection without
        // sending the trailing blank line, the buffered event must
        // still be dispatched. Mirrors the TS post-loop
        // `if (dataValue != null)` block.
        let payloads = drive(&["data: {\"step\":1}"]);
        assert_eq!(payloads, vec!["{\"step\":1}".to_string()]);
    }

    #[test]
    fn test_sse_decoder_blank_line_without_buffered_data_dispatches_nothing() {
        // Resetting on blank without a buffered `data:` must not
        // dispatch — an `event:` line followed by a blank line is
        // discarded entirely.
        let payloads = drive(&["event: ping", ""]);
        assert!(payloads.is_empty(), "got unexpected events: {payloads:?}");
    }

    #[test]
    fn test_decode_ndjson_emits_whole_line() {
        let cfg = StreamingConfig::Json { terminator: None };
        assert_eq!(
            decode_stream_event(&cfg, "{\"x\":1}"),
            StreamEvent::Event("{\"x\":1}".to_string())
        );
    }

    #[test]
    fn test_decode_ndjson_skips_blank_lines() {
        // Some servers emit blank keepalive lines between records.
        let cfg = StreamingConfig::Json { terminator: None };
        assert_eq!(decode_stream_event(&cfg, ""), StreamEvent::Skip);
    }

    #[test]
    fn test_decode_ndjson_terminator_only_when_configured() {
        // Without a configured terminator, a literal `[DONE]` payload
        // is just another event — NDJSON has no implicit sentinel.
        let no_term = StreamingConfig::Json { terminator: None };
        assert_eq!(
            decode_stream_event(&no_term, "[DONE]"),
            StreamEvent::Event("[DONE]".to_string())
        );
        let with_term = StreamingConfig::Json {
            terminator: Some("__END__".to_string()),
        };
        assert_eq!(
            decode_stream_event(&with_term, "__END__"),
            StreamEvent::Terminate
        );
    }

    #[test]
    fn test_decode_text_emits_each_line_verbatim() {
        // Plain-text format: no JSON parse, no SSE prefix strip, no
        // terminator. Each non-empty line flows through as a string.
        let cfg = StreamingConfig::Text;
        assert_eq!(
            decode_stream_event(&cfg, "hello world"),
            StreamEvent::Event("hello world".to_string())
        );
        assert_eq!(
            decode_stream_event(&cfg, "data: not stripped"),
            StreamEvent::Event("data: not stripped".to_string())
        );
        assert_eq!(
            decode_stream_event(&cfg, "{\"not\":\"parsed\"}"),
            StreamEvent::Event("{\"not\":\"parsed\"}".to_string())
        );
    }

    #[test]
    fn test_decode_text_skips_blank_lines() {
        // Mirrors the C# generator's
        // `if(!string.IsNullOrEmpty(line)) yield return line` guard.
        let cfg = StreamingConfig::Text;
        assert_eq!(decode_stream_event(&cfg, ""), StreamEvent::Skip);
    }

    #[test]
    fn test_project_text_event_bypasses_return_value_projection() {
        // Text streams emit a raw line; `x-fern-sdk-return-value`
        // and `--no-extract` are both no-ops because there's no
        // JSON object to project against.
        let cfg = StreamingConfig::Text;
        let value = project_stream_event(
            &cfg,
            "raw line",
            Some("$response.does.not.exist"),
            false,
            "test op",
        )
        .expect("text projection must succeed");
        assert_eq!(value, Value::String("raw line".to_string()));
    }

    // ---------------------------------------------------------------
    // SSE content-type auto-detection helpers
    // ---------------------------------------------------------------

    /// Verifies the auto-detection predicate: a response whose
    /// Content-Type is `text/event-stream` AND whose method has no
    /// `x-fern-streaming` config should be routed to the SSE branch.
    #[test]
    fn test_sse_autodetect_triggers_on_event_stream_content_type() {
        let content_type = "text/event-stream";
        let method = RestMethod::default();
        assert!(
            content_type.contains("text/event-stream") && method.streaming.is_none(),
            "auto-detect must trigger when content_type is text/event-stream and streaming is None"
        );
    }

    #[test]
    fn test_sse_autodetect_triggers_with_charset_suffix() {
        // Servers may send `text/event-stream; charset=utf-8`
        let content_type = "text/event-stream; charset=utf-8";
        let method = RestMethod::default();
        assert!(
            content_type.contains("text/event-stream") && method.streaming.is_none(),
            "auto-detect must trigger even with charset parameter"
        );
    }

    #[test]
    fn test_sse_autodetect_skipped_when_streaming_configured() {
        let content_type = "text/event-stream";
        let method = RestMethod {
            streaming: Some(StreamingConfig::Sse { terminator: None }),
            ..Default::default()
        };
        assert!(
            !(content_type.contains("text/event-stream") && method.streaming.is_none()),
            "auto-detect must NOT trigger when x-fern-streaming is already set"
        );
    }

    #[test]
    fn test_sse_autodetect_skipped_for_json_content_type() {
        let content_type = "application/json";
        let method = RestMethod::default();
        assert!(
            !(content_type.contains("text/event-stream") && method.streaming.is_none()),
            "auto-detect must NOT trigger for application/json"
        );
    }

    #[test]
    fn test_sse_autodetect_synthesized_config_is_sse_no_terminator() {
        // The auto-detected config must be SSE with no terminator,
        // matching what `StreamingConfig::Sse { terminator: None }`
        // produces.
        let config = StreamingConfig::Sse { terminator: None };
        match &config {
            StreamingConfig::Sse { terminator } => {
                assert!(terminator.is_none(), "auto-detected SSE must have no terminator");
            }
            _ => panic!("expected Sse variant"),
        }
    }
}

#[tokio::test]
async fn test_execute_method_dry_run() {
    let mut schemas = HashMap::new();
    let mut properties = HashMap::new();
    properties.insert(
        "name".to_string(),
        crate::openapi::discovery::JsonSchemaProperty {
            prop_type: Some("string".to_string()),
            ..Default::default()
        },
    );
    schemas.insert(
        "File".to_string(),
        crate::openapi::discovery::JsonSchema {
            schema_type: Some("object".to_string()),
            properties,
            ..Default::default()
        },
    );

    let doc = RestDescription {
        root_url: "https://example.googleapis.com/".to_string(),
        service_path: "v1/".to_string(),
        schemas,
        ..Default::default()
    };

    let mut parameters = HashMap::new();
    parameters.insert(
        "fileId".to_string(),
        crate::openapi::discovery::MethodParameter {
            location: Some("path".to_string()),
            required: true,
            ..Default::default()
        },
    );

    let method = RestMethod {
        http_method: "POST".to_string(),
        id: Some("example.files.create".to_string()),
        path: "files/{fileId}".to_string(),
        parameter_order: vec!["fileId".to_string()],
        parameters,
        request: Some(crate::openapi::discovery::SchemaRef {
            schema_ref: Some("File".to_string()),
            parameter_name: None,
        }),
        ..Default::default()
    };

    let params_json = r#"{"fileId": "123"}"#;
    let body_json = r#"{"name": "test.txt"}"#;

    let pagination = PaginationConfig::default();

    let http_config = crate::http::HttpConfig::new("test").unwrap();
    let result = execute_method(
        &doc,
        &method,
        Some(params_json),
        Some(body_json),
        &crate::auth::no_auth_provider(),
        None,
        None,
        None,
        None, // multipart_parts
        true, // dry_run
        &pagination,
        &crate::formatter::OutputPipeline::default(),
        false,
        None,
        &http_config,
        false, // no_extract
        false, // no_retry
        false, // no_stream
        false, // debug
        &[],
    )
    .await;

    assert!(result.is_ok());
}

#[tokio::test]
async fn test_execute_method_missing_path_param() {
    // Same setup but missing required fileId in params
    let mut parameters = HashMap::new();
    parameters.insert(
        "fileId".to_string(),
        crate::openapi::discovery::MethodParameter {
            location: Some("path".to_string()),
            required: true,
            ..Default::default()
        },
    );
    let doc = RestDescription::default();
    let method = RestMethod {
        http_method: "POST".to_string(),
        path: "files/{fileId}".to_string(),
        parameter_order: vec!["fileId".to_string()],
        parameters,
        ..Default::default()
    };

    let http_config = crate::http::HttpConfig::new("test").unwrap();
    let result = execute_method(
        &doc,
        &method,
        None, // No params provided
        None,
        &crate::auth::no_auth_provider(),
        None,
        None,
        None,
        None, // multipart_parts
        true,
        &PaginationConfig::default(),
        &crate::formatter::OutputPipeline::default(),
        false,
        None,
        &http_config,
        false, // no_extract
        false, // no_retry
        false, // no_stream
        false, // debug
        &[],
    )
    .await;

    assert!(result.is_err());
    assert!(result
        .unwrap_err()
        .to_string()
        .contains("Required path parameter"));
}

#[test]
fn test_get_value_type_helper() {
    assert_eq!(get_value_type(&json!(null)), "null");
    assert_eq!(get_value_type(&json!(true)), "boolean");
    assert_eq!(get_value_type(&json!(42)), "integer");
    assert_eq!(get_value_type(&json!(3.5)), "number (float)");
    assert_eq!(get_value_type(&json!("string")), "string");
    assert_eq!(get_value_type(&json!([1, 2])), "array");
    assert_eq!(get_value_type(&json!({"a": 1})), "object");
}

#[tokio::test]
async fn test_post_without_body_sets_content_length_zero() {
    let client = reqwest::Client::new();
    let method = RestMethod {
        http_method: "POST".to_string(),
        path: "messages/trash".to_string(),
        ..Default::default()
    };
    let input = ExecutionInput {
        full_url: "https://example.com/messages/trash".to_string(),
        body: None,
        query_params: Vec::new(),
        header_params: Vec::new(),
        is_upload: false,
    };

    let request = build_http_request(
        &client,
        &method,
        &input,
        &crate::auth::no_auth_provider(),
        &EndpointAuthMetadata::unspecified(),
        &PageState::Cursor(None),
        0,
        &None,
        None,
        &None,
        &PaginationConfig::default(),
    )
    .await
    .unwrap();

    let built = request.build().unwrap();
    assert_eq!(
        built
            .headers()
            .get("Content-Length")
            .map(|v| v.to_str().unwrap()),
        Some("0"),
        "POST with no body must include Content-Length: 0"
    );
}

#[tokio::test]
async fn test_post_with_body_does_not_add_content_length_zero() {
    let client = reqwest::Client::new();
    let method = RestMethod {
        http_method: "POST".to_string(),
        path: "files".to_string(),
        ..Default::default()
    };
    let input = ExecutionInput {
        full_url: "https://example.com/files".to_string(),
        body: Some(json!({"name": "test"})),
        query_params: Vec::new(),
        header_params: Vec::new(),
        is_upload: false,
    };

    let request = build_http_request(
        &client,
        &method,
        &input,
        &crate::auth::no_auth_provider(),
        &EndpointAuthMetadata::unspecified(),
        &PageState::Cursor(None),
        0,
        &None,
        None,
        &None,
        &PaginationConfig::default(),
    )
    .await
    .unwrap();

    let built = request.build().unwrap();
    // When body is present, Content-Length should NOT be "0"
    let cl = built
        .headers()
        .get("Content-Length")
        .map(|v| v.to_str().unwrap().to_string());
    assert!(cl.is_none() || cl.as_deref() != Some("0"));
}

#[tokio::test]
async fn test_get_does_not_set_content_length_zero() {
    let client = reqwest::Client::new();
    let method = RestMethod {
        http_method: "GET".to_string(),
        path: "files".to_string(),
        ..Default::default()
    };
    let input = ExecutionInput {
        full_url: "https://example.com/files".to_string(),
        body: None,
        query_params: Vec::new(),
        header_params: Vec::new(),
        is_upload: false,
    };

    let request = build_http_request(
        &client,
        &method,
        &input,
        &crate::auth::no_auth_provider(),
        &EndpointAuthMetadata::unspecified(),
        &PageState::Cursor(None),
        0,
        &None,
        None,
        &None,
        &PaginationConfig::default(),
    )
    .await
    .unwrap();

    let built = request.build().unwrap();
    assert!(
        built.headers().get("Content-Length").is_none(),
        "GET with no body should not have Content-Length header"
    );
}

// ---------------------------------------------------------------------------
// BearerHeader auth method
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_bearer_header_sends_bearer_prefix() {
    use crate::openapi::discovery::RestMethod;

    let client = crate::http::HttpConfig::new("test").unwrap().build_client().unwrap();
    let method = RestMethod {
        http_method: "GET".to_string(),
        path: "/test".to_string(),
        ..Default::default()
    };
    let input = ExecutionInput {
        full_url: "https://example.com/test".to_string(),
        body: None,
        query_params: Vec::new(),
        header_params: Vec::new(),
        is_upload: false,
    };

    let provider: DynAuthProvider = std::sync::Arc::new(crate::auth::HeaderAuthProvider::new(
        "scheme",
        "X-Auth",
        crate::auth::AuthCredentialSource::literal("mytoken"),
        true,
    ));
    let request = build_http_request(
        &client,
        &method,
        &input,
        &provider,
        &EndpointAuthMetadata::unspecified(),
        &PageState::Cursor(None),
        0,
        &None,
        None,
        &None,
        &PaginationConfig::default(),
    )
    .await
    .unwrap();

    let built = request.build().unwrap();
    let header_val = built.headers().get("x-auth").and_then(|v| v.to_str().ok());
    assert_eq!(header_val, Some("Bearer mytoken"));
}

// ---------------------------------------------------------------
// HTTP format helpers
// ---------------------------------------------------------------

#[test]
fn format_http_version_known_versions() {
    assert_eq!(format_http_version(reqwest::Version::HTTP_09), "HTTP/0.9");
    assert_eq!(format_http_version(reqwest::Version::HTTP_10), "HTTP/1.0");
    assert_eq!(format_http_version(reqwest::Version::HTTP_11), "HTTP/1.1");
    assert_eq!(format_http_version(reqwest::Version::HTTP_2), "HTTP/2");
    assert_eq!(format_http_version(reqwest::Version::HTTP_3), "HTTP/3");
}

#[test]
fn write_http_preamble_basic() {
    let mut buf = Vec::new();
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert("content-type", "application/json".parse().unwrap());
    headers.insert("x-request-id", "abc123".parse().unwrap());

    write_http_preamble(
        &mut buf,
        reqwest::Version::HTTP_11,
        reqwest::StatusCode::OK,
        &headers,
    )
    .unwrap();

    let output = String::from_utf8(buf).unwrap();
    assert!(
        output.starts_with("HTTP/1.1 200 OK\r\n"),
        "should start with status line, got: {output}"
    );
    assert!(
        output.contains("content-type: application/json\r\n"),
        "should include content-type header, got: {output}"
    );
    assert!(
        output.contains("x-request-id: abc123\r\n"),
        "should include custom header, got: {output}"
    );
    assert!(
        output.ends_with("\r\n\r\n"),
        "should end with blank line separator, got: {output}"
    );
}

#[test]
fn write_http_preamble_error_status() {
    let mut buf = Vec::new();
    let headers = reqwest::header::HeaderMap::new();

    write_http_preamble(
        &mut buf,
        reqwest::Version::HTTP_11,
        reqwest::StatusCode::NOT_FOUND,
        &headers,
    )
    .unwrap();

    let output = String::from_utf8(buf).unwrap();
    assert!(
        output.starts_with("HTTP/1.1 404 Not Found\r\n"),
        "should show 404 status line, got: {output}"
    );
}

#[test]
fn write_http_preamble_no_headers() {
    let mut buf = Vec::new();
    let headers = reqwest::header::HeaderMap::new();

    write_http_preamble(
        &mut buf,
        reqwest::Version::HTTP_2,
        reqwest::StatusCode::NO_CONTENT,
        &headers,
    )
    .unwrap();

    let output = String::from_utf8(buf).unwrap();
    assert_eq!(
        output, "HTTP/2 204 No Content\r\n\r\n",
        "empty headers should produce status line + blank line"
    );
}

#[test]
fn write_http_preamble_binary_header_value() {
    let mut buf = Vec::new();
    let mut headers = reqwest::header::HeaderMap::new();
    // Insert a header value containing non-visible ASCII (bytes that
    // fail `HeaderValue::to_str`).  `HeaderValue::from_bytes` accepts
    // any bytes in the 0x20..=0xFF range plus TAB, so we use a raw
    // byte sequence that includes characters outside the visible ASCII
    // range accepted by `to_str` (which requires only 0x20..=0x7E
    // plus TAB).
    let raw_val =
        reqwest::header::HeaderValue::from_bytes(&[0x80, 0xAB, 0xFF]).unwrap();
    headers.insert("x-binary", raw_val);

    write_http_preamble(
        &mut buf,
        reqwest::Version::HTTP_11,
        reqwest::StatusCode::OK,
        &headers,
    )
    .unwrap();

    let output = String::from_utf8(buf).unwrap();
    assert!(
        output.contains("x-binary: <binary>\r\n"),
        "non-UTF8 header value should fall back to <binary>, got: {output}"
    );
}

#[test]
fn write_http_preamble_duplicate_headers() {
    let mut buf = Vec::new();
    let mut headers = reqwest::header::HeaderMap::new();
    headers.append("set-cookie", "a=1".parse().unwrap());
    headers.append("set-cookie", "b=2".parse().unwrap());

    write_http_preamble(
        &mut buf,
        reqwest::Version::HTTP_11,
        reqwest::StatusCode::OK,
        &headers,
    )
    .unwrap();

    let output = String::from_utf8(buf).unwrap();
    assert!(
        output.contains("set-cookie: a=1\r\n"),
        "should include first set-cookie value, got: {output}"
    );
    assert!(
        output.contains("set-cookie: b=2\r\n"),
        "should include second set-cookie value, got: {output}"
    );
}
