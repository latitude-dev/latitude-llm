//! Root-level `CliApp` that composes one or more [`Binding`]s into a
//! single CLI binary.
//!
//! **Architectural rule:** `CliApp::run()` always runs the full dispatch
//! pipeline. There is no single-binding shortcut. A binary with one
//! binding goes through exactly the same pipeline as a binary with five.
//!
//! The pipeline:
//! 1. Parse argv → `ArgMatches`
//! 2. Resolve operation path → matched `Binding`
//! 3. Call `Binding::dispatch(...)` (fires transport-scope hooks)
//! 4. Run CliApp-scope `transform_response` chain
//! 5. On error from step 3, run CliApp-scope `recover_error` chain
//! 6. Format and write output
//!
//! See [PR #62 review](https://github.com/fern-api/cli-sdk/pull/62#issuecomment-4484622766)
//! for why the single-binding fast path was removed.

use std::any::Any;

use serde_json::Value;

use crate::auth::root_builder::AuthSchemeBuilder;
use crate::auth::SchemeBinding;
use crate::binding::{Binding, DispatchResult};
use crate::error::{write_error_json, CliError, ErrorDisplayContext};
use crate::formatter;
use crate::hooks::HookRegistry;
use crate::stability::Stability;

/// Handler function for CLI-level custom commands.
///
/// Receives the parsed [`clap::ArgMatches`] for the subcommand and a
/// type-erased binding context. Use [`OpenApiBinding::handler()`] or
/// [`GraphqlBinding::handler()`] to wrap a typed handler function
/// instead of downcasting manually.
///
/// [`OpenApiBinding::handler()`]: crate::openapi::OpenApiBinding::handler
/// [`GraphqlBinding::handler()`]: crate::graphql::GraphqlBinding::handler
pub type CliCommandHandler =
    Box<dyn Fn(&clap::ArgMatches, &dyn Any) -> Result<(), CliError> + Send + Sync>;

/// A CLI-level custom command: parent path, clap command, and handler.
struct CliCommand {
    path: Vec<String>,
    cmd: clap::Command,
    handler: CliCommandHandler,
}

/// Outcome of the dispatch pipeline — separates success from
/// help/version display so `CliError` is reserved for real errors.
enum PipelineOutcome {
    Success,
    HelpShown,
}

// ── Tier 1 deferred operations ──────────────────────────────────────

/// A declarative modification to be applied to the clap command tree
/// after all bindings have contributed their subtrees.
enum DeferredOp {
    Alias {
        path: Vec<String>,
        alias: String,
    },
    Hide {
        path: Vec<String>,
    },
    Stability {
        path: Vec<String>,
        stability: Stability,
    },
}

// ── Root CliApp ─────────────────────────────────────────────────────

/// Root-level CLI application builder that composes [`Binding`]s.
///
/// ```rust,ignore
/// use fern_cli_sdk::app::CliApp;
/// use fern_cli_sdk::openapi::OpenApiBinding;
///
/// fn main() {
///     CliApp::new("my-cli")
///         .title("My CLI")
///         .description("Interact with the My API from the command line.")
///         .binding(
///             OpenApiBinding::new()
///                 .spec(include_str!("openapi.yaml"))
///                 .auth_scheme_env("bearer", "MY_API_KEY"),
///         )
///         .run()
/// }
/// ```
#[must_use]
pub struct CliApp {
    name: String,
    title: Option<String>,
    description: Option<String>,
    bindings: Vec<Box<dyn Binding>>,
    hooks: HookRegistry,
    deferred_ops: Vec<DeferredOp>,
    cli_commands: Vec<CliCommand>,
    /// Root-level auth scheme bindings. These are shared across all
    /// bindings — each binding's spec references schemes by name and
    /// the credential source is looked up from this registry.
    auth_bindings: Vec<(String, SchemeBinding)>,
    /// Login flows declared for this CLI. Each populates one auth
    /// scheme's keyring entry on `<bin> auth login`. See ADR-0007.
    login_flows: Vec<crate::auth::login::DynLoginFlow>,
    /// Root-level global parameters. Declared once here (like
    /// [`auth_bindings`](Self::auth_bindings)) and shared across all
    /// bindings — `propagate_root_global_parameters` hands them to each
    /// binding via [`Binding::set_root_global_parameters`], which
    /// surfaces them as top-level flags and injects them into requests.
    global_parameters: Vec<crate::openapi::discovery::GlobalParameter>,
    /// Optional base URL for per-status-code error documentation links.
    /// When set, API errors append `<base_url>/<http_status_code>` to stderr.
    error_docs_base_url: Option<String>,
    /// Profiles configuration, or `None` when the generator did not opt in.
    ///
    /// `None` is the default and means the feature is entirely absent: no
    /// `profiles` subcommand, no `--profile` flag, and no profile resolution.
    /// Adding a top-level subcommand to every existing generated CLI is a
    /// surface change, so it ships opt-in (see `ProfilesConfig`).
    profiles: Option<crate::profiles::ProfilesConfig>,
}

impl CliApp {
    pub fn new(name: &str) -> Self {
        Self {
            name: name.to_string(),
            title: None,
            description: None,
            bindings: Vec::new(),
            hooks: HookRegistry::new(),
            deferred_ops: Vec::new(),
            cli_commands: Vec::new(),
            auth_bindings: Vec::new(),
            login_flows: Vec::new(),
            global_parameters: Vec::new(),
            error_docs_base_url: None,
            profiles: None,
        }
    }

    // ── CLI metadata ────────────────────────────────────────────────

    /// Set the top-level `--help` title for this CLI.
    pub fn title(mut self, t: &str) -> Self {
        self.title = Some(t.to_string());
        self
    }

    /// Set the top-level `--help` description for this CLI.
    pub fn description(mut self, d: &str) -> Self {
        self.description = Some(d.to_string());
        self
    }

    /// Set the base URL for per-status-code error documentation links.
    ///
    /// When set, API errors (HTTP status codes) append a docs URL to stderr:
    /// `  → <base_url>/<status_code>` (e.g. `https://docs.example.com/errors/401`).
    pub fn error_docs_base_url(mut self, url: &str) -> Self {
        self.error_docs_base_url = Some(url.to_string());
        self
    }

    /// Rename the consumer `User-Agent` suffix flag (and its derived env
    /// var). By default the CLI exposes `--user-agent-suffix` and
    /// `<NAME>_USER_AGENT_SUFFIX`; passing `"via"` here exposes `--via` and
    /// `<NAME>_VIA` instead. The name is the flag's long form without the
    /// leading `--`. Wired from the generator's `userAgentSuffixFlag`
    /// custom config; it sets a process-wide value read by the flag
    /// registration, help/schema text, and env-var lookup.
    pub fn user_agent_suffix_flag(self, name: &str) -> Self {
        crate::user_agent::set_suffix_flag(name);
        self
    }

    /// Enable named profiles: a `profiles` subcommand group, a global
    /// `--profile` / `-p` flag, and profile-sourced defaults for
    /// credentials, parameters, server variables, base URL, and output
    /// format. See [`crate::profiles`] for the resolution rules.
    ///
    /// Off unless called. A CLI that never calls this is byte-identical to
    /// one built before profiles existed — same `--help`, same `auth
    /// status`, same credential resolution.
    pub fn profiles(mut self, config: crate::profiles::ProfilesConfig) -> Self {
        // Tell the collision-avoidance machinery that `profile` is now a
        // taken arg id, before any binding builds its command tree. Without
        // this, a spec that declares a parameter or server variable of that
        // name registers a second `--profile` and clap rejects the whole tree
        // at startup — every invocation panics, not just the profile ones.
        crate::profiles::reserve_profile_flag();
        self.profiles = Some(config);
        self
    }

    // ── Binding registration ────────────────────────────────────────

    /// Add a binding (protocol adapter) to this CLI. The CLI name is
    /// propagated to the binding for HTTP config, logging, and base-URL
    /// resolution.
    pub fn binding(mut self, mut binding: impl Binding + 'static) -> Self {
        binding.set_cli_name(&self.name);
        self.bindings.push(Box::new(binding));
        self
    }

    // ── Auth registration ────────────────────────────────────────────

    /// Register an auth scheme at the root CLI level.
    ///
    /// Auth declared here is shared across all bindings. Each binding's
    /// spec references schemes by name (from its `securitySchemes`), and
    /// credential resolution comes from this root registry.
    ///
    /// ```rust,ignore
    /// use fern_cli_sdk::app::CliApp;
    /// use fern_cli_sdk::auth::{BearerAuth, ApiKeyAuth};
    ///
    /// CliApp::new("my-cli")
    ///     .auth(BearerAuth::new("bearerAuth").env("MY_TOKEN"))
    ///     .auth(ApiKeyAuth::new("apiKey").env("API_KEY"))
    ///     .binding(OpenApiBinding::new().spec(include_str!("openapi.yaml")))
    ///     .run()
    /// ```
    pub fn auth(mut self, builder: impl AuthSchemeBuilder) -> Self {
        self.auth_bindings.push(builder.into_binding());
        self
    }

    // ── Global parameter registration ─────────────────────────────────

    /// Register a global parameter at the root CLI level.
    ///
    /// Global parameters are declared once here and shared across all
    /// bindings — mirroring [`auth`](Self::auth). Before the CLI runs,
    /// `propagate_root_global_parameters` hands the full set to each
    /// binding via [`Binding::set_root_global_parameters`]; the binding
    /// surfaces them as top-level flags and injects the resolved value
    /// into outgoing requests at the configured wire location.
    ///
    /// This is the builder entry point emitted by the TypeScript codegen
    /// layer (`detectGlobalParams.ts`) from `ir.globalParameters`.
    ///
    /// ```rust,ignore
    /// use fern_cli_sdk::app::CliApp;
    /// use fern_cli_sdk::openapi::OpenApiBinding;
    /// use fern_cli_sdk::openapi::discovery::{
    ///     GlobalParameter, GlobalParameterApplyMode, GlobalParameterLocation,
    /// };
    ///
    /// CliApp::new("my-cli")
    ///     .global_parameter(GlobalParameter {
    ///         name: "api-version".into(),
    ///         location: GlobalParameterLocation::Query,
    ///         target: "api-version".into(),
    ///         env: Some("MY_API_VERSION".into()),
    ///         default: None,
    ///         optional: false,
    ///         apply: GlobalParameterApplyMode::Auto,
    ///         parameter_name: None,
    ///         docs: None,
    ///     })
    ///     .binding(OpenApiBinding::new().spec(include_str!("openapi.yaml")))
    ///     .run()
    /// ```
    pub fn global_parameter(
        mut self,
        param: crate::openapi::discovery::GlobalParameter,
    ) -> Self {
        self.global_parameters.push(param);
        self
    }

