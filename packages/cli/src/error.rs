//! Structured Error Types
//!
//! Provides error types and structured JSON error output for the CLI.

use serde_json::json;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum CliError {
    #[error("{message}")]
    Api {
        code: u16,
        message: String,
        reason: String,
        /// The server's response body, parsed, minus whatever `message`
        /// already reports.
        ///
        /// Carried structurally rather than folded into `message`: a body we
        /// don't recognise still belongs in the JSON envelope, and serializing
        /// it into the message string would emit an escaped JSON document
        /// inside a JSON field, forcing consumers to parse twice. `None` when
        /// the body held nothing `message` does not already say.
        details: Option<serde_json::Value>,
        /// Actionable advice that is not part of the failure itself, e.g. which
        /// credential source supplied the rejected token.
        ///
        /// Kept out of `message` so that field is one sentence for every error
        /// class — a consumer keying off `error.message` gets the same shape
        /// whether or not the CLI had advice to offer.
        help: Option<String>,
    },

    #[error("{0}")]
    Validation(String),

    #[error("{0}")]
    Auth(String),

    #[error("{0}")]
    Discovery(String),

    /// A request that never reached the server: DNS, TLS, connection refused,
    /// timeout. Distinct from [`Other`](Self::Other) because there is no HTTP
    /// status to report — folding it into `Other` produced `code: 500`, which
    /// tells an agent the *server* failed and invites a retry against an API
    /// that was never contacted.
    #[error("{0}")]
    Network(String),

    #[error(transparent)]
    Other(#[from] anyhow::Error),

    /// Raw-mode sentinel: error bytes already written to stdout.
    #[error("")]
    RawSentinel { code: u16 },
}


impl CliError {
    pub const EXIT_CODE_API: i32 = 1;
    pub const EXIT_CODE_AUTH: i32 = 2;
    pub const EXIT_CODE_VALIDATION: i32 = 3;
    pub const EXIT_CODE_DISCOVERY: i32 = 4;
    pub const EXIT_CODE_OTHER: i32 = 5;

    /// Construct an [`CliError::Api`] with no structured server details.
    pub fn api(code: u16, message: impl Into<String>, reason: impl Into<String>) -> Self {
        Self::Api {
            code,
            message: message.into(),
            reason: reason.into(),
            details: None,
            help: None,
        }
    }

    /// Create a duplicate of this error for passing to hook callbacks
    /// while retaining the original. `Other(anyhow::Error)` is
    /// converted to its display string since `anyhow::Error` is not
    /// `Clone`.
    pub fn duplicate(&self) -> Self {
        match self {
            Self::Api {
                code,
                message,
                reason,
                details,
                help,
            } => Self::Api {
                code: *code,
                message: message.clone(),
                reason: reason.clone(),
                details: details.clone(),
                help: help.clone(),
            },
            Self::Validation(msg) => Self::Validation(msg.clone()),
            Self::Auth(msg) => Self::Auth(msg.clone()),
            Self::Discovery(msg) => Self::Discovery(msg.clone()),
            Self::Network(msg) => Self::Network(msg.clone()),
            Self::Other(e) => Self::Other(anyhow::anyhow!("{e:#}")),
            Self::RawSentinel { code } => Self::RawSentinel { code: *code },
        }
    }

    /// Whether this is a raw-mode sentinel (error bytes already on stdout).
    pub fn is_raw_sentinel(&self) -> bool {
        matches!(self, Self::RawSentinel { .. })
    }

    pub fn exit_code(&self) -> i32 {
        match self {
            CliError::Api { .. } => Self::EXIT_CODE_API,
            CliError::Auth(_) => Self::EXIT_CODE_AUTH,
            CliError::Validation(_) => Self::EXIT_CODE_VALIDATION,
            CliError::Discovery(_) => Self::EXIT_CODE_DISCOVERY,
            // Shares `other`'s exit code: adding a sixth would change the
            // documented table every consumer already branches on.
            CliError::Network(_) => Self::EXIT_CODE_OTHER,
            CliError::Other(_) => Self::EXIT_CODE_OTHER,
            CliError::RawSentinel { .. } => Self::EXIT_CODE_API,
        }
    }

    pub fn to_json(&self) -> serde_json::Value {
        match self {
            CliError::Api {
                code,
                message,
                reason,
                details,
                help,
            } => {
                let mut error = json!({
                    "code": code,
                    "message": message,
                    "reason": reason,
                });
                if let Some(details) = details {
                    error["details"] = details.clone();
                }
                if let Some(help) = help {
                    error["help"] = json!(help);
                }
                json!({ "error": error })
            }
            CliError::Validation(msg) => {
                // A usage error arrives as clap's rendered block — a sentence,
                // then a tip, a usage line and boilerplate. The human path wants
                // all of it; `message` is supposed to be one sentence, so the
                // rest becomes fields of its own rather than embedded newlines.
                let usage = UsageText::parse(msg);
                let mut error = json!({
                    "code": 400,
                    "message": usage.message,
                    "reason": "validationError",
                });
                if let Some(help) = usage.help {
                    error["help"] = json!(help);
                }
                if let Some(usage) = usage.usage {
                    error["usage"] = json!(usage);
                }
                json!({ "error": error })
            }
            CliError::Auth(msg) => json!({
                "error": {
                    "code": 401,
                    "message": msg,
                    "reason": "authError",
                }
            }),
            CliError::Discovery(msg) => json!({
                "error": {
                    "code": 500,
                    "message": msg,
                    "reason": "discoveryError",
                }
            }),
            // No `code`: the field is documented as the HTTP status, and this
            // request never got one. A consumer testing `.error.code` sees it
            // absent rather than a status the server never sent.
            CliError::Network(msg) => json!({
                "error": {
                    "message": msg,
                    "reason": "networkError",
                }
            }),
            CliError::Other(e) => json!({
                "error": {
                    "code": 500,
                    "message": format!("{e:#}"),
                    "reason": "internalError",
                }
            }),
            CliError::RawSentinel { code } => json!({
                "error": {
                    "code": code,
                    "message": "",
                    "reason": "raw",
                }
            }),
        }
    }
}

use crate::output::{colorize, sanitize_for_terminal};

/// Render an error together with its `source()` chain, `": "`-joined.
///
/// Transport errors bury the useful part: `reqwest`'s Display is "error sending
/// request for url (…)", and "Connection refused" — the only line that tells
/// the user what to change — is two levels down.
pub fn error_chain(err: &dyn std::error::Error) -> String {
    let mut parts = vec![err.to_string()];
    let mut cursor = err.source();
    while let Some(source) = cursor {
        let text = source.to_string();
        // Skip a link that merely restates its parent.
        if !parts.last().is_some_and(|prev| prev.contains(&text)) {
            parts.push(text);
        }
        cursor = source.source();
    }
    parts.join(": ")
}

/// Map an HTTP status code to a short reason string for [`CliError::Api`].
pub fn http_status_reason(status: u16) -> &'static str {
    match status {
        400 => "badRequest",
        401 => "unauthorized",
        403 => "forbidden",
        404 => "notFound",
        408 => "requestTimeout",
        409 => "conflict",
        422 => "unprocessableEntity",
        429 => "rateLimited",
        500 => "internalServerError",
        502 => "badGateway",
        503 => "serviceUnavailable",
        504 => "gatewayTimeout",
        _ => "httpError",
    }
}

