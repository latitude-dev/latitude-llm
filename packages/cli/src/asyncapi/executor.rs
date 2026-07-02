//! AsyncAPI executor — drives a `WebSocketClient` against a parsed
//! AsyncAPI channel.
//!
//! Public surface: [`execute`]. Three modes:
//!
//! 1. **Init** (always): send the channel's `x-fern-init-payload` (or a
//!    builder-level explicit override) as the first WS frame.
//! 2. **Single-shot** (`--message <text>`): emit one `UserMessage`-shaped
//!    frame, await a single agent response, print its assembled text, then
//!    Close(1000) and exit 0.
//! 3. **REPL** (no `--message`): forward stdin lines as outbound frames,
//!    stream server responses to stdout, Close(1000) on EOF.
//!
//! Self-contained per the no-shared-abstractions rule
//! (`AGENTS.md` "Code Generation Model") — does NOT import from
//! `crate::openapi` or `crate::graphql`. Wire-level coverage lands in
//! ACP-2.4; this module's tests cover pure helpers only.

use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::{json, Value};

use crate::auth::SchemeBinding;
use crate::error::CliError;
use crate::http::HttpConfig;
use crate::validate::encode_query_component;
use crate::websocket::{ResponderAction, WebSocketClient, WsAuth, WsConfig};

use super::discovery::{AsyncApiDescription, Channel};

// ---------------------------------------------------------------------------
// Pure helpers (testable in isolation)
// ---------------------------------------------------------------------------

/// Compose a base URL override (`--base-url` / `<NAME>_BASE_URL`) with
/// the binding's configured endpoint URL.
///
/// Semantics: `--base-url` is a **host-only** override — it swaps the
/// scheme + authority (host:port), but preserves the path (and query, if
/// any) of the binding's configured endpoint. This matches the same
/// "host-only override" contract the OpenAPI path uses for HTTP base
/// URLs, and means a test running against `ws://127.0.0.1:<port>` still
/// hits the binary's configured `/v1/convai/conversation` route.
///
/// Returns:
/// - `Some(merged)` when both `override_url` and `endpoint_url` are set —
///   override's scheme+authority + endpoint's path-and-query.
/// - `Some(override_url)` when only `override_url` is set (no endpoint
///   path to preserve).
/// - `Some(endpoint_url)` when only `endpoint_url` is set.
/// - `None` when neither is set (caller falls back to the spec's
///   `servers` block).
///
/// Parsing is intentionally lightweight — we split on the first `/`
/// after the `scheme://` prefix rather than depending on the `url`
/// crate. WS URLs in this codebase are `ws://host[:port][/path]` or
/// `wss://...`; the simple split handles the cases that matter without
/// pulling a new dependency. Malformed inputs (no `://`) fall back to
/// returning the override verbatim.
pub(crate) fn compose_base_url_override(
    override_url: Option<&str>,
    endpoint_url: Option<&str>,
) -> Option<String> {
    match (override_url, endpoint_url) {
        (None, None) => None,
        (Some(o), None) => Some(o.to_string()),
        (None, Some(e)) => Some(e.to_string()),
        (Some(o), Some(e)) => Some(merge_authority_with_path(o, e)),
    }
}

/// Take scheme+authority from `override_url`, path-and-query from
/// `endpoint_url`. If the override already carries a non-trivial path
/// (anything beyond `/`), the caller's intent is to use the override
/// verbatim — return it unchanged. If parsing fails on either side,
/// fall back to the override verbatim (the safer default — at worst the
/// test fails with a clear connect error rather than a silent path
/// rewrite).
fn merge_authority_with_path(override_url: &str, endpoint_url: &str) -> String {
    let Some((o_scheme, o_rest)) = split_scheme(override_url) else {
        return override_url.to_string();
    };
    // If the override carries its own path beyond `/`, honor it verbatim.
    if let Some(slash_idx) = o_rest.find('/') {
        let path = &o_rest[slash_idx..];
        if path != "/" && !path.is_empty() {
            return override_url.to_string();
        }
    }
    let o_authority = o_rest.split('/').next().unwrap_or(o_rest);

    let Some((_, e_rest)) = split_scheme(endpoint_url) else {
        return override_url.to_string();
    };
    let e_path = match e_rest.find('/') {
        Some(idx) => &e_rest[idx..],
        None => "",
    };

    format!("{o_scheme}://{o_authority}{e_path}")
}

/// Split a URL at the `://` boundary. Returns `(scheme, rest)` — `rest`
/// includes everything after `://`.
fn split_scheme(url: &str) -> Option<(&str, &str)> {
    url.find("://").map(|idx| (&url[..idx], &url[idx + 3..]))
}

