// SPDX-License-Identifier: Apache-2.0

//! WebSocket failure → [`CliError`] mapping.
//!
//! # The matrix (v1)
//!
//! | Phase | Failure mode | `CliError` | Exit |
//! |---|---|---|---|
//! | handshake | DNS / TCP refused / reset | `Other` | 5 |
//! | handshake | TLS cert error | `Other` | 5 |
//! | handshake | 401 / 403 Upgrade rejected | `Auth` | 2 |
//! | handshake | 404 / wrong URL | `Discovery` | 4 |
//! | handshake | 5xx | `Api { code, .. }` | 1 |
//! | mid-stream | server `Close(1000)` Normal Closure | `Ok(())` | **0** |
//! | mid-stream | server `Close(1001..=1015)` abnormal | `Other` (hint included) | 5 |
//! | mid-stream | TCP drop / read timeout / inactivity | `Other` (hint included) | 5 |
//! | local | bad URL given to [`WsConfig::url`](super::WsConfig) | `Validation` | 3 |
//! | local | unparseable JSON from server | `Other` | 5 |
//!
//! The abnormal-close hint nudges users toward the most common failure
//! mode — typically a missed application-level keepalive reply. Each
//! customer overrides it on their [`super::WsConfig`] with API-specific
//! guidance.

use tokio_tungstenite::tungstenite;

use crate::error::CliError;

/// Default hint appended to abnormal-close errors. API-neutral by
/// design — it's the message a customer of *any* WS-using CLI should
/// understand. Customer code overrides
/// [`super::WsConfig::abnormal_close_hint`] with API-specific guidance.
pub const ABNORMAL_CLOSE_HINT: &str =
    "connection ended abnormally; check auth, network, and the API's keepalive/timeout requirements";

/// Map a `tungstenite::Error` raised during the handshake phase to a
/// [`CliError`] following the matrix above. Public so an external caller
/// implementing its own handshake wrapper (e.g. for unit-testing the
/// matrix in isolation) can reuse the mapping.
pub fn map_handshake_error(err: tungstenite::Error) -> CliError {
    use tungstenite::Error as TE;

    match err {
        TE::Http(response) => {
            // The HTTP-status-bearing handshake failure: the server
            // accepted the TCP connection but rejected the Upgrade.
            let status = response.status().as_u16();
            // Best-effort body capture for the error message. Tungstenite
            // exposes it as `Option<Vec<u8>>`.
            let body = response
                .into_body()
                .and_then(|b| String::from_utf8(b).ok())
                .unwrap_or_default();
            match status {
                401 | 403 => CliError::Auth(format!(
                    "WebSocket upgrade rejected with {status}: {}",
                    truncate(&body, 200),
                )),
                404 => CliError::Discovery(format!(
                    "WebSocket endpoint not found (404): {}",
                    truncate(&body, 200),
                )),
                500..=599 => CliError::Api {
                    code: status,
                    message: format!("WebSocket upgrade failed: {}", truncate(&body, 200)),
                    reason: "wsHandshakeServerError".into(),
                },
                _ => CliError::Other(anyhow::anyhow!(
                    "WebSocket upgrade failed with status {status}: {}",
                    truncate(&body, 200),
                )),
            }
        }
        TE::Url(e) => {
            // tungstenite couldn't even parse / route the URL — caller
            // gave us garbage.
            CliError::Validation(format!("invalid WebSocket URL: {e}"))
        }
        // Everything else (Io, Tls, ConnectionClosed before negotiation,
        // protocol violations during the upgrade) is transport-shaped.
        other => CliError::Other(anyhow::anyhow!("WebSocket handshake failed: {other}")),
    }
}

/// Map a `tungstenite::Error` raised mid-stream (after handshake) to a
/// [`CliError`]. Always returns an `Err`; the recv loop maps `Ok` paths
/// (clean close 1000, polite close 1001) directly. `hint` is the message
/// the user should investigate — pass the WS config's
/// [`super::WsConfig::abnormal_close_hint`] (or the default).
pub(crate) fn map_stream_error(err: tungstenite::Error, hint: &str) -> CliError {
    use tungstenite::Error as TE;

    match err {
        TE::ConnectionClosed | TE::AlreadyClosed => CliError::Other(anyhow::anyhow!(
            "WebSocket connection closed unexpectedly — {hint}"
        )),
        TE::Io(e) => CliError::Other(anyhow::anyhow!(
            "WebSocket I/O error mid-stream: {e} — {hint}"
        )),
        other => CliError::Other(anyhow::anyhow!(
            "WebSocket protocol error mid-stream: {other}"
        )),
    }
}

