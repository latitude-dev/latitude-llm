// SPDX-License-Identifier: Apache-2.0

//! `WebSocketClient` — async bidirectional WS client driven by an
//! [`OutputPipeline`](crate::formatter::OutputPipeline). See `mod.rs`
//! for the module-level overview.

use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::HeaderValue;
use tokio_tungstenite::tungstenite::protocol::{frame::coding::CloseCode, CloseFrame, Message};

use crate::error::CliError;
use crate::formatter::OutputPipeline;
use crate::http::HttpConfig;

use super::auth::WsAuth;
use super::error::{classify_close_frame, map_handshake_error, map_stream_error};

/// Disposition the autoresponder returns for an inbound frame.
///
/// Splits the two cases that the older `Option<Value>` return type
/// collapsed into one (`Some(Value)` meant "reply with `Value` and elide
/// emit"). A frame the responder wants to capture but for which it has
/// nothing to send back used to require returning a benign empty object
/// `{}` — which was written to the wire on every captured frame. The
/// dedicated [`ResponderAction::Suppress`] variant elides emit without
/// sending anything.
#[derive(Debug, Clone)]
pub enum ResponderAction {
    /// Send `Value` as an outbound text frame **and** elide the inbound
    /// frame from stdout. Used for app-level ping/pong.
    Reply(Value),
    /// Elide the inbound frame from stdout, send nothing. Used when the
    /// caller is buffering frames for later assembly (e.g. streamed
    /// agent responses).
    Suppress,
}

/// Inbound-frame autoresponder.
///
/// Called once per inbound JSON frame. The returned [`ResponderAction`]
/// controls what happens to the frame:
///
/// - `Some(ResponderAction::Reply(v))` — send `v` as an outbound text
///   frame and elide the inbound frame from stdout. Useful for
///   application-level ping/pong where the inbound is protocol
///   overhead, not user-visible payload.
/// - `Some(ResponderAction::Suppress)` — elide the inbound frame from
///   stdout, send nothing. Useful when the caller is buffering frames
///   for later assembly (e.g. streamed agent responses printed once
///   the turn completes).
/// - `None` — let the inbound flow through to [`OutputPipeline::emit`].
///
/// Customer code defines the closure — application-level keepalive shapes
/// are API-specific (`{"type":"ping"}` vs `{"event":"ping"}` vs binary
/// frames) and have no cross-API standard. A minimal example:
///
/// ```ignore
/// use std::sync::Arc;
/// use fern_cli_sdk::websocket::{AutoResponder, ResponderAction};
/// let responder: AutoResponder = Arc::new(|frame| {
///     if frame.get("type")?.as_str()? == "ping" {
///         Some(ResponderAction::Reply(serde_json::json!({"type": "pong"})))
///     } else {
///         None
///     }
/// });
/// ```
///
/// # Stateful autoresponders
///
/// The closure is `Fn`, not `FnMut`, because the recv loop borrows it by
/// shared reference. If you need state (counter, throttle, per-event-id
/// dedupe), reach for interior mutability:
///
/// ```ignore
/// use std::sync::atomic::{AtomicU64, Ordering};
/// let count = std::sync::Arc::new(AtomicU64::new(0));
/// let count_inner = count.clone();
/// let responder: AutoResponder = std::sync::Arc::new(move |frame| {
///     count_inner.fetch_add(1, Ordering::Relaxed);
///     /* ... */
///     None
/// });
/// ```
///
/// Naïve `let mut n = 0; Arc::new(move |f| { n += 1; ... })` fails to
/// compile — the compiler error points at the closure body, not the
/// trait bound, which is easy to misread.
pub type AutoResponder = Arc<dyn Fn(&Value) -> Option<ResponderAction> + Send + Sync>;