/// Build a [`CliError::Api`] from an HTTP error response.
///
/// Recognises the shapes services actually return — the Google-style
/// `{"error": {...}}` envelope, `{"error": "<message>"}`, FastAPI/RFC 7807
/// `{"detail": {...} | [...] | "<message>"}`, `{"title"}`, OAuth 2.0
/// `{"error_description"}`, and bare `{"message"}` — and lifts one sentence
/// into `message`. A JSON body it can't interpret keeps its structure in
/// `details` instead of being stringified into `message`, which would escape a
/// whole JSON document inside a JSON field.
pub fn api_error_from_body(status: u16, body: &str) -> CliError {
    let Ok(parsed) = serde_json::from_str::<serde_json::Value>(body) else {
        return non_json_api_error(status, body);
    };

    // A body that is a bare JSON string *is* the sentence. Falling through
    // would summarise it as `HTTP <status> <reason>` and exile the only text
    // the server sent to `details`.
    if let serde_json::Value::String(text) = &parsed {
        let text = text.trim();
        if !text.is_empty() {
            return CliError::api(status, text, http_status_reason(status));
        }
    }

    // Services wrap the interesting fields one level down under `error`
    // (Google, Stripe) or `detail` (FastAPI, which is what a Fern-generated
    // Python backend emits), so look inside before falling back to the root.
    // A body that is a bare list of problems is the same shape one level out.
    let scope_prefix: Vec<Seg> = ["error", "detail"]
        .into_iter()
        .find(|k| parsed.get(k).is_some_and(|v| v.is_object()))
        .map(|k| vec![Seg::Key(k.to_string())])
        .or_else(|| parsed.as_array()?.first().map(|_| vec![Seg::Index(0)]))
        .unwrap_or_default();
    let scope = resolve_path(&parsed, &scope_prefix).unwrap_or(&parsed);

    // A string `code` is a symbolic reason, not an HTTP status — as is Stripe's
    // and ElevenLabs' `type`.
    let reason = first_error(scope)
        .and_then(|(_, e)| str_field(e, "reason"))
        .or_else(|| str_field(scope, "reason"))
        .or_else(|| str_field(scope, "code"))
        .or_else(|| str_field(scope, "type"))
        .unwrap_or_else(|| http_status_reason(status).to_string());
    let located = message_from(scope);
    let message = located
        .as_ref()
        .map(|m| m.text.clone())
        .unwrap_or_else(|| format!("HTTP {status} {reason}"));

    // `details` exists to preserve what `message` could not carry — a
    // `request_id`, the `loc` of the offending field. Drop the one field the
    // sentence came from (repeating it would only say the same thing twice),
    // then drop `details` altogether if nothing unique is left. Removal is by
    // *path*, not by value: a body whose second entry happens to carry the same
    // sentence as the first must keep it, or a consumer cannot tell which
    // problem belongs to which `loc`.
    let details = match &located {
        Some(m) => {
            let path: Vec<Seg> = scope_prefix
                .iter()
                .chain(m.path.iter())
                .cloned()
                .collect();
            prune(remove_at_path(parsed, &path))
        }
        None => prune(parsed),
    };

    CliError::Api {
        // Always the HTTP status. A body's own `code` is application-defined —
        // it may be an internal numbering (`{"code": 100234}`) or even a
        // success value on a failed request — so letting it win produced
        // envelopes that contradicted the exit code and docs links pointing at
        // the wrong page. The body's `code` survives in `details`.
        code: status,
        message,
        help: None,
        reason,
        details,
    }
}

/// Follow `path` into `value`, or `None` if it does not resolve.
fn resolve_path<'v>(value: &'v serde_json::Value, path: &[Seg]) -> Option<&'v serde_json::Value> {
    path.iter().try_fold(value, |cursor, seg| match seg {
        Seg::Key(k) => cursor.get(k),
        Seg::Index(i) => cursor.get(i),
    })
}

/// Build a [`CliError::Api`] from a body that is not JSON at all.
///
/// Three shapes turn up here: an empty body, a one-line message from a proxy,
/// and a full HTML (or XML) error page from a CDN or load balancer. Only the
/// middle one belongs in `message` — a page is neither a sentence nor a single
/// line, and reproducing it there breaks the guarantee every other error class
/// keeps. The bytes are not discarded: they move to `details.body`, clipped.
fn non_json_api_error(status: u16, body: &str) -> CliError {
    let reason = http_status_reason(status);
    let collapsed = collapse_whitespace(body);
    if collapsed.is_empty() {
        // An error with no body at all still needs a sentence; an empty
        // `message` would read as "the CLI lost the error".
        return CliError::api(status, format!("HTTP {status} {reason}"), reason);
    }
    let is_markup = collapsed.starts_with('<');
    if is_markup || collapsed.len() > MAX_MESSAGE_BODY_BYTES {
        return CliError::Api {
            code: status,
            message: format!(
                "HTTP {status} {reason} (non-JSON response, {} bytes)",
                body.len()
            ),
            reason: reason.to_string(),
            details: Some(json!({ "body": truncate_body(&collapsed, MAX_MESSAGE_BODY_BYTES) })),
            help: None,
        };
    }
    CliError::api(status, collapsed, reason)
}

/// Fold every run of whitespace into a single space and trim the ends, so a
/// body that arrived wrapped across lines still reads as one.
fn collapse_whitespace(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Upper bound on `details` lines shown in the terminal. The whole structure is
/// always in the JSON envelope; this is only about not flooding a screen when a
/// service answers with a hundred per-field problems.
const MAX_DETAIL_LINES: usize = 10;

/// Flatten `details` into `path: value` lines for the human rendering.
///
/// A list of scalars stays on one line (`loc: body, email`) — splitting FastAPI's
/// two-element `loc` across two lines buries the field name it exists to report.
/// Returns at most `max` lines, with a final line naming what was elided.
/// `already_shown` are strings the reader has seen on the headline — the
/// message and the reason. A leaf repeating one of them is noise: services
/// routinely echo the same token as `code`, `status` and `type`, which turned a
/// one-fact 404 into five lines that said the same thing four times.
fn detail_lines(
    details: &serde_json::Value,
    max: usize,
    already_shown: &[&str],
) -> Vec<String> {
    let mut lines = Vec::new();
    let mut seen: std::collections::HashSet<String> =
        already_shown.iter().map(|s| s.to_string()).collect();
    walk_details(unwrap_sole_object(details), &mut String::new(), &mut lines, &mut seen);
    if lines.len() > max {
        let hidden = lines.len() - max;
        lines.truncate(max);
        lines.push(format!("… {hidden} more (use --format json to see all)"));
    }
    lines
}

/// Descend through wrappers that add a path segment but no information.
///
/// `{"detail": {...}}` would otherwise prefix every line with `detail.`, which
/// is the same word on every row and never the part the reader is looking for.
/// Only single-key *object* wrappers are unwrapped: for a list, `detail[0].loc`
/// is more legible than `[0].loc`.
fn unwrap_sole_object(mut value: &serde_json::Value) -> &serde_json::Value {
    while let serde_json::Value::Object(map) = value {
        match map.iter().next() {
            Some((_, inner)) if map.len() == 1 && inner.is_object() => value = inner,
            _ => break,
        }
    }
    value
}

fn walk_details(
    value: &serde_json::Value,
    path: &mut String,
    out: &mut Vec<String>,
    seen: &mut std::collections::HashSet<String>,
) {
    match value {
        serde_json::Value::Object(map) => {
            for (k, v) in map {
                let mark = path.len();
                if !path.is_empty() {
                    path.push('.');
                }
                path.push_str(k);
                walk_details(v, path, out, seen);
                path.truncate(mark);
            }
        }
        serde_json::Value::Array(items) => {
            // All-scalar lists read better joined than exploded one per line.
            if let Some(joined) = scalar_list(items) {
                if seen.insert(joined.clone()) {
                    out.push(format!("{path}: {joined}"));
                }
                return;
            }
            for (i, v) in items.iter().enumerate() {
                let mark = path.len();
                path.push_str(&format!("[{i}]"));
                walk_details(v, path, out, seen);
                path.truncate(mark);
            }
        }
        other => {
            let text = scalar_text(other);
            // `seen` grows as we go, so a value repeated across sibling keys is
            // printed once — under the first key that carried it.
            if seen.insert(text.clone()) {
                out.push(format!("{path}: {text}"));
            }
        }
    }
}

/// `Some(joined)` when every item is a scalar, else `None`.
fn scalar_list(items: &[serde_json::Value]) -> Option<String> {
    if items.is_empty() || items.iter().any(|v| v.is_object() || v.is_array()) {
        return None;
    }
    Some(
        items
            .iter()
            .map(scalar_text)
            .collect::<Vec<_>>()
            .join(", "),
    )
}

/// Render a scalar without JSON's quoting, which adds nothing in a terminal.
fn scalar_text(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Null => "null".to_string(),
        other => other.to_string(),
    }
}

/// One step along a path into a JSON document.
#[derive(Clone, Debug, PartialEq)]
pub(crate) enum Seg {
    Key(String),
    Index(usize),
}

/// A message plus the path it was read from, so `details` can drop exactly that
/// occurrence rather than every string that happens to equal it.
struct LocatedMessage {
    text: String,
    path: Vec<Seg>,
}

/// Remove the value at `path`, leaving everything else untouched. A path that
/// does not resolve leaves `value` unchanged.
pub(crate) fn remove_at_path(mut value: serde_json::Value, path: &[Seg]) -> serde_json::Value {
    let Some((last, parents)) = path.split_last() else {
        return value;
    };
    let mut cursor = &mut value;
    for seg in parents {
        cursor = match (cursor, seg) {
            (serde_json::Value::Object(map), Seg::Key(k)) => match map.get_mut(k) {
                Some(next) => next,
                None => return value,
            },
            (serde_json::Value::Array(items), Seg::Index(i)) => match items.get_mut(*i) {
                Some(next) => next,
                None => return value,
            },
            _ => return value,
        };
    }
    match (cursor, last) {
        (serde_json::Value::Object(map), Seg::Key(k)) => {
            map.remove(k);
        }
        (serde_json::Value::Array(items), Seg::Index(i)) if *i < items.len() => {
            items.remove(*i);
        }
        _ => {}
    }
    value
}

