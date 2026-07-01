//! [`AsyncApiBinding`] — adapts the AsyncAPI path to the root
//! [`crate::binding::Binding`] trait so it can be composed into a
//! root-level [`crate::app::CliApp`] alongside an `OpenApiBinding` or
//! `GraphqlBinding`.
//!
//! Mirrors `src/openapi/binding.rs` and `src/graphql/binding.rs` —
//! intentional duplication per the no-shared-abstractions rule
//! (`AGENTS.md` "Code Generation Model").

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use serde_json::Value;

use crate::auth::{AuthCredentialSource, SchemeBinding};
use crate::binding::{Binding, BoxFuture, DispatchResult};
use crate::error::CliError;
use crate::http::HttpConfig;
use crate::websocket::AutoResponder;

use super::app::{BindingArgKind, BindingArgs};
use super::commands;
use super::discovery::AsyncApiDescription;
use super::executor;
use super::overlay::apply_overlays_to_spec;

/// Prepared state computed once on first `build_command()` / `dispatch()`.
struct Prepared {
    doc: AsyncApiDescription,
    http_config: HttpConfig,
}

/// An AsyncAPI binding that wraps [`super::CliApp`]'s internals and
/// exposes them through the [`Binding`] trait.
#[must_use]
pub struct AsyncApiBinding {
    inner: super::CliApp,
    prepared: Mutex<Option<Arc<Prepared>>>,
}

impl Default for AsyncApiBinding {
    fn default() -> Self {
        Self {
            inner: super::CliApp::new(""),
            prepared: Mutex::new(None),
        }
    }
}

impl AsyncApiBinding {
    /// Create a new AsyncAPI binding. The CLI name is set automatically
    /// by `CliApp::binding()` — no need to pass it here.
    pub fn new() -> Self {
        Self::default()
    }

    pub fn spec(mut self, yaml: &str) -> Self {
        self.inner = self.inner.spec(yaml);
        self
    }

    pub fn overlay(mut self, yaml: &str) -> Self {
        self.inner = self.inner.overlay(yaml);
        self
    }

    pub fn endpoint(mut self, url: &str) -> Self {
        self.inner = self.inner.endpoint(url);
        self
    }

    pub fn init_payload(mut self, payload: Value) -> Self {
        self.inner = self.inner.init_payload(payload);
        self
    }

    /// Install a customer-owned autoresponder for application-level
    /// keepalive (e.g. JSON ping/pong). See [`super::CliApp::autoresponder`].
    pub fn autoresponder(mut self, responder: AutoResponder) -> Self {
        self.inner = self.inner.autoresponder(responder);
        self
    }

    /// Register a binding-level CLI arg as a clap global. See
    /// [`super::CliApp::cli_arg`] for full semantics — this is just the
    /// public wrapper on the binding.
    pub fn cli_arg(mut self, arg_name: &str, kind: BindingArgKind, help: &str) -> Self {
        self.inner = self.inner.cli_arg(arg_name, kind, help);
        self
    }

    /// [`cli_arg`](Self::cli_arg) with an env-var fallback. See
    /// [`super::CliApp::cli_arg_env`].
    pub fn cli_arg_env(
        mut self,
        arg_name: &str,
        kind: BindingArgKind,
        help: &str,
        env_var: &str,
    ) -> Self {
        self.inner = self.inner.cli_arg_env(arg_name, kind, help, env_var);
        self
    }

    /// Dynamic init-payload picker. See
    /// [`super::CliApp::init_payload_with`].
    pub fn init_payload_with<F>(mut self, f: F) -> Self
    where
        F: Fn(&BindingArgs) -> Option<serde_json::Value> + Send + Sync + 'static,
    {
        self.inner = self.inner.init_payload_with(f);
        self
    }

    /// Dynamic autoresponder picker. See
    /// [`super::CliApp::autoresponder_with`].
    pub fn autoresponder_with<F>(mut self, f: F) -> Self
    where
        F: Fn(&BindingArgs) -> Option<AutoResponder> + Send + Sync + 'static,
    {
        self.inner = self.inner.autoresponder_with(f);
        self
    }