/// Build the WebSocket connect URL from a server URL, channel name, and
/// resolved channel parameters.
///
/// Behavior:
/// - If `channel_name` starts with `/`, the channel name is appended to
///   `server_url` as a path. Otherwise the server URL is used as-is and
///   `channel_name` does not appear in the URL (the bare-name shape used
///   by the ElevenLabs fixture, where the channel name is a logical
///   identifier rather than a path).
/// - Parameters with non-empty values are appended as `?key=value&...`
///   with values percent-encoded via [`encode_query_component`]. Keys are
///   sorted alphabetically so the resulting URL is deterministic.
/// - Empty-valued parameters are skipped.
pub(crate) fn build_connect_url(
    server_url: &str,
    channel_name: &str,
    params: &HashMap<String, String>,
) -> String {
    let mut url = if channel_name.starts_with('/') {
        // Server URL may or may not end with `/`. Trim a trailing slash to
        // avoid `wss://host//v1/foo`.
        let base = server_url.trim_end_matches('/');
        format!("{base}{channel_name}")
    } else {
        server_url.to_string()
    };

    // Sort keys for determinism — HashMap iteration order is not stable.
    let mut keys: Vec<&String> = params.keys().collect();
    keys.sort();
    let mut first = !url.contains('?');
    for key in keys {
        let value = &params[key];
        if value.is_empty() {
            continue;
        }
        let sep = if first { '?' } else { '&' };
        first = false;
        url.push(sep);
        url.push_str(&encode_query_component(key));
        url.push('=');
        url.push_str(&encode_query_component(value));
    }
    url
}

/// Build the outbound frame for a single-shot `--message <text>` request.
///
/// Shape: `{"type": "user_message", "text": <text>}`. This matches the
/// `UserMessage` event in the ElevenLabs convai AsyncAPI fixture; APIs
/// with a different client→server message shape will get a more
/// elaborate selector in a later task.
pub(crate) fn build_user_message_frame(text: &str) -> Value {
    json!({ "type": "user_message", "text": text })
}

/// Concatenate the text from a sequence of inbound agent-response frames.
///
/// Handles two shapes:
/// - `AgentChatResponsePart` — `.text_response_part.text`, one chunk per
///   frame. Chunks are concatenated in input order.
/// - `AgentResponse` — `.agent_response_event.agent_response`, a single
///   complete reply.
///
/// Frames that match neither shape contribute nothing (the autoresponder
/// caller skips them).
pub(crate) fn concatenate_response_parts(frames: &[Value]) -> String {
    let mut out = String::new();
    for frame in frames {
        if let Some(chunk) = frame
            .pointer("/text_response_part/text")
            .and_then(Value::as_str)
        {
            out.push_str(chunk);
            continue;
        }
        if let Some(full) = frame
            .pointer("/agent_response_event/agent_response")
            .and_then(Value::as_str)
        {
            out.push_str(full);
        }
    }
    out
}

/// Pick the init-payload value to send as the first WS frame.
///
/// Builder-level explicit override wins; otherwise we fall back to the
/// channel's overlay-declared `x-fern-init-payload`. Returns `None` when
/// neither source set a payload — the executor skips the init send in
/// that case.
pub(crate) fn select_init_payload(channel: &Channel, explicit: Option<&Value>) -> Option<Value> {
    if let Some(value) = explicit {
        return Some(value.clone());
    }
    channel.x_fern_init_payload.clone()
}

/// Describe where a [`WsAuth`] would attach the credential, WITHOUT
/// resolving the secret value.
///
/// Used by the `--dry-run` gate. We deliberately surface only the auth
/// *location + name*, never the resolved credential. This diverges from
/// the OpenAPI dry-run (which echoes the resolved header value): the WS
/// handshake can carry auth as a query parameter, and printing a resolved
/// secret into a URL on stdout is a worse leak than the header case.
/// Describing the location also means dry-run works with no credentials
/// configured at all.
pub(crate) fn describe_ws_auth(auth: &WsAuth) -> Value {
    match auth {
        WsAuth::QueryParam(name, _) => json!({ "location": "query_param", "name": name }),
        WsAuth::Header(name, _) => json!({ "location": "header", "name": name }),
        WsAuth::Headers(pairs) => {
            let names: Vec<&String> = pairs.iter().map(|(n, _)| n).collect();
            json!({ "location": "headers", "names": names })
        }
        WsAuth::FirstMessage(field, _) => json!({ "location": "first_message", "field": field }),
        WsAuth::None => json!({ "location": "none" }),
    }
}

/// Build the `--dry-run` report for a WS channel: everything the executor
/// would do up to (but not including) opening the socket. Pure — no IO, no
/// network, no credential resolution — so it is unit-testable and safe to
/// run without any auth configured.
///
/// Mirrors the intent of `openapi::executor`'s dry-run JSON: `dry_run:
/// true` plus the resolved request shape. The `mode` field reflects the
/// `--message` vs REPL branch the live path would have taken.
pub(crate) fn build_dry_run_info(
    connect_url: &str,
    channel_name: &str,
    auth: &WsAuth,
    init_payload: Option<&Value>,
    message_arg: Option<&str>,
) -> Value {
    json!({
        "dry_run": true,
        "protocol": "websocket",
        "url": connect_url,
        "channel": channel_name,
        "auth": describe_ws_auth(auth),
        "init_payload": init_payload.cloned().unwrap_or(Value::Null),
        "message_frame": message_arg.map(build_user_message_frame).unwrap_or(Value::Null),
        "mode": if message_arg.is_some() { "single-shot" } else { "repl" },
    })
}

/// Default single-shot response timeout. A convai agent turn is normally
/// a few seconds; 30s leaves generous headroom while ensuring an agent
/// that never emits a recognized text response (e.g. one that only accepts
/// audio input) fails loudly instead of hanging the CLI forever.
pub(crate) const DEFAULT_RESPONSE_TIMEOUT_SECS: u64 = 30;

