//! Slim builder for the AsyncAPI binding.
//!
//! Unlike the OpenAPI / GraphQL paths, the AsyncAPI binding does NOT
//! expose a top-level [`CliApp`]/`AppContext` for custom-command
//! handlers — that surface arrives in a later task. For now, this module
//! holds the inner state that [`AsyncApiBinding`](super::AsyncApiBinding)
//! delegates to: spec text, overlay text, endpoint override, builder-
//! level init-payload override, and an auth-bindings vec populated via
//! the `auth_scheme*` methods.
//!
//! Self-contained per the no-shared-abstractions rule
//! (`AGENTS.md` "Code Generation Model") — does NOT import from
//! `crate::openapi` or `crate::graphql`. We mirror the shape of
//! `src/graphql/app.rs` directly, by design.

use std::collections::HashMap;
use std::sync::Arc;

use serde_json::Value;

use crate::auth::{
    build_provider_with_strategy, AuthCredentialSource, AuthStrategy, DynAuthProvider,
    SchemeBinding,
};
use crate::websocket::AutoResponder;

/// Shape of a binding-level CLI arg registered via [`CliApp::cli_arg`].
///
/// AsyncAPI binaries sometimes need to steer the init payload or
/// autoresponder based on a flag the user passes on the command line
/// (e.g. ElevenLabs convai's `--voice` / `--audio-out`). The OpenAPI
/// and GraphQL bindings have `auth_scheme_cli` for the auth-credential
/// shape; this is the more general counterpart for the AsyncAPI path.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BindingArgKind {
    /// `--<name>` boolean (clap `SetTrue`). With an env fallback, any
    /// non-empty env value is treated as true — matches the
    /// `is_ok_and(|v| !v.is_empty())` semantics ElevenLabs's
    /// `ELEVENLABS_VOICE=1` was already using.
    Flag,
    /// `--<name> <VALUE>` string. With an env fallback, a non-empty env
    /// value is used verbatim.
    Value,
}

/// One registered binding-level CLI arg.
pub(crate) struct BindingArgSpec {
    pub(crate) name: String,
    pub(crate) kind: BindingArgKind,
    pub(crate) help: String,
    pub(crate) env_fallback: Option<String>,
}

/// Resolved binding-arg values, handed to the closures registered via
/// [`CliApp::init_payload_with`] and [`CliApp::autoresponder_with`] so
/// the binding can pick a payload / responder at dispatch time based on
/// what the user passed on the command line.
pub struct BindingArgs {
    flags: HashMap<String, bool>,
    values: HashMap<String, String>,
}

impl BindingArgs {
    /// Build an empty resolver. Tests and the no-args dispatch path use
    /// this; production callers go through [`CliApp::resolve_binding_args`].
    pub(crate) fn empty() -> Self {
        Self {
            flags: HashMap::new(),
            values: HashMap::new(),
        }
    }

    pub(crate) fn insert_flag(&mut self, name: &str, value: bool) {
        self.flags.insert(name.to_string(), value);
    }

    pub(crate) fn insert_value(&mut self, name: &str, value: String) {
        self.values.insert(name.to_string(), value);
    }

    /// Read a registered boolean flag. Returns `false` if the arg name
    /// is unknown or wasn't supplied (and had no env fallback).
    pub fn flag(&self, name: &str) -> bool {
        self.flags.get(name).copied().unwrap_or(false)
    }

    /// Read a registered string value. Returns `None` if absent.
    pub fn value(&self, name: &str) -> Option<&str> {
        self.values.get(name).map(String::as_str)
    }
}

/// Dynamic init-payload picker. Returning `None` falls back to the
/// static `init_payload` (if set), then to the channel's
/// `x-fern-init-payload`.
type DynInitPayload = Arc<dyn Fn(&BindingArgs) -> Option<Value> + Send + Sync + 'static>;

/// Dynamic autoresponder picker. Returning `None` falls back to the
/// static `autoresponder` (if set).
type DynAutoResponder =
    Arc<dyn Fn(&BindingArgs) -> Option<AutoResponder> + Send + Sync + 'static>;

