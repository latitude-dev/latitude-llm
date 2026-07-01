// SPDX-License-Identifier: Apache-2.0

//! WebSocket bidirectional client.
//!
//! Used by the AsyncAPI binding (`src/asyncapi/`) and by custom commands
//! that need to graft a long-lived bidirectional connection onto the
//! CLI. The recv loop emits each inbound JSON frame through
//! [`crate::formatter::OutputPipeline`] so format / color / future
//! jq/fields/template flags compose for free.
//!
//! # Composition with [`AppContext`](crate::openapi::AppContext)
//!
//! Custom-command handlers are synchronous, but the WS client is async.
//! Bridge with the same `block_in_place` + `Handle::current().block_on(...)`
//! pattern that [`AppContext::execute`](crate::openapi::AppContext::execute)
//! uses internally — see [`WebSocketClient::connect`] for an example.
//!
//! # Auth
//!
//! `WsAuth::{QueryParam, Header, FirstMessage}` each take an
//! [`AuthCredentialSource`](crate::auth::AuthCredentialSource) directly —
//! the WS module does **not** call into [`AuthProvider`](crate::auth::AuthProvider)
//! because that surface is reqwest-shaped. See
//! `docs/adr/0001-auth-provider-no-cred-extraction.md`.
//!
//! # TLS
//!
//! `WebSocketClient::connect` honors compile-time roots from
//! `CliApp::extra_root_cert` and resolves the same env vars as the
//! reqwest path via [`HttpConfig::resolve`](crate::http::HttpConfig::resolve)
//! — `<NAME>_CA_BUNDLE`, `<NAME>_INSECURE`, `<NAME>_CONNECT_TIMEOUT_SECS`.
//! Proxy support (`<NAME>_PROXY`) is not implemented in v1; document it as
//! a follow-up.
//!
//! # Graceful shutdown
//!
//! [`WebSocketClient::run_until_shutdown`] takes any future. Production
//! wires it to [`tokio::signal::ctrl_c`] via the convenience wrapper
//! [`WebSocketClient::run_recv_loop`]; tests wire it to a `oneshot`
//! receiver.

mod auth;
mod client;
mod error;

pub use auth::WsAuth;
pub use client::{AutoResponder, ResponderAction, WebSocketClient, WsConfig};
pub use error::map_handshake_error;