/// Parse the single-shot response-timeout override value. Falls back to
/// [`DEFAULT_RESPONSE_TIMEOUT_SECS`] when the raw value is absent, empty,
/// unparseable, or zero — zero would mean "give up instantly", almost
/// always a misconfiguration rather than an intent.
pub(crate) fn parse_response_timeout(raw: Option<&str>) -> Duration {
    raw.and_then(|s| s.trim().parse::<u64>().ok())
        .filter(|n| *n > 0)
        .map(Duration::from_secs)
        .unwrap_or_else(|| Duration::from_secs(DEFAULT_RESPONSE_TIMEOUT_SECS))
}

/// Resolve the single-shot response timeout for a CLI, reading the
/// per-binary `<NAME>_WS_RESPONSE_TIMEOUT_SECS` override (same uppercase /
/// hyphen→underscore prefix convention as the logging env vars). Env vars
/// are trusted user input (see `AGENTS.md`), so the value is parsed but
/// not path-validated.
pub(crate) fn resolve_response_timeout(cli_name: &str) -> Duration {
    let prefix = cli_name.to_uppercase().replace('-', "_");
    let var = format!("{prefix}_WS_RESPONSE_TIMEOUT_SECS");
    parse_response_timeout(std::env::var(&var).ok().as_deref())
}

/// Build the error returned when single-shot mode waits out its response
/// timeout. `frames_seen` is the total inbound frame count — `0`/`1` points
/// at a silent agent (only the init-metadata frame arrived), a larger count
/// at a stream that never signalled turn-completion.
pub(crate) fn response_timeout_error(timeout: Duration, frames_seen: usize) -> CliError {
    CliError::Other(anyhow::anyhow!(
        "No agent response received within {}s ({frames_seen} inbound frame(s) seen, none \
         completed the turn). The agent may require audio input or have no text response \
         configured — try a text-capable agent, or raise the timeout via the \
         `<NAME>_WS_RESPONSE_TIMEOUT_SECS` environment variable.",
        timeout.as_secs(),
    ))
}

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

/// Resolve the WS server URL for this run.
///
/// Precedence:
/// 1. `override_url` — typically `--base-url` or `<NAME>_BASE_URL` (resolved
///    upstream in the binding), possibly composed with the binding's
///    `.endpoint(...)` path. Used verbatim if set.
/// 2. The single non-empty server URL declared in the spec.
///
/// **Errors** with `CliError::Validation` when:
/// - no override is set AND the spec declares zero non-empty server URLs;
/// - no override is set AND the spec declares two or more non-empty server
///   URLs. AsyncAPI 2.6 keys servers by name, so picking one silently
///   (e.g. alphabetically) lets `development` win over `production`.
///   Bindings declaring multiple environments must disambiguate by
///   calling `.endpoint(...)` on the builder (or set `<NAME>_BASE_URL`
///   at runtime) — the error message lists every declared candidate so
///   the caller can pick.
fn resolve_server_url(doc: &AsyncApiDescription, override_url: Option<&str>) -> Result<String, CliError> {
    if let Some(url) = override_url {
        return Ok(url.to_string());
    }
    // Sort for deterministic, reproducible error output. AsyncAPI 2.6
    // keys servers by name; HashMap iteration order is not stable.
    let mut named: Vec<(&String, &super::discovery::Server)> = doc
        .servers
        .iter()
        .filter(|(_, s)| !s.url.is_empty())
        .collect();
    named.sort_by(|a, b| a.0.cmp(b.0));
    match named.as_slice() {
        [] => Err(CliError::Validation(
            "AsyncAPI document declares no server URL and no base-url override was supplied".into(),
        )),
        [(_, server)] => Ok(server.url.clone()),
        many => {
            let candidates = many
                .iter()
                .map(|(name, server)| format!("`{name}` ({})", server.url))
                .collect::<Vec<_>>()
                .join(", ");
            Err(CliError::Validation(format!(
                "AsyncAPI document declares {} server URLs; cannot pick one \
                 unambiguously. Disambiguate by calling `.endpoint(<url>)` on \
                 the binding (or set `<NAME>_BASE_URL` / pass `--base-url`). \
                 Declared servers: {candidates}",
                many.len(),
            )))
        }
    }
}

/// Resolve the auth source for the WS connect handshake.
///
/// For v1 we wire only the single-scheme case: when one auth binding is
/// registered and it's a `Token` source, attach it as a header whose name
/// is the binding's scheme name (e.g. `xi-api-key` for ElevenLabs convai,
/// `Authorization` for a bearer-style scheme). Unbound / multi-binding /
/// non-token cases fall through to `WsAuth::None`; downstream auth
/// validation belongs to `validate_auth` on the binding.
///
/// When more than one auth binding is registered (e.g. a future binary
/// composing root-level `.auth(...)` with a binding-level `auth_scheme_env`
/// via `set_root_auth`), the WS handshake silently connects unauthenticated
/// — emit a `tracing::warn!` so the misconfiguration shows up in
/// `<NAME>_LOG` instead of as an opaque server-side 401.
fn resolve_ws_auth(auth_bindings: &[(String, SchemeBinding)]) -> WsAuth {
    if auth_bindings.len() == 1 {
        if let (scheme_name, SchemeBinding::Token(source)) = &auth_bindings[0] {
            return WsAuth::Header(scheme_name.clone(), source.clone());
        }
    }
    if auth_bindings.len() > 1 {
        let schemes: Vec<&str> = auth_bindings.iter().map(|(name, _)| name.as_str()).collect();
        tracing::warn!(
            schemes = ?schemes,
            "resolve_ws_auth: multiple auth bindings registered (only single-scheme is wired in v1); \
             WebSocket connect will fall back to unauthenticated. Bind exactly one Token scheme on \
             the AsyncAPI binding.",
        );
    }
    WsAuth::None
}

