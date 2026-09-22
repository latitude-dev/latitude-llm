//! Binding trait — the async interface that protocol-specific adapters
//! (`OpenApiBinding`, `GraphqlBinding`) implement so the root [`CliApp`]
//! can compose them into a single CLI.
//!
//! [`CliApp`]: crate::app::CliApp

use std::any::Any;
use std::future::Future;
use std::pin::Pin;

use crate::auth::SchemeBinding;
use crate::error::CliError;

/// A boxed future used by binding methods.
pub type BoxFuture<'a, T> = Pin<Box<dyn Future<Output = T> + Send + 'a>>;

/// Outcome of a binding dispatch — either a decoded JSON value ready for
/// the root hook pipeline, or a signal that the binding handled output
/// itself (e.g. `--dry-run`, binary download, streaming).
pub enum DispatchResult {
    /// A decoded response value. The root `CliApp` will run
    /// `transform_response` / `recover_error` hooks and then format it.
    Value(serde_json::Value),
    /// The binding already wrote output (dry-run, streaming, file download).
    /// The root `CliApp` skips its own formatting.
    Handled,
}

/// The async interface every protocol adapter must implement.
///
/// A binding owns one logical API surface (one or more specs sharing
/// auth / transport config). The root `CliApp` holds
/// `Vec<Box<dyn Binding>>` and delegates to the matched binding after
/// resolving which subcommand the user invoked.
pub trait Binding: Send + Sync {
    /// Human-readable name for this binding (used in diagnostics).
    fn name(&self) -> &str;

    /// Called by `CliApp::binding()` to propagate the CLI name to this
    /// binding. HTTP config, logging env vars, and base-URL resolution
    /// are CLI-level concerns that derive from this name.
    fn set_cli_name(&mut self, name: &str);

    /// Build the `clap::Command` subtree contributed by this binding.
    /// The root `CliApp` merges all binding trees into one CLI.
    fn build_command(&self) -> Result<clap::Command, CliError>;