/// Builder for the AsyncAPI binding's inner state.
#[allow(dead_code)] // Several fields wired for future tasks (overlay, endpoint, init).
pub struct CliApp {
    pub(crate) name: String,
    pub(crate) spec_yaml: Option<String>,
    pub(crate) overlay_yaml: Option<String>,
    pub(crate) endpoint_url: Option<String>,
    pub(crate) explicit_init_payload: Option<Value>,
    pub(crate) dynamic_init_payload: Option<DynInitPayload>,
    pub(crate) auto_responder: Option<AutoResponder>,
    pub(crate) dynamic_auto_responder: Option<DynAutoResponder>,
    pub(crate) binding_args: Vec<BindingArgSpec>,
    pub(crate) auth_bindings: Vec<(String, SchemeBinding)>,
    auth_strategy: AuthStrategy,
    /// Trust roots parsed at builder-call time. Mirrors graphql / openapi.
    pub(crate) extra_root_certs: Vec<reqwest::Certificate>,
    /// Raw PEM bytes for each extra trust root (threaded into HttpConfig).
    pub(crate) extra_root_certs_pem: Vec<Vec<u8>>,
}

#[allow(dead_code)] // Builder methods called from AsyncApiBinding wrappers.
impl CliApp {
    /// Create a new AsyncAPI CliApp with the given binary name.
    pub fn new(name: &str) -> Self {
        Self {
            name: name.to_string(),
            spec_yaml: None,
            overlay_yaml: None,
            endpoint_url: None,
            explicit_init_payload: None,
            dynamic_init_payload: None,
            auto_responder: None,
            dynamic_auto_responder: None,
            binding_args: Vec::new(),
            auth_bindings: Vec::new(),
            auth_strategy: AuthStrategy::Auto,
            extra_root_certs: Vec::new(),
            extra_root_certs_pem: Vec::new(),
        }
    }

    /// Set the AsyncAPI YAML/JSON spec string. Typically `include_str!`.
    pub fn spec(mut self, yaml: &str) -> Self {
        self.spec_yaml = Some(yaml.to_string());
        self
    }

    /// Set an overlay YAML/JSON string. Applied to the spec at
    /// prepare-time before parsing into `AsyncApiDescription`.
    pub fn overlay(mut self, yaml: &str) -> Self {
        self.overlay_yaml = Some(yaml.to_string());
        self
    }

    /// Override the WebSocket endpoint URL (replaces the spec's first
    /// server URL).
    pub fn endpoint(mut self, url: &str) -> Self {
        self.endpoint_url = Some(url.to_string());
        self
    }

    /// Builder-level explicit init payload — wins over an overlay's
    /// `x-fern-init-payload` at the channel level.
    pub fn init_payload(mut self, payload: Value) -> Self {
        self.explicit_init_payload = Some(payload);
        self
    }

    /// Install a customer-owned autoresponder for the bidirectional REPL
    /// path. Application-level keepalive (e.g. JSON `{"type":"ping"}` →
    /// `{"type":"pong"}`) is API-specific with no cross-API standard, so
    /// the framework provides only the [`AutoResponder`] primitive and
    /// lets the customer ship the per-API closure from their binary.
    pub fn autoresponder(mut self, responder: AutoResponder) -> Self {
        self.auto_responder = Some(responder);
        self
    }

    /// Register a binding-level CLI arg attached as a global flag on the
    /// root command. Read the resolved value inside an
    /// [`init_payload_with`](Self::init_payload_with) or
    /// [`autoresponder_with`](Self::autoresponder_with) closure via the
    /// [`BindingArgs`] resolver.
    ///
    /// `arg_name` is the kebab-cased long form (`"voice"`,
    /// `"audio-out"`) without the leading `--`. The arg is attached as a
    /// clap global on the binding's root, so it's reachable from any
    /// channel leaf without per-channel wiring — same shape as
    /// `--base-url` / `--dry-run`.
    ///
    /// This is the AsyncAPI counterpart to `auth_scheme_cli` on the
    /// OpenAPI / GraphQL bindings: a per-binding hook that lets a
    /// binary inject a flag onto the spec-driven command tree without
    /// the schema knowing anything about it.
    ///
    /// # Collision
    ///
    /// Clap rejects duplicate ids at command-tree build time, so a
    /// binding arg whose name collides with a channel parameter (or
    /// another binding's global) panics up front rather than silently
    /// shadowing.
    pub fn cli_arg(mut self, arg_name: &str, kind: BindingArgKind, help: &str) -> Self {
        self.binding_args.push(BindingArgSpec {
            name: arg_name.to_string(),
            kind,
            help: help.to_string(),
            env_fallback: None,
        });
        self
    }