    pub fn auth_scheme_env(mut self, scheme_name: &str, env_var: &str) -> Self {
        self.inner = self.inner.auth_scheme_env(scheme_name, env_var);
        self
    }

    pub fn auth_scheme(mut self, scheme_name: &str, source: AuthCredentialSource) -> Self {
        self.inner = self.inner.auth_scheme(scheme_name, source);
        self
    }

    pub fn auth_provider<P>(mut self, scheme_name: &str, provider: P) -> Self
    where
        P: crate::auth::AuthProvider + 'static,
    {
        self.inner = self.inner.auth_provider(scheme_name, provider);
        self
    }

    fn ensure_prepared(&self) -> Result<Arc<Prepared>, CliError> {
        let mut guard = self.prepared.lock().unwrap();
        if let Some(ref arc) = *guard {
            return Ok(Arc::clone(arc));
        }

        let yaml = self.inner.spec_yaml.as_deref().ok_or_else(|| {
            CliError::Discovery("No spec provided. Call .spec() on AsyncApiBinding.".to_string())
        })?;

        // Apply the overlay (if any) before parsing.
        let spec_yaml = match self.inner.overlay_yaml.as_deref() {
            Some(overlay) => apply_overlays_to_spec(yaml, &[overlay.to_string()])?,
            None => yaml.to_string(),
        };

        let doc = super::parse(&spec_yaml)?;

        let http_config = HttpConfig::new(&self.inner.name)?.with_parsed_root_certs(
            self.inner.extra_root_certs.iter().cloned(),
            self.inner.extra_root_certs_pem.iter().cloned(),
        );

        let arc = Arc::new(Prepared { doc, http_config });
        *guard = Some(Arc::clone(&arc));
        Ok(arc)
    }

    /// Resolve the matched channel from `clap::ArgMatches`. Walks the
    /// subcommand chain collecting EVERY group + leaf name, then matches
    /// against each channel's full path (`sdk_group_name ++ [leaf]`).
    ///
    /// Matching by leaf alone is wrong: two channels can share a method
    /// name under different groups (e.g. `admin list` and `users list`)
    /// and `doc.channels` is a `HashMap` with non-deterministic iteration,
    /// so leaf-only matching would silently dispatch to whichever channel
    /// the iterator yielded first.
    fn resolve_channel<'a>(
        doc: &'a AsyncApiDescription,
        root_matches: &'a clap::ArgMatches,
    ) -> Result<(&'a str, &'a super::discovery::Channel, &'a clap::ArgMatches), CliError> {
        // Walk the full subcommand chain, capturing each segment.
        let mut current_matches = root_matches;
        let mut command_path: Vec<String> = Vec::new();
        while let Some((sub_name, sub_matches)) = current_matches.subcommand() {
            command_path.push(sub_name.to_string());
            current_matches = sub_matches;
        }
        if command_path.is_empty() {
            return Err(CliError::Validation(
                "No channel subcommand was matched".to_string(),
            ));
        }

        // Match the captured path against each channel's full path. Use
        // the same registrar logic as `commands::build_cli` so empty
        // `x-fern-sdk-method-name` strings fall back to the kebab-case
        // channel name (registrar treats them as missing).
        for (channel_name, channel) in &doc.channels {
            let leaf = commands::leaf_command_name(channel_name, channel);
            // Channel's full path == sdk_group_name ++ [leaf]
            if command_path.len() == channel.sdk_group_name.len() + 1
                && command_path[..channel.sdk_group_name.len()] == channel.sdk_group_name[..]
                && command_path[channel.sdk_group_name.len()] == leaf
            {
                return Ok((channel_name.as_str(), channel, current_matches));
            }
        }

        Err(CliError::Validation(format!(
            "Matched subcommand `{}` does not correspond to any declared AsyncAPI channel",
            command_path.join(" "),
        )))
    }
}

impl Binding for AsyncApiBinding {
    fn name(&self) -> &str {
        &self.inner.name
    }

    fn set_cli_name(&mut self, name: &str) {
        self.inner.name = name.to_string();
    }