/// Drive a single AsyncAPI channel: connect, send init payload, then
/// either run single-shot (`--message <text>`) or REPL mode.
#[allow(clippy::too_many_arguments)]
pub async fn execute(
    doc: &AsyncApiDescription,
    channel_name: &str,
    channel: &Channel,
    message_arg: Option<&str>,
    param_args: &HashMap<String, String>,
    base_url_override: Option<&str>,
    auth_bindings: &[(String, SchemeBinding)],
    http_config: &HttpConfig,
    explicit_init_payload: Option<&Value>,
    auto_responder: Option<crate::websocket::AutoResponder>,
    dry_run: bool,
    response_timeout: Duration,
) -> Result<(), CliError> {
    let server_url = resolve_server_url(doc, base_url_override)?;
    let connect_url = build_connect_url(&server_url, channel_name, param_args);

    let mut ws_config = WsConfig::new(connect_url);
    ws_config.auth = resolve_ws_auth(auth_bindings);

    // ---- Mode selection -------------------------------------------------
    let init_payload = select_init_payload(channel, explicit_init_payload);

    // `--dry-run`: report the connection we WOULD open and return before
    // touching the network. Without this gate the flag is silently ignored
    // and a live WebSocket is opened against production. Mirrors the
    // OpenAPI executor's dry-run short-circuit.
    if dry_run {
        let info = build_dry_run_info(
            &ws_config.url,
            channel_name,
            &ws_config.auth,
            init_payload.as_ref(),
            message_arg,
        );
        let rendered = serde_json::to_string_pretty(&info).map_err(|e| {
            CliError::Other(anyhow::anyhow!("failed to render dry-run output: {e}"))
        })?;
        println!("{rendered}");
        return Ok(());
    }

    if let Some(text) = message_arg {
        // The single-shot path installs its own assembly closure (convai
        // turn-completion shape); the binding-provided autoresponder is
        // ignored here pending a generic single-shot model. See run_repl
        // for the bidirectional path that honors it.
        run_single_shot(ws_config, http_config, init_payload, text, response_timeout).await
    } else {
        // REPL mode is interactive and stdin-driven — it intentionally has
        // no response timeout (the user, not an agent turn, drives the loop).
        run_repl(ws_config, http_config, init_payload, auto_responder).await
    }
}