/// Configuration for a single WS connection.
pub struct WsConfig {
    /// Connect URL (`wss://...` for TLS, `ws://...` for plaintext mocks).
    pub url: String,
    /// Where the credential goes (query / header / first-message / none).
    pub auth: WsAuth,
    /// Optional autoresponder. See [`AutoResponder`].
    pub auto_responder: Option<AutoResponder>,
    /// Output pipeline applied to each inbound frame the autoresponder
    /// did *not* claim. Pass via [`OutputPipeline::from_matches`] from
    /// the custom-command handler so `--format` (and future
    /// `--jq`/`--fields`/`--template`) flow through automatically.
    pub output_pipeline: OutputPipeline,
    /// If true, forward stdin lines as outbound text frames. EOF on stdin
    /// triggers a clean WS Close(1000) and exit 0.
    pub stdin_input: bool,
    /// Validate each stdin line as JSON before sending. Invalid lines are
    /// written to stderr as a warning and dropped (the connection is *not*
    /// terminated). Default `true`. Set false only when the wire protocol
    /// is non-JSON.
    pub stdin_validate_json: bool,
    /// JSON keys to recursively elide from each inbound frame before
    /// emitting. Use `vec!["audio_base_64".into()]` for ElevenLabs to
    /// strip the base64 audio blobs that would otherwise flood a terminal.
    pub strip_audio_keys: Vec<String>,
    /// Hint string woven into mid-stream / abnormal-close error messages.
    /// The default points at the ElevenLabs missed-pong pattern; override
    /// when wiring an API with a different common failure mode (e.g.
    /// Deepgram: "check KeepAlive cadence and audio format/encoding";
    /// OpenAI Realtime: "session may have hit the 30-minute cap").
    pub abnormal_close_hint: String,
}

impl WsConfig {
    /// Build a minimal config with no auth and a default pipeline. Useful
    /// for in-process mock tests; production callers always fill in the
    /// auth + autoresponder + stdin fields.
    pub fn new(url: impl Into<String>) -> Self {
        Self {
            url: url.into(),
            auth: WsAuth::None,
            auto_responder: None,
            output_pipeline: OutputPipeline::default(),
            stdin_input: false,
            stdin_validate_json: true,
            strip_audio_keys: Vec::new(),
            abnormal_close_hint: super::error::ABNORMAL_CLOSE_HINT.to_string(),
        }
    }
}

/// A connected WS client ready to send and receive frames.
pub struct WebSocketClient {
    stream: tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
    config: WsConfig,
    /// Tracks whether [`WebSocketClient::send`] has run yet. Used to
    /// merge [`WsAuth::FirstMessage`] into the first outbound frame.
    first_send_done: bool,
}