    /// Like [`cli_arg`](Self::cli_arg) but with an environment-variable
    /// fallback used when the flag is absent on the command line.
    /// Mirrors the `cli > env` resolution shape used by
    /// `AuthCredentialSource::any([cli, env])` in the auth path.
    ///
    /// For a [`BindingArgKind::Flag`], any non-empty env value resolves
    /// to true. For a [`BindingArgKind::Value`], the env value is used
    /// verbatim when non-empty.
    pub fn cli_arg_env(
        mut self,
        arg_name: &str,
        kind: BindingArgKind,
        help: &str,
        env_var: &str,
    ) -> Self {
        self.binding_args.push(BindingArgSpec {
            name: arg_name.to_string(),
            kind,
            help: help.to_string(),
            env_fallback: Some(env_var.to_string()),
        });
        self
    }

    /// Dynamic counterpart to [`init_payload`](Self::init_payload) —
    /// picks the payload at dispatch time from the resolved binding
    /// args. Returning `None` falls back to the static
    /// [`init_payload`](Self::init_payload) (if set), then to the
    /// channel's `x-fern-init-payload`.
    pub fn init_payload_with<F>(mut self, f: F) -> Self
    where
        F: Fn(&BindingArgs) -> Option<Value> + Send + Sync + 'static,
    {
        self.dynamic_init_payload = Some(Arc::new(f));
        self
    }

    /// Dynamic counterpart to [`autoresponder`](Self::autoresponder) —
    /// picks the autoresponder at dispatch time from the resolved
    /// binding args. Returning `None` falls back to the static
    /// [`autoresponder`](Self::autoresponder) (if set).
    pub fn autoresponder_with<F>(mut self, f: F) -> Self
    where
        F: Fn(&BindingArgs) -> Option<AutoResponder> + Send + Sync + 'static,
    {
        self.dynamic_auto_responder = Some(Arc::new(f));
        self
    }

    /// Walk the registered binding args, read each from `root_matches`
    /// (and fall back to the env var if registered + absent), and
    /// produce a resolver that the init-payload / autoresponder
    /// closures can consult.
    pub(crate) fn resolve_binding_args(&self, root_matches: &clap::ArgMatches) -> BindingArgs {
        let mut resolved = BindingArgs::empty();
        for spec in &self.binding_args {
            match spec.kind {
                BindingArgKind::Flag => {
                    // clap `try_get_one::<bool>` is `Ok(Some(true))` when
                    // present, `Ok(Some(false))` when absent on a SetTrue
                    // arg, and `Err(_)` only if the arg id isn't
                    // registered — defensive read in case build_command
                    // somehow didn't attach it (would be a framework bug,
                    // not user input, so degrade silently).
                    let from_cli = root_matches
                        .try_get_one::<bool>(&spec.name)
                        .ok()
                        .flatten()
                        .copied()
                        .unwrap_or(false);
                    let resolved_value = if from_cli {
                        true
                    } else {
                        spec.env_fallback
                            .as_deref()
                            .and_then(|env| std::env::var(env).ok())
                            .map(|v| !v.is_empty())
                            .unwrap_or(false)
                    };
                    resolved.insert_flag(&spec.name, resolved_value);
                }
                BindingArgKind::Value => {
                    let from_cli = root_matches
                        .try_get_one::<String>(&spec.name)
                        .ok()
                        .flatten()
                        .cloned();
                    let resolved_value = from_cli.or_else(|| {
                        spec.env_fallback
                            .as_deref()
                            .and_then(|env| std::env::var(env).ok())
                            .filter(|v| !v.is_empty())
                    });
                    if let Some(v) = resolved_value {
                        resolved.insert_value(&spec.name, v);
                    }
                }
            }
        }
        resolved
    }

    /// Pick the init payload that should be sent on connect, considering
    /// the dynamic closure first, then the static value. Returning
    /// `None` lets the executor fall back to the channel's
    /// `x-fern-init-payload`.
    pub(crate) fn select_init_payload(&self, args: &BindingArgs) -> Option<Value> {
        if let Some(ref f) = self.dynamic_init_payload {
            if let Some(v) = f(args) {
                return Some(v);
            }
        }
        self.explicit_init_payload.clone()
    }

