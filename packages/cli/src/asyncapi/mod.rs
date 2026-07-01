//! AsyncAPI code-generation path.
//!
//! Parses AsyncAPI 2.6 documents (WebSocket protocol only) and exposes the
//! internal model used to drive code generation. The shape of this module
//! mirrors `src/openapi/` and `src/graphql/`, but is intentionally
//! self-contained — no abstractions are shared across the three paths.
//! See `AGENTS.md` ("Architecture: Code Generation Model") for the
//! no-shared-abstractions rule.

pub mod app;
pub mod binding;
pub mod commands;
pub mod discovery;
pub mod executor;
pub mod overlay;
pub mod parser;

pub use app::{BindingArgKind, BindingArgs, CliApp};
pub use binding::AsyncApiBinding;
pub use discovery::{
    AsyncApiDescription, Channel, ChannelParameter, Info, Message, Operation, Server,
};
pub use overlay::{
    apply_overlay, apply_overlays_to_spec, parse_overlay, validate_overlay, OverlayAction,
    OverlayDocument, OverlayInfo,
};
pub use parser::parse;
