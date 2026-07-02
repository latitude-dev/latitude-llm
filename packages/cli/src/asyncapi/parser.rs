//! AsyncAPI 2.6 parser.
//!
//! Accepts a YAML or JSON AsyncAPI document and produces an
//! [`AsyncApiDescription`]. Rejects unsupported AsyncAPI versions and any
//! non-WebSocket server protocol with [`CliError::Validation`].
//!
//! This module is intentionally self-contained — it must not import from
//! `crate::openapi` or `crate::graphql`. See `AGENTS.md` ("Architecture:
//! Code Generation Model").

use std::collections::HashMap;

use serde_json::{Map, Value};

use crate::error::CliError;

use super::discovery::{
    AsyncApiDescription, Channel, ChannelParameter, Info, Message, Operation, Server,
};

/// AsyncAPI specification version this parser supports (any `2.6.x`).
const SUPPORTED_VERSION_PREFIX: &str = "2.6.";

/// Server protocols accepted by this parser — WebSocket only.
const SUPPORTED_PROTOCOLS: &[&str] = &["ws", "wss"];

/// Parse an AsyncAPI 2.6 document from YAML or JSON.
///
/// # Errors
///
/// Returns [`CliError::Validation`] when:
/// - the top-level `asyncapi` version field is missing or not `2.6.x`,
/// - any server declares a protocol other than `ws` / `wss`.
///
/// Returns [`CliError::Discovery`] when YAML/JSON deserialization fails.
pub fn parse(input: &str) -> Result<AsyncApiDescription, CliError> {
    // Parse into a generic JSON value first. Try JSON, then YAML — mirrors
    // the openapi overlay loader strategy.
    let doc: Value = serde_json::from_str::<Value>(input).or_else(|_| {
        let yaml_value: serde_yaml::Value = serde_yaml::from_str(input).map_err(|e| {
            CliError::Discovery(format!("Failed to parse AsyncAPI document: {e}"))
        })?;
        Ok::<Value, CliError>(yaml_to_json(yaml_value))
    })?;

    let obj = doc.as_object().ok_or_else(|| {
        CliError::Validation(
            "AsyncAPI document must be a mapping at the top level".to_string(),
        )
    })?;

    // ---- Version guard --------------------------------------------------
    let version = obj.get("asyncapi").and_then(Value::as_str).ok_or_else(|| {
        CliError::Validation(
            "AsyncAPI document is missing required `asyncapi` version field; \
             only AsyncAPI 2.6.x is supported"
                .to_string(),
        )
    })?;
    if !version.starts_with(SUPPORTED_VERSION_PREFIX) {
        return Err(CliError::Validation(format!(
            "Unsupported AsyncAPI version `{version}`; only AsyncAPI 2.6.x is supported"
        )));
    }

    // ---- Protocol guard -------------------------------------------------
    if let Some(servers) = obj.get("servers").and_then(Value::as_object) {
        for (name, server) in servers {
            let protocol = server
                .get("protocol")
                .and_then(Value::as_str)
                .unwrap_or_default();
            if !SUPPORTED_PROTOCOLS.contains(&protocol) {
                return Err(CliError::Validation(format!(
                    "Server `{name}` declares unsupported protocol `{protocol}`; \
                     only WebSocket (ws, wss) is supported"
                )));
            }
        }
    }

    // ---- Build the description ------------------------------------------
    let info = obj
        .get("info")
        .cloned()
        .map(|v| serde_json::from_value::<Info>(v).unwrap_or_default())
        .unwrap_or_default();

    let servers = obj
        .get("servers")
        .and_then(Value::as_object)
        .map(parse_servers)
        .unwrap_or_default();

    let channels = obj
        .get("channels")
        .and_then(Value::as_object)
        .map(parse_channels)
        .unwrap_or_default();

    let (messages, schemas) = obj
        .get("components")
        .and_then(Value::as_object)
        .map(parse_components)
        .unwrap_or_default();

    Ok(AsyncApiDescription {
        asyncapi: version.to_string(),
        info,
        servers,
        channels,
        messages,
        schemas,
    })
}