    fn set_root_auth(&mut self, bindings: &[(String, SchemeBinding)]) {
        let mut merged = bindings.to_vec();
        merged.extend(std::mem::take(&mut self.inner.auth_bindings));
        self.inner.auth_bindings = merged;
    }

    fn build_command(&self) -> Result<clap::Command, CliError> {
        let prepared = self.ensure_prepared()?;
        let mut cli = commands::build_cli(&prepared.doc);
        // Attach binding-level CLI args as globals on the root. Clap
        // raises a duplicate-id error at parse time if a binding-arg
        // name collides with a channel-parameter flag — that's the loud
        // failure mode we want, not a silent shadow.
        for spec in &self.inner.binding_args {
            let arg = match spec.kind {
                BindingArgKind::Flag => clap::Arg::new(spec.name.clone())
                    .long(spec.name.clone())
                    .help(spec.help.clone())
                    .action(clap::ArgAction::SetTrue)
                    .global(true),
                BindingArgKind::Value => clap::Arg::new(spec.name.clone())
                    .long(spec.name.clone())
                    .help(spec.help.clone())
                    .value_name("VALUE")
                    .global(true),
            };
            cli = cli.arg(arg);
        }
        Ok(self.inner.decorate_command(cli))
    }

    fn dispatch<'a>(
        &'a self,
        root_matches: &'a clap::ArgMatches,
        _sub_matches: &'a clap::ArgMatches,
        _op_path: &'a [String],
    ) -> BoxFuture<'a, Result<DispatchResult, CliError>> {
        let prepared = match self.ensure_prepared() {
            Ok(p) => p,
            Err(e) => return Box::pin(async move { Err(e) }),
        };

        Box::pin(async move {
            let (channel_name, channel, matched_args) =
                Self::resolve_channel(&prepared.doc, root_matches)?;

            let message_arg = matched_args.get_one::<String>("message").map(String::as_str);

            // `--dry-run` is a global flag. It is registered by the AsyncAPI
            // command tree (`commands::build_cli`) and, in mixed apps, also by
            // a sibling `OpenApiBinding` — either way it resolves on the leaf
            // matches. Read it defensively (`try_get_one`) so a host app that
            // somehow strips the flag degrades to "live" rather than panicking.
            let dry_run = matched_args
                .try_get_one::<bool>("dry-run")
                .ok()
                .flatten()
                .copied()
                .unwrap_or(false);

            // Collect URL-template parameters from the matched flags.
            let mut param_args: HashMap<String, String> = HashMap::new();
            for param_name in channel.parameters.keys() {
                if let Some(value) = matched_args.get_one::<String>(param_name) {
                    param_args.insert(param_name.clone(), value.clone());
                }
            }

            // `--base-url` (or `<NAME>_BASE_URL`) is a HOST-ONLY override:
            // it swaps the scheme + authority but PRESERVES the path of
            // the binding-configured endpoint URL. That way a wire test
            // can point at `ws://127.0.0.1:<port>` and still hit the
            // binary's `/v1/convai/conversation` route. When only one of
            // the two is set, it's used verbatim.
            let base_url_override_owned = crate::cli_args::resolve_base_url_override(
                root_matches,
                &self.inner.name,
            )?;
            let composed = executor::compose_base_url_override(
                base_url_override_owned.as_deref(),
                self.inner.endpoint_url.as_deref(),
            );
            let base_url_override = composed.as_deref();

            // Resolve binding-level CLI args (e.g. `--voice`, `--audio-out`)
            // ONCE per dispatch, then pick the init payload and
            // autoresponder via the dynamic-or-static helpers on `CliApp`.
            // Channel-level `x-fern-init-payload` is still selected by the
            // executor when both pickers return `None`.
            let binding_args = self.inner.resolve_binding_args(root_matches);
            let resolved_init_payload = self.inner.select_init_payload(&binding_args);
            let resolved_autoresponder = self.inner.select_autoresponder(&binding_args);

            // --format http is HTTP-specific; reject for AsyncAPI/WebSocket.
            // Use OutputPipeline::from_matches so both --format flag and
            // <NAME>_OUTPUT env var are resolved.
            let pipeline = crate::formatter::OutputPipeline::from_matches(
                root_matches,
                &self.inner.name,
            )
            .map_err(|e| CliError::Validation(e.to_string()))?;
            if pipeline.is_http() {
                return Err(CliError::Validation(
                    "the `http` output format is only supported for OpenAPI-based CLIs".to_string(),
                ));
            }

            executor::execute(
                &prepared.doc,
                channel_name,
                channel,
                message_arg,
                &param_args,
                base_url_override,
                &self.inner.auth_bindings,
                &prepared.http_config,
                resolved_init_payload.as_ref(),
                resolved_autoresponder,
                dry_run,
                executor::resolve_response_timeout(&self.inner.name),
            )
            .await?;

            Ok(DispatchResult::Handled)
        })
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::binding::Binding;
    use crate::openapi::OpenApiBinding;

    const FIXTURE: &str = include_str!("agent.asyncapi.yaml");

    const TRIVIAL_OPENAPI: &str = r#"openapi: 3.0.0
