//! AsyncAPI clap command emitter.
//!
//! Walks an [`AsyncApiDescription`] and produces a `clap::Command` tree
//! where each channel maps to a leaf subcommand. The hierarchy comes
//! from two Fern extensions on the channel object:
//!
//! - `x-fern-sdk-group-name: [a, b, c]` — nested subcommand groups
//! - `x-fern-sdk-method-name: leaf` — the leaf command name
//!
//! Channels without `x-fern-sdk-method-name` fall back to a kebab-case
//! form of the channel name (`AgentMessages` → `agent-messages`).
//!
//! Per-channel flags:
//! - `--message <TEXT>` (optional) — single-shot client message
//! - one `--<kebab(param)>` per URL-template parameter declared under
//!   `channels.<name>.parameters`
//!
//! Global flags (`--format`, `--base-url`, `--verbose`) are attached at
//! the root so the emitter is testable in isolation. CliApp integration
//! arrives in a later task.
//!
//! Self-contained — must not import from `crate::openapi` or
//! `crate::graphql`. See `AGENTS.md` ("Architecture: Code Generation
//! Model"). The `to_kebab_flag` / `sanitize_flag_name` helpers in
//! `crate::text` are shared infrastructure and are fair game.

use std::collections::BTreeMap;

use clap::{Arg, Command};

use crate::text::{sanitize_flag_name, to_kebab_flag};

use super::discovery::{AsyncApiDescription, Channel};

/// Build the full clap command tree for an AsyncAPI document.
///
/// The root command carries the doc title (falling back to the version),
/// plus three global flags (`--format`, `--base-url`, `--verbose`) that
/// later wire-up phases can read from `CliApp`. Each channel becomes a
/// leaf subcommand nested under its `x-fern-sdk-group-name` path.
pub fn build_cli(doc: &AsyncApiDescription) -> Command {
    let about_text = if doc.info.title.is_empty() {
        format!("AsyncAPI CLI ({})", doc.asyncapi)
    } else {
        doc.info.title.clone()
    };

    let mut root = Command::new("asyncapi-cli")
        .about(about_text)
        .subcommand_required(true)
        .arg_required_else_help(true)
        .arg(
            Arg::new("format")
                .long("format")
                .help("Output format: json (default), table, yaml, csv")
                .value_name("FORMAT")
                .global(true),
        )
        .arg(
            Arg::new("base-url")
                .long("base-url")
                .help("Override the WebSocket base URL (e.g. for testing against a mock server)")
                .value_name("URL")
                .global(true),
        )
        .arg(
            Arg::new("verbose")
                .long("verbose")
                .short('v')
                .help("Enable verbose logging to stderr")
                .action(clap::ArgAction::SetTrue)
                .global(true),
        )
        .arg(
            // A pure-AsyncAPI CLI must own its own `--dry-run` global: when
            // an `OpenApiBinding` is present in the same app it contributes
            // this flag (and the merge dedups by id), but an AsyncAPI-only
            // app has no other source for it. Without this arg the executor's
            // dry-run gate is unreachable and `chat --dry-run` silently opens
            // a live WebSocket.
            Arg::new("dry-run")
                .long("dry-run")
                .help("Validate the request locally without sending it to the API")
                .action(clap::ArgAction::SetTrue)
                .global(true),
        );

    // ---- Build the channel subtree -------------------------------------
    // Walk channels in sorted order so the emitted tree is deterministic
    // regardless of the parser's HashMap iteration order. For each
    // channel we walk down its group path (creating nodes as needed),
    // then attach the leaf at the deepest level.

    let mut channel_names: Vec<&String> = doc.channels.keys().collect();
    channel_names.sort();

    // Group-path nodes are tracked in a tree keyed by the full path so
    // siblings under the same parent merge correctly. Once the tree is
    // populated, we drain it into nested `Command` instances bottom-up.
    let mut tree = GroupNode::default();
    for channel_name in channel_names {
        let channel = &doc.channels[channel_name];
        let leaf_name = leaf_command_name(channel_name, channel);
        let leaf_cmd = build_channel_command(&leaf_name, channel);
        tree.insert(&channel.sdk_group_name, leaf_cmd);
    }

    for child in tree.into_commands() {
        root = root.subcommand(child);
    }

    root
}