/// Mode 2: send `init payload (if any) + UserMessage`, await one agent
/// response, print, Close(1000), exit 0.
async fn run_single_shot(
    mut ws_config: WsConfig,
    http_config: &HttpConfig,
    init_payload: Option<Value>,
    message_text: &str,
    response_timeout: Duration,
) -> Result<(), CliError> {
    // Capture multi-part assembly state. The autoresponder closure flushes
    // on a `stop`-typed part OR on the first `AgentResponse` (single-frame
    // shape) — whichever arrives first signals "turn complete".
    let parts: Arc<Mutex<Vec<Value>>> = Arc::new(Mutex::new(Vec::new()));
    let done: Arc<Mutex<bool>> = Arc::new(Mutex::new(false));
    // Total inbound frames, for the response-timeout diagnostic.
    let seen: Arc<AtomicUsize> = Arc::new(AtomicUsize::new(0));

    let parts_inner = Arc::clone(&parts);
    let done_inner = Arc::clone(&done);
    let seen_inner = Arc::clone(&seen);

    // Autoresponder responsibilities, end to end:
    //   - reply with a `pong` to `ping` frames (the server times us out
    //     at 20s without one),
    //   - capture `agent_chat_response_part` / `agent_response` frames
    //     into `parts` and elide their raw emit,
    //   - mark `done = true` once the turn completes so the recv loop
    //     can shut down and the caller can print the assembled reply.
    //
    // The closure must be `Fn`, hence the Mutex<Vec>. Suppression for
    // captured frames uses [`ResponderAction::Suppress`] — no bytes are
    // written to the wire for elision, unlike the earlier `{}` ack hack.
    let responder: crate::websocket::AutoResponder = Arc::new(move |frame: &Value| {
        // Count every inbound frame so a response timeout can report how
        // much (if anything) the agent sent before giving up.
        seen_inner.fetch_add(1, Ordering::Relaxed);

        // Ping/pong is the only frame shape we actively reply to (otherwise
        // the server times us out at 20s).
        if frame.get("type").and_then(Value::as_str) == Some("ping") {
            if let Some(event_id) = frame
                .pointer("/ping_event/event_id")
                .and_then(Value::as_i64)
            {
                return Some(ResponderAction::Reply(
                    json!({"type": "pong", "event_id": event_id}),
                ));
            }
        }

        // Capture agent response shapes for later assembly.
        let ty = frame.get("type").and_then(Value::as_str);
        let is_part = ty == Some("agent_chat_response_part");
        let is_full = ty == Some("agent_response");
        if is_part || is_full {
            let mut guard = parts_inner.lock().unwrap();
            guard.push(frame.clone());
            // Heuristic: AgentResponse is single-frame → turn complete.
            // AgentChatResponsePart with `.text_response_part.is_final == true`
            // OR a `.text_response_part.type == "stop"` marks the end of a
            // streaming turn. The fixture spec does not lock the shape down,
            // so we accept either signal.
            let final_part = frame
                .pointer("/text_response_part/is_final")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            let stop_part = frame
                .pointer("/text_response_part/type")
                .and_then(Value::as_str)
                == Some("stop");
            if is_full || final_part || stop_part {
                *done_inner.lock().unwrap() = true;
            }
            // Elide raw emit; the assembled reply prints once the turn
            // completes (see below). No bytes go to the wire.
            return Some(ResponderAction::Suppress);
        }
        None
    });
    ws_config.auto_responder = Some(responder);

    let mut client = WebSocketClient::connect(ws_config, http_config).await?;

    // Send init payload first if declared.
    if let Some(ref payload) = init_payload {
        client.send(payload).await?;
    }

    // Then the user's message.
    let frame = build_user_message_frame(message_text);
    client.send(&frame).await?;

    // Spin the recv loop until the autoresponder marks the turn done.
    // We use a oneshot shutdown future driven off the `done` flag.
    let done_check = Arc::clone(&done);
    let shutdown = Box::pin(async move {
        loop {
            if *done_check.lock().unwrap() {
                return;
            }
            tokio::time::sleep(std::time::Duration::from_millis(25)).await;
        }
    });

    // Bound the wait: without this, an agent that never emits a recognized
    // text response (e.g. one that only accepts audio input) leaves the
    // `done` flag false forever and the CLI hangs indefinitely. On timeout
    // we fail loudly with a diagnostic rather than blocking. `run_recv_loop`
    // (REPL) is deliberately exempt — it's interactive.
    match tokio::time::timeout(response_timeout, client.run_until_shutdown(shutdown)).await {
        Ok(result) => result?,
        Err(_elapsed) => {
            return Err(response_timeout_error(
                response_timeout,
                seen.load(Ordering::Relaxed),
            ));
        }
    }

    // Flush the assembled response to stdout as a single line.
    let assembled = {
        let guard = parts.lock().unwrap();
        concatenate_response_parts(&guard)
    };
    if !assembled.is_empty() {
        println!("{assembled}");
    }
    Ok(())
}