    /// Declare a login flow for one of the registered auth schemes.
    ///
    /// Generated and hand-written CLIs use this to wire `<bin> auth login`
    /// to a concrete flow — `DeviceCodeLoginFlow`, `PkceLoginFlow`, or
    /// `TokenPasteLoginFlow` from [`crate::auth::login`] /
    /// [`crate::auth::oauth2`]. Exactly one flow per scheme (ADR-0007).
    ///
    /// Token-paste via `--with-token` is universally available regardless
    /// of declared flows; this method only matters when a binary wants
    /// the OAuth (device-code / PKCE) flow to run automatically.
    pub fn login_flow(mut self, flow: impl crate::auth::login::LoginFlow + 'static) -> Self {
        let scheme = flow.scheme_name().to_string();
        // If the flow declares a request-time auth provider (OAuth flows
        // do, paste does not), register it as a Custom scheme binding so
        // the dispatch pipeline uses the OAuth2KeyringProvider on every
        // API request — refresh-on-expired included.
        if let Some(provider) = flow.build_auth_provider(&self.name) {
            // Replace any existing binding for this scheme. The flow's
            // provider supersedes plain bearer/header on the same name —
            // but emit a warning so a hand-written CLI that wired both
            // (e.g. `.auth(BearerAuth::new("X").env("Y")).login_flow(...)`)
            // discovers the silent replacement instead of debugging a
            // mysteriously-ignored env var.
            let prior = self.auth_bindings.len();
            self.auth_bindings.retain(|(n, _)| n != &scheme);
            if self.auth_bindings.len() < prior {
                tracing::warn!(
                    scheme = %scheme,
                    cli = %self.name,
                    "login_flow() replaced a previously-registered auth binding for scheme `{scheme}` — \
                     any .auth() / .auth_scheme_*() / .auth_provider*() call for that scheme is discarded. \
                     Move the .login_flow() call before the .auth() call, or drop the .auth() if the login \
                     flow's request-time provider is what you want."
                );
            }
            self.auth_bindings
                .push((scheme, crate::auth::builder::SchemeBinding::Custom(provider)));
        }
        self.login_flows.push(std::sync::Arc::new(flow));
        self
    }

    // ── Custom commands ──────────────────────────────────────────────

    /// Register a top-level custom command.
    ///
    /// Use [`OpenApiBinding::handler()`] or [`GraphqlBinding::handler()`]
    /// to wrap a typed handler that receives the concrete binding context:
    ///
    /// ```rust,ignore
    /// CliApp::new("my-cli")
    ///     .binding(OpenApiBinding::new().spec(include_str!("openapi.yaml")))
    ///     .command(my_command(), OpenApiBinding::handler(my_handler))
    ///     .run()
    /// ```
    ///
    /// **Note:** `transform_response` and `recover_error` hooks do not
    /// apply to custom commands. Custom command handlers manage their
    /// own output directly.
    ///
    /// [`OpenApiBinding::handler()`]: crate::openapi::OpenApiBinding::handler
    /// [`GraphqlBinding::handler()`]: crate::graphql::GraphqlBinding::handler
    pub fn command(mut self, cmd: clap::Command, handler: CliCommandHandler) -> Self {
        self.cli_commands.push(CliCommand {
            path: Vec::new(),
            cmd,
            handler,
        });
        self
    }

    /// Register a top-level custom command with compile-time typed arguments.
    ///
    /// `A` is a [`clap::Args`] struct (typically `#[derive(clap::Args)]`)
    /// whose fields become CLI flags. The handler receives the parsed `A`
    /// and the binding context `C` (e.g. [`AppContext`]) directly — no
    /// wrapper needed.
    ///
    /// ```rust,ignore
    /// #[derive(clap::Args)]
    /// struct AdoptArgs {
    ///     name: String,
    ///     #[arg(long)]
    ///     tag: Option<String>,
    /// }
    ///
    /// fn handle_adopt(args: AdoptArgs, ctx: &AppContext) -> Result<(), CliError> {
    ///     println!("adopting {}", args.name);
    ///     Ok(())
    /// }
    ///
    /// CliApp::new("my-cli")
    ///     .binding(OpenApiBinding::new().spec(include_str!("openapi.yaml")))
    ///     .command_typed("adopt", "Adopt a pet", handle_adopt)
    ///     .run()
    /// ```
    ///
    /// For full [`clap::Command`] customization (long_about, aliases, etc.)
    /// use [`command_typed_with`](Self::command_typed_with).
    ///
    /// **Note:** `transform_response` and `recover_error` hooks do not
    /// apply to custom commands. Custom command handlers manage their
    /// own output directly.
    pub fn command_typed<A, C>(
        self,
        name: &str,
        about: &str,
        handler: fn(A, &C) -> Result<(), CliError>,
    ) -> Self
    where
        A: clap::Args + 'static,
        C: 'static,
    {
        self.command_typed_with(
            clap::Command::new(name.to_string()).about(about.to_string()),
            handler,
        )
    }

    /// Like [`command_typed`](Self::command_typed) but accepts a full
    /// [`clap::Command`] for advanced customization.
    ///
    /// ```rust,ignore
    /// app.command_typed_with(
    ///     clap::Command::new("adopt")
    ///         .about("Adopt a pet")
    ///         .long_about("Create and fetch back a pet record."),
    ///     handle_adopt,
    /// )
    /// ```
    pub fn command_typed_with<A, C>(
        mut self,
        cmd: clap::Command,
        handler: fn(A, &C) -> Result<(), CliError>,
    ) -> Self
    where
        A: clap::Args + 'static,
        C: 'static,
    {
        let augmented = A::augment_args(cmd);
        let erased: CliCommandHandler = Box::new(move |matches, ctx| {
            let args = A::from_arg_matches(matches)
                .map_err(|e| CliError::Validation(e.to_string()))?;
            let ctx = ctx.downcast_ref::<C>().ok_or_else(|| {
                CliError::Validation("binding context type mismatch".into())
            })?;
            handler(args, ctx)
        });
        self.cli_commands.push(CliCommand {
            path: Vec::new(),
            cmd: augmented,
            handler: erased,
        });
        self
    }

    /// Register a custom command under an existing command path.
    ///
    /// ```rust,ignore
    /// CliApp::new("my-cli")
    ///     .binding(OpenApiBinding::new().spec(include_str!("openapi.yaml")))
    ///     .command_under(
    ///         &["webhooks"],
    ///         verify_command(),
    ///         OpenApiBinding::handler(handle_verify),
    ///     )
    ///     .run()
    /// ```
    ///
    /// **Note:** `transform_response` and `recover_error` hooks do not
    /// apply to custom commands. Custom command handlers manage their
    /// own output directly.
    pub fn command_under(
        mut self,
        path: &[&str],
        cmd: clap::Command,
        handler: CliCommandHandler,
    ) -> Self {
        self.cli_commands.push(CliCommand {
            path: path.iter().map(|s| s.to_string()).collect(),
            cmd,
            handler,
        });
        self
    }

    /// Register a typed custom command under an existing command path.
    ///
    /// Like [`command_typed`](Self::command_typed) but nests the command
    /// under `path` in the command tree.
    ///
    /// ```rust,ignore
    /// app.command_under_typed(&["pets"], "find", "Find pets by name", handle_find)
    /// ```
    ///
    /// For full [`clap::Command`] customization use
    /// [`command_under_typed_with`](Self::command_under_typed_with).
    pub fn command_under_typed<A, C>(
        self,
        path: &[&str],
        name: &str,
        about: &str,
        handler: fn(A, &C) -> Result<(), CliError>,
    ) -> Self
    where
        A: clap::Args + 'static,
        C: 'static,
    {
        self.command_under_typed_with(
            path,
            clap::Command::new(name.to_string()).about(about.to_string()),
            handler,
        )
    }

    /// Like [`command_under_typed`](Self::command_under_typed) but
    /// accepts a full [`clap::Command`].
    pub fn command_under_typed_with<A, C>(
        mut self,
        path: &[&str],
        cmd: clap::Command,
        handler: fn(A, &C) -> Result<(), CliError>,
    ) -> Self
    where
        A: clap::Args + 'static,
        C: 'static,
    {
        let augmented = A::augment_args(cmd);
        let erased: CliCommandHandler = Box::new(move |matches, ctx| {
            let args = A::from_arg_matches(matches)
                .map_err(|e| CliError::Validation(e.to_string()))?;
            let ctx = ctx.downcast_ref::<C>().ok_or_else(|| {
                CliError::Validation("binding context type mismatch".into())
            })?;
            handler(args, ctx)
        });
        self.cli_commands.push(CliCommand {
            path: path.iter().map(|s| s.to_string()).collect(),
            cmd: augmented,
            handler: erased,
        });
        self
    }

    // ── Tier 1: Declarative ─────────────────────────────────────────

    /// Register an alias for a command at `path`. Invoking the alias
    /// produces the same output as the canonical name.
    pub fn alias(mut self, path: &[&str], alias: &str) -> Self {
        self.deferred_ops.push(DeferredOp::Alias {
            path: path.iter().map(|s| s.to_string()).collect(),
            alias: alias.to_string(),
        });
        self
    }

    /// Hide a command from `--help` output.
    pub fn hide(mut self, path: &[&str]) -> Self {
        self.deferred_ops.push(DeferredOp::Hide {
            path: path.iter().map(|s| s.to_string()).collect(),
        });
        self
    }

    /// Set the stability level for a command.
    pub fn stability(mut self, path: &[&str], stability: Stability) -> Self {
        self.deferred_ops.push(DeferredOp::Stability {
            path: path.iter().map(|s| s.to_string()).collect(),
            stability,
        });
        self
    }

    /// Mark a command as deprecated with a message.
    pub fn deprecate(self, path: &[&str], message: &str) -> Self {
        self.stability(
            path,
            Stability::Deprecated {
                message: message.to_string(),
                replacement: None,
                removed_in: None,
            },
        )
    }

    // ── Tier 2: Per-command hooks ───────────────────────────────────

    /// Transform a decoded response value before format/output.
    /// Glob path applies across many operations.
    pub fn transform_response<F, Fut>(mut self, path: &[&str], f: F) -> Self
    where
        F: Fn(Value, Vec<String>) -> Fut + Send + Sync + 'static,
        Fut: std::future::Future<Output = Result<Value, CliError>> + Send + 'static,
    {
        self.hooks.add_transform_response(
            path,
            Box::new(move |v, p| Box::pin(f(v, p))),
        );
        self
    }

    /// Convert an API error into synthetic success. Returning
    /// `Ok(Some(v))` short-circuits with `v` as the response;
    /// `Ok(None)` lets the error propagate.
    pub fn recover_error<F, Fut>(mut self, path: &[&str], f: F) -> Self
    where
        F: Fn(CliError, Vec<String>) -> Fut + Send + Sync + 'static,
        Fut: std::future::Future<Output = Result<Option<Value>, CliError>> + Send + 'static,
    {
        self.hooks.add_recover_error(
            path,
            Box::new(move |e, p| Box::pin(f(e, p))),
        );
        self
    }

    // ── Run ─────────────────────────────────────────────────────────

    /// Run the CLI, consuming `self`. Builds the command tree, parses
    /// argv, dispatches through the matched binding, applies hooks,
    /// and formats output.
    pub fn run(self) {
        let args: Vec<std::ffi::OsString> = std::env::args_os().collect();
        self.run_with_args(args)
    }