/// Resolve the leaf clap command name for a channel.
///
/// Prefers `x-fern-sdk-method-name` when set; otherwise falls back to
/// a kebab-case form of the AsyncAPI channel name. Empty strings are
/// treated as "missing" so a stray `x-fern-sdk-method-name: ""` doesn't
/// silently produce an unreachable empty subcommand.
pub(super) fn leaf_command_name(channel_name: &str, channel: &Channel) -> String {
    match channel.sdk_method_name.as_deref() {
        Some(name) if !name.is_empty() => name.to_string(),
        _ => to_kebab_flag(channel_name),
    }
}

/// Build the leaf `clap::Command` for a single channel.
///
/// Exposes `--message <TEXT>` (optional, single-shot mode) plus one
/// `--<kebab(name)>` flag per declared URL-template parameter. Parameter
/// names are sorted before iteration so flag order is deterministic
/// across runs (HashMap iteration order is not stable).
fn build_channel_command(leaf_name: &str, channel: &Channel) -> Command {
    let about = channel
        .description
        .clone()
        .unwrap_or_else(|| format!("WebSocket channel `{leaf_name}`"));

    let mut cmd = Command::new(leaf_name.to_string()).about(about).arg(
        Arg::new("message")
            .long("message")
            .help("Single-shot client message payload (text)")
            .value_name("TEXT"),
    );

    let mut params: Vec<(&String, &super::discovery::ChannelParameter)> =
        channel.parameters.iter().collect();
    params.sort_by(|a, b| a.0.cmp(b.0));
    for (param_name, param) in params {
        // Sanitize the wire name (rejects whitespace / control chars) and
        // get the kebab-cased flag spelling. Skip entries that refuse to
        // sanitize — the emitter is infallible, so a malformed parameter
        // name silently drops rather than panicking.
        let Ok(long) = sanitize_flag_name(param_name) else {
            continue;
        };

        let help = param
            .description
            .clone()
            .unwrap_or_else(|| format!("URL template parameter `{param_name}`"));

        cmd = cmd.arg(
            Arg::new(param_name.clone())
                .long(long)
                .help(help)
                .value_name("VALUE"),
        );
    }

    cmd
}

/// Intermediate tree node used to merge channels under shared
/// `sdk_group_name` paths before lowering into `clap::Command`s.
///
/// `children` is a sorted map so the rendered subcommand order is
/// deterministic regardless of the input channel order. `leaves`
/// holds the commands that attach at this node directly (i.e. channels
/// whose group path ends at this depth).
#[derive(Default)]
struct GroupNode {
    children: BTreeMap<String, GroupNode>,
    leaves: Vec<Command>,
}

impl GroupNode {
    /// Insert a leaf command at the end of `path`. Intermediate nodes
    /// are created on demand so multiple channels can share group
    /// prefixes (e.g. `["shared"]` for two distinct methods).
    fn insert(&mut self, path: &[String], leaf: Command) {
        match path.split_first() {
            None => self.leaves.push(leaf),
            Some((head, tail)) => {
                self.children
                    .entry(head.clone())
                    .or_default()
                    .insert(tail, leaf);
            }
        }
    }

    /// Lower this node's children + leaves into a list of `Command`s
    /// suitable for attaching as subcommands of the parent. Leaves come
    /// first, then child groups in sorted order — both bands within
    /// themselves are deterministic.
    fn into_commands(self) -> Vec<Command> {
        let GroupNode { children, leaves } = self;
        let mut out: Vec<Command> = leaves;
        for (name, child) in children {
            let mut group_cmd = Command::new(name.clone())
                .about(format!("AsyncAPI group `{name}`"))
                .subcommand_required(true)
                .arg_required_else_help(true);
            for sub in child.into_commands() {
                group_cmd = group_cmd.subcommand(sub);
            }
            out.push(group_cmd);
        }
        out
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::asyncapi::parser::parse;

    /// Helper: parse a YAML fixture and build the clap tree. Panics on
    /// parse failure since the fixtures are author-controlled.
    fn build(spec: &str) -> Command {
        let doc = parse(spec).expect("fixture should parse");
        build_cli(&doc)
    }

    /// Find a (possibly nested) subcommand by walking a path of names.
    fn descend<'a>(root: &'a Command, path: &[&str]) -> Option<&'a Command> {
        let mut cur = root;
        for segment in path {
            cur = cur.find_subcommand(segment)?;
        }
        Some(cur)
    }

    // ---------------------------------------------------------------- AC1

    const SPEC_GROUP_METHOD: &str = r#"