impl WebSocketClient {
    /// Connect to a WS endpoint, applying auth and reading TLS knobs from
    /// `http_config`.
    ///
    /// Honored in v1:
    /// - `<NAME>_CONNECT_TIMEOUT_SECS` — applied as a handshake deadline.
    ///
    /// Resolved but not yet wired to the tungstenite connector
    /// (deferred — misconfigurations still surface as a `CliError` at
    /// `resolve()` time, before the handshake is attempted):
    /// - `<NAME>_CA_BUNDLE` / `<NAME>_EXTRA_CA_CERTS` / `SSL_CERT_FILE`
    /// - `<NAME>_INSECURE` / `<NAME>_INSECURE_SKIP_VERIFY`
    /// - `<NAME>_PROXY` / `<NAME>_NO_PROXY`
    ///
    /// Not applicable to streaming transports:
    /// - `<NAME>_TIMEOUT_SECS` — bounds total request lifetime for the
    ///   reqwest path; a streaming WS connection has no defined "total
    ///   lifetime" so the value is ignored here. Use
    ///   `<NAME>_CONNECT_TIMEOUT_SECS` for the handshake deadline.
    ///
    /// Default trust roots come from whichever TLS backend the feature
    /// gate selects (`native-tls` reads the OS keychain; `rustls` uses
    /// Mozilla's bundled webpki roots).
    pub async fn connect(
        mut config: WsConfig,
        http_config: &HttpConfig,
    ) -> Result<Self, CliError> {
        // Resolve transport config up front. Even though v1 doesn't yet
        // translate CA bundle / insecure into a tungstenite Connector,
        // calling resolve() surfaces a misconfigured CA path immediately
        // rather than after a confusing TLS error during handshake.
        let resolved = http_config.resolve()?;

        // Apply URL/header auth. FirstMessage is deferred to first send().
        let mut url = config.url.clone();
        let mut headers: Vec<(String, String)> = Vec::new();
        config.auth.apply_to_url_and_headers(&mut url, &mut headers)?;

        // Build the handshake request. Using IntoClientRequest on a parsed
        // URI gets us all the required WS handshake headers
        // (Sec-WebSocket-Key/Version/Upgrade); we then layer our custom
        // headers on top.
        let uri: tokio_tungstenite::tungstenite::http::Uri = url.parse().map_err(|e| {
            CliError::Validation(format!("invalid WebSocket URL `{url}`: {e}"))
        })?;
        let mut request = uri
            .into_client_request()
            .map_err(map_handshake_error)?;
        for (name, value) in &headers {
            let header_value = HeaderValue::from_str(value).map_err(|e| {
                CliError::Validation(format!(
                    "WebSocket header `{name}` contains invalid characters: {e}"
                ))
            })?;
            let header_name: tokio_tungstenite::tungstenite::http::HeaderName =
                name.parse().map_err(|e| {
                    CliError::Validation(format!("invalid WebSocket header name `{name}`: {e}"))
                })?;
            request.headers_mut().insert(header_name, header_value);
        }

        // Sync the URL on the WsConfig with what we actually connected to,
        // so anything downstream that reads it (logging, error messages)
        // reflects the post-auth-apply form.
        config.url = url;

        // Connect, with optional handshake deadline.
        let connect_fut = tokio_tungstenite::connect_async(request);
        let connect_result = if let Some(deadline) = resolved.connect_timeout {
            tokio::time::timeout(deadline, connect_fut).await.map_err(|_| {
                CliError::Other(anyhow::anyhow!(
                    "WebSocket handshake timed out after {}s",
                    deadline.as_secs(),
                ))
            })?
        } else {
            connect_fut.await
        };

        let (stream, _response) = connect_result.map_err(map_handshake_error)?;
        Ok(Self {
            stream,
            config,
            first_send_done: false,
        })
    }

    /// Send a JSON value as a WS text frame. Applies
    /// [`WsAuth::FirstMessage`] merging on the very first send, then
    /// becomes a plain serialize-and-send.
    pub async fn send(&mut self, msg: &Value) -> Result<(), CliError> {
        let mut to_send = msg.clone();
        if !self.first_send_done {
            self.config.auth.merge_into_first_message(&mut to_send)?;
            self.first_send_done = true;
        }
        let text = serde_json::to_string(&to_send).map_err(|e| {
            CliError::Validation(format!("failed to serialize WS frame: {e}"))
        })?;
        let hint = self.config.abnormal_close_hint.clone();
        self.stream
            .send(Message::Text(text))
            .await
            .map_err(|e| map_stream_error(e, &hint))
    }

    /// Send raw bytes as a WS binary frame.
    ///
    /// Required by APIs that ship PCM audio on the wire (Deepgram realtime,
    /// AssemblyAI v3 Universal-Streaming). Customers typically call this
    /// from their own audio-capture loop (`cpal` mic, file reader, etc.)
    /// rather than from the stdin path — stdin forwarding stays JSON-text
    /// only in v1 (see ADR-0002 follow-ups).
    ///
    /// # `WsAuth::FirstMessage` interaction
    ///
    /// `FirstMessage` auth merges the credential into the first outbound
    /// JSON frame. Binary frames have no JSON object to merge into, so
    /// calling `send_binary` as the *very first* outbound when `FirstMessage`
    /// auth is configured silently drops the credential. We error loudly
    /// instead: send a JSON frame first (typically a per-API "configure
    /// session" message that *should* carry the credential), then call
    /// `send_binary` for audio chunks.
    pub async fn send_binary(&mut self, bytes: Vec<u8>) -> Result<(), CliError> {
        if !self.first_send_done && matches!(self.config.auth, WsAuth::FirstMessage(_, _)) {
            return Err(CliError::Validation(
                "WebSocket: send_binary called before any send() with WsAuth::FirstMessage \
                 configured — the auth credential would never reach the server. Send your \
                 session-init JSON frame via `send(...)` first; binary frames after."
                    .into(),
            ));
        }
        let hint = self.config.abnormal_close_hint.clone();
        self.stream
            .send(Message::Binary(bytes))
            .await
            .map_err(|e| map_stream_error(e, &hint))
    }