    /// Like [`Self::run`], but takes the argv to parse explicitly
    /// instead of pulling from `std::env::args_os()`. Useful when a
    /// binary's `main` needs to pre-scan or rewrite argv (e.g. to
    /// strip binding-steering flags like `--voice`) before the
    /// spec-driven clap tree sees it. Performs the same one-time
    /// setup as `run` (sigpipe reset, `.env` load, logging init) and
    /// terminates the process with the run's exit code.
    pub fn run_with_args<I, T>(mut self, args: I)
    where
        I: IntoIterator<Item = T>,
        T: Into<std::ffi::OsString>,
    {
        crate::reset_sigpipe();
        // Collect now, report after `init_logging` — a warning emitted before the
        // subscriber exists is dropped, which would leave a user whose `.env`
        // setting was ignored with no explanation at all.
        let ignored_dotenv_keys = crate::load_dotenv_filtered(&self.name);
        crate::init_logging(&self.name);
        crate::warn_ignored_dotenv_keys(&ignored_dotenv_keys);

        let args: Vec<std::ffi::OsString> = args.into_iter().map(Into::into).collect();
        let prepare_error = self.prepare(&args);
        let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
        let mut out = std::io::stdout().lock();
        let exit = rt.block_on(self.run_inner(args, prepare_error, &mut out));
        drop(out);
        std::process::exit(exit);
    }

    /// Testable entry point: runs the full pipeline against the given
    /// argv and returns the exit code instead of calling
    /// `std::process::exit`. Output is written to stdout.
    pub fn try_run_from<I, T>(mut self, args: I) -> i32
    where
        I: IntoIterator<Item = T>,
        T: Into<std::ffi::OsString>,
    {
        let args: Vec<std::ffi::OsString> = args.into_iter().map(Into::into).collect();
        let prepare_error = self.prepare(&args);
        let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
        let mut out = std::io::stdout().lock();
        rt.block_on(self.run_inner(args, prepare_error, &mut out))
    }

    /// Testable entry point that captures output into the provided
    /// writer instead of stdout. Returns `(exit_code, bytes_written)`.
    ///
    /// This is the preferred method for behavior tests — it avoids
    /// process-global stdout redirection (`gag`) which is racy under
    /// parallel test execution.
    pub fn try_run_from_with_output<I, T, W>(mut self, args: I, out: &mut W) -> i32
    where
        I: IntoIterator<Item = T>,
        T: Into<std::ffi::OsString>,
        W: std::io::Write,
    {
        let args: Vec<std::ffi::OsString> = args.into_iter().map(Into::into).collect();
        let prepare_error = self.prepare(&args);
        let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
        rt.block_on(self.run_inner(args, prepare_error, &mut *out))
    }

    /// One-time setup every entry point performs before the pipeline runs:
    /// resolve and publish the profile, then propagate root auth and global
    /// parameters to the bindings.
    ///
    /// Returns the profile-resolution error, if any, instead of failing —
    /// `dispatch_pipeline` re-raises it *after* the `--help` / `--schema` /
    /// `profiles` intercepts, so a stale `active` profile does not make the
    /// commands you need in order to fix it unreachable.
    ///
    /// Ordering matters: the profile has to be installed before
    /// [`propagate_root_auth`](Self::propagate_root_auth), because that is
    /// where the keyring account and the OAuth token-cache key are derived
    /// from it.
    fn prepare(&mut self, args: &[std::ffi::OsString]) -> Option<CliError> {
        let error = self.resolve_and_install_profile(args).err();
        self.propagate_root_auth();
        self.propagate_root_global_parameters();
        error
    }

    /// Resolve the profile for this invocation and publish it process-wide.
    ///
    /// No-op (and no error) when the generator did not opt into profiles, so
    /// an existing generated CLI does not read `profiles.toml` at all.
    fn resolve_and_install_profile(&self, args: &[std::ffi::OsString]) -> Result<(), CliError> {
        if self.profiles.is_none() {
            return Ok(());
        }
        // `to_string_lossy`, not `filter_map(to_str)`: dropping a non-UTF-8
        // argument would shift every later position, so the pre-clap scanner
        // could read the value of a preceding option as if it were a flag.
        // Lossy replacement keeps the vector positionally faithful to argv,
        // and U+FFFD cannot alias a flag we match on.
        let str_args: Vec<String> = args
            .iter()
            .map(|a| a.to_string_lossy().into_owned())
            .collect();

        // The `profiles` group itself runs unprofiled. Otherwise a stale
        // `active` pointer, or a profile with a broken `parent`, would make
        // `profiles list` / `use` / `remove` — the only way to repair it —
        // fail with the very error the user is trying to clear.
        if self.invocation_is_profiles_group(&str_args) {
            crate::profiles::selection::install(None);
            return Ok(());
        }

        match crate::profiles::resolve_selection(&self.name, &str_args) {
            Ok(selection) => {
                crate::profiles::selection::install(selection);
                Ok(())
            }
            Err(error) => {
                // Leave the slot empty: every read-side helper then behaves
                // as if unprofiled, which keeps `--help` and `--schema`
                // working while the error is surfaced for real commands.
                crate::profiles::selection::install(None);
                Err(error)
            }
        }
    }

    /// The parameter and server-variable names `profiles create` will accept,
    /// unioned across every registered binding.
    ///
    /// The framework cannot know that `AccountSid` is Twilio's tenant key —
    /// a Stripe CLI's equivalent is `account`, a GitHub CLI's is `owner`. So
    /// `parameters` is a free-form map, and this is what keeps a typo from
    /// being a silent no-op: `--set AcountSid=…` is rejected at write time
    /// with a near-miss suggestion instead of storing a default nothing
    /// ever reads.
    ///
    /// Empty when no binding can enumerate its surface, which disables the
    /// check rather than rejecting everything.
    fn profiles_vocabulary(&self) -> crate::profiles::commands::Vocabulary {
        let mut vocabulary = crate::profiles::commands::Vocabulary::default();
        for binding in &self.bindings {
            vocabulary.add_parameters(binding.parameter_specs());
            vocabulary.add_tenant_keys(binding.tenant_key_candidates());
            vocabulary
                .server_variables
                .extend(binding.server_variable_names());
        }
        vocabulary
    }

    /// True when raw argv targets the `profiles` group.
    fn invocation_is_profiles_group(&self, str_args: &[String]) -> bool {
        let Some(config) = &self.profiles else {
            return false;
        };
        crate::early_intercept::first_positional_is(str_args, &config.command_name)
    }

    /// Pass root-level auth bindings to each registered binding and
    /// validate that specs don't reference unregistered schemes.
    /// Must be called before `run_inner` / `dispatch_pipeline`.
    fn propagate_root_auth(&mut self) {
        // Inject a keyring source into every scheme's credential chain
        // before propagating, so `<bin> auth login` populating the keyring
        // is visible to the binding-level auth provider without per-binary
        // wiring (ADR-0008 § precedence).
        crate::auth::login::inject_keyring_sources(&self.name, &mut self.auth_bindings);

        // Wire on-disk token caching into OAuth2 providers that were
        // constructed without a cache (i.e. via `root_builder`).
        crate::auth::login::inject_oauth2_caches(&self.name, &mut self.auth_bindings);

        if !self.auth_bindings.is_empty() {
            for binding in &mut self.bindings {
                binding.set_root_auth(&self.auth_bindings);
            }
        }
    }

    /// Pass root-level global parameters to each registered binding.
    /// Mirrors [`propagate_root_auth`](Self::propagate_root_auth):
    /// parameters are declared once on the root `CliApp` and shared with
    /// every binding, which surfaces them as flags and injects them into
    /// requests. Must be called before `run_inner` / `dispatch_pipeline`.
    fn propagate_root_global_parameters(&mut self) {
        if !self.global_parameters.is_empty() {
            for binding in &mut self.bindings {
                binding.set_root_global_parameters(&self.global_parameters);
            }
        }
    }

    /// Validate auth across all bindings. Hard-errors if any binding's
    /// spec references a scheme not registered in auth_bindings.
    fn validate_auth(&self) -> Result<(), CliError> {
        for binding in &self.bindings {
            binding.validate_auth()?;
        }
        Ok(())
    }

    /// Core async pipeline. Returns exit code (0 = success).
    ///
    /// **NO SINGLE-BINDING SHORTCUT.** Every execution path goes through
    /// the full dispatch pipeline regardless of binding count.
    async fn run_inner<W: std::io::Write>(
        &self,
        args: Vec<std::ffi::OsString>,
        profile_error: Option<CliError>,
        out: &mut W,
    ) -> i32 {
        let str_args: Vec<String> = args.iter()
            .filter_map(|a| a.to_str().map(String::from))
            .collect();
        let subcommand_path = crate::cli_args::extract_subcommand_path(&str_args);
        let help_hint = if subcommand_path.is_empty() {
            format!("{} --help", self.name)
        } else {
            format!("{} {} --help", self.name, subcommand_path.join(" "))
        };
        let ctx = ErrorDisplayContext {
            docs_base_url: self.error_docs_base_url.clone(),
            help_hint: Some(help_hint),
            // Resolved from raw argv because an error can precede clap parsing;
            // the resolver is the same one the success path uses, so errors land
            // in whichever representation the caller already asked for.
            format: crate::formatter::resolve_format_from_raw_args(&str_args, &self.name),
        };
        match self.dispatch_pipeline(args, profile_error, out).await {
            Ok(PipelineOutcome::Success) => 0,
            Ok(PipelineOutcome::HelpShown) => 0,
            Err(err) => {
                write_error_json(&err, out, Some(&ctx));
                err.exit_code()
            }
        }
    }