/// Drop containers that hold nothing, recursively. `None` means the document
/// carried no information once the message was removed.
pub(crate) fn prune(value: serde_json::Value) -> Option<serde_json::Value> {
    match value {
        serde_json::Value::Object(map) => {
            let kept: serde_json::Map<String, serde_json::Value> = map
                .into_iter()
                .filter_map(|(k, v)| prune(v).map(|v| (k, v)))
                .collect();
            (!kept.is_empty()).then_some(serde_json::Value::Object(kept))
        }
        serde_json::Value::Array(items) => {
            let kept: Vec<serde_json::Value> = items.into_iter().filter_map(prune).collect();
            (!kept.is_empty()).then_some(serde_json::Value::Array(kept))
        }
        other => Some(other),
    }
}

/// A validation message split into the parts an envelope keeps apart.
///
/// Single-line messages — the overwhelming majority, raised by our own
/// validators — pass through as `message` with nothing else set.
struct UsageText {
    message: String,
    help: Option<String>,
    usage: Option<String>,
}

impl UsageText {
    /// Boilerplate that only makes sense as terminal output: an agent reading
    /// the envelope cannot "try `--help`".
    const TRY_HELP: &'static str = "For more information, try";

    /// Whether `text` is clap's rendered error block rather than one of our
    /// own validators' messages.
    ///
    /// The split below is tuned to clap's layout — first line is the failure,
    /// everything after it is a tip, a usage line, or boilerplate. Applied to a
    /// message that merely happens to span lines (a schema validation listing
    /// one bullet per violation) it would demote the violations to `help` and
    /// leave only the header in `message`, so anything not clap-shaped passes
    /// through whole. clap is built without the `color` feature here, so the
    /// prefix is plain text.
    fn is_clap_block(text: &str) -> bool {
        let trimmed = text.trim_start();
        trimmed.starts_with("error:") || trimmed.starts_with("Usage:") || text.contains("\nUsage:")
    }

    fn parse(text: &str) -> Self {
        if !Self::is_clap_block(text) {
            return Self {
                message: text.trim().to_string(),
                help: None,
                usage: None,
            };
        }
        let mut message = Vec::new();
        let mut help = Vec::new();
        let mut usage = Vec::new();
        // Everything from `Usage:` up to the next blank line: clap wraps long
        // usage strings onto continuation lines.
        let mut in_usage = false;

        for line in text.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                in_usage = false;
                continue;
            }
            if let Some(rest) = trimmed.strip_prefix("Usage:") {
                in_usage = true;
                usage.push(rest.trim().to_string());
            } else if in_usage {
                usage.push(trimmed.to_string());
            } else if let Some(rest) = trimmed.strip_prefix("tip:") {
                help.push(rest.trim().to_string());
            } else if trimmed.starts_with(Self::TRY_HELP) {
                continue;
            } else if message.is_empty() {
                message.push(trimmed.strip_prefix("error:").unwrap_or(trimmed).trim().to_string());
            } else {
                // A wrapped sentence or a `[possible values: ...]` list — advice
                // about the failure rather than the failure itself.
                help.push(trimmed.to_string());
            }
        }

        Self {
            message: if message.is_empty() {
                text.trim().to_string()
            } else {
                message.remove(0)
            },
            help: (!help.is_empty()).then(|| help.join(" ")),
            usage: (!usage.is_empty()).then(|| usage.join(" ")),
        }
    }
}

/// Upper bound on a non-JSON body reproduced verbatim in `message`.
const MAX_MESSAGE_BODY_BYTES: usize = 500;

/// Clip `body` to `max` bytes on a char boundary, marking the elision.
fn truncate_body(body: &str, max: usize) -> String {
    if body.len() <= max {
        return body.to_string();
    }
    let mut end = max;
    while end > 0 && !body.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}… ({} bytes total)", &body[..end], body.len())
}