    /// Run the recv loop until either `shutdown` fires or the server
    /// closes the connection. On graceful shutdown / server `Close(1000)`,
    /// returns `Ok(())`. Other terminations map per the matrix in
    /// [`super::error`].
    ///
    /// `shutdown` is intentionally a generic future rather than a
    /// `tokio_util::sync::CancellationToken` — keeps the dep surface
    /// small, and lets tests pass a `oneshot::Receiver` without dragging
    /// the SIGINT machinery into unit tests. Production wires this to
    /// [`tokio::signal::ctrl_c`] via [`Self::run_recv_loop`].
    pub async fn run_until_shutdown<F>(self, shutdown: F) -> Result<(), CliError>
    where
        F: std::future::Future<Output = ()> + Send + Unpin,
    {
        let WebSocketClient {
            stream,
            config,
            first_send_done,
        } = self;
        let (mut sink, mut source) = stream.split();

        let stdin_input = config.stdin_input;
        let stdin_validate_json = config.stdin_validate_json;
        let abnormal_hint = config.abnormal_close_hint.clone();
        // Keep the first-send bookkeeping live across the loop so the
        // stdin branch can honor `WsAuth::FirstMessage` — without this,
        // a customer combining `stdin_input = true` with `FirstMessage`
        // auth would have the auth field silently dropped from the first
        // outbound frame. (Bug surfaced by Devin Review on PR #53.)
        let mut first_send_done = first_send_done;

        // Bounded channel: stdin reader → recv loop. Bound is 64; when
        // full, the reader blocks on `tx.send`, propagating backpressure
        // back through the OS pipe buffer to the user's writer side.
        // The `_stdin_tx_keepalive` binding holds the sender alive when
        // we're not spawning a reader — without it the rx would return
        // `None` on first recv, which the select! arm interprets as
        // EOF (= clean shutdown) and exits immediately. Combined with
        // the `if stdin_input` guard below this is belt-and-braces.
        let (stdin_tx, mut stdin_rx) = mpsc::channel::<String>(64);
        let _stdin_tx_keepalive;
        let stdin_handle = if stdin_input {
            _stdin_tx_keepalive = None;
            Some(tokio::spawn(stdin_reader_task(stdin_tx, stdin_validate_json)))
        } else {
            _stdin_tx_keepalive = Some(stdin_tx);
            None
        };

        // Use the owned `Stdout` rather than a `StdoutLock`. Holding a
        // lock across the recv loop's await points blocks any other
        // thread that tries to write to stdout — and `StdoutLock` isn't
        // `Send`, so the future itself wouldn't be `Send` either, which
        // breaks `tokio::spawn`. `Stdout::write_all` locks internally
        // per call, which is the right granularity for our throughput.
        let mut stdout = std::io::stdout();
        let pipeline = config.output_pipeline.clone();
        let auto_responder = config.auto_responder.clone();
        let strip_keys: Vec<String> = config.strip_audio_keys.clone();

        let mut shutdown = shutdown;

        let exit_reason: Result<(), CliError> = loop {
            tokio::select! {
                // Bias toward shutdown — if a Ctrl+C fires the same
                // instant as a frame arrives, the user expects the close
                // path to win.
                biased;
                _ = &mut shutdown => {
                    break Ok(());
                }
                line = stdin_rx.recv(), if stdin_input => {
                    match line {
                        Some(text) => {
                            // If `WsAuth::FirstMessage` is configured and
                            // we haven't sent yet, parse → merge → re-serialize
                            // so the auth credential lands in the very first
                            // outbound frame. Lines after the first ship as-is
                            // (matching `WebSocketClient::send`'s contract that
                            // FirstMessage applies only once per connection).
                            let to_send = if !first_send_done
                                && matches!(config.auth, WsAuth::FirstMessage(_, _))
                            {
                                match serde_json::from_str::<Value>(&text) {
                                    Ok(mut v) => {
                                        if let Err(e) =
                                            config.auth.merge_into_first_message(&mut v)
                                        {
                                            break Err(e);
                                        }
                                        match serde_json::to_string(&v) {
                                            Ok(s) => s,
                                            Err(e) => {
                                                break Err(CliError::Validation(format!(
                                                    "failed to re-serialize first stdin \
                                                     frame after merging FirstMessage \
                                                     auth: {e}"
                                                )));
                                            }
                                        }
                                    }
                                    Err(e) => {
                                        // FirstMessage auth requires merging
                                        // into a JSON object — a non-JSON first
                                        // stdin line breaks the contract loudly
                                        // rather than silently dropping creds.
                                        break Err(CliError::Validation(format!(
                                            "FirstMessage auth requires the first stdin \
                                             frame to be valid JSON (got parse error: \
                                             {e}). If your wire protocol allows non-JSON \
                                             frames, call `client.send(...)` once with \
                                             the auth-bearing frame before \
                                             `run_until_shutdown`."
                                        )));
                                    }
                                }
                            } else {
                                text
                            };
                            first_send_done = true;
                            if let Err(e) = sink.send(Message::Text(to_send)).await {
                                break Err(map_stream_error(e, &abnormal_hint));
                            }
                        }
                        None => {
                            // stdin EOF — clean exit per resolution sheet.
                            // The Close(1000) frame is sent after the loop
                            // unwinds (`exit_reason.is_ok()` branch below).
                            break Ok(());
                        }
                    }
                }
                msg = source.next() => {
                    let result = handle_inbound(
                        msg,
                        &mut sink,
                        &auto_responder,
                        &pipeline,
                        &strip_keys,
                        &mut stdout,
                        &abnormal_hint,
                    ).await;
                    match result {
                        FrameDisposition::Continue => continue,
                        FrameDisposition::Stop(r) => break r,
                    }
                }
            }
        };

        // Send Close(1000) on graceful exit. We swallow the error from
        // close() because the connection may already be closed (server
        // initiated the close, network is gone, etc.) — `exit_reason`
        // is the authoritative outcome.
        //
        // Note: when the server initiated the close, tungstenite has
        // already queued the echo internally before our `Message::Close`
        // reaches `sink.send`. Tungstenite's close-state machine treats
        // user-side `send(Close)` as a no-op outside the Active state,
        // so this is *not* a double-frame on the wire — just a wasted
        // method call. Cheap and keeps the source readable.
        if exit_reason.is_ok() {
            let _ = tokio::time::timeout(
                Duration::from_secs(2),
                sink.send(Message::Close(Some(CloseFrame {
                    code: CloseCode::Normal,
                    reason: "".into(),
                }))),
            )
            .await;
        }

        // Abort the stdin reader task. NOTE: `abort()` does NOT unwind a
        // blocking read inside `tokio::io::stdin()` — the underlying
        // blocking thread continues until the OS hands it a line or EOF.
        // In `run_recv_loop` this is fine because the process is about
        // to exit and the OS reclaims everything. Future stdin-driven
        // *tests* will need a fake stdin (e.g. a custom `AsyncRead`
        // injected via a future `WsConfig.stdin_source` field) to avoid
        // leaking a blocking thread per test.
        if let Some(handle) = stdin_handle {
            handle.abort();
        }

        exit_reason
    }