    /// The full dispatch pipeline.
    async fn dispatch_pipeline<W: std::io::Write>(
        &self,
        args: Vec<std::ffi::OsString>,
        profile_error: Option<CliError>,
        out: &mut W,
    ) -> Result<PipelineOutcome, CliError> {
        if self.bindings.is_empty() {
            return Err(CliError::Discovery(
                "No bindings registered. Call .binding() on CliApp.".to_string(),
            ));
        }

        // 0. Validate auth bindings — hard error if a binding's spec
        // references a scheme not registered at root.
        self.validate_auth()?;

        // 0. Convert args to strings for early interception checks.
        let str_args: Vec<String> = args.iter()
            .filter_map(|a| a.to_str().map(String::from))
            .collect();

        // 0a. Intercept `<cli> errors` early — before loading specs.
        if crate::cli_args::is_errors_subcommand(&str_args) {
            crate::error::write_errors_to(&str_args, out);
            return Ok(PipelineOutcome::HelpShown);
        }

        // 0b. Intercept the `--schema` global flag — the agent-facing
        // machine-readable counterpart to `--help`. Done before clap parses
        // so paths with required args still emit their spec without tripping
        // clap's required-arg validation (mirrors how `--help` is handled).
        //
        // Each binding's contribution is fetched via `Binding::schema(&path)`.
        // Empty path: aggregate across all bindings (operations concatenated,
        // sdkVariables unioned, root shape preserved). Non-empty path: first
        // binding to own the path wins. A real `Err` from one binding is
        // logged and the walk continues — one broken spec cannot mask its
        // sibling's surface.
        // `--schema`, or `--help` with an explicit machine format — the spelling
        // the generated README has always documented for the operation catalog.
        let explicit_schema = crate::cli_args::wants_schema(&str_args);
        let help_as_schema = crate::cli_args::wants_help(&str_args)
            && crate::formatter::explicit_machine_format(&str_args);
        if explicit_schema || help_as_schema {
            let path = crate::cli_args::extract_subcommand_path(&str_args);

            if path.is_empty() {
                let mut sdk_vars: Vec<serde_json::Value> = Vec::new();
                let mut ops: Vec<serde_json::Value> = Vec::new();
                let mut any_sdk_vars = false;
                for binding in &self.bindings {
                    match binding.schema(&path) {
                        Ok(Some(serde_json::Value::Array(arr))) => ops.extend(arr),
                        Ok(Some(serde_json::Value::Object(obj))) => {
                            if let Some(serde_json::Value::Array(vs)) =
                                obj.get("sdkVariables")
                            {
                                any_sdk_vars = true;
                                sdk_vars.extend(vs.iter().cloned());
                            }
                            if let Some(serde_json::Value::Array(os)) =
                                obj.get("operations")
                            {
                                ops.extend(os.iter().cloned());
                            }
                        }
                        // Bindings are contracted to return either a bare
                        // array of operations OR a `{sdkVariables?,
                        // operations}` object at empty path. Any other
                        // shape (scalar, null, object missing both keys)
                        // is a binding bug — log a warn and skip rather
                        // than silently injecting a non-operation value
                        // into the aggregated `operations` array. Mirrors
                        // the principle the `Err` arm just below establishes:
                        // one malformed binding must not corrupt the root view.
                        Ok(Some(other)) => tracing::warn!(
                            "--schema: binding `{}` returned non-array, non-object value at empty path; skipping: {other}",
                            binding.name()
                        ),
                        Ok(None) => {}
                        Err(e) => tracing::warn!(
                            "--schema: binding `{}` errored: {e}",
                            binding.name()
                        ),
                    }
                }
                // Per ADR-0006: always wrap the empty-path result with
                // `globalFlags` (CLI harness affordances available on
                // every op). Single-binding CLIs that had a bare-array
                // root before now also get the wrapped shape. SDK
                // variables surface only when at least one binding
                // declared any.
                let mut wrapped = serde_json::Map::new();
                wrapped.insert(
                    "globalFlags".into(),
                    serde_json::Value::Array(global_flags(&self.name, self.profiles.as_ref())),
                );
                // Framework-owned commands (`auth`, `profiles`, `completion`,
                // `man`). Listed separately from `operations` because they are
                // not API calls: they have no HTTP method, path, or response
                // schema, and an agent that treated them as operations would
                // look for one.
                wrapped.insert(
                    "builtinCommands".into(),
                    serde_json::Value::Array(builtin_commands(
                        self.profiles.as_ref(),
                        &self.profiles_vocabulary(),
                    )),
                );
                if any_sdk_vars {
                    wrapped.insert("sdkVariables".into(), serde_json::Value::Array(sdk_vars));
                }
                wrapped.insert("operations".into(), serde_json::Value::Array(ops));
                let output = serde_json::Value::Object(wrapped);
                writeln!(
                    out,
                    "{}",
                    serde_json::to_string_pretty(&output).map_err(|e| {
                        CliError::Validation(format!("Failed to serialize spec: {e}"))
                    })?
                )
                .map_err(|e| CliError::Other(e.into()))?;
                return Ok(PipelineOutcome::Success);
            }

            for binding in &self.bindings {
                match binding.schema(&path) {
                    Ok(Some(value)) => {
                        writeln!(
                            out,
                            "{}",
                            serde_json::to_string_pretty(&value).map_err(|e| {
                                CliError::Validation(format!("Failed to serialize spec: {e}"))
                            })?
                        )
                        .map_err(|e| CliError::Other(e.into()))?;
                        return Ok(PipelineOutcome::Success);
                    }
                    Ok(None) => {}
                    Err(e) => tracing::warn!(
                        "--schema: binding `{}` errored: {e}",
                        binding.name()
                    ),
                }
            }
            // A path with no schema is an error for an explicit `--schema` —
            // the caller asked for a document that does not exist. It must not
            // be one for `--help`: built-in subcommands (`auth login`,
            // `completion`, `man`) are not API operations, and someone asking
            // for help on one should get help, not `discoveryError` exit 4.
            if explicit_schema {
                return Err(CliError::Discovery(format!(
                    "--schema: no binding contains path `{}`",
                    path.join(" ")
                )));
            }
        }

        // 0c. --spec / --spec-raw: emit embedded OpenAPI spec(s) and exit.
        // Root-only (not path-scoped). Multi-binding CLIs emit a YAML
        // stream (---delimited, one document per binding).
        let wants_spec = crate::cli_args::wants_spec(&str_args);
        let wants_spec_raw = crate::cli_args::wants_spec_raw(&str_args);
        if wants_spec || wants_spec_raw {
            let raw = wants_spec_raw;
            let mut documents: Vec<String> = Vec::new();
            for binding in &self.bindings {
                match binding.spec_document(raw) {
                    Ok(Some(yaml)) => documents.push(yaml),
                    Ok(None) => {}
                    Err(e) => {
                        let flag = if raw { "--spec-raw" } else { "--spec" };
                        tracing::warn!(
                            "{flag}: binding `{}` errored: {e}",
                            binding.name()
                        );
                    }
                }
            }

            if documents.is_empty() {
                let flag = if raw { "--spec-raw" } else { "--spec" };
                return Err(CliError::Discovery(format!(
                    "{flag}: no binding has an embedded API spec"
                )));
            }

            let output = if documents.len() == 1 {
                documents.into_iter().next().unwrap()
            } else {
                let mut output = documents[0].clone();
                for doc in &documents[1..] {
                    if !output.ends_with('\n') {
                        output.push('\n');
                    }
                    output.push_str("---\n");
                    output.push_str(doc);
                }
                output
            };

            write!(out, "{output}")
                .map_err(|e| CliError::Other(e.into()))?;
            return Ok(PipelineOutcome::Success);
        }

        // 1. Build merged command tree from all bindings.
        let mut cli = clap::Command::new(self.name.clone())
            .version(env!("CARGO_PKG_VERSION"))
            .arg_required_else_help(true)
            .subcommand_required(true)
            .term_width(200);
        if let Some(ref t) = self.title {
            cli = cli.about(t.clone());
        }
        if let Some(ref d) = self.description {
            cli = cli.long_about(d.clone());
        }
        cli = cli
            .arg(
                clap::Arg::new("format")
                    .long("format")
                    .help("Output format: json, table, yaml, csv, raw, jsonl, http. Default: table when stdout is a TTY, json when piped. Override default with <NAME>_OUTPUT env var. raw emits unmodified server response bytes. jsonl emits one compact JSON value per line (NDJSON); arrays are flattened. http emits the full HTTP response (status line + headers + body) like curl -i (OpenAPI only).")
                    .value_name("FORMAT")
                    .global(true),
            )
            // The one shorthand a caller needs beyond TTY detection: piping
            // already selects the machine rendering, so only the reverse —
            // "I am a human, but I am paging or redirecting" — needs a flag.
            // Deliberately not mirrored by a `--json`: endpoints with a request
            // body already spell that flag `--json <JSON>`.
            .arg(
                clap::Arg::new("human")
                    .long("human")
                    .help("Force human-readable output (same as --format table) even when piped")
                    .action(clap::ArgAction::SetTrue)
                    .conflicts_with("format")
                    .global(true),
            )
            .arg(
                clap::Arg::new("base-url")
                    .long("base-url")
                    .help("Override the API base URL (e.g. for testing against a mock server)")
                    .value_name("URL")
                    .global(true),
            )
            .arg(
                clap::Arg::new("user-agent-suffix")
                    .long(crate::user_agent::suffix_flag())
                    .help(format!(
                        "Product token appended to the User-Agent (e.g. my-app/1.0), so a tool built on top of this CLI can tag its traffic. Takes precedence over <NAME>{}.",
                        crate::user_agent::suffix_env_segment()
                    ))
                    .value_name("TOKEN")
                    .global(true),
            )
            // Discoverability only — the `--schema` flag is intercepted before
            // clap parses (see step 0b above). Registering it here makes it
            // appear in `--help` output so users / agents discover it
            // alongside `--help`.
            .arg(
                clap::Arg::new("schema")
                    .long("schema")
                    .help("Print machine-readable JSON schema for this scope (agent-facing counterpart to --help)")
                    .action(clap::ArgAction::SetTrue)
                    .global(true),
            )
            // Discoverability only — intercepted pre-clap like --schema.
            .arg(
                clap::Arg::new("spec")
                    .long("spec")
                    .help("Print the effective OpenAPI spec (source + overlays + overrides merged) to stdout")
                    .action(clap::ArgAction::SetTrue)
                    .global(true),
            )
            .arg(
                clap::Arg::new("spec-raw")
                    .long("spec-raw")
                    .help("Print the byte-exact embedded source OpenAPI spec(s) to stdout")
                    .action(clap::ArgAction::SetTrue)
                    .global(true),
            );

        // `--profile` / `-p`. Registered for discoverability and so clap
        // accepts it on every subcommand; the value itself is read pre-clap
        // (see `resolve_and_install_profile`), because the resolved profile
        // supplies `default_value`s to the args in this very tree.
        //
        // `-p` is free: spec-derived parameter args are `.long()`-only, so
        // there is no short-flag namespace for it to collide in.
        if let Some(ref config) = self.profiles {
            cli = cli.arg(
                clap::Arg::new(crate::profiles::selection::PROFILE_FLAG)
                    .long(crate::profiles::selection::PROFILE_FLAG)
                    .short(crate::profiles::selection::PROFILE_SHORT)
                    .value_name("NAME")
                    .help(format!(
                        "Run this command under a named profile (see `{} {}`). \
                         Overrides {} and the active profile.",
                        self.name,
                        config.command_name,
                        crate::profiles::selection::profile_env_var(&self.name),
                    ))
                    .global(true),
            );
        }

        // Deep-merge every binding's subtree into one placeholder
        // command and build the full leaf-path → binding-index map.
        // Errors surface (as `CliError::Validation`) if two bindings
        // declare the same full leaf path — before any dispatch.
        let (merged_subtree, leaf_map, binding_cmds) =
            merge_binding_subtrees(&self.bindings)?;

        // Does the spec itself claim a top-level `auth` group? When it
        // does, the built-in credential subcommands are folded into it
        // (see `graft_builtin_command`) and `auth <op>` operations owned
        // by the spec must reach their binding instead of `dispatch_auth`.
        let spec_owns_auth = merged_subtree.find_subcommand("auth").is_some();

        // Same question for the `profiles` group. Computed here, alongside
        // `spec_owns_auth`, because `merged_subtree` is consumed by the graft
        // below.
        let spec_owns_profiles = self
            .profiles
            .as_ref()
            .is_some_and(|config| merged_subtree.find_subcommand(&config.command_name).is_some());
        let profiles_vocabulary = self.profiles_vocabulary();

        // Graft the merged subtree's subcommands and binding-level
        // global args / about / after_help into the root cli, reusing
        // the per-binding commands already built above.
        cli = graft_merged_subtree(cli, &binding_cmds, merged_subtree, self.title.is_some());

        // 1b. Register CLI-level custom commands (may be nested).
        for cc in &self.cli_commands {
            cli = crate::custom_commands::graft_subcommand(cli, &cc.path, cc.cmd.clone());
        }

        // 1c. Register `completion`, `man`, and `auth` subcommands.
        //
        // `auth` is always grafted, even on binaries that declare no OAuth
        // flow — `auth login --with-token` is the universal credential
        // entry point that ships on every Fern CLI (ADR-0007 § always-graft).
        cli = graft_builtin_command(cli, crate::completions::completion_command());
        cli = graft_builtin_command(cli, crate::man::man_command());
        cli = graft_builtin_command(cli, crate::auth::login::build_auth_command());

        // `profiles`, when the generator opted in. Folded into a spec-owned
        // group of the same name rather than colliding with it, exactly as
        // `auth` is.
        if let Some(ref config) = self.profiles {
            cli = graft_builtin_command(
                cli,
                crate::profiles::commands::build_profiles_command(
                    config,
                    &profiles_vocabulary,
                ),
            );
        }

        // 1d. Apply Tier 1 deferred operations (alias, hide, stability)
        // before completion/man generation so aliases appear in tab-
        // completion scripts and man pages reflect hidden/stability state.
        for op in &self.deferred_ops {
            match op {
                DeferredOp::Alias { path, alias } => {
                    cli = apply_alias(cli, path, alias);
                }
                DeferredOp::Hide { path } => {
                    cli = apply_hide(cli, path);
                }
                DeferredOp::Stability { path, stability } => {
                    cli = apply_stability(cli, path, stability);
                }
            }
        }

        // 1e. Group every global flag under its own `--help` section so leaf
        // help leads with the operation's own required/optional parameters.
        cli = crate::cli_args::apply_global_help_heading(cli);

        // 1f. Validate hook patterns against the command tree.
        self.hooks.validate_patterns(&cli)?;

        // 1g. Intercept `completion` and `man` before clap parses.
        if crate::completions::wants_completion(&str_args) {
            let raw_shell_arg =
                crate::early_intercept::nth_positional(&str_args, 1);
            match raw_shell_arg {
                Some(s) => match crate::completions::parse_shell(s) {
                    Some(shell) => {
                        crate::completions::generate_completion_to(shell, &mut cli, &self.name, out)
                            .map_err(|e| CliError::Other(e.into()))?;
                        return Ok(PipelineOutcome::HelpShown);
                    }
                    None => {
                        return Err(CliError::Validation(format!(
                            "invalid shell: '{s}'. Expected one of: bash, zsh, fish, powershell, elvish"
                        )));
                    }
                },
                None => {
                    if let Some(sub) = cli.find_subcommand_mut("completion") {
                        let _ = sub.write_help(out);
                    }
                    return Ok(PipelineOutcome::HelpShown);
                }
            }
        }
        if crate::man::wants_man(&str_args) {
            let has_help = str_args.iter().skip(1)
                .skip_while(|a| a.as_str() != "man").skip(1)
                .any(|a| a == "--help" || a == "-h");
            if has_help {
                if let Some(sub) = cli.find_subcommand_mut("man") {
                    let _ = sub.write_help(out);
                }
                return Ok(PipelineOutcome::HelpShown);
            }
            crate::man::generate_man_to(cli, &self.name, out)
                .map_err(|e| CliError::Other(e.into()))?;
            return Ok(PipelineOutcome::HelpShown);
        }

        // 3. Parse argv.
        let matches = match cli.try_get_matches_from(&args) {
            Ok(m) => m,
            Err(e)
                if e.kind() == clap::error::ErrorKind::DisplayHelp
                    || e.kind()
                        == clap::error::ErrorKind::DisplayHelpOnMissingArgumentOrSubcommand
                    || e.kind() == clap::error::ErrorKind::DisplayVersion =>
            {
                let _ = std::io::Write::write_fmt(out, format_args!("{e}"));
                let _ = out.flush();
                return Ok(PipelineOutcome::HelpShown);
            }
            Err(e) => return Err(CliError::Validation(e.to_string())),
        };

        // 3b. A profile that was named but could not be resolved is an error
        // for a real command — never a silent fallthrough to env credentials,
        // which would send the request against a tenant the caller did not
        // choose. Raised here rather than in `prepare` so `--help`,
        // `--version`, `--schema`, `completion`, `man`, and the whole
        // `profiles` group stay reachable while the profile is broken.
        if let Some(error) = profile_error {
            return Err(error);
        }

        // 3c. The pre-clap scanner and clap must agree on which profile was
        // named. They parse the same argv independently, and a spelling the
        // scanner misses but clap accepts does not fail — it silently runs
        // against whatever profile *was* installed, exit 0, against a tenant
        // the caller did not choose. That is how `-qp acme` (clap's short-flag
        // bundling) slipped through. Cheap assertion, whole class closed.
        // Skipped for the `profiles` group itself: it runs unprofiled by
        // design, and `profiles create --profile <name>` overloads the flag to
        // mean the name being created, so a mismatch there is expected.
        let invocation_is_profiles_group = self.profiles.as_ref().is_some_and(|config| {
            matches.subcommand_name() == Some(config.command_name.as_str())
        });
        if self.profiles.is_some() && !invocation_is_profiles_group {
            let from_clap = matches
                .try_get_one::<String>(crate::profiles::selection::PROFILE_FLAG)
                .ok()
                .flatten()
                .map(String::as_str);
            let installed = crate::profiles::active_name();
            if let Some(named) = from_clap {
                if installed.as_deref() != Some(named) {
                    return Err(CliError::Validation(format!(
                        "internal: `--{}` named `{named}` but `{}` was resolved. \
                         This is a bug in the profile flag scanner — please report \
                         the exact command line.",
                        crate::profiles::selection::PROFILE_FLAG,
                        installed.as_deref().unwrap_or("no profile"),
                    )));
                }
            }
        }

        // 4. Resolve which binding owns the matched subcommand.
        let (op_path, sub_matches) = resolve_op_path(&matches);

        // 3a. Intercept the always-grafted `auth` subcommand before binding
        // resolution — it's framework-owned, not spec-owned, and runs
        // synchronously without touching any binding (ADR-0007 § always-graft).
        //
        // When the spec also declares an `auth` group, only the built-in
        // credential subcommands are intercepted; everything else under
        // `auth` belongs to the spec and falls through to its binding.
        if let Some(("auth", auth_matches)) = matches.subcommand() {
            let builtin_sub = matches!(
                auth_matches.subcommand_name(),
                Some("login" | "logout" | "status")
            );
            if builtin_sub || !spec_owns_auth {
                crate::auth::login::dispatch_auth(
                    auth_matches,
                    &self.name,
                    &self.auth_bindings,
                    &self.login_flows,
                    out,
                )?;
                return Ok(PipelineOutcome::Success);
            }
        }

        // 3c. Intercept the `profiles` group, like `auth` above: it is
        // framework-owned and runs synchronously without touching a binding.
        // When the spec also declares a group of the same name, only the
        // built-in leaves are intercepted and the rest falls through.
        if let Some(ref config) = self.profiles {
            if let Some((name, profile_matches)) = matches.subcommand() {
                if name == config.command_name {
                    let builtin_sub = profile_matches.subcommand_name().is_some_and(|sub| {
                        crate::profiles::commands::BUILTIN_SUBCOMMANDS.contains(&sub)
                    });
                    if builtin_sub || !spec_owns_profiles {
                        crate::profiles::commands::dispatch_profiles(
                            profile_matches,
                            &crate::profiles::commands::ProfilesContext {
                                cli_name: &self.name,
                                bindings: &self.bindings,
                                revoke_op_path: config.revoke_op_path(),
                                command_name: &config.command_name,
                                auth_bindings: &self.auth_bindings,
                                login_flows: &self.login_flows,
                                vocabulary: &profiles_vocabulary,
                            },
                            out,
                        )
                        .await?;
                        return Ok(PipelineOutcome::Success);
                    }
                }
            }
        }

        // 4a. Check CLI-level custom commands first.
        for cc in &self.cli_commands {
            if let Some(target) = crate::custom_commands::walk_matches_to_custom(
                &matches, &cc.path, cc.cmd.get_name(),
            ) {
                // Collect contexts from ALL bindings so the handler can
                // invoke operations from any binding transparently.
                let mut ctx: Option<Box<dyn Any + Send + Sync>> = None;
                for b in &self.bindings {
                    ctx = b.merge_binding_context(&matches, ctx)?;
                }
                let ctx = ctx.unwrap_or_else(|| Box::new(()));
                (cc.handler)(target, ctx.as_ref())?;
                return Ok(PipelineOutcome::Success);
            }
        }

        let binding_idx = resolve_binding_for_leaf(&op_path, &leaf_map)
            .ok_or_else(|| {
                CliError::Discovery(format!(
                    "No binding found for command path: {}",
                    op_path.join(" "),
                ))
            })?;

        // 5. Dispatch to the binding. NO SHORTCUT — always goes through
        //    the full pipeline.
        let dispatch_result = self.bindings[binding_idx]
            .dispatch(&matches, sub_matches, &op_path)
            .await;

        // 6. Apply CliApp-scope hooks.
        match dispatch_result {
            Ok(DispatchResult::Value(value)) => {
                // Run transform_response chain.
                let transformed = self.hooks.run_transform_response(value, &op_path).await?;

                // Format and write output.
                let pipeline = formatter::OutputPipeline::from_matches(&matches, &self.name)
                    .map_err(|e| CliError::Validation(e.to_string()))?;
                pipeline
                    .emit(out, &transformed, false, true)
                    .map_err(|e| CliError::Other(e.into()))?;
                Ok(PipelineOutcome::Success)
            }
            Ok(DispatchResult::Handled) => {
                // Binding already handled output (dry-run, streaming, etc.).
                Ok(PipelineOutcome::Success)
            }
            Err(err) => {
                // Raw sentinel: bytes already on stdout, skip hooks.
                if err.is_raw_sentinel() {
                    return Err(err);
                }
                // Run recover_error chain.
                if self.hooks.has_recover_error() {
                    match self.hooks.run_recover_error(err, &op_path).await {
                        Ok(value) => {
                            let pipeline = formatter::OutputPipeline::from_matches(&matches, &self.name)
                                .map_err(|e| CliError::Validation(e.to_string()))?;
                            pipeline
                                .emit(out, &value, false, true)
                                .map_err(|e| CliError::Other(e.into()))?;
                            Ok(PipelineOutcome::Success)
                        }
                        Err(e) => Err(e),
                    }
                } else {
                    Err(err)
                }
            }
        }
    }
}