    /// Pick the autoresponder to install on the REPL path, dynamic first
    /// then static. Returning `None` is fine — the executor handles the
    /// no-responder case.
    pub(crate) fn select_autoresponder(&self, args: &BindingArgs) -> Option<AutoResponder> {
        if let Some(ref f) = self.dynamic_auto_responder {
            if let Some(r) = f(args) {
                return Some(r);
            }
        }
        self.auto_responder.clone()
    }

    /// Shorthand: bind a named scheme to an env var.
    pub fn auth_scheme_env(self, scheme_name: &str, env_var: &str) -> Self {
        self.auth_scheme(scheme_name, AuthCredentialSource::from_env(env_var))
    }

    /// Bind a credential source to a named auth scheme.
    pub fn auth_scheme(mut self, scheme_name: &str, source: AuthCredentialSource) -> Self {
        self.auth_bindings
            .push((scheme_name.to_string(), SchemeBinding::Token(source)));
        self
    }

    /// Bind separate username and password sources to an http-basic scheme.
    pub fn auth_basic_scheme(
        mut self,
        scheme_name: &str,
        username: AuthCredentialSource,
        password: AuthCredentialSource,
    ) -> Self {
        self.auth_bindings.push((
            scheme_name.to_string(),
            SchemeBinding::Basic { username, password },
        ));
        self
    }

    /// Bind a fully-custom [`AuthProvider`][crate::auth::AuthProvider].
    pub fn auth_provider<P>(self, scheme_name: &str, provider: P) -> Self
    where
        P: crate::auth::AuthProvider + 'static,
    {
        self.auth_provider_shared(scheme_name, Arc::new(provider))
    }

    /// Variant of [`auth_provider`](Self::auth_provider) for a pre-built
    /// [`DynAuthProvider`].
    pub fn auth_provider_shared(
        mut self,
        scheme_name: &str,
        provider: DynAuthProvider,
    ) -> Self {
        self.auth_bindings
            .push((scheme_name.to_string(), SchemeBinding::Custom(provider)));
        self
    }

    /// Build the auth provider used at dispatch time.
    pub(crate) fn build_auth_provider(&self) -> DynAuthProvider {
        build_provider_with_strategy(
            &self.auth_bindings,
            &std::collections::HashMap::new(),
            self.auth_strategy,
            false,
        )
    }