    /// Convenience wrapper that runs the recv loop until either
    /// [`tokio::signal::ctrl_c`] fires or the server closes.
    pub async fn run_recv_loop(self) -> Result<(), CliError> {
        // Wrap the signal future so its concrete unit-typed shape lines
        // up with the `Future<Output = ()> + Unpin` bound on
        // `run_until_shutdown`. Box the future to satisfy Unpin without
        // requiring callers to pin manually.
        let shutdown = Box::pin(async {
            let _ = tokio::signal::ctrl_c().await;
        });
        self.run_until_shutdown(shutdown).await
    }
}

enum FrameDisposition {
    Continue,
    Stop(Result<(), CliError>),
}

/// Single-frame handler — invoked once per item from the WS source.
/// Returns whether the loop should keep going or break with a result.
async fn handle_inbound(
    msg: Option<Result<Message, tokio_tungstenite::tungstenite::Error>>,
    sink: &mut futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
        Message,
    >,
    auto_responder: &Option<AutoResponder>,
    pipeline: &OutputPipeline,
    strip_keys: &[String],
    stdout: &mut std::io::Stdout,
    abnormal_hint: &str,
) -> FrameDisposition {
    match msg {
        None => FrameDisposition::Stop(Err(CliError::Other(anyhow::anyhow!(
            "WebSocket stream ended without a close frame — {abnormal_hint}"
        )))),
        Some(Err(e)) => FrameDisposition::Stop(Err(map_stream_error(e, abnormal_hint))),
        Some(Ok(Message::Close(frame))) => {
            FrameDisposition::Stop(classify_close_frame(frame.as_ref(), abnormal_hint))
        }
        // WS protocol-level Ping/Pong are auto-handled by tungstenite; we
        // never see them as user-payload. Frame is also internal. None of
        // them should emit to stdout.
        Some(Ok(Message::Ping(_) | Message::Pong(_) | Message::Frame(_))) => {
            FrameDisposition::Continue
        }
        Some(Ok(Message::Binary(b))) => {
            // v1: inbound binary frames are not emitted to stdout
            // (ElevenLabs / OpenAI use JSON text; Deepgram / AssemblyAI
            // send JSON inbound and only accept binary outbound). Warn
            // visibly so a customer hitting an API that *does* stream
            // binary back (some Deepgram protobuf configs, some OpenAI
            // tool-call audio paths) knows their stream produced
            // unprintable bytes — silence would look like a hung pipe.
            eprintln!(
                "warning: dropped {}-byte inbound WebSocket binary frame \
                 (v1 does not emit binary inbound; plumb a handler via \
                 WsConfig in a future release if your API needs this)",
                b.len(),
            );
            FrameDisposition::Continue
        }
        Some(Ok(Message::Text(text))) => {
            // Parse as JSON. If parsing fails, treat as transport-level
            // garbage from the server — surface it.
            let value: Value = match serde_json::from_str(&text) {
                Ok(v) => v,
                Err(e) => {
                    return FrameDisposition::Stop(Err(CliError::Other(anyhow::anyhow!(
                        "WebSocket received unparseable JSON: {e}: {}",
                        truncate(&text, 200),
                    ))));
                }
            };

            // Autoresponder first: if it claims the frame, dispatch on
            // the requested action and elide emit either way.
            if let Some(responder) = auto_responder {
                match responder(&value) {
                    Some(ResponderAction::Reply(reply)) => {
                        let reply_text = match serde_json::to_string(&reply) {
                            Ok(s) => s,
                            Err(e) => {
                                return FrameDisposition::Stop(Err(CliError::Other(
                                    anyhow::anyhow!(
                                        "autoresponder produced unserializable JSON: {e}"
                                    ),
                                )));
                            }
                        };
                        if let Err(e) = sink.send(Message::Text(reply_text)).await {
                            return FrameDisposition::Stop(Err(map_stream_error(
                                e,
                                abnormal_hint,
                            )));
                        }
                        return FrameDisposition::Continue;
                    }
                    Some(ResponderAction::Suppress) => {
                        return FrameDisposition::Continue;
                    }
                    None => {}
                }
            }

            // Strip audio-shaped keys before emit (recursive).
            let to_emit = if strip_keys.is_empty() {
                value
            } else {
                let mut v = value;
                strip_keys_recursive(&mut v, strip_keys);
                v
            };

            // Emit through the pipeline. `paginated=true` so each frame
            // emits as compact NDJSON (one object per line).
            if let Err(e) = pipeline.emit(stdout, &to_emit, true, false) {
                return FrameDisposition::Stop(Err(CliError::Other(anyhow::anyhow!(
                    "failed to emit WebSocket frame: {e}"
                ))));
            }
            FrameDisposition::Continue
        }
    }
}