    /// Execute the matched operation and return the decoded response.
    ///
    /// `root_matches` are the full parse result (for global flags).
    /// `sub_matches` are scoped to the matched leaf subcommand.
    /// `op_path` is the resolved command path (e.g. `["users", "get"]`).
    fn dispatch<'a>(
        &'a self,
        root_matches: &'a clap::ArgMatches,
        sub_matches: &'a clap::ArgMatches,
        op_path: &'a [String],
    ) -> BoxFuture<'a, Result<DispatchResult, CliError>>;

    /// Return the embedded API spec(s) as a YAML string.
    ///
    /// - `raw == false` → the **effective** spec: source with overlays +
    ///   overrides merged (what the CLI actually serves at runtime).
    /// - `raw == true` → the **source** spec: byte-exact embedded YAML,
    ///   before any overlay/override processing.
    ///
    /// Returns `Ok(None)` for bindings that do not embed a spec (e.g.
    /// GraphQL). Multi-spec bindings concatenate entries as a YAML
    /// stream (`---`-delimited).
    fn spec_document(&self, _raw: bool) -> Result<Option<String>, CliError> {
        Ok(None)
    }

    /// Build this binding's contribution to the `--schema` flag for the given
    /// subcommand path. `--schema` is the agent-facing machine-readable
    /// counterpart to `--help`: wherever a user could type `--help` for prose,
    /// they can type `--schema` for the same scope rendered as JSON.
    ///
    /// Returns:
    ///
    /// - `Ok(Some(value))` — this binding owns the path; `value` is the JSON
    ///   to emit (path-scoped) or aggregate (empty path).
    /// - `Ok(None)` — this binding does not own the path; the caller will try
    ///   the next binding.
    /// - `Err(_)` — a real failure (e.g. the binding's spec failed to
    ///   prepare). The caller logs and continues to the next binding so one
    ///   broken binding cannot block schema output for the others.
    ///
    /// `path.is_empty()` is the "list everything I contribute" case. The
    /// caller concatenates the array contributions across all bindings, so
    /// multi-binding CLIs (e.g. REST + GraphQL) get a unified root view.
    ///
    /// Default: `Ok(None)`. Bindings that expose a discoverable surface
    /// override this.
    fn schema(&self, _path: &[String]) -> Result<Option<serde_json::Value>, CliError> {
        Ok(None)
    }

    /// Return a type-erased binding context for use by CLI-level custom
    /// command handlers. `matches` are the full parse result (needed
    /// to resolve global flags like server vars and global headers).
    ///
    /// Returns `None` by default. Concrete bindings return their
    /// protocol-specific `AppContext` (e.g. `openapi::AppContext`).
    fn binding_context(
        &self,
        _matches: &clap::ArgMatches,
    ) -> Result<Option<Box<dyn Any + Send + Sync>>, CliError> {
        Ok(None)
    }

    /// Receive root-level auth scheme bindings. Called by `CliApp`
    /// before `build_command()` so the binding can incorporate root auth
    /// into its command tree (help footer, global flags) and dispatch.
    ///
    /// Default: no-op. Bindings that support root-level auth override this.
    fn set_root_auth(&mut self, _bindings: &[(String, SchemeBinding)]) {}

    /// Receive root-level global parameters. Called by `CliApp` before
    /// `build_command()` so the binding can register them as top-level
    /// flags and inject them into outgoing requests. Mirrors
    /// [`set_root_auth`](Self::set_root_auth): global parameters are
    /// declared once at the root and shared across all bindings, and each
    /// binding grabs them here.
    ///
    /// Default: no-op. Bindings that support global parameters override this.
    fn set_root_global_parameters(
        &mut self,
        _params: &[crate::openapi::discovery::GlobalParameter],
    ) {
    }

    /// Every operation parameter this binding accepts — one entry per
    /// spelling it answers to (wire name and, when they differ, the flag
    /// name `--help` shows), each carrying the values an enum constrains it
    /// to.
    ///
    /// Consumed by `profiles create --set <KEY>=<VALUE>`, which validates
    /// both halves: a key no operation accepts is a silently-ignored
    /// default, and a value no operation accepts makes every command
    /// carrying that parameter fail on a flag the caller never passed.
    ///
    /// Default: empty, which disables that validation. A binding that
    /// cannot enumerate its surface must not make `--set` unusable.
    fn parameter_specs(&self) -> Vec<crate::profiles::commands::ParameterSpec> {
        Vec::new()
    }

    /// Invoke one operation directly, outside the clap dispatch path.
    ///
    /// `op_path` is the command path (`["iam", "keys", "remove"]`) and
    /// `params` a JSON object of parameter name → value, exactly the shape
    /// `--params` accepts. Returns the decoded response, or `Ok(None)` when
    /// the operation produced no body.
    ///
    /// Exists because some framework-owned commands need to call the API on
    /// the user's behalf — `profiles remove --revoke` deleting the key it
    /// created — and they have no `ArgMatches` for the target operation to
    /// hand to [`dispatch`](Self::dispatch). Everything downstream (auth,
    /// retries, TLS, base-URL resolution) is the same stack a normal
    /// invocation uses; only the argument source differs.
    ///
    /// Returns `Ok(None)` from the default implementation, meaning "this
    /// binding does not own that path" — the caller should try the next.
    fn invoke_operation<'a>(
        &'a self,
        _op_path: &'a [String],
        _params: &'a serde_json::Value,
    ) -> BoxFuture<'a, Result<Option<serde_json::Value>, CliError>> {
        Box::pin(async { Ok(None) })
    }

    /// Parameters that look like a tenant key: ones this binding scopes most
    /// of its operations by.
    ///
    /// Consumed by `profiles create`, which gives each its own `--<name>`
    /// flag so the commonest profile field is not stuck behind
    /// `--set <name>=<value>`.
    ///
    /// Default: empty, which surfaces no such flags.
    fn tenant_key_candidates(&self) -> Vec<String> {
        Vec::new()
    }

    /// Every server-URL template variable name this binding declares —
    /// both generator-registered (`server_var(...)`) and spec-declared
    /// (`servers[].variables`).
    ///
    /// Consumed by `profiles create`, which validates `--server-var` keys
    /// against it and registers a convenience `--<name>` flag per entry.
    ///
    /// Default: empty.
    fn server_variable_names(&self) -> Vec<String> {
        Vec::new()
    }

    /// Validate that all auth schemes referenced by the binding's spec
    /// have a corresponding entry in the auth bindings. Returns `Ok(())`
    /// if validation passes, or `Err(CliError::Validation(...))` listing
    /// unregistered schemes.
    ///
    /// Default: no-op (passes). Concrete bindings override when they
    /// can inspect their spec's security declarations.
    fn validate_auth(&self) -> Result<(), CliError> {
        Ok(())
    }

    /// Merge this binding's context into an existing context, or create
    /// a new one if `existing` is `None`.
    ///
    /// When multiple bindings of the same protocol type are registered
    /// on a `CliApp`, their contexts are merged so that custom command
    /// handlers can access operations from any binding transparently.
    ///
    /// The default implementation delegates to [`binding_context`](Self::binding_context)
    /// and ignores the existing context.
    fn merge_binding_context(
        &self,
        matches: &clap::ArgMatches,
        existing: Option<Box<dyn Any + Send + Sync>>,
    ) -> Result<Option<Box<dyn Any + Send + Sync>>, CliError> {
        let _ = existing;
        self.binding_context(matches)
    }
}