// ── Command tree helpers ────────────────────────────────────────────

/// Walk the `ArgMatches` subcommand chain to extract the operation path
/// and the leaf subcommand's matches.
fn resolve_op_path(matches: &clap::ArgMatches) -> (Vec<String>, &clap::ArgMatches) {
    let mut path = Vec::new();
    let mut current = matches;
    while let Some((name, sub)) = current.subcommand() {
        path.push(name.to_string());
        current = sub;
    }
    (path, current)
}

/// Attach `merged_subtree`'s subcommands to `cli`, then dedup-merge each
/// binding's global args / about / after_help into `cli`.
///
/// `binding_cmds` is the per-binding `clap::Command` vector already built
/// by [`merge_binding_subtrees`] — passed in so we don't call
/// `binding.build_command()` a second time.
///
/// `title_set` says whether `CliApp::title()` already provided an
/// about line — when true we don't let a binding's about override it.
fn graft_merged_subtree(
    mut cli: clap::Command,
    binding_cmds: &[clap::Command],
    merged_subtree: clap::Command,
    title_set: bool,
) -> clap::Command {
    // 1. Attach every top-level subcommand from the merged subtree,
    //    including groups named `completion`, `man`, or `auth`. The
    //    built-in counterparts are registered AFTER this graft (at step
    //    1c in `CliApp::run`) via `graft_builtin_command`, which folds
    //    them into a spec-owned group of the same name rather than
    //    letting clap see a duplicate top-level subcommand.
    for sub in merged_subtree.get_subcommands().cloned() {
        cli = cli.subcommand(sub);
    }

    // 2. Walk each binding's command for its global args, about, and
    //    after_help. Dedup by arg id (skip the root-owned globals to
    //    avoid clap panic on duplicates).
    let mut seen_arg_ids: std::collections::HashSet<String> = ROOT_OWNED_ARG_IDS
        .iter()
        .map(|id| (*id).to_string())
        // Root-owned when profiles are enabled. A binding-contributed arg of
        // the same id would otherwise be handed to clap alongside the root's,
        // and clap rejects duplicate ids for the whole tree.
        .chain(std::iter::once(
            crate::profiles::selection::PROFILE_FLAG.to_string(),
        ))
        .collect();
    let mut after_help_sections: Vec<String> = Vec::new();

    for subcmd in binding_cmds {
        for arg in subcmd.get_arguments() {
            let id = arg.get_id().as_str();
            if !seen_arg_ids.insert(id.to_string()) {
                continue;
            }
            cli = cli.arg(arg.clone());
        }
        // Carry the first binding's about into the root only when
        // CliApp::title() didn't already set one.
        if !title_set {
            if let Some(about) = subcmd.get_about() {
                cli = cli.about(about.to_string());
            }
        }
        if let Some(help) = subcmd.get_after_help() {
            after_help_sections.push(help.to_string());
        }
    }
    if !after_help_sections.is_empty() {
        cli = cli.after_help(deduplicate_after_help(&after_help_sections));
    }
    cli
}