/// Recursively remove keys whose name matches any entry in `keys`. Walks
/// objects and arrays in place. Linear in the JSON value's node count.
fn strip_keys_recursive(value: &mut Value, keys: &[String]) {
    match value {
        Value::Object(map) => {
            for k in keys {
                map.remove(k);
            }
            for (_, v) in map.iter_mut() {
                strip_keys_recursive(v, keys);
            }
        }
        Value::Array(arr) => {
            for v in arr.iter_mut() {
                strip_keys_recursive(v, keys);
            }
        }
        _ => {}
    }
}

/// Stdin reader task: pushes validated lines onto the bounded sender.
/// When stdin EOFs, drops the sender so the main loop sees `None` on
/// its next `recv()` and exits cleanly. Blank lines silently skipped;
/// invalid JSON warned to stderr and dropped (connection stays up).
async fn stdin_reader_task(tx: mpsc::Sender<String>, validate_json: bool) {
    let stdin = tokio::io::stdin();
    let mut reader = BufReader::new(stdin).lines();
    loop {
        match reader.next_line().await {
            Ok(Some(line)) => {
                if line.trim().is_empty() {
                    continue;
                }
                if validate_json {
                    if let Err(e) = serde_json::from_str::<Value>(&line) {
                        eprintln!(
                            "warning: stdin line is not valid JSON, dropping: {} ({})",
                            truncate(&line, 80),
                            e,
                        );
                        continue;
                    }
                }
                if tx.send(line).await.is_err() {
                    // Receiver dropped — the recv loop has exited. Stop.
                    return;
                }
            }
            Ok(None) => return, // EOF — drop tx by returning
            Err(e) => {
                eprintln!("warning: stdin read error: {e}");
                return;
            }
        }
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        let mut end = max;
        while end > 0 && !s.is_char_boundary(end) {
            end -= 1;
        }
        format!("{}…", &s[..end])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_keys_removes_top_level_and_nested() {
        let mut value = serde_json::json!({
            "audio_base_64": "AAAA...",
            "text": "hello",
            "agent_response": {
                "audio_base_64": "BBBB...",
                "transcript": "world",
            },
            "items": [
                {"audio_base_64": "CCCC...", "id": 1},
                {"audio_base_64": "DDDD...", "id": 2},
            ],
        });
        strip_keys_recursive(&mut value, &["audio_base_64".to_string()]);
        assert!(value.get("audio_base_64").is_none());
        assert_eq!(value["text"], "hello");
        assert!(value["agent_response"].get("audio_base_64").is_none());
        assert_eq!(value["agent_response"]["transcript"], "world");
        assert!(value["items"][0].get("audio_base_64").is_none());
        assert!(value["items"][1].get("audio_base_64").is_none());
        assert_eq!(value["items"][0]["id"], 1);
    }

    #[test]
    fn strip_keys_noop_when_keys_absent() {
        let mut value = serde_json::json!({"text": "hi", "n": 1});
        strip_keys_recursive(&mut value, &["audio_base_64".to_string()]);
        assert_eq!(value, serde_json::json!({"text": "hi", "n": 1}));
    }
}