/// Mode 3: stdin → outbound frames; server frames → stdout. EOF on stdin
/// sends Close(1000) and exits 0.
async fn run_repl(
    mut ws_config: WsConfig,
    http_config: &HttpConfig,
    init_payload: Option<Value>,
    auto_responder: Option<crate::websocket::AutoResponder>,
) -> Result<(), CliError> {
    ws_config.stdin_input = true;
    // Stdin lines are NOT necessarily JSON in REPL mode — accept anything
    // and let the server reject malformed input. JSON validation would
    // surprise users with a friendly REPL.
    ws_config.stdin_validate_json = false;
    // Application-level keepalive is API-specific; the binding-provided
    // autoresponder ships from the customer's binary (e.g. convai
    // ping/pong) instead of being baked into the framework.
    ws_config.auto_responder = auto_responder;

    let mut client = WebSocketClient::connect(ws_config, http_config).await?;

    if let Some(payload) = init_payload {
        client.send(&payload).await?;
    }

    client.run_recv_loop().await
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::asyncapi::discovery::Channel;

    fn channel_with_init(payload: Option<Value>) -> Channel {
        Channel {
            x_fern_init_payload: payload,
            ..Channel::default()
        }
    }

    // -- select_init_payload --------------------------------------------------

    #[test]
    fn init_payload_uses_overlay_when_set() {
        let payload = json!({
            "type": "conversation_initiation_client_data",
            "conversation_config_override": {
                "agent": {"language": "en"},
                "tts": {"voice_id": "voice-x"}
            }
        });
        let channel = channel_with_init(Some(payload.clone()));
        let selected = select_init_payload(&channel, None).expect("Some");
        // Verbatim — nested keys preserved.
        assert_eq!(selected, payload);
    }

    #[test]
    fn init_payload_explicit_overrides_overlay() {
        let overlay = json!({"type": "overlay"});
        let explicit = json!({"type": "explicit", "extra": 42});
        let channel = channel_with_init(Some(overlay));
        let selected = select_init_payload(&channel, Some(&explicit)).expect("Some");
        assert_eq!(selected, explicit);
    }

    #[test]
    fn init_payload_none_when_neither_set() {
        let channel = channel_with_init(None);
        assert!(select_init_payload(&channel, None).is_none());
    }

    // -- build_connect_url ----------------------------------------------------

    #[test]
    fn connect_url_encodes_special_chars() {
        let mut params = HashMap::new();
        params.insert("agent_id".to_string(), "bad/id?foo&bar".to_string());
        let url = build_connect_url("wss://api.elevenlabs.io", "AgentMessages", &params);
        assert!(
            url.contains("agent_id=bad%2Fid%3Ffoo%26bar"),
            "expected encoded agent_id, got: {url}",
        );
        // EXACTLY ONE `?` — no extra query params leaked.
        assert_eq!(
            url.matches('?').count(),
            1,
            "url must have exactly one `?` separator, got: {url}",
        );
    }

    #[test]
    fn connect_url_sorts_params() {
        let mut params = HashMap::new();
        params.insert("zeta".to_string(), "z".to_string());
        params.insert("alpha".to_string(), "a".to_string());
        params.insert("mid".to_string(), "m".to_string());
        let url = build_connect_url("wss://example.com", "AgentMessages", &params);
        // Find the indices of each key — alphabetical order required.
        let i_alpha = url.find("alpha=").expect("alpha present");
        let i_mid = url.find("mid=").expect("mid present");
        let i_zeta = url.find("zeta=").expect("zeta present");
        assert!(i_alpha < i_mid, "alpha must come before mid in {url}");
        assert!(i_mid < i_zeta, "mid must come before zeta in {url}");
    }

    #[test]
    fn connect_url_appends_channel_path_when_starts_with_slash() {
        let params = HashMap::new();
        let url = build_connect_url("wss://api.elevenlabs.io", "/v1/convai/conversation", &params);
        assert_eq!(url, "wss://api.elevenlabs.io/v1/convai/conversation");
    }

    #[test]
    fn connect_url_skips_empty_value_params() {
        let mut params = HashMap::new();
        params.insert("agent_id".to_string(), "abc".to_string());
        params.insert("nothing".to_string(), "".to_string());
        let url = build_connect_url("wss://example.com", "AgentMessages", &params);
        assert!(url.contains("agent_id=abc"));
        assert!(!url.contains("nothing="), "empty-valued params must be skipped: {url}");
    }

    // -- build_user_message_frame --------------------------------------------

    #[test]
    fn user_message_frame_shape() {
        let frame = build_user_message_frame("hi");
        assert_eq!(frame, json!({"type": "user_message", "text": "hi"}));
    }

    // -- concatenate_response_parts -----------------------------------------

    #[test]
    fn concatenate_parts_assembles_chunks() {
        let frames = vec![
            json!({
                "type": "agent_chat_response_part",
                "text_response_part": {"text": "Hel"}
            }),
            json!({
                "type": "agent_chat_response_part",
                "text_response_part": {"text": "lo, "}
            }),
            json!({
                "type": "agent_chat_response_part",
                "text_response_part": {"text": "world"}
            }),
        ];
        assert_eq!(concatenate_response_parts(&frames), "Hello, world");
    }

    #[test]
    fn concatenate_parts_handles_agent_response() {
        let frames = vec![json!({
            "type": "agent_response",
            "agent_response_event": {"agent_response": "complete reply"}
        })];
        assert_eq!(concatenate_response_parts(&frames), "complete reply");
    }

    #[test]
    fn concatenate_parts_ignores_unknown_shapes() {
        let frames = vec![
            json!({"type": "vad_score", "vad_score_event": {"vad_score": 0.5}}),
            json!({"type": "ping", "ping_event": {"event_id": 7}}),
        ];
        assert_eq!(concatenate_response_parts(&frames), "");
    }

    // -- resolve_ws_auth -----------------------------------------------------

    #[test]
    fn resolve_ws_auth_uses_scheme_name_from_binding() {
        // A non-xi-api-key scheme name must propagate to the WS header name,
        // not be silently rewritten. Regression for a copy-paste hardcoded
        // `"xi-api-key"` header.
        use crate::auth::AuthCredentialSource;

        let bindings = vec![(
            "Authorization".to_string(),
            SchemeBinding::Token(AuthCredentialSource::from_env("MY_TOKEN")),
        )];
        match resolve_ws_auth(&bindings) {
            WsAuth::Header(name, _) => assert_eq!(name, "Authorization"),
            _ => panic!("expected WsAuth::Header variant"),
        }
    }

    #[test]
    fn resolve_ws_auth_preserves_xi_api_key_scheme() {
        // ElevenLabs-shaped binding must still produce an `xi-api-key`
        // header — no regression in the canonical case.
        use crate::auth::AuthCredentialSource;

        let bindings = vec![(
            "xi-api-key".to_string(),
            SchemeBinding::Token(AuthCredentialSource::from_env("XI_API_KEY")),
        )];
        match resolve_ws_auth(&bindings) {
            WsAuth::Header(name, _) => assert_eq!(name, "xi-api-key"),
            _ => panic!("expected WsAuth::Header variant"),
        }
    }

    #[test]
    fn resolve_ws_auth_falls_back_to_none_with_multiple_bindings() {
        // When more than one auth binding is registered (e.g. root-level
        // `.auth(...)` composed with a binding-level `auth_scheme_env` via
        // `set_root_auth`), the single-scheme code path is skipped and
        // `WsAuth::None` is returned. The accompanying `tracing::warn!`
        // surfaces the misconfiguration in `<NAME>_LOG`; this test just
        // pins the structural fallback so a future refactor doesn't
        // silently start picking the first / last binding.
        use crate::auth::AuthCredentialSource;

        let bindings = vec![
            (
                "Authorization".to_string(),
                SchemeBinding::Token(AuthCredentialSource::from_env("ROOT_TOKEN")),
            ),
            (
                "xi-api-key".to_string(),
                SchemeBinding::Token(AuthCredentialSource::from_env("XI_API_KEY")),
            ),
        ];
        assert!(matches!(resolve_ws_auth(&bindings), WsAuth::None));
    }

    #[test]
    fn resolve_ws_auth_falls_back_to_none_with_no_bindings() {
        // Zero bindings is a legitimate "unauthenticated WS" case (no creds
        // configured at all) — no warn, just `WsAuth::None`.
        assert!(matches!(resolve_ws_auth(&[]), WsAuth::None));
    }

    // -- compose_base_url_override --------------------------------------------

    #[test]
    fn compose_base_url_none_when_both_unset() {
        assert!(compose_base_url_override(None, None).is_none());
    }

    #[test]
    fn compose_base_url_uses_override_alone() {
        let out = compose_base_url_override(Some("ws://127.0.0.1:1234"), None);
        assert_eq!(out.as_deref(), Some("ws://127.0.0.1:1234"));
    }

    #[test]
    fn compose_base_url_uses_endpoint_alone() {
        let out = compose_base_url_override(None, Some("wss://api.elevenlabs.io/v1/convai/conversation"));
        assert_eq!(
            out.as_deref(),
            Some("wss://api.elevenlabs.io/v1/convai/conversation"),
        );
    }

    #[test]
    fn compose_base_url_merges_authority_with_endpoint_path() {
        // The canonical wire-test shape: host swap, path preserved.
        let out = compose_base_url_override(
            Some("ws://127.0.0.1:1234"),
            Some("wss://api.elevenlabs.io/v1/convai/conversation"),
        );
        assert_eq!(
            out.as_deref(),
            Some("ws://127.0.0.1:1234/v1/convai/conversation"),
        );
    }

    #[test]
    fn compose_base_url_override_with_explicit_path_wins() {
        // If the override carries its own non-trivial path, honor it verbatim —
        // the user told us exactly where to connect.
        let out = compose_base_url_override(
            Some("ws://127.0.0.1:1234/custom/path"),
            Some("wss://api.elevenlabs.io/v1/convai/conversation"),
        );
        assert_eq!(out.as_deref(), Some("ws://127.0.0.1:1234/custom/path"));
    }

    #[test]
    fn compose_base_url_trailing_slash_override_still_takes_endpoint_path() {
        // `ws://host/` is treated as "no path beyond root" — endpoint path wins.
        let out = compose_base_url_override(
            Some("ws://127.0.0.1:1234/"),
            Some("wss://api.elevenlabs.io/v1/convai/conversation"),
        );
        assert_eq!(
            out.as_deref(),
            Some("ws://127.0.0.1:1234/v1/convai/conversation"),
        );
    }

    // -- resolve_server_url --------------------------------------------------

    fn doc_with_servers(entries: &[(&str, &str)]) -> AsyncApiDescription {
        let mut servers = HashMap::new();
        for (name, url) in entries {
            servers.insert(
                (*name).to_string(),
                super::super::discovery::Server {
                    url: (*url).to_string(),
                    ..Default::default()
                },
            );
        }
        AsyncApiDescription { servers, ..Default::default() }
    }

    #[test]
    fn resolve_server_url_override_always_wins() {
        // Even when the spec declares multiple servers, an explicit override
        // (`--base-url` / `.endpoint()`) is used verbatim — no ambiguity error.
        let doc = doc_with_servers(&[
            ("production", "wss://api.example.com"),
            ("development", "wss://dev.example.com"),
        ]);
        let url = resolve_server_url(&doc, Some("ws://127.0.0.1:1234")).expect("ok");
        assert_eq!(url, "ws://127.0.0.1:1234");
    }

    #[test]
    fn resolve_server_url_single_server_used() {
        let doc = doc_with_servers(&[("production", "wss://api.example.com")]);
        let url = resolve_server_url(&doc, None).expect("ok");
        assert_eq!(url, "wss://api.example.com");
    }

    #[test]
    fn resolve_server_url_empty_url_skipped() {
        // An entry with an empty URL is treated as not-present; the one
        // non-empty entry is unambiguous.
        let doc = doc_with_servers(&[
            ("production", "wss://api.example.com"),
            ("placeholder", ""),
        ]);
        let url = resolve_server_url(&doc, None).expect("ok");
        assert_eq!(url, "wss://api.example.com");
    }

    #[test]
    fn resolve_server_url_zero_servers_errors() {
        let doc = doc_with_servers(&[]);
        let err = resolve_server_url(&doc, None).expect_err("must error");
        match err {
            CliError::Validation(msg) => assert!(
                msg.contains("declares no server URL"),
                "expected no-server-URL message, got: {msg}",
            ),
            other => panic!("expected Validation, got {other:?}"),
        }
    }

    #[test]
    fn resolve_server_url_multiple_servers_errors_with_candidates() {
        // Regression for the silent alphabetical-pick footgun: when the spec
        // declares two non-empty server URLs and no override is set, the
        // resolver MUST error rather than picking one. The error must list
        // every declared candidate so the caller can disambiguate.
        let doc = doc_with_servers(&[
            ("development", "wss://dev.example.com"),
            ("production", "wss://api.example.com"),
        ]);
        let err = resolve_server_url(&doc, None).expect_err("must error");
        match err {
            CliError::Validation(msg) => {
                assert!(
                    msg.contains("declares 2 server URLs"),
                    "expected count in error, got: {msg}",
                );
                assert!(
                    msg.contains("`production`") && msg.contains("`development`"),
                    "error must list both server names, got: {msg}",
                );
                assert!(
                    msg.contains(".endpoint("),
                    "error must point at the .endpoint() remediation, got: {msg}",
                );
            }
            other => panic!("expected Validation, got {other:?}"),
        }
    }

    // -- describe_ws_auth -----------------------------------------------------

    #[test]
    fn describe_ws_auth_surfaces_location_and_name_without_secret() {
        use crate::auth::AuthCredentialSource;

        // Header auth → location + header name, never the resolved value.
        let header = WsAuth::Header(
            "xi-api-key".into(),
            AuthCredentialSource::literal("super-secret-key"),
        );
        let desc = describe_ws_auth(&header);
        assert_eq!(desc, json!({ "location": "header", "name": "xi-api-key" }));
        // The secret must not leak into the description anywhere.
        assert!(!desc.to_string().contains("super-secret-key"));
    }

    #[test]
    fn describe_ws_auth_covers_every_variant() {
        use crate::auth::AuthCredentialSource;
        let src = || AuthCredentialSource::literal("x");

        assert_eq!(
            describe_ws_auth(&WsAuth::QueryParam("authorization".into(), src())),
            json!({ "location": "query_param", "name": "authorization" }),
        );
        assert_eq!(
            describe_ws_auth(&WsAuth::Headers(vec![
                ("Authorization".into(), src()),
                ("OpenAI-Beta".into(), src()),
            ])),
            json!({ "location": "headers", "names": ["Authorization", "OpenAI-Beta"] }),
        );
        assert_eq!(
            describe_ws_auth(&WsAuth::FirstMessage("xi_api_key".into(), src())),
            json!({ "location": "first_message", "field": "xi_api_key" }),
        );
        assert_eq!(
            describe_ws_auth(&WsAuth::None),
            json!({ "location": "none" }),
        );
    }

    // -- build_dry_run_info ---------------------------------------------------

    #[test]
    fn dry_run_info_single_shot_shape() {
        let init = json!({ "type": "conversation_initiation_client_data" });
        let info = build_dry_run_info(
            "wss://api.elevenlabs.io/v1/convai/conversation?agent_id=agt_1",
            "conversation",
            &WsAuth::Header("xi-api-key".into(), crate::auth::AuthCredentialSource::literal("k")),
            Some(&init),
            Some("hello"),
        );
        assert_eq!(info["dry_run"], json!(true));
        assert_eq!(info["protocol"], json!("websocket"));
        assert_eq!(
            info["url"],
            json!("wss://api.elevenlabs.io/v1/convai/conversation?agent_id=agt_1")
        );
        assert_eq!(info["channel"], json!("conversation"));
        assert_eq!(info["mode"], json!("single-shot"));
        assert_eq!(info["init_payload"], init);
        assert_eq!(
            info["message_frame"],
            json!({ "type": "user_message", "text": "hello" })
        );
    }

    // -- parse_response_timeout -----------------------------------------------

    #[test]
    fn response_timeout_parses_valid_override() {
        assert_eq!(parse_response_timeout(Some("5")), Duration::from_secs(5));
        assert_eq!(parse_response_timeout(Some("  12 ")), Duration::from_secs(12));
    }

    #[test]
    fn response_timeout_falls_back_on_bad_or_zero_values() {
        let default = Duration::from_secs(DEFAULT_RESPONSE_TIMEOUT_SECS);
        assert_eq!(parse_response_timeout(None), default);
        assert_eq!(parse_response_timeout(Some("")), default);
        assert_eq!(parse_response_timeout(Some("nope")), default);
        // Zero would mean "give up instantly" — treat as misconfig.
        assert_eq!(parse_response_timeout(Some("0")), default);
        // Negative parses as invalid u64 → default.
        assert_eq!(parse_response_timeout(Some("-3")), default);
    }

    #[test]
    fn response_timeout_error_mentions_duration_frames_and_override() {
        let err = response_timeout_error(Duration::from_secs(7), 3);
        let msg = err.to_string();
        assert!(msg.contains("within 7s"), "got: {msg}");
        assert!(msg.contains("3 inbound frame"), "got: {msg}");
        assert!(
            msg.contains("WS_RESPONSE_TIMEOUT_SECS"),
            "error should point at the override env var, got: {msg}"
        );
    }

    #[test]
    fn dry_run_info_repl_has_null_message_and_init() {
        let info = build_dry_run_info(
            "wss://example.com/chan",
            "chan",
            &WsAuth::None,
            None,
            None,
        );
        assert_eq!(info["mode"], json!("repl"));
        assert_eq!(info["message_frame"], Value::Null);
        assert_eq!(info["init_payload"], Value::Null);
        assert_eq!(info["auth"], json!({ "location": "none" }));
    }
}