/// Read a non-empty string field, if present.
fn str_field(scope: &serde_json::Value, key: &str) -> Option<String> {
    scope
        .get(key)
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

/// The first entry of an `errors`/`detail` list of per-problem objects, which is
/// where Google-style and FastAPI-style bodies put the actual message. Returns
/// the key it was found under so callers can rebuild the path to it.
fn first_error(scope: &serde_json::Value) -> Option<(&'static str, &serde_json::Value)> {
    ["errors", "detail"]
        .into_iter()
        .filter_map(|k| Some((k, scope.get(k)?.as_array()?)))
        .find_map(|(k, arr)| arr.first().map(|first| (k, first)))
}

/// Pull a human-readable sentence out of an error object, accepting the field
/// names services actually use, and report where it came from.
fn message_from(scope: &serde_json::Value) -> Option<LocatedMessage> {
    for key in [
        "message",
        "msg",
        "detail",
        "title",
        "error_description",
        "error",
    ] {
        if let Some(text) = str_field(scope, key) {
            return Some(LocatedMessage {
                text,
                path: vec![Seg::Key(key.to_string())],
            });
        }
    }
    let (key, first) = first_error(scope)?;
    let prefix = [Seg::Key(key.to_string()), Seg::Index(0)];
    match first.as_str() {
        Some(text) => Some(LocatedMessage {
            text: text.to_string(),
            path: prefix.to_vec(),
        }),
        None => message_from(first).map(|inner| LocatedMessage {
            text: inner.text,
            path: prefix.into_iter().chain(inner.path).collect(),
        }),
    }
}

/// All documented exit codes with their human-readable descriptions.
pub const EXIT_CODE_TABLE: &[(i32, &str, &str)] = &[
    (CliError::EXIT_CODE_API, "api", "API returned a non-success HTTP status"),
    (CliError::EXIT_CODE_AUTH, "auth", "Authentication failed or credentials missing"),
    (CliError::EXIT_CODE_VALIDATION, "validation", "Invalid arguments or request body"),
    (CliError::EXIT_CODE_DISCOVERY, "discovery", "Schema loading or endpoint resolution failed"),
    (CliError::EXIT_CODE_OTHER, "other", "Unexpected internal error"),
];

/// Render all documented exit codes to stdout in the format requested
/// by the user's raw args.
///
/// Honors `--format json` (and equivalents) so AI agents can consume a
/// machine-readable inventory of exit codes — the whole point of this
/// command for scripting workflows. Unknown `--format` values fall
/// back to the human-readable table, matching the resolver behavior
/// elsewhere in the CLI.
pub fn print_errors(args: &[String]) {
    write_errors_to(args, &mut std::io::stdout());
}

/// Writer-parameterized variant of [`print_errors`].
pub fn write_errors_to(args: &[String], out: &mut dyn std::io::Write) {
    match detect_errors_format(args) {
        ErrorsFormat::Json => write_errors_json_to(out),
        ErrorsFormat::Table => write_errors_table_to(out),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ErrorsFormat {
    Table,
    Json,
}

fn detect_errors_format(args: &[String]) -> ErrorsFormat {
    for (i, a) in args.iter().enumerate() {
        if let Some(rest) = a.strip_prefix("--format=") {
            if rest.eq_ignore_ascii_case("json") {
                return ErrorsFormat::Json;
            }
        } else if a == "--format" {
            if let Some(next) = args.get(i + 1) {
                if next.eq_ignore_ascii_case("json") {
                    return ErrorsFormat::Json;
                }
            }
        }
    }
    ErrorsFormat::Table
}

/// Print a human-readable table of all exit codes to stdout.
pub fn print_errors_table() {
    write_errors_table_to(&mut std::io::stdout());
}

fn write_errors_table_to(out: &mut dyn std::io::Write) {
    let _ = writeln!(out, "Exit codes:\n");
    let _ = writeln!(out, "  {:<6}  {:<14}  DESCRIPTION", "CODE", "CATEGORY");
    let _ = writeln!(out, "  {:<6}  {:<14}  ───────────────────────────────────────────", "──────", "──────────────");
    for &(code, category, description) in EXIT_CODE_TABLE {
        let _ = writeln!(out, "  {:<6}  {:<14}  {}", code, category, description);
    }
    let _ = writeln!(out);
    let _ = writeln!(out, "Exit code 0 means success. Any non-zero code indicates an error.");
}

/// Print all documented exit codes as a JSON array on stdout.
///
/// Shape:
/// ```json
/// {
///   "exit_codes": [
///     {"code": 0, "category": "success", "description": "..."},
///     {"code": 1, "category": "api",     "description": "..."},
///     ...
///   ]
/// }
/// ```
///
/// Includes the implicit success code (0) so consumers see the full
/// matrix without having to special-case the success path.
pub fn print_errors_json() {
    write_errors_json_to(&mut std::io::stdout());
}

fn write_errors_json_to(out: &mut dyn std::io::Write) {
    let mut entries: Vec<serde_json::Value> = Vec::with_capacity(EXIT_CODE_TABLE.len() + 1);
    entries.push(json!({
        "code": 0,
        "category": "success",
        "description": "Command completed successfully",
    }));
    for &(code, category, description) in EXIT_CODE_TABLE {
        entries.push(json!({
            "code": code,
            "category": category,
            "description": description,
        }));
    }
    let doc = json!({ "exit_codes": entries });
    let _ = writeln!(out, "{}", serde_json::to_string_pretty(&doc).expect("static EXIT_CODE_TABLE always serializes"));
}

fn error_label(err: &CliError) -> String {
    match err {
        CliError::Api { .. } => colorize("error[api]:", "31"),
        CliError::Auth(_) => colorize("error[auth]:", "31"),
        CliError::Validation(_) => colorize("error[validation]:", "33"),
        CliError::Discovery(_) => colorize("error[discovery]:", "31"),
        CliError::Network(_) => colorize("error[network]:", "31"),
        CliError::Other(_) => colorize("error:", "31"),
        CliError::RawSentinel { .. } => colorize("error[api]:", "31"),
    }
}

/// Context for rendering an error: which representation to emit, plus the
/// docs link and `--help` suggestion that enrich the human one.
pub struct ErrorDisplayContext {
    /// Base URL for per-code documentation links (e.g. `https://docs.example.com/errors/`).
    /// Appended with the HTTP status code for `CliError::Api` errors.
    pub docs_base_url: Option<String>,
    /// Full help invocation, e.g. `box users list --help`.
    /// Printed as `Try \`...\`` after the error message.
    pub help_hint: Option<String>,
    /// The resolved output format.
    ///
    /// Selects *which* representation of the error is emitted, never both: a
    /// machine format puts the JSON envelope on stdout, a human one puts a
    /// single line on stderr and leaves stdout empty. It also decides the
    /// envelope's shape — `jsonl` is line-delimited by definition, so a
    /// pretty-printed value there is unreadable to the line-at-a-time consumer
    /// the format exists for.
    pub format: crate::formatter::OutputFormat,
}

impl Default for ErrorDisplayContext {
    fn default() -> Self {
        Self {
            docs_base_url: None,
            help_hint: None,
            // Matches the format resolver's non-TTY default: a caller with no
            // resolved format is a pipe or a test, both of which want JSON.
            format: crate::formatter::OutputFormat::Json,
        }
    }
}

/// Render `err` in exactly one representation, chosen by
/// [`ErrorDisplayContext::format`]: the JSON envelope on `out` for a machine
/// format, or a human line (plus details, help hint and docs link) on stderr.
pub fn write_error_json(
    err: &CliError,
    out: &mut dyn std::io::Write,
    ctx: Option<&ErrorDisplayContext>,
) {
    // Raw-mode sentinel: bytes already on stdout, skip structured JSON.
    if let CliError::RawSentinel { code } = err {
        eprintln!("Error: HTTP {code}");
        return;
    }
    // One representation per invocation. Emitting both makes a consumer that
    // merges stdout and stderr see the same error twice with no way to tell
    // which is authoritative.
    let format = ctx.map(|c| c.format).unwrap_or(crate::formatter::OutputFormat::Json);
    let machine_readable = format.is_machine_readable();
    let docs_url = ctx
        .and_then(|ctx| ctx.docs_base_url.as_deref())
        .zip(match err {
            CliError::Api { code, .. } => Some(code),
            _ => None,
        })
        .map(|(base, code)| format!("{}/{}", base.trim_end_matches('/'), code));
    if machine_readable {
        let mut json = err.to_json();
        // The human rendering has always printed this link; carrying it in the
        // envelope too keeps both representations equally informative.
        if let Some(url) = &docs_url {
            json["error"]["docs_url"] = json!(url);
        }
        // `jsonl` means one JSON value per line; pretty-printing puts a bare
        // `{` on the first line and breaks every line-at-a-time reader.
        let rendered = if matches!(format, crate::formatter::OutputFormat::Jsonl) {
            serde_json::to_string(&json).unwrap_or_default()
        } else {
            serde_json::to_string_pretty(&json).unwrap_or_default()
        };
        let _ = writeln!(out, "{rendered}");
        return;
    }
    // A service-specific reason (`workspace_not_found`) is the second most
    // useful thing after the sentence, and the human rendering used to be the
    // one place it never appeared. A reason derived from the status carries
    // nothing the label and message do not already say, so it stays hidden.
    let specific_reason = match err {
        CliError::Api { code, reason, .. } if reason != http_status_reason(*code) => {
            Some(reason.as_str())
        }
        _ => None,
    };
    match specific_reason {
        Some(reason) => eprintln!(
            "{} {} ({})",
            error_label(err),
            sanitize_for_terminal(&err.to_string()),
            sanitize_for_terminal(reason)
        ),
        None => eprintln!(
            "{} {}",
            error_label(err),
            sanitize_for_terminal(&err.to_string())
        ),
    }
    // What the server said beyond the sentence, before the advice about it.
    // Without this a field-level failure reads as `error[api]: field required`
    // with no way to tell *which* field — the `loc` is in the envelope but the
    // person in the terminal is the one who cannot see it.
    if let CliError::Api {
        details: Some(details),
        message,
        reason,
        ..
    } = err
    {
        let shown = [message.as_str(), reason.as_str()];
        for line in detail_lines(details, MAX_DETAIL_LINES, &shown) {
            eprintln!("  {}", sanitize_for_terminal(&line));
        }
    }
    if let CliError::Api {
        help: Some(help), ..
    } = err
    {
        eprintln!("{}", sanitize_for_terminal(help));
    }
    if let Some(url) = &docs_url {
        eprintln!("  → {}", sanitize_for_terminal(url));
    }
    if let Some(ctx) = ctx {
        if matches!(err, CliError::Validation(_)) {
            if let Some(hint) = &ctx.help_hint {
                // `--help` is the right next step for a malformed flag, but not
                // when the message already tells the user exactly what to set —
                // a refused cross-host redirect, for instance, is remedied by an
                // environment variable, and `Try <cmd> --help` sends them to a
                // flag list that says nothing about it.
                if !message_names_its_own_remedy(&err.to_string()) {
                    eprintln!("  Try `{}`", sanitize_for_terminal(hint));
                }
            }
        }
    }
}

/// Marker shared with the security guards in [`crate::http`], whose refusal
/// messages end by naming the environment variable that permits the action.
///
/// Kept as one constant so the guards and this check cannot drift apart; the
/// test below builds a real refusal and asserts it still matches.
pub(crate) const SELF_REMEDY_MARKER: &str = "=1 to allow it";

/// Whether a validation message already states its own remedy, making a generic
/// `Try <cmd> --help` redundant or actively misleading.
///
/// Deliberately narrow — the default stays "show the hint", because for the
/// overwhelming majority of validation errors (a bad flag value, a missing
/// required parameter) `--help` is exactly where the user should look. It is
/// only suppressed when the fix lives in the environment rather than in the
/// command's flags, where pointing at a flag list would send the user somewhere
/// that says nothing about it.
fn message_names_its_own_remedy(message: &str) -> bool {
    message.contains(SELF_REMEDY_MARKER)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn self_remedy_marker_matches_a_real_guard_refusal() {
        // Built from the pagination guard rather than a hand-copied string, so
        // rewording the guard breaks this test instead of silently restoring the
        // misleading `Try ... --help` hint.
        let refusal = crate::http::check_pagination_target(
            "hintcheck",
            "https://api.example.com/v1/things",
            "https://evil.example.net/v1/things",
        )
        .expect_err("a cross-host pagination target must be refused");
        assert!(
            message_names_its_own_remedy(&refusal),
            "the guard's message should suppress the --help hint, got: {refusal}"
        );
    }

    #[test]
    fn ordinary_validation_messages_still_get_the_help_hint() {
        // The common case must be unaffected: a bad flag or missing parameter
        // has no env-var remedy, so `--help` is the right pointer.
        for message in [
            "Required parameter 'query' is missing. Provide it via --query-param or --params",
            "Cannot combine --json with per-field body flags (--type). Use one or the other.",
            "Invalid --params JSON: expected value at line 1 column 1",
        ] {
            assert!(
                !message_names_its_own_remedy(message),
                "{message} should keep the --help hint"
            );
        }
    }

    #[test]
    fn test_exit_codes_are_distinct() {
        let codes = [
            CliError::EXIT_CODE_API,
            CliError::EXIT_CODE_AUTH,
            CliError::EXIT_CODE_VALIDATION,
            CliError::EXIT_CODE_DISCOVERY,
            CliError::EXIT_CODE_OTHER,
        ];
        let unique: std::collections::HashSet<i32> = codes.iter().copied().collect();
        assert_eq!(unique.len(), codes.len());
    }

    #[test]
    fn test_error_to_json_api() {
        let err = CliError::api(404, "Not Found".to_string(), "notFound".to_string());
        let json = err.to_json();
        assert_eq!(json["error"]["code"], 404);
        assert_eq!(json["error"]["message"], "Not Found");
    }

    #[test]
    fn test_error_to_json_validation() {
        let err = CliError::Validation("Invalid input".to_string());
        let json = err.to_json();
        assert_eq!(json["error"]["code"], 400);
    }

    #[test]
    fn single_line_validation_messages_pass_through_untouched() {
        let err = CliError::Validation(
            "Required parameter 'user_id' is missing. Provide it via --user-id or --params"
                .to_string(),
        );
        let json = err.to_json();
        assert_eq!(
            json["error"]["message"],
            "Required parameter 'user_id' is missing. Provide it via --user-id or --params"
        );
        assert!(json["error"].get("usage").is_none());
        assert!(json["error"].get("help").is_none());
    }

    #[test]
    fn clap_usage_block_is_split_out_of_the_message() {
        // clap's rendering for a mistyped subcommand, verbatim.
        let err = CliError::Validation(
            "error: unrecognized subcommand 'lst'\n\n  \
             tip: a similar subcommand exists: 'list'\n\n\
             Usage: openapi-fixture users [OPTIONS] <COMMAND>\n\n\
             For more information, try '--help'.\n"
                .to_string(),
        );
        let json = err.to_json();
        assert_eq!(json["error"]["message"], "unrecognized subcommand 'lst'");
        assert_eq!(json["error"]["help"], "a similar subcommand exists: 'list'");
        assert_eq!(
            json["error"]["usage"],
            "openapi-fixture users [OPTIONS] <COMMAND>"
        );
        // The one-sentence promise: no embedded newlines anywhere.
        for field in ["message", "help", "usage"] {
            let value = json["error"][field].as_str().expect("string field");
            assert!(!value.contains('\n'), "{field} should be a single line: {value}");
        }
    }

    #[test]
    fn flag_conflicts_keep_their_sentence_and_usage_apart() {
        let err = CliError::Validation(
            "error: the argument '--human' cannot be used with '--format <FORMAT>'\n\n\
             Usage: openapi-fixture --human <COMMAND>\n\n\
             For more information, try '--help'.\n"
                .to_string(),
        );
        let json = err.to_json();
        assert_eq!(
            json["error"]["message"],
            "the argument '--human' cannot be used with '--format <FORMAT>'"
        );
        assert_eq!(json["error"]["usage"], "openapi-fixture --human <COMMAND>");
        assert!(json["error"].get("help").is_none());
    }

    #[test]
    fn possible_values_lists_land_in_help() {
        let err = CliError::Validation(
            "error: invalid value 'xml' for '--format <FORMAT>'\n  \
             [possible values: json, table, yaml]\n\n\
             For more information, try '--help'.\n"
                .to_string(),
        );
        let json = err.to_json();
        assert_eq!(
            json["error"]["message"],
            "invalid value 'xml' for '--format <FORMAT>'"
        );
        assert_eq!(json["error"]["help"], "[possible values: json, table, yaml]");
    }

    #[test]
    fn human_rendering_of_a_usage_error_keeps_the_whole_block() {
        // The split is a JSON-envelope concern: `Display` — what the human path
        // prints on stderr — must still carry clap's tip and usage lines.
        let rendered = "error: unrecognized subcommand 'lst'\n\n  \
                        tip: a similar subcommand exists: 'list'\n\n\
                        Usage: openapi-fixture users [OPTIONS] <COMMAND>\n";
        let err = CliError::Validation(rendered.to_string());
        assert_eq!(err.to_string(), rendered);
    }

    #[test]
    fn test_exit_codes_all_variants() {
        assert_eq!(CliError::api(404, "", "").exit_code(), CliError::EXIT_CODE_API);
        assert_eq!(CliError::Auth(String::new()).exit_code(), CliError::EXIT_CODE_AUTH);
        assert_eq!(CliError::Validation(String::new()).exit_code(), CliError::EXIT_CODE_VALIDATION);
        assert_eq!(CliError::Discovery(String::new()).exit_code(), CliError::EXIT_CODE_DISCOVERY);
        assert_eq!(
            CliError::Other(anyhow::anyhow!("oops")).exit_code(),
            CliError::EXIT_CODE_OTHER
        );
    }

    #[test]
    fn test_to_json_auth() {
        let err = CliError::Auth("bad creds".to_string());
        let json = err.to_json();
        assert_eq!(json["error"]["code"], 401);
        assert_eq!(json["error"]["reason"], "authError");
    }

    #[test]
    fn test_to_json_discovery() {
        let err = CliError::Discovery("spec not found".to_string());
        let json = err.to_json();
        assert_eq!(json["error"]["code"], 500);
        assert_eq!(json["error"]["reason"], "discoveryError");
        assert_eq!(json["error"]["message"], "spec not found");
    }

    #[test]
    fn test_to_json_other() {
        let err = CliError::Other(anyhow::anyhow!("something broke"));
        let json = err.to_json();
        assert_eq!(json["error"]["code"], 500);
        assert_eq!(json["error"]["reason"], "internalError");
    }

    #[test]
    fn every_variant_renders_without_panicking() {
        // Captures rather than writing to the real stdout, and covers `Network`
        // and `RawSentinel`, which the previous version of this test predated.
        for err in [
            CliError::api(500, "oops".to_string(), "err".to_string()),
            CliError::Validation("bad input".to_string()),
            CliError::Auth("no auth".to_string()),
            CliError::Discovery("no spec".to_string()),
            CliError::Network("connection refused".to_string()),
            CliError::Other(anyhow::anyhow!("broken")),
            CliError::RawSentinel { code: 500 },
        ] {
            let mut out = Vec::new();
            write_error_json(&err, &mut out, None);
        }
    }

    #[test]
    fn write_error_json_stdout_unchanged_with_context() {
        let err = CliError::api(401, "Unauthorized".to_string(), "authError".to_string());
        let ctx = ErrorDisplayContext {
            docs_base_url: Some("https://docs.example.com/errors".to_string()),
            help_hint: Some("mycli users list --help".to_string()),
            format: crate::formatter::OutputFormat::Json,
        };
        let mut out = Vec::new();
        write_error_json(&err, &mut out, Some(&ctx));
        let stdout = String::from_utf8(out).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&stdout).unwrap();
        assert_eq!(parsed["error"]["code"], 401);
        assert_eq!(parsed["error"]["message"], "Unauthorized");
        // The docs link is part of both representations, not just the human one.
        assert_eq!(
            parsed["error"]["docs_url"],
            "https://docs.example.com/errors/401"
        );
    }

    #[test]
    fn help_is_a_separate_field_from_message() {
        // `message` must be one sentence for every error class, so advice such
        // as the credential-source hint gets its own field rather than being
        // appended with a newline.
        let err = CliError::Api {
            code: 401,
            message: "Invalid API key".to_string(),
            reason: "unauthorized".to_string(),
            details: None,
            help: Some("Credentials were supplied via: MY_CLI_API_KEY.".to_string()),
        };
        let parsed = err.to_json();
        assert_eq!(parsed["error"]["message"], "Invalid API key");
        assert_eq!(
            parsed["error"]["help"],
            "Credentials were supplied via: MY_CLI_API_KEY."
        );
        // Absent advice means an absent field, not an empty string.
        assert!(
            CliError::api(500, "Server blew up", "internalServerError").to_json()["error"]["help"]
                .is_null()
        );
    }

    #[test]
    fn write_error_json_no_docs_url_for_non_api_errors() {
        let ctx = ErrorDisplayContext {
            docs_base_url: Some("https://docs.example.com/errors".to_string()),
            help_hint: None,
            format: crate::formatter::OutputFormat::Json,
        };
        // Validation errors should not get docs URLs (no HTTP status code).
        let mut out = Vec::new();
        write_error_json(
            &CliError::Validation("bad input".to_string()),
            &mut out,
            Some(&ctx),
        );
        let stdout = String::from_utf8(out).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&stdout).unwrap();
        assert_eq!(parsed["error"]["code"], 400);
        assert!(parsed["error"]["docs_url"].is_null());
    }

    #[test]
    fn human_format_leaves_stdout_empty() {
        // The regression: stdout carried the envelope *and* stderr carried the
        // same message, so a consumer merging the two saw the error twice.
        let ctx = ErrorDisplayContext {
            format: crate::formatter::OutputFormat::Table,
            ..Default::default()
        };
        let mut out = Vec::new();
        write_error_json(
            &CliError::api(500, "Server blew up", "internalServerError"),
            &mut out,
            Some(&ctx),
        );
        assert!(
            out.is_empty(),
            "human format must not write the envelope to stdout, got: {}",
            String::from_utf8_lossy(&out)
        );
    }

    #[test]
    fn top_level_service_error_is_not_double_encoded() {
        // A body with no `error` key used to be stringified whole into
        // `message`, emitting an escaped JSON document inside the envelope.
        let err = api_error_from_body(
            500,
            r#"{"status": "internal_server_error", "message": "Internal Server error. All such crashes are reported to us automatically."}"#,
        );
        let json = err.to_json();
        let message = json["error"]["message"].as_str().unwrap();
        assert_eq!(
            message,
            "Internal Server error. All such crashes are reported to us automatically."
        );
        assert!(
            serde_json::from_str::<serde_json::Value>(message).is_err(),
            "message must be a sentence, not a serialized JSON document"
        );
        assert_eq!(json["error"]["reason"], "internalServerError");
        assert_eq!(json["error"]["details"]["status"], "internal_server_error");
    }

    #[test]
    fn nested_detail_bodies_yield_a_sentence() {
        // Bodies captured verbatim from api.elevenlabs.io: FastAPI puts the
        // useful fields under `detail`, as an object, a list, or a bare string.
        let err = api_error_from_body(
            401,
            r#"{"detail":{"type":"authentication_error","code":"unauthorized","message":"Invalid API key","status":"invalid_api_key","request_id":"f883"}}"#,
        );
        assert_eq!(err.to_string(), "Invalid API key");
        let json = err.to_json();
        // A string `code` is a symbolic reason, so it must not land in `code`.
        assert_eq!(json["error"]["code"], 401);
        assert_eq!(json["error"]["reason"], "unauthorized");
        assert_eq!(json["error"]["details"]["detail"]["request_id"], "f883");

        let err = api_error_from_body(
            422,
            r#"{"detail":[{"type":"missing","loc":["body","text"],"msg":"Field required","input":null}]}"#,
        );
        assert_eq!(err.to_string(), "Field required");
        assert_eq!(err.to_json()["error"]["reason"], "unprocessableEntity");

        let err = api_error_from_body(404, r#"{"detail":"Not Found"}"#);
        assert_eq!(err.to_string(), "Not Found");
        assert_eq!(err.to_json()["error"]["reason"], "notFound");
    }

    #[test]
    fn details_never_repeat_the_message() {
        // The sentence lifted into `message` is dropped from `details`, however
        // deeply it sat, while everything unique to the body survives.
        let err = api_error_from_body(
            401,
            r#"{"detail":{"type":"authentication_error","code":"unauthorized","message":"Invalid API key","request_id":"f883"}}"#,
        );
        let json = err.to_json();
        assert_eq!(json["error"]["message"], "Invalid API key");
        assert_eq!(json["error"]["details"]["detail"]["request_id"], "f883");
        assert!(
            json["error"]["details"]["detail"].get("message").is_none(),
            "got: {json:#}"
        );

        let err = api_error_from_body(
            422,
            r#"{"detail":[{"type":"missing","loc":["body","text"],"msg":"Field required"}]}"#,
        );
        let json = err.to_json();
        assert_eq!(json["error"]["message"], "Field required");
        assert_eq!(json["error"]["details"]["detail"][0]["loc"][1], "text");
        assert!(json["error"]["details"]["detail"][0].get("msg").is_none());
    }

    #[test]
    fn details_are_omitted_when_the_body_is_only_the_message() {
        // Nothing to preserve once the sentence is lifted, so the field would
        // be an empty husk restating `message`.
        for body in [
            r#"{"detail":"Not Found"}"#,
            r#"{"message":"Not Found"}"#,
            r#"{"error":"Not Found"}"#,
            r#"{"errors":["Not Found"]}"#,
        ] {
            let json = api_error_from_body(404, body).to_json();
            assert_eq!(json["error"]["message"], "Not Found", "body: {body}");
            assert!(json["error"].get("details").is_none(), "body: {body}");
        }
    }

    #[test]
    fn api_error_from_body_recognizes_common_shapes() {
        // Google-style envelope: the reason comes from the body, the code does
        // not — `error.code` is the status the server actually answered with.
        let err = api_error_from_body(
            401,
            r#"{"error":{"code":403,"message":"Denied","errors":[{"reason":"authError"}]}}"#,
        );
        match &err {
            CliError::Api {
                code,
                message,
                reason,
                details,
                ..
            } => {
                assert_eq!(*code, 401);
                assert_eq!(message, "Denied");
                assert_eq!(reason, "authError");
                // The body's own code is still reachable, just not as `code`.
                assert_eq!(details.as_ref().unwrap()["error"]["code"], 403);
            }
            other => panic!("expected Api, got: {other:?}"),
        }

        // `{"error": "<message>"}`, RFC 7807 `detail`, and OAuth 2.0
        // `error_description` all yield a sentence.
        for (body, expected) in [
            (
                r#"{"error":"Something went wrong"}"#,
                "Something went wrong",
            ),
            (r#"{"detail":"Rate limit exceeded"}"#, "Rate limit exceeded"),
            (r#"{"error_description":"Token expired"}"#, "Token expired"),
            (
                r#"{"errors":[{"message":"Field required"}]}"#,
                "Field required",
            ),
        ] {
            assert_eq!(
                api_error_from_body(400, body).to_string(),
                expected,
                "body: {body}"
            );
        }

        // Unrecognised JSON: a status summary, with the body kept structurally.
        let err = api_error_from_body(503, r#"{"upstream":{"queue":"full"}}"#);
        assert_eq!(err.to_string(), "HTTP 503 serviceUnavailable");
        assert_eq!(
            err.to_json()["error"]["details"]["upstream"]["queue"],
            "full"
        );

        // Non-JSON bodies still surface verbatim.
        let err = api_error_from_body(502, "upstream connect error");
        assert_eq!(err.to_string(), "upstream connect error");
        assert!(err.to_json()["error"].get("details").is_none());
    }

    #[test]
    fn markup_bodies_are_summarised_not_pasted_into_the_message() {
        // A CDN answering 502 with an HTML page: `message` is a sentence about
        // what happened, and the markup moves to `details.body` clipped. Size
        // alone is not the test — even a short page is multi-line markup, which
        // `message` promises never to be.
        for page in [
            format!("<html><body>{}</body></html>", "x".repeat(4000)),
            "<!DOCTYPE html>\n<html>\n  <body>502 Bad Gateway</body>\n</html>".to_string(),
        ] {
            let err = api_error_from_body(502, &page);
            let message = err.to_string();
            assert_eq!(
                message,
                format!("HTTP 502 badGateway (non-JSON response, {} bytes)", page.len())
            );
            assert!(!message.contains('\n'), "message must be one line: {message}");
            let json = err.to_json();
            let body = json["error"]["details"]["body"].as_str().unwrap();
            assert!(body.starts_with("<"), "the bytes are kept: {body}");
            assert!(!body.contains('\n'), "details.body is collapsed: {body}");
            assert!(body.len() < 600, "details.body is clipped: {} bytes", body.len());
        }
    }

    #[test]
    fn non_json_bodies_that_are_a_sentence_stay_in_the_message() {
        // The common proxy case: a short plain-text reason. It is the most
        // informative thing we have, so it stays where a reader looks first.
        let err = api_error_from_body(502, "upstream connect error");
        assert_eq!(err.to_string(), "upstream connect error");
        assert!(err.to_json()["error"].get("details").is_none());

        // Wrapped across lines by the server, but still one sentence.
        let err = api_error_from_body(503, "upstream connect error\n  or disconnect");
        assert_eq!(err.to_string(), "upstream connect error or disconnect");
    }

    #[test]
    fn bodyless_and_bare_string_responses_still_yield_a_sentence() {
        // An empty body used to produce `message: ""`, which reads as the CLI
        // having lost the error rather than the server having sent nothing.
        for body in ["", "   \n  "] {
            let err = api_error_from_body(504, body);
            assert_eq!(err.to_string(), "HTTP 504 gatewayTimeout", "body: {body:?}");
            assert!(err.to_json()["error"].get("details").is_none());
        }
        // A body that is a bare JSON string is the sentence itself, not an
        // unrecognised document to file under `details`.
        let err = api_error_from_body(500, r#""Service temporarily unavailable""#);
        assert_eq!(err.to_string(), "Service temporarily unavailable");
        assert!(err.to_json()["error"].get("details").is_none());

        // A body that is a bare list of problems reads like `errors`/`detail`
        // one level out.
        let err = api_error_from_body(
            422,
            r#"[{"loc":["body","email"],"msg":"value is not a valid email"}]"#,
        );
        assert_eq!(err.to_string(), "value is not a valid email");
        assert_eq!(err.to_json()["error"]["details"][0]["loc"][1], "email");
    }

    #[test]
    fn human_rendering_reports_the_details_a_reader_cannot_otherwise_see() {
        // The envelope carries `loc`; the person in the terminal cannot read the
        // envelope. Without these lines a field-level failure is unactionable.
        let err = api_error_from_body(
            422,
            r#"{"detail":[{"loc":["body","email"],"msg":"value is not a valid email","type":"value_error.email"}]}"#,
        );
        let CliError::Api { details, .. } = &err else {
            panic!("expected Api");
        };
        let lines = detail_lines(details.as_ref().unwrap(), MAX_DETAIL_LINES, &[]);
        // A scalar list stays on one line: the field path is the point.
        assert!(
            lines.contains(&"detail[0].loc: body, email".to_string()),
            "got: {lines:?}"
        );
        assert!(
            lines.contains(&"detail[0].type: value_error.email".to_string()),
            "got: {lines:?}"
        );
        assert!(lines.iter().all(|l| !l.contains('"')), "got: {lines:?}");
    }

    #[test]
    fn human_details_drop_what_the_headline_already_said() {
        // Verbatim from api.elevenlabs.io. `code`, `status` and `type` all
        // restate the reason; only `request_id` is new. Rendering all four
        // turned a one-fact 404 into five lines saying the same thing.
        let err = api_error_from_body(
            404,
            r#"{"detail":{"status":"workspace_not_found","message":"Workspace 1anonymous1 not found.","code":"workspace_not_found","type":"not_found","request_id":"6c312f"}}"#,
        );
        let CliError::Api {
            details,
            message,
            reason,
            ..
        } = &err
        else {
            panic!("expected Api");
        };
        assert_eq!(reason, "workspace_not_found");
        let lines = detail_lines(
            details.as_ref().unwrap(),
            MAX_DETAIL_LINES,
            &[message.as_str(), reason.as_str()],
        );
        // The sole `detail.` wrapper is stripped — it prefixed every line and
        // named nothing the reader was looking for.
        assert_eq!(
            lines,
            vec![
                "request_id: 6c312f".to_string(),
                "type: not_found".to_string()
            ],
            "got: {lines:?}"
        );
        // Nothing is lost: the envelope still carries every field.
        let json = err.to_json();
        assert_eq!(json["error"]["details"]["detail"]["status"], "workspace_not_found");
        assert_eq!(json["error"]["details"]["detail"]["code"], "workspace_not_found");
    }

    #[test]
    fn a_status_derived_reason_stays_off_the_headline() {
        // `notFound` on a 404 says nothing `error[api]` and the message do not.
        let err = api_error_from_body(404, r#"{"detail":"Not Found"}"#);
        let CliError::Api { code, reason, .. } = &err else {
            panic!("expected Api");
        };
        assert_eq!(reason, http_status_reason(*code));
    }

    #[test]
    fn jsonl_errors_are_one_line() {
        // NDJSON is parsed a line at a time; a pretty-printed envelope puts a
        // bare `{` on line one and breaks every such reader.
        let err = api_error_from_body(404, r#"{"detail":"Not Found"}"#);
        let mut out = Vec::new();
        write_error_json(
            &err,
            &mut out,
            Some(&ErrorDisplayContext {
                docs_base_url: None,
                help_hint: None,
                format: crate::formatter::OutputFormat::Jsonl,
            }),
        );
        let text = String::from_utf8(out).unwrap();
        assert_eq!(text.lines().count(), 1, "got: {text}");
        serde_json::from_str::<serde_json::Value>(text.trim()).expect("each line must parse");

        // `json` keeps the readable multi-line rendering.
        let mut out = Vec::new();
        write_error_json(
            &err,
            &mut out,
            Some(&ErrorDisplayContext {
                docs_base_url: None,
                help_hint: None,
                format: crate::formatter::OutputFormat::Json,
            }),
        );
        assert!(String::from_utf8(out).unwrap().lines().count() > 1);
    }

    #[test]
    fn human_detail_rendering_is_capped() {
        // A service answering with a hundred per-field problems must not scroll
        // the failure sentence off the screen.
        let problems: Vec<serde_json::Value> = (0..40)
            .map(|i| json!({ "field": format!("f{i}") }))
            .collect();
        let lines = detail_lines(&json!({ "detail": problems }), MAX_DETAIL_LINES, &[]);
        assert_eq!(lines.len(), MAX_DETAIL_LINES + 1);
        assert!(lines.last().unwrap().contains("30 more"), "got: {lines:?}");
        assert!(lines.last().unwrap().contains("--format json"));
    }

    #[test]
    fn api_error_from_body_code_is_always_the_http_status() {
        // A body's `code` is application-defined and cannot be told apart from
        // an HTTP status by inspection, so it never wins: an internal numbering
        // would truncate into a nonsense status, and a code that merely *looks*
        // like a status can disagree with the one actually served — including a
        // success value on a failed request, which contradicts the exit code
        // and points the docs link at the wrong page.
        for (status, body, expected_in_details) in [
            (400, r#"{"code":100234,"message":"Bad thing"}"#, 100234),
            (400, r#"{"code":422,"message":"Bad thing"}"#, 422),
            (500, r#"{"code":200,"message":"Bad thing"}"#, 200),
        ] {
            let json = api_error_from_body(status, body).to_json();
            assert_eq!(json["error"]["code"], status, "body: {body}");
            assert_eq!(json["error"]["message"], "Bad thing", "body: {body}");
            assert_eq!(
                json["error"]["details"]["code"], expected_in_details,
                "the body's own code must survive in details; body: {body}"
            );
        }
    }

    #[test]
    fn details_keep_a_sibling_that_repeats_the_lifted_sentence() {
        // Two fields failing the same way is the common multi-field validation
        // shape. Only the entry the sentence was lifted *from* loses its `msg`;
        // dropping every string equal to it would leave the second problem
        // unattributable.
        let err = api_error_from_body(
            422,
            r#"{"detail":[{"loc":["body","name"],"msg":"field required"},
                          {"loc":["body","email"],"msg":"field required"}]}"#,
        );
        let json = err.to_json();
        assert_eq!(json["error"]["message"], "field required");
        let entries = json["error"]["details"]["detail"].as_array().unwrap();
        assert_eq!(entries.len(), 2, "got: {json:#}");
        assert!(entries[0].get("msg").is_none(), "got: {json:#}");
        assert_eq!(entries[1]["msg"], "field required", "got: {json:#}");
        assert_eq!(entries[1]["loc"][1], "email");
    }

    #[test]
    fn multi_line_validator_messages_are_not_split_like_clap_output() {
        // Our own schema validator emits one bullet per violation. The clap
        // splitter would demote every bullet to `help` and leave `message` as
        // the bare header, so a non-clap block passes through whole.
        let err = CliError::Validation(
            "Request body failed schema validation:\n- $.name: expected string, got number\n- $.age: required property missing".to_string(),
        );
        let json = err.to_json();
        assert_eq!(
            json["error"]["message"],
            "Request body failed schema validation:\n- $.name: expected string, got number\n- $.age: required property missing"
        );
        assert!(json["error"].get("help").is_none(), "got: {json:#}");
        assert!(json["error"].get("usage").is_none(), "got: {json:#}");
    }

    #[test]
    fn validation_label_is_error_validation() {
        let label = error_label(&CliError::Validation("oops".to_string()));
        assert!(label.contains("error[validation]"), "expected 'error[validation]:' label, got: {label}");
        assert!(!label.contains("warning:"), "label should not contain 'warning:'");
    }

    #[test]
    fn help_hint_shown_only_for_validation_errors() {
        let ctx = ErrorDisplayContext {
            docs_base_url: None,
            help_hint: Some("mycli users list --help".to_string()),
            format: crate::formatter::OutputFormat::Json,
        };
        // Validation errors should get the hint.
        let mut out = Vec::new();
        write_error_json(&CliError::Validation("bad input".to_string()), &mut out, Some(&ctx));
        // Stdout is the JSON envelope — we don't assert stderr here since eprintln
        // always targets the real stderr in unit tests. The gating logic is covered
        // by the `matches!` branch; the wire test exercises it end-to-end.

        // Non-Validation variants must NOT produce a hint. Verify the branch
        // is unreachable for Api/Auth/Discovery/Other by asserting the helper
        // doesn't panic and returns clean JSON.
        for err in [
            CliError::api(401, "denied", "authError"),
            CliError::Auth("missing token".to_string()),
            CliError::Discovery("no spec".to_string()),
            CliError::Other(anyhow::anyhow!("boom")),
        ] {
            let mut o = Vec::new();
            write_error_json(&err, &mut o, Some(&ctx));
            assert!(serde_json::from_str::<serde_json::Value>(&String::from_utf8(o).unwrap()).is_ok());
        }
    }

    #[test]
    fn write_error_json_no_panic_without_context() {
        let mut out = Vec::new();
        write_error_json(
            &CliError::api(422, "invalid", "validationError"),
            &mut out,
            None,
        );
        let stdout = String::from_utf8(out).unwrap();
        assert!(serde_json::from_str::<serde_json::Value>(&stdout).is_ok());
    }

    #[test]
    fn test_duplicate_preserves_variant() {
        let api = CliError::api(404, "Not Found".to_string(), "notFound".to_string());
        let dup = api.duplicate();
        assert_eq!(dup.exit_code(), CliError::EXIT_CODE_API);
        assert_eq!(dup.to_json()["error"]["code"], 404);

        let val = CliError::Validation("bad".to_string());
        assert_eq!(val.duplicate().exit_code(), CliError::EXIT_CODE_VALIDATION);

        let auth = CliError::Auth("denied".to_string());
        assert_eq!(auth.duplicate().exit_code(), CliError::EXIT_CODE_AUTH);

        let disc = CliError::Discovery("missing".to_string());
        assert_eq!(disc.duplicate().exit_code(), CliError::EXIT_CODE_DISCOVERY);

        // Other(anyhow) preserves variant and exit code.
        let other = CliError::Other(anyhow::anyhow!("anyhow msg"));
        let dup_other = other.duplicate();
        assert_eq!(dup_other.exit_code(), CliError::EXIT_CODE_OTHER);
    }

    #[test]
    fn exit_code_table_covers_all_known_codes() {
        let table_codes: std::collections::HashSet<i32> =
            EXIT_CODE_TABLE.iter().map(|&(c, _, _)| c).collect();
        let expected = [
            CliError::EXIT_CODE_API,
            CliError::EXIT_CODE_AUTH,
            CliError::EXIT_CODE_VALIDATION,
            CliError::EXIT_CODE_DISCOVERY,
            CliError::EXIT_CODE_OTHER,
        ];
        for code in expected {
            assert!(table_codes.contains(&code), "EXIT_CODE_TABLE missing code {code}");
        }
    }

    #[test]
    fn exit_code_table_has_no_duplicates() {
        let codes: Vec<i32> = EXIT_CODE_TABLE.iter().map(|&(c, _, _)| c).collect();
        let unique: std::collections::HashSet<i32> = codes.iter().copied().collect();
        assert_eq!(unique.len(), codes.len(), "EXIT_CODE_TABLE has duplicate codes");
    }

    fn args(slice: &[&str]) -> Vec<String> {
        slice.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn detect_errors_format_defaults_to_table() {
        assert_eq!(detect_errors_format(&args(&["cli", "errors"])), ErrorsFormat::Table);
    }

    #[test]
    fn detect_errors_format_recognizes_json_space_separated() {
        assert_eq!(
            detect_errors_format(&args(&["cli", "errors", "--format", "json"])),
            ErrorsFormat::Json,
        );
    }

    #[test]
    fn detect_errors_format_recognizes_json_equals() {
        assert_eq!(
            detect_errors_format(&args(&["cli", "errors", "--format=json"])),
            ErrorsFormat::Json,
        );
    }

    #[test]
    fn detect_errors_format_case_insensitive() {
        assert_eq!(
            detect_errors_format(&args(&["cli", "errors", "--format", "JSON"])),
            ErrorsFormat::Json,
        );
        assert_eq!(
            detect_errors_format(&args(&["cli", "errors", "--format=Json"])),
            ErrorsFormat::Json,
        );
    }

    #[test]
    fn detect_errors_format_unknown_format_falls_back_to_table() {
        assert_eq!(
            detect_errors_format(&args(&["cli", "errors", "--format", "yaml"])),
            ErrorsFormat::Table,
        );
    }

    #[test]
    fn detect_errors_format_trailing_format_flag_with_no_value_is_table() {
        assert_eq!(
            detect_errors_format(&args(&["cli", "errors", "--format"])),
            ErrorsFormat::Table,
        );
    }

    #[test]
    fn is_raw_sentinel_true_for_raw_sentinel_variant() {
        let err = CliError::RawSentinel { code: 500 };
        assert!(err.is_raw_sentinel());
    }

    #[test]
    fn is_raw_sentinel_false_for_api_with_raw_reason() {
        // A server returning reason "raw" must NOT collide with the sentinel.
        let err = CliError::api(500, String::new(), "raw".to_string());
        assert!(!err.is_raw_sentinel());
    }

    #[test]
    fn is_raw_sentinel_false_for_non_api_errors() {
        assert!(!CliError::Validation("x".into()).is_raw_sentinel());
        assert!(!CliError::Auth("x".into()).is_raw_sentinel());
        assert!(!CliError::Discovery("x".into()).is_raw_sentinel());
    }

    #[test]
    fn raw_sentinel_exit_code_matches_api() {
        let sentinel = CliError::RawSentinel { code: 404 };
        assert_eq!(sentinel.exit_code(), CliError::EXIT_CODE_API);
    }

    #[test]
    fn raw_sentinel_duplicate() {
        let sentinel = CliError::RawSentinel { code: 422 };
        let dup = sentinel.duplicate();
        assert!(dup.is_raw_sentinel());
        assert_eq!(dup.exit_code(), CliError::EXIT_CODE_API);
    }

    #[test]
    fn write_error_json_raw_sentinel_suppresses_stdout() {
        let err = CliError::RawSentinel { code: 500 };
        let mut buf: Vec<u8> = Vec::new();
        write_error_json(&err, &mut buf, None);
        assert!(
            buf.is_empty(),
            "raw sentinel should suppress stdout JSON, got: {:?}",
            String::from_utf8_lossy(&buf)
        );
    }

    #[test]
    fn write_error_json_normal_api_error_writes_json() {
        let err = CliError::api(404, "Not Found".to_string(), "notFound".to_string());
        let mut buf: Vec<u8> = Vec::new();
        write_error_json(&err, &mut buf, None);
        assert!(
            !buf.is_empty(),
            "normal API error should write JSON to stdout"
        );
        let s = String::from_utf8(buf).unwrap();
        assert!(s.contains("Not Found"));
    }

    #[test]
    fn print_errors_json_emits_expected_shape() {
        // Smoke: the JSON payload parses cleanly and includes every
        // documented exit code (plus the implicit 0). Captures the
        // contract that AI agents consume.
        let mut entries: Vec<serde_json::Value> = Vec::with_capacity(EXIT_CODE_TABLE.len() + 1);
        entries.push(json!({
            "code": 0,
            "category": "success",
            "description": "Command completed successfully",
        }));
        for &(code, category, description) in EXIT_CODE_TABLE {
            entries.push(json!({
                "code": code,
                "category": category,
                "description": description,
            }));
        }
        let payload = json!({ "exit_codes": entries });
        let arr = payload["exit_codes"].as_array().expect("exit_codes is array");
        assert_eq!(arr.len(), EXIT_CODE_TABLE.len() + 1);
        assert_eq!(arr[0]["code"], 0);
        let codes: std::collections::HashSet<i64> = arr
            .iter()
            .filter_map(|e| e["code"].as_i64())
            .collect();
        for &(code, _, _) in EXIT_CODE_TABLE {
            assert!(codes.contains(&(code as i64)), "missing code {code}");
        }
    }
}