/// Classify a server-initiated close frame.
///
/// Returns `Ok(())` for **success-shaped** closures:
/// - `1000 Normal Closure` — protocol-correct end-of-session.
/// - `1001 Going Away` — peer is leaving (page navigation, server
///   shutdown, *or* session-cap expiry like OpenAI Realtime's 30-minute
///   hard limit). For long-running sessions this is the polite way to
///   say "we're done"; treating it as an error would cause shell
///   pipelines to spuriously fail on a clean end-of-session.
///
/// Returns `Err` for everything else, with `hint` woven into the message
/// when supplied. `hint` is what the user should investigate; pass
/// [`ABNORMAL_CLOSE_HINT`] for the API-neutral default, or supply an
/// API-specific string (see [`super::WsConfig::abnormal_close_hint`]).
pub(crate) fn classify_close_frame(
    frame: Option<&tungstenite::protocol::CloseFrame<'_>>,
    hint: &str,
) -> Result<(), CliError> {
    use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;

    let Some(frame) = frame else {
        // No close frame at all — the peer just hung up. Treat as abnormal.
        return Err(CliError::Other(anyhow::anyhow!(
            "WebSocket peer closed without a close frame — {hint}"
        )));
    };
    match frame.code {
        CloseCode::Normal => Ok(()),
        CloseCode::Away => {
            // 1001 "Going Away" — log to stderr so the user sees that
            // the session ended for a benign reason, but don't fail the
            // exit code.
            let reason_suffix = if frame.reason.is_empty() {
                String::new()
            } else {
                format!(" ({})", frame.reason)
            };
            eprintln!(
                "websocket: session ended with code 1001 going away{reason_suffix}"
            );
            Ok(())
        }
        _ => {
            let code: u16 = frame.code.into();
            Err(CliError::Other(anyhow::anyhow!(
                "WebSocket closed with code {code}{} — {hint}",
                if frame.reason.is_empty() {
                    String::new()
                } else {
                    format!(" ({})", frame.reason)
                },
            )))
        }
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        // Truncate on a char boundary for safety; the body may be UTF-8
        // and slicing in the middle of a multibyte sequence panics.
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
    use tokio_tungstenite::tungstenite::protocol::{CloseFrame, frame::coding::CloseCode};
    use std::borrow::Cow;

    fn frame(code: u16, reason: &'static str) -> CloseFrame<'static> {
        CloseFrame {
            code: CloseCode::from(code),
            reason: Cow::Borrowed(reason),
        }
    }

    #[test]
    fn close_1000_is_ok() {
        assert!(classify_close_frame(Some(&frame(1000, "")), ABNORMAL_CLOSE_HINT).is_ok());
    }

    #[test]
    fn close_1001_going_away_is_ok() {
        // 1001 = peer is leaving (page nav, server shutdown, session-cap
        // expiry). Treated as a clean end-of-session per OpenAI Realtime
        // 30-minute hard limit and similar "polite hangup" patterns.
        assert!(classify_close_frame(Some(&frame(1001, "session cap")), ABNORMAL_CLOSE_HINT).is_ok());
    }

    #[test]
    fn close_1006_is_err_with_hint() {
        let err = classify_close_frame(Some(&frame(1006, "")), ABNORMAL_CLOSE_HINT).unwrap_err();
        assert!(err.to_string().contains("1006"));
        assert!(err.to_string().contains(ABNORMAL_CLOSE_HINT));
    }

    #[test]
    fn close_with_reason_includes_reason_in_message() {
        let err = classify_close_frame(Some(&frame(1011, "internal error")), ABNORMAL_CLOSE_HINT)
            .unwrap_err();
        assert!(err.to_string().contains("internal error"));
    }

    #[test]
    fn missing_close_frame_is_abnormal_err() {
        let err = classify_close_frame(None, ABNORMAL_CLOSE_HINT).unwrap_err();
        assert!(err.to_string().contains(ABNORMAL_CLOSE_HINT));
    }

    #[test]
    fn custom_hint_replaces_default_in_message() {
        let custom = "Deepgram check: KeepAlive cadence + audio format";
        let err = classify_close_frame(Some(&frame(1006, "")), custom).unwrap_err();
        assert!(err.to_string().contains(custom));
        assert!(!err.to_string().contains(ABNORMAL_CLOSE_HINT),
            "default hint should NOT appear when a custom one was passed");
    }

    #[test]
    fn handshake_url_error_maps_to_validation() {
        let err = map_handshake_error(tungstenite::Error::Url(
            tungstenite::error::UrlError::NoHostName,
        ));
        assert!(matches!(err, CliError::Validation(_)));
    }

    #[test]
    fn truncate_respects_char_boundary() {
        // U+1F600 is 4 bytes in UTF-8. Truncating at byte 2 would split it.
        let s = "ab😀cd";
        let truncated = truncate(s, 3);
        // Should fall back to a char boundary at or before 3.
        assert!(truncated.starts_with("ab"));
    }
}
