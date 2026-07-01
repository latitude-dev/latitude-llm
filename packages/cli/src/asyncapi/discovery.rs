//! AsyncAPI internal representation.
//!
//! Models the subset of AsyncAPI 2.6 used by the code generator — channels,
//! messages, operations, and servers. Payloads and schemas are kept as raw
//! `serde_json::Value` because this layer does not interpret JSON Schema.
//!
//! Like `src/openapi/discovery.rs` and `src/graphql/discovery.rs`, this
//! module is intentionally self-contained — it must not import from sibling
//! code-generation paths.

use std::collections::HashMap;

use serde::Deserialize;
use serde_json::Value;

/// Top-level AsyncAPI document model.
#[derive(Debug, Clone, Deserialize, Default)]
pub struct AsyncApiDescription {
    /// AsyncAPI specification version (e.g. `"2.6.0"`).
    pub asyncapi: String,
    /// Document metadata.
    #[serde(default)]
    pub info: Info,
    /// Servers keyed by server name.
    #[serde(default)]
    pub servers: HashMap<String, Server>,
    /// Channels keyed by channel name.
    #[serde(default)]
    pub channels: HashMap<String, Channel>,
    /// Resolved message definitions keyed by component name.
    ///
    /// Populated from `components.messages.*` during parsing.
    #[serde(default)]
    pub messages: HashMap<String, Message>,
    /// Component schemas keyed by component name, as raw JSON Schema values.
    #[serde(default)]
    pub schemas: HashMap<String, Value>,
}

/// AsyncAPI `info` block.
#[derive(Debug, Clone, Deserialize, Default)]
pub struct Info {
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub description: Option<String>,
}

/// AsyncAPI server entry (`servers.<name>`).
#[derive(Debug, Clone, Deserialize, Default)]
pub struct Server {
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub protocol: String,
    #[serde(default)]
    pub description: Option<String>,
}

/// AsyncAPI channel entry (`channels.<name>`).
///
/// `sdk_group_name` mirrors `x-fern-sdk-group-name` (a nested list of
/// strings) and `sdk_method_name` mirrors `x-fern-sdk-method-name` —
/// the same shape used by the OpenAPI path to drive `clap` command
/// hierarchies. Both default to empty / `None` when the extensions are
/// absent; the command emitter falls back to a kebab-case channel name
/// in that case.
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Channel {
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub publish: Option<Operation>,
    #[serde(default)]
    pub subscribe: Option<Operation>,
    #[serde(default)]
    pub parameters: HashMap<String, ChannelParameter>,
    /// Nested subcommand group path from `x-fern-sdk-group-name`.
    /// Empty when the extension is absent — the leaf attaches at root.
    #[serde(default)]
    pub sdk_group_name: Vec<String>,
    /// Leaf command name from `x-fern-sdk-method-name`. `None` when the
    /// extension is absent — the emitter falls back to a kebab-case form
    /// of the channel name.
    #[serde(default)]
    pub sdk_method_name: Option<String>,
    /// Raw JSON value of `x-fern-init-payload` — the frame that the
    /// executor sends immediately after WebSocket connect. Typically
    /// supplied by an overlay (ACP-3.1); `None` when the channel does
    /// not declare an init payload. Preserved verbatim so nested objects
    /// and arrays round-trip without lossy schema interpretation.
    #[serde(default)]
    pub x_fern_init_payload: Option<Value>,
}

/// AsyncAPI operation (`publish` / `subscribe` under a channel).
///
/// `message_refs` contains the bare component names extracted from
/// `#/components/messages/<Name>` `$ref` pointers — both single-ref and
/// `oneOf:` shapes are flattened here so consumers do not need to chase
/// pointers at parse time.
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Operation {
    #[serde(default)]
    pub operation_id: Option<String>,
    #[serde(default)]
    pub summary: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    /// Bare component message names referenced by this operation.
    #[serde(default)]
    pub message_refs: Vec<String>,
}

/// AsyncAPI message definition under `components.messages`.
#[derive(Debug, Clone, Deserialize, Default)]
pub struct Message {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    /// Raw payload definition (typically a JSON Schema or a `$ref`).
    #[serde(default)]
    pub payload: Value,
}

/// AsyncAPI channel parameter (`channels.<name>.parameters.<name>`).
#[derive(Debug, Clone, Deserialize, Default)]
pub struct ChannelParameter {
    #[serde(default)]
    pub description: Option<String>,
    /// Raw JSON Schema for the parameter.
    #[serde(default)]
    pub schema: Value,
}