// ---------------------------------------------------------------------------
// Component parsing helpers
// ---------------------------------------------------------------------------

fn parse_servers(servers: &Map<String, Value>) -> HashMap<String, Server> {
    servers
        .iter()
        .map(|(name, value)| {
            let server = serde_json::from_value::<Server>(value.clone()).unwrap_or_default();
            (name.clone(), server)
        })
        .collect()
}

fn parse_channels(channels: &Map<String, Value>) -> HashMap<String, Channel> {
    channels
        .iter()
        .map(|(name, value)| (name.clone(), parse_channel(value)))
        .collect()
}

fn parse_channel(value: &Value) -> Channel {
    let map = match value.as_object() {
        Some(map) => map,
        None => return Channel::default(),
    };

    let description = map
        .get("description")
        .and_then(Value::as_str)
        .map(str::to_string);
    let publish = map.get("publish").map(parse_operation);
    let subscribe = map.get("subscribe").map(parse_operation);
    let parameters = map
        .get("parameters")
        .and_then(Value::as_object)
        .map(parse_parameters)
        .unwrap_or_default();

    // `x-fern-sdk-group-name` is an array of strings (nested group path);
    // `x-fern-sdk-method-name` is a single string (leaf command name).
    // Mirrors the OpenAPI extension shape — same semantics, different host.
    let sdk_group_name = map
        .get("x-fern-sdk-group-name")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|entry| entry.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default();
    let sdk_method_name = map
        .get("x-fern-sdk-method-name")
        .and_then(Value::as_str)
        .map(str::to_string);

    // `x-fern-init-payload` — opaque JSON value that the executor will
    // send as the first WS frame after connect. Preserved verbatim
    // (`Value::clone`) so nested objects survive round-trips. Channels
    // without the extension yield `None`.
    let x_fern_init_payload = map.get("x-fern-init-payload").cloned();

    Channel {
        description,
        publish,
        subscribe,
        parameters,
        sdk_group_name,
        sdk_method_name,
        x_fern_init_payload,
    }
}

fn parse_operation(value: &Value) -> Operation {
    let map = match value.as_object() {
        Some(map) => map,
        None => return Operation::default(),
    };

    Operation {
        operation_id: map
            .get("operationId")
            .and_then(Value::as_str)
            .map(str::to_string),
        summary: map
            .get("summary")
            .and_then(Value::as_str)
            .map(str::to_string),
        description: map
            .get("description")
            .and_then(Value::as_str)
            .map(str::to_string),
        message_refs: extract_message_refs(map.get("message")),
    }
}

/// Walk an operation's `message` node and return the bare component message
/// names referenced. Supports both a single `$ref` and `oneOf: [...]`.
fn extract_message_refs(message: Option<&Value>) -> Vec<String> {
    let Some(message) = message else {
        return Vec::new();
    };

    // Single `$ref`
    if let Some(name) = message
        .get("$ref")
        .and_then(Value::as_str)
        .and_then(strip_message_ref)
    {
        return vec![name.to_string()];
    }

    // `oneOf: [{$ref}, ...]`
    if let Some(one_of) = message.get("oneOf").and_then(Value::as_array) {
        return one_of
            .iter()
            .filter_map(|entry| {
                entry
                    .get("$ref")
                    .and_then(Value::as_str)
                    .and_then(strip_message_ref)
                    .map(str::to_string)
            })
            .collect();
    }

    Vec::new()
}

/// Strip the `#/components/messages/` prefix from a `$ref` and return the
/// bare component name, or `None` if the ref points elsewhere.
fn strip_message_ref(reference: &str) -> Option<&str> {
    reference.strip_prefix("#/components/messages/")
}