asyncapi: "2.6.0"
info:
  title: Test
  version: "1.0"
servers:
  prod:
    url: "wss://example.com/{agent_id}"
    protocol: wss
channels:
  AgentMessages:
    description: Bi-directional agent stream
    x-fern-sdk-group-name: ["foo"]
    x-fern-sdk-method-name: bar
    parameters:
      agent_id:
        description: Agent ID
        schema:
          type: string
"#;

    #[test]
    fn ac1_group_and_method_extension_produce_foo_bar_path() {
        let cmd = build(SPEC_GROUP_METHOD);
        // The path `foo bar` must be reachable via clap argument parsing.
        let matches = cmd
            .clone()
            .try_get_matches_from([
                "bin", "foo", "bar", "--agent-id", "abc",
            ])
            .expect("foo bar should parse");

        // Drill down into the matched subcommand chain to confirm
        // structure (not just an alias).
        let (foo_name, foo_matches) = matches.subcommand().expect("foo subcmd present");
        assert_eq!(foo_name, "foo");
        let (bar_name, bar_matches) = foo_matches.subcommand().expect("bar subcmd present");
        assert_eq!(bar_name, "bar");
        assert_eq!(
            bar_matches.get_one::<String>("agent_id").map(String::as_str),
            Some("abc"),
        );
    }

    // ---------------------------------------------------------------- AC2

    #[test]
    fn ac2_leaf_exposes_optional_message_and_param_flags() {
        let cmd = build(SPEC_GROUP_METHOD);
        let bar = descend(&cmd, &["foo", "bar"]).expect("foo bar leaf present");

        // --message exists, is long-only, and is optional.
        let message_arg = bar
            .get_arguments()
            .find(|a| a.get_id() == "message")
            .expect("--message arg missing");
        assert_eq!(message_arg.get_long(), Some("message"));
        assert!(
            !message_arg.is_required_set(),
            "--message must be optional, but clap reports it required",
        );

        // --agent-id exists for the URL template param.
        let agent_id = bar
            .get_arguments()
            .find(|a| a.get_id() == "agent_id")
            .expect("--agent-id arg missing");
        assert_eq!(agent_id.get_long(), Some("agent-id"));
    }

    #[test]
    fn ac2_message_is_optional_parse_succeeds_without_it() {
        let cmd = build(SPEC_GROUP_METHOD);
        cmd.clone()
            .try_get_matches_from(["bin", "foo", "bar", "--agent-id", "x"])
            .expect("leaf must parse without --message");
    }

    // ---------------------------------------------------------------- AC3

    const SPEC_FALLBACK_KEBAB: &str = r#"
asyncapi: "2.6.0"
info:
  title: Test
  version: "1.0"
servers:
  prod:
    url: "wss://example.com"
    protocol: wss
channels:
  AgentMessages:
    description: No SDK extensions
"#;

    #[test]
    fn ac3_channel_without_method_name_falls_back_to_kebab_case() {
        let cmd = build(SPEC_FALLBACK_KEBAB);
        // `AgentMessages` → `agent-messages` at the root.
        let matches = cmd
            .clone()
            .try_get_matches_from(["bin", "agent-messages"])
            .expect("kebab-case fallback should resolve");
        let (name, _) = matches.subcommand().expect("subcommand present");
        assert_eq!(name, "agent-messages");
    }

    // ----------------------------------------------------------- Nested

    const SPEC_NESTED_GROUPS: &str = r#"
asyncapi: "2.6.0"
info:
  title: Test
  version: "1.0"
servers:
  prod:
    url: "wss://example.com"
    protocol: wss
channels:
  Whatever:
    x-fern-sdk-group-name: ["alpha", "beta"]
    x-fern-sdk-method-name: gamma