/// Graft a framework-owned built-in command (`completion`, `man`, `auth`)
/// into `cli`.
///
/// When no spec-owned group shares the built-in's name this is a plain
/// `.subcommand(...)`. When one does — e.g. an API with an `auth` resource
/// group — the built-in's subcommands are folded into the spec-owned group
/// so both surfaces stay reachable (`<bin> auth login` and `<bin> auth me`).
/// Exact leaf collisions follow the `graft_subcommand` rule: the
/// framework-owned leaf wins.
fn graft_builtin_command(cli: clap::Command, builtin: clap::Command) -> clap::Command {
    let name = builtin.get_name().to_string();
    if cli.find_subcommand(&name).is_none() {
        return cli.subcommand(builtin);
    }

    let builtin_subs: Vec<clap::Command> = builtin.get_subcommands().cloned().collect();
    if builtin_subs.is_empty() {
        // Leaf built-in (`completion`, `man`) — nothing to fold, and both
        // are intercepted pre-clap anyway, so the built-in wins.
        return cli.mut_subcommand(name, move |_spec_owned| builtin);
    }
    let builtin_about = builtin.get_about().map(ToString::to_string);
    let builtin_long_about = builtin.get_long_about().map(ToString::to_string);
    let generic_about = crate::openapi::commands::generic_group_about(&name);
    cli.mut_subcommand(name, move |spec_owned| {
        let mut merged = spec_owned;
        let spec_uses_generic_about = merged
            .get_about()
            .is_none_or(|about| about.to_string() == generic_about);
        if spec_uses_generic_about {
            if let Some(about) = builtin_about {
                merged = merged.about(about);
            }
            if let Some(long_about) = builtin_long_about {
                merged = merged.long_about(long_about);
            }
        }
        for sub in builtin_subs {
            merged = crate::custom_commands::graft_subcommand(merged, &[], sub);
        }
        merged
    })
}

/// Clap arg ids the root `CliApp` registers itself.
///
/// A binding that contributes an arg with one of these ids does not get a
/// second copy — clap rejects duplicate ids for the whole tree — so the
/// root's wins and the binding's is dropped. That is fine for a duplicate
/// *flag*, and dangerous for a credential: see
/// [`reject_reserved_auth_arg_ids`].
///
/// `user-agent-suffix` is the arg's id, which is stable even when the long
/// name is renamed via `userAgentSuffixFlag`.
const ROOT_OWNED_ARG_IDS: &[&str] = &[
    "format",
    "human",
    "base-url",
    "user-agent-suffix",
    "schema",
    "spec",
    "spec-raw",
    "help",
    "version",
];

/// True when `id` is a clap arg id the root owns for this binary.
///
/// `profile` is included only when profiles are enabled, matching the
/// conditional long-name reservation in
/// [`crate::openapi::commands::flag_name_is_reserved`].
pub(crate) fn root_owns_arg_id(id: &str) -> bool {
    ROOT_OWNED_ARG_IDS.contains(&id) || crate::profiles::collides_with_profile_flag(id)
}

/// Reject an auth credential source bound to a CLI flag whose clap id the
/// root already owns.
///
/// Without this the arg is silently dropped by `graft_merged_subtree`'s
/// dedup — and because `AuthCredentialSource::Cli` resolves *by id*, it then
/// reads the **root flag's** value. An `ApiKeyAuth` bound to `cli("profile")`
/// on a profiles-enabled CLI sends `Authorization: <profile name>`; bound to
/// `cli("format")` it sends `json`. The credential is silently replaced by an
/// unrelated user-supplied string, which is worse than either a panic or a
/// missing credential.
///
/// Rejected rather than renamed: a credential flag is a documented entry
/// point, and moving it out from under the user is its own surprise. The
/// author's fix is to pick another name, and the error fires on the first
/// invocation — so this surfaces in development, not in a customer's shell.
pub(crate) fn reject_reserved_auth_arg_ids(cli_auth_args: &[String]) -> Result<(), CliError> {
    let offenders: Vec<&str> = cli_auth_args
        .iter()
        .map(String::as_str)
        .filter(|name| root_owns_arg_id(name))
        .collect();
    if offenders.is_empty() {
        return Ok(());
    }
    Err(CliError::Validation(format!(
        "auth credential flag(s) {} collide with flags this CLI already registers \
         globally, so the credential would resolve to the global flag's value \
         instead of the user's. Bind the scheme to a different flag name (or to \
         an env var). Reserved: {}.",
        offenders
            .iter()
            .map(|name| format!("`--{name}`"))
            .collect::<Vec<_>>()
            .join(", "),
        ROOT_OWNED_ARG_IDS.join(", "),
    )))
}

/// `(binding_idx, full_leaf_path)` for every leaf in a merged command tree.
type LeafMap = Vec<(usize, Vec<String>)>;

/// Deep-merge the subtrees contributed by all bindings into a single
/// placeholder `clap::Command` and build a leaf-path → binding-index map.
///
/// **Returns** `(merged_subtree, leaf_map, binding_cmds)` where:
/// - `merged_subtree` is a `clap::Command::new("__merged_subtree__")` whose
///   top-level subcommands are the union of all bindings' top-level
///   subcommands, deep-merged at every level so two bindings can
///   contribute disjoint children under the same group;
/// - `leaf_map` is a [`LeafMap`] of `(binding_idx, full_leaf_path)` entries,
///   one per leaf in the merged tree;
/// - `binding_cmds` is each binding's raw `clap::Command` (in registration
///   order) — handed back so callers can read global args / about /
///   after_help without invoking `binding.build_command()` a second time.
///
/// **Errors** with `CliError::Validation` when two bindings declare the
/// exact same full leaf path — those would collide unrecoverably at
/// dispatch, so we surface the colliding path(s) up-front.
fn merge_binding_subtrees(
    bindings: &[Box<dyn Binding>],
) -> Result<(clap::Command, LeafMap, Vec<clap::Command>), CliError> {
    // 1. Build each binding's clap command.
    let mut binding_cmds: Vec<clap::Command> = Vec::with_capacity(bindings.len());
    for b in bindings {
        binding_cmds.push(b.build_command()?);
    }

    // 2. Collect every leaf path with its owning binding index.
    let mut leaf_map: LeafMap = Vec::new();
    for (idx, cmd) in binding_cmds.iter().enumerate() {
        for sub in cmd.get_subcommands() {
            let mut path = vec![sub.get_name().to_string()];
            collect_leaves(sub, &mut path, idx, &mut leaf_map);
        }
    }

    // 3. Detect leaf-path collisions across bindings. Two leaves with
    //    the same path but different owning binding indexes are a
    //    collision; identical owner (same idx) is just a duplicate
    //    within one binding's tree and not our concern here.
    //
    //    Intrinsic top-level commands every binding registers (e.g.
    //    `generate-skills`) are functionally identical across bindings —
    //    `merge_command_subtree` produces a single node for them — so
    //    they're exempt from collision detection. Without this exemption
    //    every multi-binding CliApp would fail validation on the
    //    binding-emitted intrinsics alone. See d683bd7 (square panic).
    let mut by_path: std::collections::BTreeMap<Vec<String>, std::collections::BTreeSet<usize>> =
        std::collections::BTreeMap::new();
    for (idx, path) in &leaf_map {
        if is_intrinsic_top_level_leaf(path) {
            continue;
        }
        by_path.entry(path.clone()).or_default().insert(*idx);
    }
    let collisions: Vec<String> = by_path
        .into_iter()
        .filter(|(_, owners)| owners.len() > 1)
        .map(|(path, _)| path.join(" "))
        .collect();
    if !collisions.is_empty() {
        return Err(CliError::Validation(format!(
            "colliding leaf command path(s): {}",
            collisions.join(", "),
        )));
    }

    // 4. Deep-merge each binding's top-level subcommands into a placeholder.
    let mut merged = clap::Command::new("__merged_subtree__");
    for cmd in &binding_cmds {
        for sub in cmd.get_subcommands().cloned() {
            merged = merge_command_subtree(merged, sub);
        }
    }

    Ok((merged, leaf_map, binding_cmds))
}

/// Find which binding index owns the leaf matched by `op_path`.
///
/// Returns `None` for empty paths or unknown paths.
fn resolve_binding_for_leaf(op_path: &[String], leaf_map: &LeafMap) -> Option<usize> {
    if op_path.is_empty() {
        return None;
    }
    leaf_map
        .iter()
        .find(|(_, leaf)| leaf.as_slice() == op_path)
        .map(|(idx, _)| *idx)
}

/// Names of leaf top-level commands that every binding emits identically
/// (e.g. `generate-skills` from `OpenApiBinding::build_command`). When two
/// bindings each contribute one, the deep-merge produces a single node;
/// the collision detector would otherwise flag them as user-facing
/// conflicts. Exempting them here mirrors the pre-ACP-1.1 intrinsic
/// dedup that d683bd7 introduced for the same square `generate-skills`
/// panic.
fn is_intrinsic_top_level_leaf(path: &[String]) -> bool {
    matches!(path, [name] if name == "generate-skills")
}

/// DFS over a `clap::Command` subtree, pushing `(idx, path.clone())` for
/// every leaf (subcommand with no further subcommands).
fn collect_leaves(cmd: &clap::Command, path: &mut Vec<String>, idx: usize, out: &mut LeafMap) {
    let mut has_child = false;
    for sub in cmd.get_subcommands() {
        has_child = true;
        path.push(sub.get_name().to_string());
        collect_leaves(sub, path, idx, out);
        path.pop();
    }
    if !has_child {
        out.push((idx, path.clone()));
    }
}