fn parse_parameters(params: &Map<String, Value>) -> HashMap<String, ChannelParameter> {
    params
        .iter()
        .map(|(name, value)| {
            let map = value.as_object();
            let description = map
                .and_then(|m| m.get("description"))
                .and_then(Value::as_str)
                .map(str::to_string);
            let schema = map
                .and_then(|m| m.get("schema"))
                .cloned()
                .unwrap_or(Value::Null);
            (
                name.clone(),
                ChannelParameter {
                    description,
                    schema,
                },
            )
        })
        .collect()
}

fn parse_components(
    components: &Map<String, Value>,
) -> (HashMap<String, Message>, HashMap<String, Value>) {
    let messages = components
        .get("messages")
        .and_then(Value::as_object)
        .map(parse_messages)
        .unwrap_or_default();

    let schemas = components
        .get("schemas")
        .and_then(Value::as_object)
        .map(|m| {
            m.iter()
                .map(|(name, value)| (name.clone(), value.clone()))
                .collect()
        })
        .unwrap_or_default();

    (messages, schemas)
}

fn parse_messages(messages: &Map<String, Value>) -> HashMap<String, Message> {
    messages
        .iter()
        .map(|(name, value)| {
            let map = value.as_object();
            let payload = map
                .and_then(|m| m.get("payload"))
                .cloned()
                .unwrap_or(Value::Null);
            let message = Message {
                name: map
                    .and_then(|m| m.get("name"))
                    .and_then(Value::as_str)
                    .map(str::to_string),
                title: map
                    .and_then(|m| m.get("title"))
                    .and_then(Value::as_str)
                    .map(str::to_string),
                description: map
                    .and_then(|m| m.get("description"))
                    .and_then(Value::as_str)
                    .map(str::to_string),
                payload,
            };
            (name.clone(), message)
        })
        .collect()
}

// ---------------------------------------------------------------------------
// YAML → JSON conversion
// ---------------------------------------------------------------------------