info:
  title: Trivial
  version: "1.0"
paths:
  /ping:
    get:
      operationId: ping
      x-fern-sdk-group-name: ["health"]
      x-fern-sdk-method-name: ping
      responses:
        '200':
          description: ok
"#;

    #[test]
    fn binding_registers_alongside_openapi_without_panic() {
        // Build both bindings and call build_command on each — both must succeed
        // and the AsyncAPI tree must surface the fixture's AgentMessages leaf.
        let mut async_binding = AsyncApiBinding::new().spec(FIXTURE);
        async_binding.set_cli_name("convai");
        let async_cmd = async_binding
            .build_command()
            .expect("AsyncApiBinding must build a clap tree");
        // The ElevenLabs fixture's AgentMessages channel has no x-fern-sdk-method-name,
        // so it falls back to kebab-case at the root.
        let names: Vec<&str> = async_cmd.get_subcommands().map(|c| c.get_name()).collect();
        assert!(
            names.contains(&"agent-messages"),
            "expected agent-messages at the asyncapi root, got: {names:?}"
        );

        let mut openapi = OpenApiBinding::new().spec(TRIVIAL_OPENAPI);
        openapi.set_cli_name("convai");
        let openapi_cmd = openapi
            .build_command()
            .expect("OpenApiBinding must build a clap tree");
        let openapi_names: Vec<&str> = openapi_cmd
            .get_subcommands()
            .map(|c| c.get_name())
            .collect();
        assert!(
            openapi_names.contains(&"health"),
            "expected health group from openapi spec, got: {openapi_names:?}"
        );
    }

    #[test]
    fn resolve_channel_agrees_with_registrar_on_empty_sdk_method_name() {
        // Regression: an empty `x-fern-sdk-method-name` is treated as
        // "missing" by the registrar (commands::leaf_command_name) — the
        // resolver must agree, or dispatch would fail to match the
        // kebab-fallback leaf the registrar actually created.
        use super::super::discovery::Channel;
        use std::collections::HashMap;

        let mut channels: HashMap<String, Channel> = HashMap::new();
        channels.insert(
            "AgentMessages".to_string(),
            Channel {
                sdk_method_name: Some(String::new()),
                ..Channel::default()
            },
        );

        let doc = AsyncApiDescription {
            channels,
            ..Default::default()
        };

        // Build a minimal clap matches tree that lands on the kebab leaf.
        let cli = clap::Command::new("root")
            .subcommand_required(true)
            .subcommand(clap::Command::new("agent-messages"));
        let matches = cli.try_get_matches_from(["root", "agent-messages"]).unwrap();

        let (resolved_name, _, _) =
            AsyncApiBinding::resolve_channel(&doc, &matches).expect("resolver matches kebab leaf");
        assert_eq!(resolved_name, "AgentMessages");
    }

    #[test]
    fn resolve_channel_disambiguates_shared_leaf_by_group_path() {
        // Two channels share the leaf method name `list` but live under
        // different groups. Leaf-only matching would silently pick whichever
        // HashMap iteration yielded first; the resolver must compare the
        // full subcommand path against each channel's `sdk_group_name`.
        use super::super::discovery::Channel;
        use std::collections::HashMap;

        let mut channels: HashMap<String, Channel> = HashMap::new();
        channels.insert(
            "AdminList".to_string(),
            Channel {
                sdk_group_name: vec!["admin".to_string()],
                sdk_method_name: Some("list".to_string()),
                ..Channel::default()
            },
        );
        channels.insert(
            "UserList".to_string(),
            Channel {
                sdk_group_name: vec!["users".to_string()],
                sdk_method_name: Some("list".to_string()),
                ..Channel::default()
            },
        );

        let doc = AsyncApiDescription {
            channels,
            ..Default::default()
        };

        // Mirror the registrar's nested-subcommand shape.
        let cli = clap::Command::new("root")
            .subcommand_required(true)
            .subcommand(
                clap::Command::new("admin")
                    .subcommand_required(true)
                    .subcommand(clap::Command::new("list")),
            )
            .subcommand(
                clap::Command::new("users")
                    .subcommand_required(true)
                    .subcommand(clap::Command::new("list")),
            );

        let admin_matches = cli
            .clone()
            .try_get_matches_from(["root", "admin", "list"])
            .unwrap();
        let (admin_name, _, _) = AsyncApiBinding::resolve_channel(&doc, &admin_matches)
            .expect("admin list must resolve to AdminList");
        assert_eq!(admin_name, "AdminList");

        let users_matches = cli
            .try_get_matches_from(["root", "users", "list"])
            .unwrap();
        let (users_name, _, _) = AsyncApiBinding::resolve_channel(&doc, &users_matches)
            .expect("users list must resolve to UserList");
        assert_eq!(users_name, "UserList");
    }

    #[test]
    fn cli_arg_attaches_global_flag_to_built_clap_tree() {
        // `--voice` registered on the binding must be reachable from any
        // channel leaf because the arg is `.global(true)`. Use the
        // ElevenLabs fixture which has `AgentMessages` falling back to
        // the kebab leaf.
        let mut binding = AsyncApiBinding::new()
            .spec(FIXTURE)
            .cli_arg("voice", BindingArgKind::Flag, "Enable voice mode");
        binding.set_cli_name("convai");
        let cmd = binding.build_command().expect("clap tree builds");
        // Pass `--voice` AFTER the leaf — only a global arg parses here.
        let matches = cmd
            .clone()
            .try_get_matches_from(["convai", "agent-messages", "--voice"])
            .expect("--voice must parse on the leaf as a global");
        assert!(
            matches
                .try_get_one::<bool>("voice")
                .ok()
                .flatten()
                .copied()
                .unwrap_or(false),
            "global --voice must surface on root matches",
        );
    }

    #[test]
    fn cli_arg_value_attaches_global_value_arg() {
        let mut binding = AsyncApiBinding::new().spec(FIXTURE).cli_arg(
            "audio-out",
            BindingArgKind::Value,
            "Capture PCM to file",
        );
        binding.set_cli_name("convai");
        let cmd = binding.build_command().expect("clap tree builds");
        let matches = cmd
            .clone()
            .try_get_matches_from(["convai", "agent-messages", "--audio-out", "reply.pcm"])
            .expect("--audio-out <PATH> must parse on the leaf as a global");
        assert_eq!(
            matches
                .try_get_one::<String>("audio-out")
                .ok()
                .flatten()
                .map(String::as_str),
            Some("reply.pcm"),
        );
    }

    #[test]
    fn binding_inherits_root_auth() {
        // set_root_auth should prepend root-level bindings so the
        // composition with CliApp::auth + AsyncApiBinding works.
        let mut binding = AsyncApiBinding::new().spec(FIXTURE);
        let root = vec![(
            "xi-api-key".to_string(),
            SchemeBinding::Token(AuthCredentialSource::from_env("XI_API_KEY")),
        )];
        binding.set_root_auth(&root);
        assert_eq!(binding.inner.auth_bindings.len(), 1);
    }
}
