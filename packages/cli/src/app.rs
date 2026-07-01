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
    /// Optional base URL for per-status-code error documentation links.
    /// When set, API errors append `<base_url>/<http_status_code>` to stderr.
    error_docs_base_url: Option<String>,
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
            error_docs_base_url: None,
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
        let _ = dotenvy::dotenv();
        crate::init_logging(&self.name);

        self.propagate_root_auth();

        let args: Vec<std::ffi::OsString> = args.into_iter().map(Into::into).collect();
        let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
        let mut out = std::io::stdout().lock();
        let exit = rt.block_on(self.run_inner(args, &mut out));
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
        self.propagate_root_auth();
        let args: Vec<std::ffi::OsString> = args.into_iter().map(Into::into).collect();
        let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
        let mut out = std::io::stdout().lock();
        rt.block_on(self.run_inner(args, &mut out))
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
        self.propagate_root_auth();
        let args: Vec<std::ffi::OsString> = args.into_iter().map(Into::into).collect();
        let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
        rt.block_on(self.run_inner(args, out))
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
    async fn run_inner<W: std::io::Write>(&self, args: Vec<std::ffi::OsString>, out: &mut W) -> i32 {
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
        };
        match self.dispatch_pipeline(args, out).await {
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
        if crate::cli_args::wants_schema(&str_args) {
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
                    serde_json::Value::Array(global_flags()),
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
            return Err(CliError::Discovery(format!(
                "--schema: no binding contains path `{}`",
                path.join(" ")
            )));
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
            .arg(
                clap::Arg::new("base-url")
                    .long("base-url")
                    .help("Override the API base URL (e.g. for testing against a mock server)")
                    .value_name("URL")
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

        // Deep-merge every binding's subtree into one placeholder
        // command and build the full leaf-path → binding-index map.
        // Errors surface (as `CliError::Validation`) if two bindings
        // declare the same full leaf path — before any dispatch.
        let (merged_subtree, leaf_map, binding_cmds) =
            merge_binding_subtrees(&self.bindings)?;

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
        cli = cli
            .subcommand(crate::completions::completion_command())
            .subcommand(crate::man::man_command())
            .subcommand(crate::auth::login::build_auth_command());

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

        // 1e. Validate hook patterns against the command tree.
        self.hooks.validate_patterns(&cli)?;

        // 1f. Intercept `completion` and `man` before clap parses.
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

        // 4. Resolve which binding owns the matched subcommand.
        let (op_path, sub_matches) = resolve_op_path(&matches);

        // 3a. Intercept the always-grafted `auth` subcommand before binding
        // resolution — it's framework-owned, not spec-owned, and runs
        // synchronously without touching any binding (ADR-0007 § always-graft).
        if let Some(("auth", auth_matches)) = matches.subcommand() {
            crate::auth::login::dispatch_auth(
                auth_matches,
                &self.name,
                &self.auth_bindings,
                &self.login_flows,
                out,
            )?;
            return Ok(PipelineOutcome::Success);
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
    // 1. Attach every top-level subcommand from the merged subtree.
    //    Skip subcommands named `completion`, `man`, or `auth` — the
    //    built-in counterparts are registered AFTER this graft (at
    //    step 1c in `CliApp::run`) and clap panics on duplicate
    //    top-level subcommands. `auth` is the always-grafted framework
    //    surface for `auth login` / `logout` / `status` (ADR-0007).
    //    No known spec uses these names, but the guard matches the old
    //    pre-refactor behavior and keeps us safe against adversarial specs.
    for sub in merged_subtree.get_subcommands().cloned() {
        if matches!(sub.get_name(), "completion" | "man" | "auth") {
            continue;
        }
        cli = cli.subcommand(sub);
    }

    // 2. Walk each binding's command for its global args, about, and
    //    after_help. Dedup by arg id (skip the root-owned globals to
    //    avoid clap panic on duplicates).
    let mut seen_arg_ids: std::collections::HashSet<String> = [
        "format".to_string(),
        "base-url".to_string(),
        "schema".to_string(),
        "spec".to_string(),
        "spec-raw".to_string(),
        "help".to_string(),
        "version".to_string(),
    ]
    .into();
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
fn global_flags() -> Vec<serde_json::Value> {
    vec![
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
    ]
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