/// Convert a `serde_yaml::Value` into a `serde_json::Value`.
fn yaml_to_json(yaml: serde_yaml::Value) -> Value {
    match yaml {
        serde_yaml::Value::Null => Value::Null,
        serde_yaml::Value::Bool(b) => Value::Bool(b),
        serde_yaml::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Value::Number(i.into())
            } else if let Some(u) = n.as_u64() {
                Value::Number(u.into())
            } else if let Some(f) = n.as_f64() {
                serde_json::Number::from_f64(f)
                    .map(Value::Number)
                    .unwrap_or(Value::Null)
            } else {
                Value::Null
            }
        }
        serde_yaml::Value::String(s) => Value::String(s),
        serde_yaml::Value::Sequence(seq) => {
            Value::Array(seq.into_iter().map(yaml_to_json).collect())
        }
        serde_yaml::Value::Mapping(map) => {
            let obj = map
                .into_iter()
                .filter_map(|(k, v)| {
                    let key = match k {
                        serde_yaml::Value::String(s) => s,
                        serde_yaml::Value::Number(n) => n.to_string(),
                        serde_yaml::Value::Bool(b) => b.to_string(),
                        _ => return None,
                    };
                    Some((key, yaml_to_json(v)))
                })
                .collect();
            Value::Object(obj)
        }
        serde_yaml::Value::Tagged(tagged) => yaml_to_json(tagged.value),
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_validation_error(err: CliError, fragment: &str) -> String {
        match err {
            CliError::Validation(msg) => {
                assert!(
                    msg.contains(fragment),
                    "expected error to contain `{fragment}`, got: {msg}"
                );
                msg
            }
            other => panic!("expected Validation error, got: {other:?}"),
        }
    }

    // -- Happy path: the real ElevenLabs spec ---------------------------------

    #[test]
    fn parse_real_elevenlabs_spec_returns_ok_with_agentmessages_and_31_messages() {
        let spec = include_str!("agent.asyncapi.yaml");
        let api = parse(spec).expect("real spec must parse");

        assert!(
            api.channels.contains_key("AgentMessages"),
            "AgentMessages channel must be present"
        );
        assert_eq!(
            api.messages.len(),
            31,
            "expected 31 component messages, got {}",
            api.messages.len()
        );
        assert_eq!(api.asyncapi, "2.6.0");
    }

    // -- Version guard --------------------------------------------------------

    fn minimal_spec_with_version(version: &str) -> String {
        format!(
            r#"asyncapi: "{version}"
info:
  title: Test
  version: "1.0"
servers:
  prod:
    url: wss://example.com
    protocol: ws
channels:
  Main:
    description: trivial
"#,
        )
    }

    #[test]
    fn parse_rejects_asyncapi_3_0_0() {
        let err = parse(&minimal_spec_with_version("3.0.0"))
            .expect_err("3.0.0 must be rejected");
        assert_validation_error(err, "3.0.0");
    }

    #[test]
    fn parse_rejects_asyncapi_2_5_0() {
        let err = parse(&minimal_spec_with_version("2.5.0"))
            .expect_err("2.5.0 must be rejected");
        assert_validation_error(err, "2.5.0");
    }

    #[test]
    fn parse_rejects_asyncapi_1_2_0() {
        let err = parse(&minimal_spec_with_version("1.2.0"))
            .expect_err("1.2.0 must be rejected");
        assert_validation_error(err, "1.2.0");
    }

    #[test]
    fn parse_rejects_missing_asyncapi_field() {
        let spec = r#"
info:
  title: Test
  version: "1.0"
servers:
  prod:
    url: wss://example.com
    protocol: ws
channels:
  Main: {}
"#;
        let err = parse(spec).expect_err("missing version must be rejected");
        let msg = assert_validation_error(err, "asyncapi");
        assert!(
            msg.contains("missing") || msg.contains("Missing"),
            "expected `missing` mention, got: {msg}"
        );
    }

    // -- Protocol guard -------------------------------------------------------

    fn minimal_spec_with_protocol(protocol: &str) -> String {
        format!(
            r#"asyncapi: "2.6.0"
info:
  title: Test
  version: "1.0"
servers:
  prod:
    url: example.com
    protocol: {protocol}
channels:
  Main: {{}}
"#,
        )
    }

    #[test]
    fn parse_rejects_protocol_mqtt() {
        let err = parse(&minimal_spec_with_protocol("mqtt"))
            .expect_err("mqtt must be rejected");
        let msg = assert_validation_error(err, "mqtt");
        assert!(msg.contains("prod"), "expected server name, got: {msg}");
    }

    #[test]
    fn parse_rejects_protocol_kafka() {
        let err = parse(&minimal_spec_with_protocol("kafka"))
            .expect_err("kafka must be rejected");
        assert_validation_error(err, "kafka");
    }

    #[test]
    fn parse_rejects_protocol_amqp() {
        let err = parse(&minimal_spec_with_protocol("amqp"))
            .expect_err("amqp must be rejected");
        assert_validation_error(err, "amqp");
    }

    #[test]
    fn parse_rejects_protocol_sse() {
        let err = parse(&minimal_spec_with_protocol("sse"))
            .expect_err("sse must be rejected");
        assert_validation_error(err, "sse");
    }

    #[test]
    fn parse_accepts_ws_and_wss_protocols() {
        let spec = r#"
asyncapi: "2.6.0"
info:
  title: Test
  version: "1.0"
servers:
  insecure:
    url: ws://localhost:8080
    protocol: ws
  secure:
    url: wss://example.com
    protocol: wss
channels:
  Main: {}
"#;
        let api = parse(spec).expect("ws + wss must be accepted");
        assert_eq!(api.servers.len(), 2);
    }

    // -- Message-ref extraction ----------------------------------------------

    #[test]
    fn parse_extracts_message_refs_from_oneof() {
        let spec = r##"
asyncapi: "2.6.0"
info:
  title: Test
  version: "1.0"
servers:
  prod:
    url: wss://example.com
    protocol: ws
channels:
  Main:
    publish:
      message:
        oneOf:
          - $ref: "#/components/messages/Foo"
          - $ref: "#/components/messages/Bar"
components:
  messages:
    Foo:
      payload: {}
    Bar:
      payload: {}
"##;
        let api = parse(spec).expect("must parse");
        let channel = api.channels.get("Main").expect("Main channel present");
        let publish = channel.publish.as_ref().expect("publish op present");
        assert_eq!(publish.message_refs, vec!["Foo".to_string(), "Bar".to_string()]);
    }

    #[test]
    fn parse_extracts_message_ref_from_single_ref() {
        let spec = r##"
asyncapi: "2.6.0"
info:
  title: Test
  version: "1.0"
servers:
  prod:
    url: wss://example.com
    protocol: ws
channels:
  Main:
    subscribe:
      message:
        $ref: "#/components/messages/Solo"
components:
  messages:
    Solo:
      payload: {}
"##;
        let api = parse(spec).expect("must parse");
        let channel = api.channels.get("Main").expect("Main channel present");
        let subscribe = channel.subscribe.as_ref().expect("subscribe op present");
        assert_eq!(subscribe.message_refs, vec!["Solo".to_string()]);
    }

    // -- x-fern-init-payload --------------------------------------------------

    #[test]
    fn parse_populates_x_fern_init_payload_when_present() {
        let spec = r#"
asyncapi: "2.6.0"
info:
  title: Test
  version: "1.0"
servers:
  prod:
    url: wss://example.com
    protocol: ws
channels:
  AgentMessages:
    x-fern-init-payload:
      type: conversation_initiation_client_data
      conversation_config_override:
        agent:
          language: en
"#;
        let api = parse(spec).expect("must parse");
        let channel = api.channels.get("AgentMessages").expect("channel present");
        let payload = channel
            .x_fern_init_payload
            .as_ref()
            .expect("init payload should be Some");
        assert_eq!(payload["type"], "conversation_initiation_client_data");
        assert_eq!(
            payload["conversation_config_override"]["agent"]["language"],
            "en",
        );
    }

    #[test]
    fn parse_yields_none_when_x_fern_init_payload_absent() {
        let spec = r#"
asyncapi: "2.6.0"
info:
  title: Test
  version: "1.0"
servers:
  prod:
    url: wss://example.com
    protocol: ws
channels:
  AgentMessages:
    description: no init payload here
"#;
        let api = parse(spec).expect("must parse");
        let channel = api.channels.get("AgentMessages").expect("channel present");
        assert!(channel.x_fern_init_payload.is_none());
    }

    #[test]
    fn parse_extracts_real_spec_message_refs_for_agentmessages() {
        let spec = include_str!("agent.asyncapi.yaml");
        let api = parse(spec).expect("real spec must parse");
        let channel = api
            .channels
            .get("AgentMessages")
            .expect("AgentMessages present");
        let publish_refs = &channel
            .publish
            .as_ref()
            .expect("publish op present")
            .message_refs;
        let subscribe_refs = &channel
            .subscribe
            .as_ref()
            .expect("subscribe op present")
            .message_refs;
        assert!(
            publish_refs.contains(&"Audio".to_string()),
            "publish should include Audio, got: {publish_refs:?}"
        );
        assert!(
            subscribe_refs.contains(&"UserAudio".to_string()),
            "subscribe should include UserAudio, got: {subscribe_refs:?}"
        );
        // Sanity: combined refs should sum to the 31 declared messages.
        let total = publish_refs.len() + subscribe_refs.len();
        assert_eq!(total, 31, "expected 31 refs total, got {total}");
    }
}