/// Deep-merge `incoming` into `parent`. If `parent` already has a
/// subcommand with the same name, recurse into it via `mut_subcommand`;
/// otherwise attach `incoming` as a fresh subcommand. Leaf collisions
/// (two subcommands with identical names and no further children) are
/// not detected here — the caller has already vetted leaf paths via
/// `merge_binding_subtrees`.
///
/// Note: `merge_binding_subtrees` matches on full leaf paths, so it
/// catches the common collision case (two bindings contribute the
/// same operation). It does **not** catch partial-path shadowing —
/// e.g. binding A contributes `users` as a leaf operation while
/// binding B contributes `users → list`. After this merge `users`
/// gains a subcommand, so clap requires a subcommand selection and
/// binding A's leaf operation becomes unreachable. OpenAPI bindings
/// generated from `x-fern-sdk-group-name` structure operations as
/// leaves *under* groups (not at the group level itself), so this
/// case is structurally unreachable for spec-driven bindings; it
/// can only arise from hand-rolled `.command(...)` registrations
/// that mix leaf and group nodes at the same path.
fn merge_command_subtree(
    parent: clap::Command,
    incoming: clap::Command,
) -> clap::Command {
    let incoming_name = incoming.get_name().to_string();
    if parent.find_subcommand(&incoming_name).is_some() {
        // Recurse: deep-merge incoming's children into the existing subcommand.
        parent.mut_subcommand(incoming_name, move |mut existing| {
            for child in incoming.get_subcommands().cloned() {
                existing = merge_command_subtree(existing, child);
            }
            existing
        })
    } else {
        parent.subcommand(incoming)
    }
}

/// Apply a transform to the command at `path` using clap's
/// `mut_subcommand` to walk the tree. Parent commands are never
/// rebuilt — only the leaf is transformed — so all clap settings on
/// every ancestor are preserved automatically, regardless of what
/// settings clap adds in future versions.
fn modify_at_path(
    cmd: clap::Command,
    path: &[String],
    transform: &dyn Fn(clap::Command) -> clap::Command,
) -> clap::Command {
    if path.is_empty() {
        return transform(cmd);
    }
    let head = path[0].clone();
    let rest = path[1..].to_vec();
    cmd.mut_subcommand(head, move |sub| modify_at_path(sub, &rest, transform))
}

/// Apply a clap alias to the command at `path`.
fn apply_alias(cli: clap::Command, path: &[String], alias: &str) -> clap::Command {
    let alias_owned = alias.to_string();
    modify_at_path(cli, path, &|c| c.visible_alias(alias_owned.clone()))
}

/// Apply `hide(true)` to the command at `path`.
fn apply_hide(cli: clap::Command, path: &[String]) -> clap::Command {
    modify_at_path(cli, path, &|c| c.hide(true))
}

/// Apply a stability badge to the command at `path`.
fn apply_stability(cli: clap::Command, path: &[String], stability: &Stability) -> clap::Command {
    modify_at_path(cli, path, &|c| {
        if let Some(badge) = stability.badge() {
            let about = c
                .get_about()
                .map(|a| format!("{badge} {a}"))
                .unwrap_or_else(|| badge.to_string());
            c.about(about)
        } else {
            c
        }
    })
}

/// Merge multiple `after_help` sections, deduplicating identical blocks
/// while preserving first-seen order. Blocks are delimited by blank
/// lines (`\n\n`). This handles multi-line entries (e.g. auth sections
/// spanning several lines) as atomic units — they're either kept or
/// dropped as a whole, never split.
fn deduplicate_after_help(sections: &[String]) -> String {
    let mut seen = std::collections::HashSet::new();
    let mut blocks = Vec::new();
    for section in sections {
        // Split each section into blank-line-delimited blocks.
        for block in section.split("\n\n") {
            let trimmed = block.trim();
            if !trimmed.is_empty() && seen.insert(trimmed.to_string()) {
                blocks.push(trimmed.to_string());
            }
        }
    }
    blocks.join("\n\n")
}

/// Static description of every CLI-level affordance the harness exposes
/// on every operation, surfaced under the root `--schema` output's
/// `globalFlags` key per ADR-0006. Per-op flags (`--page-all`,
/// `--output PATH`) are NOT in this list — those surface via per-op
/// capability hints (`paginable`, `binaryResponse`).
fn global_flags(
    cli_name: &str,
    profiles: Option<&crate::profiles::ProfilesConfig>,
) -> Vec<serde_json::Value> {
    let mut flags = vec![
        serde_json::json!({
            "flag": "--schema",
            "description": "Emit the machine-readable command surface as JSON (agent-facing counterpart to --help)",
        }),
        serde_json::json!({
            "flag": "--dry-run",
            "description": "Validate the request locally without sending it to the API",
        }),
        serde_json::json!({
            "flag": "--format",
            "valueName": "FORMAT",
            "description": "Output format: json, table, yaml, csv, raw, jsonl, http. Default: table when stdout is a TTY, json when piped",
        }),
        serde_json::json!({
            "flag": "--base-url",
            "valueName": "URL",
            "description": "Override the API base URL (e.g. for testing against a mock server)",
        }),
        serde_json::json!({
            "flag": format!("--{}", crate::user_agent::suffix_flag()),
            "valueName": "TOKEN",
            "description": format!(
                "Product token appended to the User-Agent (e.g. my-app/1.0). Takes precedence over <NAME>{}.",
                crate::user_agent::suffix_env_segment()
            ),
        }),
        serde_json::json!({
            "flag": "--quiet",
            "description": "Suppress stdout output on success (errors still go to stderr)",
        }),
        serde_json::json!({
            "flag": "--debug",
            "description": "Dump HTTP request and response to stderr",
        }),
        serde_json::json!({
            "flag": "--query",
            "valueName": "EXPR",
            "description": "JMESPath expression applied to the response before formatting. For streaming responses, events whose projection is null are suppressed (use as a per-event filter).",
        }),
        serde_json::json!({
            "flag": "--spec",
            "description": "Print the effective OpenAPI spec (source + overlays + overrides merged) to stdout",
        }),
        serde_json::json!({
            "flag": "--spec-raw",
            "description": "Print the byte-exact embedded source OpenAPI spec(s) to stdout",
        }),
        // Registered on every operation command, so genuinely global from an
        // agent's point of view even though they are not clap `global(true)`
        // args. Their absence meant an agent reading `--schema` did not know
        // `--params` or `--no-retry` existed at all.
        serde_json::json!({
            "flag": "--params",
            "description": "Supply parameters as a JSON object instead of individual flags; overrides them where both are given",
        }),
        serde_json::json!({
            "flag": "--no-retry",
            "description": "Disable retries declared by x-fern-retries on this operation, including network errors",
        }),
        serde_json::json!({
            "flag": "--no-extract",
            "description": "Disable x-fern-sdk-return-value extraction and print the full response body",
        }),
        serde_json::json!({
            "flag": "--help",
            "description": "Print help for this scope (human-readable counterpart to --schema)",
        }),
    ];
    // Only advertised when the generator opted into profiles — an agent must
    // not be told about a flag this binary will reject.
    if let Some(config) = profiles {
        flags.push(serde_json::json!({
            "flag": "--profile",
            "alias": "-p",
            "valueName": "NAME",
            // The real env var, not `<NAME>_PROFILE`: an agent reading
            // `--schema` has to be able to act on what it finds here.
            "description": format!(
                "Run this command under a named profile (see `{}`), overriding \
                 the {} env var and the active profile",
                config.command_name,
                crate::profiles::selection::profile_env_var(cli_name),
            ),
        }));
    }
    flags
}

/// Describe the framework-owned built-in commands for `--schema`.
///
/// `auth`, `profiles`, `completion` and `man` are grafted onto the tree at
/// dispatch time but are not API operations, so they were absent from
/// `--schema` entirely — a hole an agent cannot see past. It reads
/// `--schema`, concludes the CLI has no way to authenticate or to switch
/// tenant, and cannot discover otherwise.
///
/// Derived by walking the same `clap::Command`s that are actually grafted,
/// so the description can never drift from the surface.
fn builtin_commands(
    profiles: Option<&crate::profiles::ProfilesConfig>,
    vocabulary: &crate::profiles::commands::Vocabulary,
) -> Vec<serde_json::Value> {
    let mut commands: Vec<clap::Command> = vec![
        crate::auth::login::build_auth_command(),
        crate::completions::completion_command(),
        crate::man::man_command(),
    ];
    if let Some(config) = profiles {
        commands.push(crate::profiles::commands::build_profiles_command(
            config,
            vocabulary,
        ));
    }

    let mut out = Vec::new();
    for command in &commands {
        describe_builtin_leaves(command, &mut Vec::new(), &mut out);
    }
    out
}

/// Push one `--schema` entry per leaf of a built-in command's subtree.
///
/// A group with subcommands (`auth`) contributes its leaves (`auth login`,
/// `auth logout`, …) rather than itself, matching how spec operations are
/// listed: an agent needs the thing it can actually invoke.
fn describe_builtin_leaves(
    command: &clap::Command,
    path: &mut Vec<String>,
    out: &mut Vec<serde_json::Value>,
) {
    path.push(command.get_name().to_string());
    let mut has_child = false;
    for sub in command.get_subcommands() {
        has_child = true;
        describe_builtin_leaves(sub, path, out);
    }
    if !has_child {
        let flags: Vec<serde_json::Value> = command
            .get_arguments()
            .filter(|arg| !matches!(arg.get_action(), clap::ArgAction::Help))
            .map(|arg| {
                let mut entry = serde_json::Map::new();
                match arg.get_long() {
                    Some(long) => entry.insert("flag".into(), format!("--{long}").into()),
                    // A required positional (`completion <SHELL>`,
                    // `profiles use <NAME>`) has no long form; name it by its
                    // value placeholder so the invocation is still derivable.
                    None => entry.insert(
                        "argument".into(),
                        arg.get_value_names()
                            .and_then(|names| names.first())
                            .map(|name| name.to_string())
                            .unwrap_or_else(|| arg.get_id().as_str().to_string())
                            .into(),
                    ),
                };
                if let Some(help) = arg.get_help() {
                    entry.insert("description".into(), help.to_string().into());
                }
                if arg.is_required_set() {
                    entry.insert("required".into(), true.into());
                }
                serde_json::Value::Object(entry)
            })
            .collect();
        let mut entry = serde_json::Map::new();
        entry.insert("command".into(), path.join(" ").into());
        if let Some(about) = command.get_about() {
            entry.insert("description".into(), about.to_string().into());
        }
        if !flags.is_empty() {
            entry.insert("flags".into(), serde_json::Value::Array(flags));
        }
        out.push(serde_json::Value::Object(entry));
    }
    path.pop();
}