    /// Decorate a clap `Command` with the auth help section, matching
    /// the openapi/graphql binding shape.
    pub(crate) fn decorate_command(&self, mut cli: clap::Command) -> clap::Command {
        let existing_after_help = cli.get_after_help().map(|s| s.to_string());
        let auth_section = crate::auth::render_auth_help_section(&self.auth_bindings);
        if existing_after_help.is_some() || auth_section.is_some() {
            let mut sections: Vec<&str> = Vec::with_capacity(2);
            if let Some(ref s) = existing_after_help {
                sections.push(s);
            }
            if let Some(ref s) = auth_section {
                sections.push(s);
            }
            cli = cli.after_help(sections.join("\n\n"));
        }
        cli
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cli_app_builder_records_spec_and_endpoint() {
        let app = CliApp::new("ws-cli")
            .spec("asyncapi: '2.6.0'")
            .endpoint("wss://example.com");
        assert_eq!(app.name, "ws-cli");
        assert!(app.spec_yaml.is_some());
        assert_eq!(app.endpoint_url.as_deref(), Some("wss://example.com"));
    }

    #[test]
    fn cli_app_auth_scheme_records_binding() {
        let app = CliApp::new("ws-cli")
            .spec("asyncapi: '2.6.0'")
            .auth_scheme_env("xi-api-key", "XI_API_KEY");
        assert_eq!(app.auth_bindings.len(), 1);
    }

    #[test]
    fn cli_app_init_payload_records_explicit_override() {
        let app = CliApp::new("ws-cli")
            .spec("asyncapi: '2.6.0'")
            .init_payload(serde_json::json!({"type": "init"}));
        assert!(app.explicit_init_payload.is_some());
    }

    // -- cli_arg / binding-arg resolver ------------------------------------

    /// Build a minimal clap root carrying the binding-args declared on
    /// `app` so we can exercise `resolve_binding_args` without spinning
    /// up the full AsyncAPI command tree.
    fn matches_with_app_args(app: &CliApp, argv: &[&str]) -> clap::ArgMatches {
        let mut cli = clap::Command::new("root");
        for spec in &app.binding_args {
            let arg = match spec.kind {
                BindingArgKind::Flag => clap::Arg::new(spec.name.clone())
                    .long(spec.name.clone())
                    .action(clap::ArgAction::SetTrue)
                    .global(true),
                BindingArgKind::Value => clap::Arg::new(spec.name.clone())
                    .long(spec.name.clone())
                    .value_name("VALUE")
                    .global(true),
            };
            cli = cli.arg(arg);
        }
        cli.try_get_matches_from(argv).expect("argv parses")
    }

    #[test]
    fn cli_arg_records_spec_with_no_env_fallback() {
        let app = CliApp::new("ws-cli")
            .cli_arg("voice", BindingArgKind::Flag, "Enable voice mode");
        assert_eq!(app.binding_args.len(), 1);
        assert_eq!(app.binding_args[0].name, "voice");
        assert_eq!(app.binding_args[0].kind, BindingArgKind::Flag);
        assert!(app.binding_args[0].env_fallback.is_none());
    }

    #[test]
    fn cli_arg_env_records_fallback() {
        let app = CliApp::new("ws-cli").cli_arg_env(
            "audio-out",
            BindingArgKind::Value,
            "Capture decoded PCM",
            "ELEVENLABS_AUDIO_OUT",
        );
        assert_eq!(
            app.binding_args[0].env_fallback.as_deref(),
            Some("ELEVENLABS_AUDIO_OUT"),
        );
    }

    #[test]
    fn resolve_binding_args_reads_flag_from_cli() {
        let app = CliApp::new("ws-cli").cli_arg("voice", BindingArgKind::Flag, "");
        let matches = matches_with_app_args(&app, &["root", "--voice"]);
        let resolved = app.resolve_binding_args(&matches);
        assert!(resolved.flag("voice"));
    }

    #[test]
    fn resolve_binding_args_flag_absent_is_false() {
        let app = CliApp::new("ws-cli").cli_arg("voice", BindingArgKind::Flag, "");
        let matches = matches_with_app_args(&app, &["root"]);
        let resolved = app.resolve_binding_args(&matches);
        assert!(!resolved.flag("voice"));
    }

    #[test]
    fn resolve_binding_args_reads_value_from_cli() {
        let app = CliApp::new("ws-cli").cli_arg("audio-out", BindingArgKind::Value, "");
        let matches = matches_with_app_args(&app, &["root", "--audio-out", "reply.pcm"]);
        let resolved = app.resolve_binding_args(&matches);
        assert_eq!(resolved.value("audio-out"), Some("reply.pcm"));
    }

    #[test]
    fn resolve_binding_args_value_absent_returns_none() {
        let app = CliApp::new("ws-cli").cli_arg("audio-out", BindingArgKind::Value, "");
        let matches = matches_with_app_args(&app, &["root"]);
        let resolved = app.resolve_binding_args(&matches);
        assert_eq!(resolved.value("audio-out"), None);
    }

    /// Pick a process-unique env name so parallel cargo tests don't
    /// interfere (no `Date.now()` available; the test's pid + line is
    /// enough entropy).
    fn unique_env(stem: &str) -> String {
        format!("ASYNCAPI_TEST_{}_{}", stem.to_uppercase(), std::process::id())
    }

    #[test]
    fn resolve_binding_args_env_fallback_promotes_nonempty_to_true_flag() {
        let env_name = unique_env("voice_flag");
        std::env::set_var(&env_name, "1");
        let app = CliApp::new("ws-cli").cli_arg_env(
            "voice",
            BindingArgKind::Flag,
            "",
            &env_name,
        );
        let matches = matches_with_app_args(&app, &["root"]);
        let resolved = app.resolve_binding_args(&matches);
        assert!(resolved.flag("voice"));
        std::env::remove_var(&env_name);
    }

    #[test]
    fn resolve_binding_args_env_fallback_empty_string_leaves_flag_false() {
        let env_name = unique_env("voice_empty");
        std::env::set_var(&env_name, "");
        let app = CliApp::new("ws-cli").cli_arg_env(
            "voice",
            BindingArgKind::Flag,
            "",
            &env_name,
        );
        let matches = matches_with_app_args(&app, &["root"]);
        let resolved = app.resolve_binding_args(&matches);
        assert!(
            !resolved.flag("voice"),
            "empty env value must not promote flag to true",
        );
        std::env::remove_var(&env_name);
    }

    #[test]
    fn resolve_binding_args_cli_value_overrides_env_fallback() {
        let env_name = unique_env("audio_out_override");
        std::env::set_var(&env_name, "from-env.pcm");
        let app = CliApp::new("ws-cli").cli_arg_env(
            "audio-out",
            BindingArgKind::Value,
            "",
            &env_name,
        );
        let matches = matches_with_app_args(&app, &["root", "--audio-out", "from-cli.pcm"]);
        let resolved = app.resolve_binding_args(&matches);
        assert_eq!(resolved.value("audio-out"), Some("from-cli.pcm"));
        std::env::remove_var(&env_name);
    }

    #[test]
    fn resolve_binding_args_env_value_fallback_used_when_cli_absent() {
        let env_name = unique_env("audio_out_envonly");
        std::env::set_var(&env_name, "from-env.pcm");
        let app = CliApp::new("ws-cli").cli_arg_env(
            "audio-out",
            BindingArgKind::Value,
            "",
            &env_name,
        );
        let matches = matches_with_app_args(&app, &["root"]);
        let resolved = app.resolve_binding_args(&matches);
        assert_eq!(resolved.value("audio-out"), Some("from-env.pcm"));
        std::env::remove_var(&env_name);
    }

    // -- select_init_payload / select_autoresponder pickers ----------------

    #[test]
    fn select_init_payload_dynamic_closure_wins_over_static() {
        let app = CliApp::new("ws-cli")
            .init_payload(serde_json::json!({"source": "static"}))
            .cli_arg("voice", BindingArgKind::Flag, "")
            .init_payload_with(|args| {
                if args.flag("voice") {
                    Some(serde_json::json!({"source": "dynamic"}))
                } else {
                    None
                }
            });
        let matches = matches_with_app_args(&app, &["root", "--voice"]);
        let resolved = app.resolve_binding_args(&matches);
        let picked = app.select_init_payload(&resolved).expect("Some");
        assert_eq!(picked["source"], "dynamic");
    }

    #[test]
    fn select_init_payload_falls_back_to_static_when_dynamic_returns_none() {
        let app = CliApp::new("ws-cli")
            .init_payload(serde_json::json!({"source": "static"}))
            .cli_arg("voice", BindingArgKind::Flag, "")
            .init_payload_with(|_args| None);
        let matches = matches_with_app_args(&app, &["root"]);
        let resolved = app.resolve_binding_args(&matches);
        let picked = app.select_init_payload(&resolved).expect("Some");
        assert_eq!(picked["source"], "static");
    }

    #[test]
    fn select_init_payload_returns_none_when_neither_set() {
        let app = CliApp::new("ws-cli");
        let resolved = BindingArgs::empty();
        assert!(app.select_init_payload(&resolved).is_none());
    }

    #[test]
    fn select_autoresponder_dynamic_closure_wins_over_static() {
        use crate::websocket::ResponderAction;
        let static_called = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let static_clone = std::sync::Arc::clone(&static_called);
        let dynamic_called = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let dynamic_clone = std::sync::Arc::clone(&dynamic_called);

        let static_responder: crate::websocket::AutoResponder = std::sync::Arc::new(
            move |_frame: &serde_json::Value| -> Option<ResponderAction> {
                static_clone.store(true, std::sync::atomic::Ordering::SeqCst);
                None
            },
        );
        let app = CliApp::new("ws-cli")
            .autoresponder(static_responder)
            .cli_arg("voice", BindingArgKind::Flag, "")
            .autoresponder_with(move |args| {
                if args.flag("voice") {
                    let flag = std::sync::Arc::clone(&dynamic_clone);
                    let responder: crate::websocket::AutoResponder = std::sync::Arc::new(
                        move |_frame: &serde_json::Value| -> Option<ResponderAction> {
                            flag.store(true, std::sync::atomic::Ordering::SeqCst);
                            None
                        },
                    );
                    Some(responder)
                } else {
                    None
                }
            });
        let matches = matches_with_app_args(&app, &["root", "--voice"]);
        let resolved = app.resolve_binding_args(&matches);
        let picked = app.select_autoresponder(&resolved).expect("Some");
        // Invoke the picked responder once; the dynamic closure's
        // bool flips, the static one's does not.
        let _ = picked(&serde_json::json!({}));
        assert!(dynamic_called.load(std::sync::atomic::Ordering::SeqCst));
        assert!(!static_called.load(std::sync::atomic::Ordering::SeqCst));
    }
}