"#;

    #[test]
    fn nested_groups_resolve_three_levels_deep() {
        let cmd = build(SPEC_NESTED_GROUPS);
        cmd.clone()
            .try_get_matches_from(["bin", "alpha", "beta", "gamma"])
            .expect("alpha beta gamma should resolve");
    }

    // ----------------------------------------------------------- Shared group

    const SPEC_SHARED_GROUP: &str = r#"
asyncapi: "2.6.0"
info:
  title: Test
  version: "1.0"
servers:
  prod:
    url: "wss://example.com"
    protocol: wss
channels:
  ChannelOne:
    x-fern-sdk-group-name: ["shared"]
    x-fern-sdk-method-name: first
  ChannelTwo:
    x-fern-sdk-group-name: ["shared"]
    x-fern-sdk-method-name: second
"#;

    #[test]
    fn shared_group_merges_two_distinct_leaves() {
        let cmd = build(SPEC_SHARED_GROUP);
        let shared = cmd
            .find_subcommand("shared")
            .expect("shared group present");
        assert!(
            shared.find_subcommand("first").is_some(),
            "first leaf must attach under shared",
        );
        assert!(
            shared.find_subcommand("second").is_some(),
            "second leaf must attach under shared",
        );

        // And both must parse as full command lines.
        cmd.clone()
            .try_get_matches_from(["bin", "shared", "first"])
            .expect("shared first should parse");
        cmd.clone()
            .try_get_matches_from(["bin", "shared", "second"])
            .expect("shared second should parse");
    }

    // ----------------------------------------------------------- Parameter kebab-casing

    const SPEC_PARAM_KEBAB: &str = r#"
asyncapi: "2.6.0"
info:
  title: Test
  version: "1.0"
servers:
  prod:
    url: "wss://example.com/{agent_id}/{clientSessionId}"
    protocol: wss
channels:
  Convai:
    x-fern-sdk-method-name: convai
    parameters:
      agent_id:
        schema:
          type: string
      clientSessionId:
        schema:
          type: string
"#;

    #[test]
    fn parameter_flags_are_kebab_cased() {
        let cmd = build(SPEC_PARAM_KEBAB);
        let convai = cmd
            .find_subcommand("convai")
            .expect("convai leaf present");

        let longs: Vec<&str> = convai
            .get_arguments()
            .filter_map(Arg::get_long)
            .collect();
        assert!(
            longs.contains(&"agent-id"),
            "agent_id should become --agent-id; got: {longs:?}",
        );
        assert!(
            longs.contains(&"client-session-id"),
            "clientSessionId should become --client-session-id; got: {longs:?}",
        );
    }

    // ----------------------------------------------------------- No parameters

    const SPEC_NO_PARAMS: &str = r#"
asyncapi: "2.6.0"
info:
  title: Test
  version: "1.0"
servers:
  prod:
    url: "wss://example.com"
    protocol: wss
channels:
  Ping:
    x-fern-sdk-method-name: ping
"#;

    #[test]
    fn channel_without_params_exposes_only_message_flag() {
        let cmd = build(SPEC_NO_PARAMS);
        let ping = cmd.find_subcommand("ping").expect("ping leaf present");
        let arg_ids: Vec<String> = ping
            .get_arguments()
            .map(|a| a.get_id().to_string())
            .collect();
        assert!(
            arg_ids.contains(&"message".to_string()),
            "--message should always be present; got: {arg_ids:?}",
        );
        // No other channel-specific args (clap's built-in --help is not
        // returned by get_arguments).
        let non_message: Vec<&String> = arg_ids
            .iter()
            .filter(|id| id.as_str() != "message")
            .collect();
        assert!(
            non_message.is_empty(),
            "no extra args expected when channel has no parameters; got: {non_message:?}",
        );
    }

    // ----------------------------------------------------------- Method-only / no group

    const SPEC_METHOD_ONLY: &str = r#"
asyncapi: "2.6.0"
info:
  title: Test
  version: "1.0"
servers:
  prod:
    url: "wss://example.com"
    protocol: wss
channels:
  AgentMessages:
    x-fern-sdk-method-name: chat
"#;

    #[test]
    fn method_without_group_attaches_at_root() {
        let cmd = build(SPEC_METHOD_ONLY);
        cmd.clone()
            .try_get_matches_from(["bin", "chat"])
            .expect("chat should attach at root when no group is set");
    }
}