// ── Tests ───────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_op_path_extracts_chain() {
        let cmd = clap::Command::new("test")
            .subcommand(
                clap::Command::new("users").subcommand(clap::Command::new("get")),
            );
        let matches = cmd
            .try_get_matches_from(["test", "users", "get"])
            .unwrap();
        let (path, _) = resolve_op_path(&matches);
        assert_eq!(path, vec!["users".to_string(), "get".to_string()]);
    }

    // ── Helpers for merge_binding_subtrees / resolve_binding_for_leaf ──

    /// Minimal Binding stub for unit-testing the merge helpers.
    struct TestBinding {
        name: String,
        command: clap::Command,
    }

    impl TestBinding {
        fn new(name: &str, command: clap::Command) -> Self {
            Self { name: name.to_string(), command }
        }
    }

    impl Binding for TestBinding {
        fn name(&self) -> &str { &self.name }
        fn set_cli_name(&mut self, _name: &str) {}
        fn build_command(&self) -> Result<clap::Command, CliError> {
            Ok(self.command.clone())
        }
        fn dispatch<'a>(
            &'a self,
            _root: &'a clap::ArgMatches,
            _sub: &'a clap::ArgMatches,
            _op: &'a [String],
        ) -> crate::binding::BoxFuture<'a, Result<DispatchResult, CliError>> {
            Box::pin(async { Ok(DispatchResult::Handled) })
        }
    }

    fn p(s: &[&str]) -> Vec<String> {
        s.iter().map(|x| x.to_string()).collect()
    }

    #[test]
    fn merge_disjoint_top_levels() {
        // Binding A: users → list ; Binding B: posts → get
        let a = clap::Command::new("a")
            .subcommand(clap::Command::new("users").subcommand(clap::Command::new("list")));
        let b = clap::Command::new("b")
            .subcommand(clap::Command::new("posts").subcommand(clap::Command::new("get")));
        let bindings: Vec<Box<dyn Binding>> = vec![
            Box::new(TestBinding::new("a", a)),
            Box::new(TestBinding::new("b", b)),
        ];

        let (merged, leaf_map, _) = merge_binding_subtrees(&bindings).expect("merge ok");

        // Both top-level groups present.
        assert!(merged.find_subcommand("users").is_some(), "users should be present");
        assert!(merged.find_subcommand("posts").is_some(), "posts should be present");

        // Both leaves owned by their respective binding indexes.
        assert_eq!(resolve_binding_for_leaf(&p(&["users", "list"]), &leaf_map), Some(0));
        assert_eq!(resolve_binding_for_leaf(&p(&["posts", "get"]), &leaf_map), Some(1));
    }

    #[test]
    fn merge_overlapping_top_levels_disjoint_leaves() {
        // A: convai → agents → list ; B: convai → conversations → get
        let a = clap::Command::new("a").subcommand(
            clap::Command::new("convai")
                .subcommand(clap::Command::new("agents").subcommand(clap::Command::new("list"))),
        );
        let b = clap::Command::new("b").subcommand(
            clap::Command::new("convai")
                .subcommand(
                    clap::Command::new("conversations").subcommand(clap::Command::new("get")),
                ),
        );
        let bindings: Vec<Box<dyn Binding>> = vec![
            Box::new(TestBinding::new("a", a)),
            Box::new(TestBinding::new("b", b)),
        ];

        let (merged, leaf_map, _) = merge_binding_subtrees(&bindings).expect("merge ok");

        let convai = merged
            .find_subcommand("convai")
            .expect("convai should be merged into one parent");
        assert!(convai.find_subcommand("agents").is_some(), "agents should be present");
        assert!(
            convai.find_subcommand("conversations").is_some(),
            "conversations should be present",
        );

        assert_eq!(
            resolve_binding_for_leaf(&p(&["convai", "agents", "list"]), &leaf_map),
            Some(0),
        );
        assert_eq!(
            resolve_binding_for_leaf(&p(&["convai", "conversations", "get"]), &leaf_map),
            Some(1),
        );
    }

    #[test]
    fn merge_detects_leaf_collision() {
        // Both bindings declare users → list (full leaf-path collision).
        let a = clap::Command::new("a")
            .subcommand(clap::Command::new("users").subcommand(clap::Command::new("list")));
        let b = clap::Command::new("b")
            .subcommand(clap::Command::new("users").subcommand(clap::Command::new("list")));
        let bindings: Vec<Box<dyn Binding>> = vec![
            Box::new(TestBinding::new("a", a)),
            Box::new(TestBinding::new("b", b)),
        ];

        let err = merge_binding_subtrees(&bindings).expect_err("collision must error");
        match err {
            CliError::Validation(msg) => {
                assert!(
                    msg.contains("users list"),
                    "collision message must list path 'users list', got: {msg}",
                );
            }
            other => panic!("expected Validation, got {other:?}"),
        }
    }

    #[test]
    fn merge_exempts_intrinsic_generate_skills_from_collision() {
        // Two bindings that BOTH expose the binding-emitted intrinsic
        // `generate-skills` top-level leaf plus disjoint user-facing
        // subtrees. The intrinsic must NOT trip the collision detector
        // (the deep-merge produces a single node for it); only true
        // user-facing collisions should error.
        let a = clap::Command::new("a")
            .subcommand(clap::Command::new("users").subcommand(clap::Command::new("list")))
            .subcommand(clap::Command::new("generate-skills"));
        let b = clap::Command::new("b")
            .subcommand(clap::Command::new("posts").subcommand(clap::Command::new("get")))
            .subcommand(clap::Command::new("generate-skills"));
        let bindings: Vec<Box<dyn Binding>> = vec![
            Box::new(TestBinding::new("a", a)),
            Box::new(TestBinding::new("b", b)),
        ];

        let (merged, _leaf_map, _) =
            merge_binding_subtrees(&bindings).expect("intrinsic dedup should not error");

        assert!(
            merged.find_subcommand("generate-skills").is_some(),
            "merged tree must keep a single `generate-skills` node",
        );
        // Sanity check the disjoint user-facing subtrees survived too.
        assert!(merged.find_subcommand("users").is_some());
        assert!(merged.find_subcommand("posts").is_some());
    }

    #[test]
    fn graft_builtin_folds_into_spec_owned_group() {
        // A spec that declares its own `auth` resource group keeps every
        // operation in it, and still gets the built-in credential
        // subcommands folded in alongside.
        let spec = clap::Command::new("root").subcommand(
            clap::Command::new("auth")
                .subcommand(clap::Command::new("me"))
                .subcommand(clap::Command::new("revoke")),
        );
        let cli = graft_builtin_command(spec, crate::auth::login::build_auth_command());

        let auth = cli.find_subcommand("auth").expect("auth group survives");
        for name in ["me", "revoke", "login", "logout", "status"] {
            assert!(
                auth.find_subcommand(name).is_some(),
                "`auth {name}` should be reachable",
            );
        }

        // And the merged tree actually parses the spec-owned operation.
        let matches = cli
            .clone()
            .try_get_matches_from(["root", "auth", "me"])
            .expect("`auth me` should parse");
        let (path, _) = resolve_op_path(&matches);
        assert_eq!(path, p(&["auth", "me"]));
    }

    #[test]
    fn graft_builtin_wins_on_exact_leaf_collision() {
        // A spec operation named exactly like a built-in loses to the
        // framework leaf — same rule as `graft_subcommand`.
        let spec = clap::Command::new("root").subcommand(
            clap::Command::new("auth")
                .subcommand(clap::Command::new("login").about("spec-owned")),
        );
        let cli = graft_builtin_command(spec, crate::auth::login::build_auth_command());

        let login = cli
            .find_subcommand("auth")
            .and_then(|a| a.find_subcommand("login"))
            .expect("login present");
        assert!(login.get_arguments().any(|a| a.get_id() == "with-token"));
    }

    #[test]
    fn graft_builtin_about_wins_over_generic_spec_fallback() {
        let spec = clap::Command::new("root").subcommand(
            clap::Command::new("auth")
                .about(crate::openapi::commands::generic_group_about("auth"))
                .subcommand(clap::Command::new("me")),
        );
        let cli = graft_builtin_command(spec, crate::auth::login::build_auth_command());
        let auth = cli.find_subcommand("auth").expect("auth group survives");
        assert_eq!(
            auth.get_about().map(ToString::to_string).as_deref(),
            Some("Manage credentials (login / logout / status)"),
        );
    }

    #[test]
    fn graft_builtin_preserves_real_spec_about() {
        let spec = clap::Command::new("root").subcommand(
            clap::Command::new("auth")
                .about("API authentication operations")
                .subcommand(clap::Command::new("me")),
        );
        let cli = graft_builtin_command(spec, crate::auth::login::build_auth_command());
        let auth = cli.find_subcommand("auth").expect("auth group survives");
        assert_eq!(
            auth.get_about().map(ToString::to_string).as_deref(),
            Some("API authentication operations"),
        );
    }

    #[test]
    fn graft_builtin_registers_when_no_collision() {
        let cli = graft_builtin_command(
            clap::Command::new("root").subcommand(clap::Command::new("users")),
            crate::auth::login::build_auth_command(),
        );
        assert_eq!(
            cli.find_subcommand("auth")
                .and_then(|auth| auth.get_about())
                .map(ToString::to_string)
                .as_deref(),
            Some("Manage credentials (login / logout / status)"),
        );
        assert!(cli.find_subcommand("users").is_some());
    }

    #[test]
    fn resolve_binding_for_leaf_finds_owner() {
        let leaf_map: LeafMap = vec![
            (0, p(&["users", "list"])),
            (1, p(&["posts", "get"])),
            (1, p(&["posts", "list"])),
        ];

        // Known path → Some(owner index).
        assert_eq!(resolve_binding_for_leaf(&p(&["users", "list"]), &leaf_map), Some(0));
        assert_eq!(resolve_binding_for_leaf(&p(&["posts", "get"]), &leaf_map), Some(1));

        // Unknown path → None.
        assert_eq!(resolve_binding_for_leaf(&p(&["unknown"]), &leaf_map), None);

        // Empty path → None.
        assert_eq!(resolve_binding_for_leaf(&[], &leaf_map), None);
    }

    #[test]
    fn cli_app_must_use() {
        // This test verifies the builder compiles — #[must_use]
        // would fire a warning if the value were dropped without use.
        let _app = CliApp::new("test");
    }

    #[test]
    fn deduplicate_after_help_removes_identical_blocks() {
        let a = "Environment variables:\n  BOX_BASE_URL  Override\n  BOX_CA_BUNDLE  Path".to_string();
        let b = "Environment variables:\n  BOX_BASE_URL  Override\n  BOX_CA_BUNDLE  Path".to_string();
        let result = deduplicate_after_help(&[a, b]);
        assert_eq!(
            result,
            "Environment variables:\n  BOX_BASE_URL  Override\n  BOX_CA_BUNDLE  Path",
        );
    }

    #[test]
    fn deduplicate_after_help_preserves_unique_blocks() {
        let a = "Auth:\n  bearer via API_KEY".to_string();
        let b = "Environment variables:\n  BOX_BASE_URL  Override".to_string();
        let result = deduplicate_after_help(&[a, b]);
        assert_eq!(
            result,
            "Auth:\n  bearer via API_KEY\n\nEnvironment variables:\n  BOX_BASE_URL  Override",
        );
    }

    #[test]
    fn deduplicate_after_help_multiline_blocks_are_atomic() {
        // Two bindings with identical multi-line env block but
        // different auth blocks — env block appears once, both auth kept.
        let env_block = "Environment variables:\n  BOX_BASE_URL  Override\n  BOX_CA_BUNDLE  Path";
        let a = format!("Auth:\n  bearer via API_KEY\n\n{env_block}");
        let b = format!("Auth:\n  basic via SECRET\n\n{env_block}");
        let result = deduplicate_after_help(&[a, b]);
        assert_eq!(
            result,
            format!("Auth:\n  bearer via API_KEY\n\n{env_block}\n\nAuth:\n  basic via SECRET"),
        );
    }

    #[test]
    fn deduplicate_after_help_real_world_footer() {
        // Simulates two bindings with the same binary name producing
        // identical env var + standard-env-var blocks.
        let section = "Environment variables:\n  BOX_BASE_URL  Override\n  BOX_TIMEOUT_SECS  Timeout\n\nStandard env vars are also honored.";
        let result = deduplicate_after_help(&[section.to_string(), section.to_string()]);
        assert_eq!(result, section);
    }
}
