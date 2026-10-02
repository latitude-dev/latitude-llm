//! [`OpenApiBinding`] — adapts [`super::CliApp`] to the root
//! [`crate::binding::Binding`] trait so it can be composed into
//! a root-level [`crate::app::CliApp`].

use std::io::IsTerminal;
use std::sync::Arc;

use crate::auth::{AuthCredentialSource, AuthStrategy, DynAuthProvider};
use crate::binding::{Binding, BoxFuture, DispatchResult};
use crate::error::CliError;
use crate::openapi::commands;
use crate::openapi::discovery::RestDescription;
use crate::openapi::executor;

/// Prepared state computed once in `build_command()` and reused in
/// `dispatch()`. This avoids parsing the spec twice.
struct Prepared {
    doc: RestDescription,
    http_config: crate::http::HttpConfig,
    auth_provider: DynAuthProvider,
}

/// An OpenAPI binding that wraps [`super::CliApp`]'s internals and
/// exposes them through the [`Binding`] trait.
///
/// ```rust,ignore
/// use fern_cli_sdk::app::CliApp;
/// use fern_cli_sdk::openapi::OpenApiBinding;
///
/// fn main() {
///     CliApp::new("my-cli")
///         .binding(
///             OpenApiBinding::new()
///                 .spec(include_str!("openapi.yaml"))
///                 .auth_scheme_env("bearer", "MY_API_KEY"),
///         )
///         .run()
/// }
/// ```
#[must_use]
pub struct OpenApiBinding {
    inner: super::CliApp,
    /// Lazily computed on first `build_command()`, then reused in
    /// `dispatch()`. `Arc` so we can clone it out of the lock without
    /// holding across await.
    prepared: std::sync::Mutex<Option<Arc<Prepared>>>,
    /// Optional namespace prefix. When set, all spec-derived subcommands
    /// are nested under `Command::new(namespace)` in the clap tree and
    /// the dispatch / schema paths strip the prefix before resolving
    /// against the `RestDescription`.
    command_namespace: Option<String>,
}

impl Default for OpenApiBinding {
    fn default() -> Self {
        Self {
            inner: super::CliApp::new(""),
            prepared: std::sync::Mutex::new(None),
            command_namespace: None,
        }
    }
}

impl OpenApiBinding {
    /// Create a new OpenAPI binding. The CLI name is set automatically
    /// by `CliApp::binding()` — no need to pass it here.
    pub fn new() -> Self {
        Self::default()
    }

    /// Set the OpenAPI spec YAML string.
    pub fn spec(mut self, yaml: &str) -> Self {
        self.inner = self.inner.spec(yaml);
        self
    }

    /// Set a spec YAML with Fern-style overrides.
    pub fn spec_with_overrides(mut self, yaml: &str, overrides: &str) -> Self {
        self.inner = self.inner.spec_with_overrides(yaml, overrides);
        self
    }

    /// Set a spec under a prefix path.
    pub fn spec_under(mut self, prefix: &str, yaml: &str) -> Self {
        self.inner = self.inner.spec_under(prefix, yaml);
        self
    }

    /// Set multiple specs under a prefix.
    pub fn specs_under<I, S>(mut self, prefix: &str, yamls: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: AsRef<str>,
    {
        self.inner = self.inner.specs_under(prefix, yamls);
        self
    }

    /// Bind a credential source to a named auth scheme (env var shorthand).
    pub fn auth_scheme_env(mut self, scheme_name: &str, env_var: &str) -> Self {
        self.inner = self.inner.auth_scheme_env(scheme_name, env_var);
        self
    }

    /// Bind a credential source to a named auth scheme.
    pub fn auth_scheme(mut self, scheme_name: &str, source: AuthCredentialSource) -> Self {
        self.inner = self.inner.auth_scheme(scheme_name, source);
        self
    }

    /// Add multiple specs under `prefix`, each in its own sub-namespace.
    pub fn specs_under_named<I, K, V>(mut self, prefix: &str, named: I) -> Self
    where
        I: IntoIterator<Item = (K, V)>,
        K: AsRef<str>,
        V: AsRef<str>,
    {
        self.inner = self.inner.specs_under_named(prefix, named);
        self
    }

    /// Bind a custom auth provider to a named scheme.
    pub fn auth_provider(
        mut self,
        scheme_name: &str,
        provider: impl crate::auth::provider::AuthProvider + 'static,
    ) -> Self {
        self.inner = self.inner.auth_provider(scheme_name, provider);
        self
    }

    /// Bind a pre-built shared auth provider to a named scheme.
    pub fn auth_provider_shared(
        mut self,
        scheme_name: &str,
        provider: crate::auth::DynAuthProvider,
    ) -> Self {
        self.inner = self.inner.auth_provider_shared(scheme_name, provider);
        self
    }

    /// Pin how multiple auth schemes compose. See [`AuthStrategy`].
    pub fn auth_strategy(mut self, strategy: AuthStrategy) -> Self {
        self.inner = self.inner.auth_strategy(strategy);
        self
    }

    /// Register an additive auth layer applied on top of the primary auth
    /// whenever its credential is present. See [`CliApp::auth_layer`].
    ///
    /// [`CliApp::auth_layer`]: crate::openapi::app::CliApp::auth_layer
    pub fn auth_layer(
        mut self,
        provider: impl crate::auth::provider::AuthProvider + 'static,
    ) -> Self {
        self.inner = self.inner.auth_layer(provider);
        self
    }

    /// Register a pre-built shared additive auth layer.
    /// See [`CliApp::auth_layer_shared`].
    ///
    /// [`CliApp::auth_layer_shared`]: crate::openapi::app::CliApp::auth_layer_shared
    pub fn auth_layer_shared(mut self, provider: crate::auth::DynAuthProvider) -> Self {
        self.inner = self.inner.auth_layer_shared(provider);
        self
    }

    /// Bind HTTP Basic auth for the named scheme.
    pub fn auth_basic_scheme(
        mut self,
        scheme_name: &str,
        username: AuthCredentialSource,
        password: AuthCredentialSource,
    ) -> Self {
        self.inner = self.inner.auth_basic_scheme(scheme_name, username, password);
        self
    }

    /// Register a server variable for URL template substitution.
    pub fn server_var(
        mut self,
        name: &str,
        env_var: Option<&str>,
        default: Option<&str>,
        description: Option<&str>,
    ) -> Self {
        self.inner = self.inner.server_var(name, env_var, default, description);
        self
    }

    /// Apply an overlay.
    pub fn overlay(mut self, overlay_yaml: &str) -> Self {
        self.inner = self.inner.overlay(overlay_yaml);
        self
    }

    /// Set compile-time audiences.
    pub fn audiences<I, S>(mut self, audiences: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        self.inner = self.inner.audiences(audiences);
        self
    }

    /// Register a global parameter that surfaces as a top-level CLI flag
    /// and is injected into outgoing requests at the configured wire
    /// location. Emitted by the TypeScript codegen layer
    /// (`detectGlobalParams.ts`) from `ir.globalParameters`; delegates to
    /// [`super::CliApp::global_parameter`], which merges these (with
    /// precedence) over any params parsed from the spec's
    /// `x-fern-global-parameters` extension.
    pub fn global_parameter(mut self, param: crate::openapi::discovery::GlobalParameter) -> Self {
        self.inner = self.inner.global_parameter(param);
        self
    }

    /// Mount all spec-derived subcommands under a namespace prefix.
    ///
    /// Without a namespace the generated commands are top-level:
    /// `cli users list`, `cli files get`, etc.
    ///
    /// With `.command_namespace("api")` they move one level down:
    /// `cli api users list`, `cli api files get`, etc.
    ///
    /// The namespace node sits beside any later-grafted custom commands
    /// (`command_under(&["recipes"], …)` stays at root). `--help` and
    /// `--schema` reflect the nesting automatically.
    pub fn command_namespace(mut self, namespace: impl Into<String>) -> Self {
        let ns = namespace.into();
        // Guard against names that collide with framework-owned
        // subcommands grafted by `CliApp::run`. Using one of these
        // would cause the namespace node to be silently dropped.
        const RESERVED: &[&str] = &["completion", "man", "auth"];
        assert!(
            !RESERVED.contains(&ns.as_str()),
            "command_namespace({ns:?}) collides with a reserved framework subcommand; \
             choose a different name",
        );
        self.command_namespace = Some(ns);
        self
    }

    /// Prepare the binding state (idempotent; only runs once).
    /// Returns an `Arc` clone so the caller doesn't hold the lock.
    fn ensure_prepared(&self) -> Result<Arc<Prepared>, CliError> {
        let mut guard = self.prepared.lock().unwrap();
        if let Some(ref arc) = *guard {
            return Ok(Arc::clone(arc));
        }

        let mut doc = self.inner.build_doc()?;
        commands::filter_doc_by_audiences(&mut doc, &self.inner.audiences);

        let http_config = crate::http::HttpConfig::new(&self.inner.name)?
            .with_parsed_root_certs(
                self.inner.extra_root_certs.iter().cloned(),
                self.inner.extra_root_certs_pem.iter().cloned(),
            );
        let auth_provider = self.inner.build_auth_provider(&doc);

        let arc = Arc::new(Prepared {
            doc,
            http_config,
            auth_provider,
        });
        *guard = Some(Arc::clone(&arc));
        Ok(arc)
    }

    /// Build a [`BindingEntry`](super::app::BindingEntry) from this
    /// binding's prepared state and the current CLI matches.
    fn build_binding_entry(
        &self,
        matches: &clap::ArgMatches,
    ) -> Result<super::app::BindingEntry, CliError> {
        let prepared = self.ensure_prepared()?;
        let mut doc_owned;
        let doc = if self.inner.needs_server_var_resolution(&prepared.doc) {
            doc_owned = prepared.doc.clone();
            self.inner.apply_server_vars(&mut doc_owned, matches);
            &doc_owned
        } else {
            &prepared.doc
        };

        // Finalize CLI-arg-bound auth sources against parsed matches,
        // mirroring dispatch() so custom command handlers get working auth.
        let cli_auth_args = crate::auth::collect_binding_cli_args(&self.inner.auth_bindings);
        let auth_provider = if cli_auth_args.is_empty() {
            prepared.auth_provider.clone()
        } else {
            let matches_arc = std::sync::Arc::new(matches.clone());
            let finalized = crate::auth::finalize_bindings(
                self.inner.auth_bindings.clone(),
                &matches_arc,
            );
            self.inner.build_auth_provider_from_finalized(&finalized, doc)
        };

        let global_headers: Vec<(String, String)> = doc
            .global_headers
            .iter()
            .filter_map(|h| {
                let val = super::app::resolve_global_header_value(matches, h)?;
                Some((h.header.clone(), val))
            })
            .collect();
        let global_params: Vec<super::app::ResolvedGlobalParam> = doc
            .global_parameters
            .iter()
            .filter_map(|p| {
                let val = super::app::resolve_global_parameter_value(matches, p)?;
                Some(super::app::ResolvedGlobalParam {
                    name: p.name.clone(),
                    location: p.location,
                    target: p.target.clone(),
                    value: val,
                })
            })
            .collect();
        Ok(super::app::BindingEntry {
            doc: doc.clone(),
            auth_provider,
            http_config: prepared.http_config.clone(),
            global_headers,
            global_params,
        })
    }

    /// Wrap a typed handler function into a [`CliCommandHandler`] that
    /// automatically downcasts the binding context to
    /// [`AppContext`](super::AppContext).
    ///
    /// Use this with [`CliApp::command()`](crate::app::CliApp::command)
    /// or [`CliApp::command_under()`](crate::app::CliApp::command_under):
    ///
    /// ```rust,ignore
    /// CliApp::new("my-cli")
    ///     .binding(OpenApiBinding::new().spec(include_str!("openapi.yaml")))
    ///     .command(my_cmd(), OpenApiBinding::handler(my_handler))
    ///     .run()
    /// ```
    pub fn handler(
        f: fn(&clap::ArgMatches, &super::AppContext) -> Result<(), crate::error::CliError>,
    ) -> crate::app::CliCommandHandler {
        Box::new(move |matches: &clap::ArgMatches, ctx: &dyn std::any::Any| {
            let ctx = ctx.downcast_ref::<super::AppContext>().ok_or_else(|| {
                crate::error::CliError::Validation(
                    "handler requires an OpenAPI binding context".into(),
                )
            })?;
            f(matches, ctx)
        })
    }

}

impl Binding for OpenApiBinding {
    fn name(&self) -> &str {
        &self.inner.name
    }

    fn set_cli_name(&mut self, name: &str) {
        self.inner.name = name.to_string();
    }

    fn set_root_auth(&mut self, bindings: &[(String, crate::auth::SchemeBinding)]) {
        // Root-level auth bindings are prepended to the inner CliApp's
        // auth_bindings. If the binding also has its own auth_scheme_env()
        // calls, those take priority (they appear later and override).
        let mut merged = bindings.to_vec();
        merged.extend(std::mem::take(&mut self.inner.auth_bindings));
        self.inner.auth_bindings = merged;
    }

    fn set_root_global_parameters(
        &mut self,
        params: &[crate::openapi::discovery::GlobalParameter],
    ) {
        // Root-level global parameters are prepended to the inner CliApp's
        // builder_global_parameters. Any parameter the binding declared
        // directly (via its own `.global_parameter()` call) takes priority
        // and suppresses the same-named root parameter — mirroring how
        // binding-level auth overrides root auth by scheme name.
        let binding_names: std::collections::HashSet<String> = self
            .inner
            .builder_global_parameters
            .iter()
            .map(|p| p.name.clone())
            .collect();
        let mut merged: Vec<crate::openapi::discovery::GlobalParameter> = params
            .iter()
            .filter(|p| !binding_names.contains(&p.name))
            .cloned()
            .collect();
        merged.extend(std::mem::take(&mut self.inner.builder_global_parameters));
        self.inner.builder_global_parameters = merged;
    }

    fn parameter_specs(&self) -> Vec<crate::profiles::commands::ParameterSpec> {
        // Best-effort: a spec that fails to prepare yields an empty
        // vocabulary, which disables `--set` validation rather than making
        // `profiles create` fail on an unrelated parse error.
        let Ok(prepared) = self.ensure_prepared() else {
            return Vec::new();
        };
        let mut specs = Vec::new();
        collect_parameter_specs(&prepared.doc.parameters, &mut specs);
        collect_parameter_specs_from_resources(&prepared.doc.resources, &mut specs);
        specs
    }

    fn invoke_operation<'a>(
        &'a self,
        op_path: &'a [String],
        params: &'a serde_json::Value,
    ) -> BoxFuture<'a, Result<Option<serde_json::Value>, CliError>> {
        Box::pin(async move {
            let prepared = self.ensure_prepared()?;
            // Strip the namespace prefix the same way `dispatch` does, so a
            // caller names the operation as it appears on the command line.
            let effective: &[String] = match &self.command_namespace {
                Some(ns) if op_path.first().map(String::as_str) == Some(ns.as_str()) => &op_path[1..],
                Some(_) if !op_path.is_empty() => return Ok(None),
                _ => op_path,
            };
            let Some(method) = resolve_method_by_path(&prepared.doc, effective) else {
                // Not ours — the caller tries the next binding.
                return Ok(None);
            };

            let params_json = serde_json::to_string(params)
                .map_err(|e| CliError::Validation(format!("Failed to serialize params: {e}")))?;
            let params_json = params
                .as_object()
                .is_some_and(|o| !o.is_empty())
                .then_some(params_json.as_str());

            // Quiet: the caller decides what to print. Everything else is
            // the default request shape — no pagination, no dry run, no
            // output file.
            let pipeline = crate::formatter::OutputPipeline {
                quiet: true,
                ..Default::default()
            };
            executor::execute_method(
                &prepared.doc,
                method,
                params_json,
                None,
                &prepared.auth_provider,
                None,
                None,
                None,
                None,
                false,
                &executor::PaginationConfig::default(),
                &pipeline,
                true,
                crate::cli_args::resolve_base_url_override_for(&self.inner.name)?.as_deref(),
                &prepared.http_config,
                false,
                false,
                true,
                false,
                &[],
                &[],
            )
            .await
        })
    }

    fn tenant_key_candidates(&self) -> Vec<String> {
        let Ok(prepared) = self.ensure_prepared() else {
            return Vec::new();
        };
        tenant_key_candidates(&prepared.doc)
    }

    fn server_variable_names(&self) -> Vec<String> {
        let Ok(prepared) = self.ensure_prepared() else {
            return Vec::new();
        };
        let mut names: std::collections::BTreeSet<String> = self
            .inner
            .server_var_names()
            .into_iter()
            .collect();
        names.extend(
            crate::openapi::app::collect_spec_server_variables(&prepared.doc)
                .into_iter()
                .map(|variable| variable.name),
        );
        names.into_iter().collect()
    }

    fn validate_auth(&self) -> Result<(), CliError> {
        // Only validate when root-level auth is being used (auth_bindings
        // is non-empty). If the binding has no auth bindings at all, it's
        // intentionally running unauthenticated — no validation needed.
        if self.inner.auth_bindings.is_empty() {
            return Ok(());
        }
        let prepared = self.ensure_prepared()?;
        let registered: std::collections::HashSet<&str> = self
            .inner
            .auth_bindings
            .iter()
            .map(|(name, _)| name.as_str())
            .collect();
        let mut missing: Vec<&str> = Vec::new();
        for scheme_name in prepared.doc.security_schemes.keys() {
            if !registered.contains(scheme_name.as_str()) {
                missing.push(scheme_name.as_str());
            }
        }
        if !missing.is_empty() {
            missing.sort();
            // Warn rather than fail — multi-spec binaries may intentionally
            // bind only a subset of schemes (e.g. Twilio binds basic auth
            // but not the IAM OAuth2 schemes).
            tracing::warn!(
                "Spec declares security scheme(s) [{}] with no .auth() binding. \
                 Those endpoints will run unauthenticated.",
                missing.join(", "),
            );
        }
        Ok(())
    }

    fn spec_document(&self, raw: bool) -> Result<Option<String>, CliError> {
        self.inner.spec_yaml(raw)
    }

    fn schema(&self, path: &[String]) -> Result<Option<serde_json::Value>, CliError> {
        let prepared = self.ensure_prepared()?;
        let effective_path = match &self.command_namespace {
            Some(ns) if path.first().map(|s| s.as_str()) == Some(ns.as_str()) => &path[1..],
            // Non-empty path that doesn't start with our namespace — this
            // binding doesn't own it.
            Some(_) if !path.is_empty() => return Ok(None),
            _ => path,
        };
        let schema = super::help::build_schema(&prepared.doc, effective_path);
        match (&self.command_namespace, schema) {
            (Some(ns), Some(value)) => Ok(Some(prefix_schema_operations(value, ns))),
            (_, schema) => Ok(schema),
        }
    }

    fn build_command(&self) -> Result<clap::Command, CliError> {
        let prepared = self.ensure_prepared()?;
        let cli = commands::build_cli(&prepared.doc)
            .subcommand(crate::openapi::skill_emitter::generate_skills_command());
        let mut cli = self.inner.decorate_command(&prepared.doc, cli);

        // Register global --<name> flags for CLI-bound auth sources
        // so clap knows about them before parsing.
        let cli_auth_args = crate::auth::collect_binding_cli_args(&self.inner.auth_bindings);
        // Reject before registering: an id the root already owns would be
        // dropped by the merge and the credential would then resolve to the
        // root flag's value. See `reject_reserved_auth_arg_ids`.
        crate::app::reject_reserved_auth_arg_ids(&cli_auth_args)?;
        for arg_name in &cli_auth_args {
            let kebab = arg_name.replace('_', "-");
            cli = cli.arg(
                clap::Arg::new(arg_name.clone())
                    .long(kebab)
                    .global(true)
                    .value_name(arg_name.to_uppercase())
                    .help("Auth credential"),
            );
        }

        // Wrap all spec-derived subcommands under the namespace prefix.
        if let Some(ref ns) = self.command_namespace {
            cli = wrap_subcommands_under_namespace(cli, ns);
        }

        Ok(cli)
    }

    fn dispatch<'a>(
        &'a self,
        root_matches: &'a clap::ArgMatches,
        _sub_matches: &'a clap::ArgMatches,
        _op_path: &'a [String],
    ) -> BoxFuture<'a, Result<DispatchResult, CliError>> {
        // Clone the Arc so we don't hold the lock across the await.
        let prepared = match self.ensure_prepared() {
            Ok(p) => p,
            Err(e) => return Box::pin(async move { Err(e) }),
        };

        // Strip the namespace prefix from op_path for internal routing.
        let effective_op_path: &[String] = match &self.command_namespace {
            Some(ns) if _op_path.first().map(|s| s.as_str()) == Some(ns.as_str()) => {
                &_op_path[1..]
            }
            _ => _op_path,
        };

        // Intercept `generate-skills` — it's not a spec operation.
        if effective_op_path == ["generate-skills"] {
            let output_dir = _sub_matches.get_one::<String>("output-dir");
            let result = self.inner.handle_generate_skills(
                output_dir.map(|s| s.as_str()),
                &prepared.doc,
            );
            return Box::pin(async move {
                result?;
                Ok(DispatchResult::Handled)
            });
        }

        Box::pin(async move {
            // If any auth source uses CLI flags, finalize them against
            // the parsed matches and rebuild the auth provider.
            let cli_auth_args = crate::auth::collect_binding_cli_args(&self.inner.auth_bindings);
            let auth_provider = if cli_auth_args.is_empty() {
                prepared.auth_provider.clone()
            } else {
                let matches_arc = std::sync::Arc::new(root_matches.clone());
                let finalized = crate::auth::finalize_bindings(
                    self.inner.auth_bindings.clone(),
                    &matches_arc,
                );
                self.inner.build_auth_provider_from_finalized(&finalized, &prepared.doc)
            };

            // Apply server-variable substitutions to a local copy of the doc
            // when the generator registered server vars or the spec declares
            // its own `servers[].variables` / `x-fern-default-url`.
            let mut doc_owned;
            let doc = if self.inner.needs_server_var_resolution(&prepared.doc) {
                doc_owned = prepared.doc.clone();
                self.inner.apply_server_vars(&mut doc_owned, root_matches);
                &doc_owned
            } else {
                &prepared.doc
            };

            // Walk the subcommand tree from root to find the target method.
            // When a namespace is set the clap tree has an extra wrapper
            // level (`cli <ns> <resource> <method>`). Skip past it so the
            // doc's resource names align with the subcommand chain.
            let resolve_from = match &self.command_namespace {
                Some(ns) => root_matches
                    .subcommand_matches(ns.as_str())
                    .unwrap_or(root_matches),
                None => root_matches,
            };
            let (method, matched_args) =
                super::resolve_method_from_matches(doc, resolve_from)?;

            let params_override = matched_args
                .get_one::<String>("params")
                .map(|s| s.as_str());
            // `collect_params_from_flags` may call `resolve_file_refs` which
            // performs blocking `std::fs::read` I/O. Wrap in `block_in_place`
            // so the tokio runtime can schedule other work while the thread is
            // parked on disk reads.
            let mut params = tokio::task::block_in_place(|| {
                super::app::collect_params_from_flags(
                    matched_args,
                    method,
                    params_override,
                )
            })?;
            // Collect multipart/form-data parts from CLI flags for operations
            // that declare a `multipart/form-data` body. `None` for all others.
            // Runs before `params` is serialized: multipart fields live in
            // `method.multipart_fields`, not `method.parameters`, so a field
            // named in `--params` has no `location: body` to route on and
            // would otherwise leak into the query string.
            let multipart_parts =
                super::app::collect_multipart_parts(method, matched_args, &mut params)?;
            let params_json_string = serde_json::to_string(&params)
                .map_err(|e| CliError::Validation(format!("Failed to serialize params: {e}")))?;
            let params_json: Option<&str> = if params.is_empty() {
                None
            } else {
                Some(&params_json_string)
            };

            let body_json_owned = crate::cli_args::resolve_body_json(matched_args)?;
            let body_json = body_json_owned.as_deref();

            let dry_run = matched_args.get_flag("dry-run");
            let debug = root_matches.get_flag("debug");

            let pagination = super::app::build_pagination_config(matched_args, doc, &self.inner.name);

            let no_extract = matched_args.get_flag("no-extract");
            let no_retry = matched_args.get_flag("no-retry");
            // `--retries` is resolved here rather than via clap's `.env()` /
            // `default_value` because the flag is registered per operation, in
            // `build_resource_command`, which has no access to the CLI name
            // needed for `<PREFIX>_RETRIES`. Same precedence either way:
            // flag > env > profile > whatever the spec declared.
            crate::openapi::discovery::set_retries_override(
                matched_args
                    .try_get_one::<u32>("retries")
                    .ok()
                    .flatten()
                    .copied()
                    .or_else(|| {
                        std::env::var(format!(
                            "{}_RETRIES",
                            crate::text::env_var_prefix(&self.inner.name)
                        ))
                        .ok()
                        .and_then(|raw| raw.trim().parse::<u32>().ok())
                    })
                    .or_else(crate::profiles::retries),
            );
            let no_stream = matched_args
                .try_get_one::<bool>("no-stream")
                .ok()
                .flatten()
                .copied()
                .unwrap_or(false);

            let binary_body_path = method
                .binary_request_body
                .as_ref()
                .and_then(|b| {
                    matched_args
                        .try_get_one::<String>(&b.flag_name)
                        .ok()
                        .flatten()
                        .map(|s| s.as_str())
                });

            // Validate binary body path for dangerous characters. Validate the
            // SAME string the executor will use as the file path — for plain
            // and `@`-prefixed values that's the input with the optional `@`
            // (or `@file://` / `@data://` scheme) stripped; for the `\@<REST>`
            // escape that's the literal `@<REST>`. Unlike the multipart and
            // JSON-shorthand sites, the binary-body escape still opens a file
            // (see `BinaryBodySource::parse` → `File { .. }`), so path-shape
            // validation must apply in both branches. FER-10436, FER-10532.
            //
            // Stdin is only the `Auto`-mode `-` sentinel; an explicit scheme
            // (`@file://-` / `@data://-`) is a literal filename and is still
            // validated.
            if let Some(path_str) = binary_body_path {
                let flag = method.binary_request_body.as_ref()
                    .map(|b| b.flag_name.as_str()).unwrap_or("file");
                let (inner, is_stdin) = match executor::parse_at_ref(path_str) {
                    executor::AtRef::File { path, mode: executor::AtMode::Auto } => {
                        let is_dash = path.as_ref() == "-";
                        (path, is_dash)
                    }
                    executor::AtRef::File { path, .. } => (path, false),
                    executor::AtRef::Escaped(literal) => {
                        (std::borrow::Cow::Owned(literal), false)
                    }
                    executor::AtRef::Plain(s) => {
                        (std::borrow::Cow::Borrowed(s), s == "-")
                    }
                };
                if !is_stdin {
                    crate::output::reject_dangerous_chars(inner.as_ref(), &format!("--{flag}"))?;
                }
            }

            let global_header_overrides = super::app::build_global_header_overrides(
                matched_args,
                doc,
                method,
                &params,
            )?;

            let global_param_overrides = super::app::build_global_parameter_overrides(
                matched_args,
                doc,
                method,
                &params,
            )?;

            // --base-url flag wins; otherwise {NAME}_BASE_URL env var.
            let base_url_override_owned =
                crate::cli_args::resolve_base_url_override(root_matches, &self.inner.name)?;
            let base_url_override = base_url_override_owned.as_deref();

            // --user-agent-suffix flag wins; otherwise {NAME}_USER_AGENT_SUFFIX
            // env var (resolved inside HttpConfig). Apply the flag override to
            // a clone so the client this request builds carries it.
            let http_config = prepared.http_config.clone().with_user_agent_suffix_override(
                crate::cli_args::resolve_user_agent_suffix_override(root_matches),
            );

            // Read --output flag for binary response file writing. The literal
            // `-` is a stdout sentinel (curl/wget convention) and bypasses
            // path validation — handle_binary_response branches on it to
            // stream raw bytes to stdout instead of touching the filesystem.
            // Every other value flows through validate_safe_file_path, which
            // rejects control characters and requires the parent directory to
            // exist, but does not sandbox the path to CWD — the file is
            // written wherever the user points it (final-component symlinks
            // are still refused at open time via O_NOFOLLOW).
            let output_path_owned = matched_args
                .try_get_one::<String>("output")
                .ok()
                .flatten()
                .cloned();
            let output_path_buf = match output_path_owned.as_deref() {
                Some("-") => None,
                Some(p) => Some(crate::validate::validate_safe_file_path(p, "--output")?),
                None => None,
            };
            let output_path = if output_path_owned.as_deref() == Some("-") {
                Some("-")
            } else {
                output_path_buf.as_deref().and_then(|p| p.to_str())
            };

            let pipeline = crate::formatter::OutputPipeline::from_matches(
                root_matches,
                &self.inner.name,
            )
            .map_err(|e| CliError::Validation(e.to_string()))?;

            if pipeline.is_raw() && pagination.page_all {
                return Err(CliError::Validation(
                    "--format raw is incompatible with --page-all".to_string(),
                ));
            }
            if pipeline.is_http() && pagination.page_all {
                return Err(CliError::Validation(
                    "--format http is incompatible with --page-all".to_string(),
                ));
            }

            // When --page-all is active on a TTY without --no-pager,
            // let the executor write directly to the pager (capture_output
            // = false). The executor spawns the pager and returns None,
            // which maps to DispatchResult::Handled below.
            let use_pager = pagination.page_all
                && !pagination.no_pager
                && std::io::stdout().is_terminal();
            let capture_output = !pipeline.is_raw() && !pipeline.is_http() && !use_pager;

            let result = executor::execute_method(
                doc,
                method,
                params_json,
                body_json,
                &auth_provider,
                output_path,
                None,  // upload
                binary_body_path,
                multipart_parts,
                dry_run,
                &pagination,
                &pipeline,
                capture_output,
                base_url_override,
                &http_config,
                no_extract,
                no_retry,
                no_stream,
                debug,
                &global_header_overrides,
                &global_param_overrides,
            )
            .await?;

            match result {
                Some(value) => Ok(DispatchResult::Value(value)),
                None => Ok(DispatchResult::Handled),
            }
        })
    }

    fn binding_context(
        &self,
        matches: &clap::ArgMatches,
    ) -> Result<Option<Box<dyn std::any::Any + Send + Sync>>, CliError> {
        let entry = self.build_binding_entry(matches)?;
        let quiet = matches
            .try_get_one::<bool>("quiet")
            .ok()
            .flatten()
            .copied()
            .unwrap_or(false);
        let debug = matches.get_flag("debug");
        let base_url_override =
            crate::cli_args::resolve_base_url_override(matches, &self.inner.name)?;
        let http_config = entry.http_config.with_user_agent_suffix_override(
            crate::cli_args::resolve_user_agent_suffix_override(matches),
        );
        let ctx = super::AppContext::new(
            entry.doc,
            entry.auth_provider,
            http_config,
            entry.global_headers,
            entry.global_params,
        ).with_quiet(quiet)
         .with_base_url_override(base_url_override)
         .with_debug(debug);
        Ok(Some(Box::new(ctx)))
    }

    fn merge_binding_context(
        &self,
        matches: &clap::ArgMatches,
        existing: Option<Box<dyn std::any::Any + Send + Sync>>,
    ) -> Result<Option<Box<dyn std::any::Any + Send + Sync>>, CliError> {
        let entry = self.build_binding_entry(matches)?;
        let quiet = matches
            .try_get_one::<bool>("quiet")
            .ok()
            .flatten()
            .copied()
            .unwrap_or(false);
        let debug = matches.get_flag("debug");
        let base_url_override =
            crate::cli_args::resolve_base_url_override(matches, &self.inner.name)?;
        let entry = super::app::BindingEntry {
            http_config: entry.http_config.with_user_agent_suffix_override(
                crate::cli_args::resolve_user_agent_suffix_override(matches),
            ),
            ..entry
        };
        match existing {
            Some(ctx_box) => match ctx_box.downcast::<super::AppContext>() {
                Ok(mut ctx) => {
                    ctx.add_entry(entry);
                    ctx.debug = debug;
                    ctx.quiet = quiet;
                    ctx.base_url_override = base_url_override;
                    Ok(Some(ctx as Box<dyn std::any::Any + Send + Sync>))
                }
                Err(original) => {
                    // Different binding type — start a new AppContext,
                    // discard the incompatible context.
                    let ctx = super::AppContext::new(
                        entry.doc,
                        entry.auth_provider,
                        entry.http_config,
                        entry.global_headers,
                        entry.global_params,
                    ).with_quiet(quiet)
                     .with_base_url_override(base_url_override)
                     .with_debug(debug);
                    let _ = original;
                    Ok(Some(Box::new(ctx)))
                }
            },
            None => {
                let ctx = super::AppContext::new(
                    entry.doc,
                    entry.auth_provider,
                    entry.http_config,
                    entry.global_headers,
                    entry.global_params,
                ).with_quiet(quiet)
                 .with_base_url_override(base_url_override)
                 .with_debug(debug);
                Ok(Some(Box::new(ctx)))
            }
        }
    }
}

// ── Namespace helpers ──────────────────────────────────────────────

/// Move all subcommands of `cmd` into an intermediate
/// `Command::new(namespace)` wrapper, returning a rebuilt command whose
/// sole subcommand is the namespace node. Global args, about, and
/// after_help are preserved on the outer command.
/// Walk `op_path` to the operation it names: every segment but the last is a
/// resource, the last is the method.
///
/// The by-name counterpart to `resolve_method_from_matches`, which needs a
/// parsed `ArgMatches` the direct-invocation path does not have.
fn resolve_method_by_path<'a>(
    doc: &'a crate::openapi::discovery::RestDescription,
    op_path: &[String],
) -> Option<&'a crate::openapi::discovery::RestMethod> {
    let (method_name, resource_path) = op_path.split_last()?;
    let mut resources = &doc.resources;
    let mut current = None;
    for segment in resource_path {
        let resource = resources.get(segment)?;
        resources = &resource.resources;
        current = Some(resource);
    }
    current?.methods.get(method_name)
}

/// A path parameter has to appear in at least this share of operations, in a
/// non-terminal position, to be offered as a profile field.
///
/// Two thirds rather than a bare majority: a tenant key is on *nearly* every
/// path (Twilio's `AccountSid` is on ~87%), and the cost of a false positive
/// — a flag on `profiles create` that nobody wants — is higher than the cost
/// of a miss, which just leaves `--set` as the way in.
const TENANT_KEY_MIN_SHARE: f64 = 0.66;

/// Parameters that look like a tenant key, derived from the spec alone.
///
/// The signal is **non-terminal path position**, not raw frequency. A tenant
/// key is structurally a prefix — `/Accounts/{AccountSid}/Messages` — with
/// more path after it. Raw frequency alone misfires on the `{id}` of a plain
/// REST API (`/users/{id}`, `/posts/{id}`): frequent, but always terminal,
/// because it addresses the object rather than scoping it.
///
/// Known false positive: a templated API version (`/{version}/users`) is
/// structurally identical to a tenant key and will be offered. That is
/// tolerable only because the caller *proposes* these as flags rather than
/// filling anything in — an unwanted flag costs nothing but its own help
/// line, whereas silently populating a profile from a guess would not be
/// recoverable.
pub(crate) fn tenant_key_candidates(
    doc: &crate::openapi::discovery::RestDescription,
) -> Vec<String> {
    let mut paths: Vec<&str> = Vec::new();
    collect_method_paths(&doc.resources, &mut paths);
    if paths.is_empty() {
        return Vec::new();
    }

    let mut non_terminal: std::collections::BTreeMap<&str, usize> = Default::default();
    for path in &paths {
        let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
        // A `{name}` segment with more path after it. Deduplicated per path so
        // one operation cannot vote twice for the same parameter.
        let mut seen: std::collections::BTreeSet<&str> = Default::default();
        for (index, segment) in segments.iter().enumerate() {
            if index + 1 >= segments.len() {
                continue;
            }
            if let Some(name) = segment
                .strip_prefix('{')
                .and_then(|rest| rest.strip_suffix('}'))
            {
                if seen.insert(name) {
                    *non_terminal.entry(name).or_default() += 1;
                }
            }
        }
    }

    let threshold = (paths.len() as f64) * TENANT_KEY_MIN_SHARE;
    non_terminal
        .into_iter()
        .filter(|(_, count)| (*count as f64) >= threshold)
        .map(|(name, _)| name.to_string())
        .collect()
}

fn collect_method_paths<'a>(
    resources: &'a std::collections::HashMap<String, crate::openapi::discovery::RestResource>,
    out: &mut Vec<&'a str>,
) {
    for resource in resources.values() {
        for method in resource.methods.values() {
            out.push(method.path.as_str());
        }
        collect_method_paths(&resource.resources, out);
    }
}

/// Collect both spellings of every parameter: the **wire** name (the map
/// key, which is what `--schema` reports) and the **flag** name the user
/// actually reads in `--help`.
///
/// Both are needed because they can differ. `x-fern-parameter-name` renames
/// `filter_term` to `--search-query`; a user setting a profile default has
/// only ever seen the latter, so rejecting it would be wrong — and accepting
/// it silently without listing it would make the "did you mean" useless.
///
/// `enum_values` rides along so `profiles create --set user_type=admin` is
/// rejected at write time rather than breaking every command that takes
/// `--user-type`. `item_enum_values` is deliberately *not* consulted: those
/// constrain an array's *elements*, and a profile default is a single
/// scalar clap value.
fn collect_parameter_specs(
    parameters: &std::collections::HashMap<String, crate::openapi::discovery::MethodParameter>,
    out: &mut Vec<crate::profiles::commands::ParameterSpec>,
) {
    use crate::profiles::commands::ParameterSpec;
    for (wire_name, parameter) in parameters {
        let accepted = commands::enum_accepted_values(parameter);
        let spec = |name: String| match &accepted {
            Some(values) => ParameterSpec::with_values(name, values.clone()),
            None => ParameterSpec::unconstrained(name),
        };
        out.push(spec(wire_name.clone()));
        if let Some(flag) = commands::resolve_param_flag_name(parameter, wire_name) {
            if &flag != wire_name {
                out.push(spec(flag));
            }
        }
    }
}

/// Walk the resource tree collecting every operation's parameters.
fn collect_parameter_specs_from_resources(
    resources: &std::collections::HashMap<String, crate::openapi::discovery::RestResource>,
    out: &mut Vec<crate::profiles::commands::ParameterSpec>,
) {
    for resource in resources.values() {
        for method in resource.methods.values() {
            collect_parameter_specs(&method.parameters, out);
            // Multipart fields are not in `parameters` but do surface as
            // per-field flags, so a profile may reasonably default one.
            for field in &method.multipart_fields {
                out.push(crate::profiles::commands::ParameterSpec::unconstrained(
                    field.wire_name.clone(),
                ));
            }
        }
        collect_parameter_specs_from_resources(&resource.resources, out);
    }
}

fn wrap_subcommands_under_namespace(cmd: clap::Command, namespace: &str) -> clap::Command {
    let subs: Vec<clap::Command> = cmd.get_subcommands().cloned().collect();

    let mut ns_cmd = clap::Command::new(namespace.to_string())
        .about("API commands")
        .subcommand_required(true)
        .arg_required_else_help(true);
    for sub in subs {
        ns_cmd = ns_cmd.subcommand(sub);
    }

    // Rebuild the outer command: same name, global args, about, and
    // after_help — but with only the namespace wrapper as a subcommand.
    let mut new_cmd = clap::Command::new(cmd.get_name().to_string())
        .term_width(200)
        .subcommand_required(true)
        .arg_required_else_help(true);
    if let Some(about) = cmd.get_about() {
        new_cmd = new_cmd.about(about.to_string());
    }
    if let Some(after_help) = cmd.get_after_help() {
        new_cmd = new_cmd.after_help(after_help.to_string());
    }
    for arg in cmd.get_arguments() {
        new_cmd = new_cmd.arg(arg.clone());
    }
    new_cmd.subcommand(ns_cmd)
}

/// Prefix the `"operation"` field of every entry in a schema value with
/// `"<namespace>."`. Handles both the plain `[{operation, …}]` array and
/// the `{sdkVariables, operations}` envelope.
fn prefix_schema_operations(value: serde_json::Value, namespace: &str) -> serde_json::Value {
    fn prefix_ops(arr: Vec<serde_json::Value>, ns: &str) -> Vec<serde_json::Value> {
        arr.into_iter()
            .map(|mut entry| {
                if let Some(op) = entry.get("operation").and_then(|v| v.as_str()) {
                    entry["operation"] = serde_json::Value::String(
                        format!("{ns}.{op}"),
                    );
                }
                entry
            })
            .collect()
    }

    match value {
        serde_json::Value::Array(arr) => {
            serde_json::Value::Array(prefix_ops(arr, namespace))
        }
        serde_json::Value::Object(mut obj) => {
            if let Some(serde_json::Value::Array(ops)) = obj.remove("operations") {
                obj.insert(
                    "operations".to_string(),
                    serde_json::Value::Array(prefix_ops(ops, namespace)),
                );
            }
            // Single-operation schema (leaf query) has a top-level
            // `"operation"` key instead of the plural `"operations"`.
            if let Some(op) = obj.get("operation").and_then(|v| v.as_str()) {
                let prefixed = format!("{namespace}.{op}");
                obj.insert("operation".to_string(), serde_json::Value::String(prefixed));
            }
            serde_json::Value::Object(obj)
        }
        other => other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefix_schema_operations_array() {
        let input = serde_json::json!([
            { "operation": "users.get", "httpMethod": "GET" },
            { "operation": "files.list", "httpMethod": "GET" },
        ]);
        let result = prefix_schema_operations(input, "api");
        let arr = result.as_array().unwrap();
        assert_eq!(arr[0]["operation"], "api.users.get");
        assert_eq!(arr[1]["operation"], "api.files.list");
    }

    #[test]
    fn prefix_schema_operations_envelope() {
        let input = serde_json::json!({
            "sdkVariables": [],
            "operations": [
                { "operation": "users.get", "httpMethod": "GET" },
            ],
        });
        let result = prefix_schema_operations(input, "api");
        let ops = result["operations"].as_array().unwrap();
        assert_eq!(ops[0]["operation"], "api.users.get");
    }

    #[test]
    fn wrap_subcommands_under_namespace_moves_subs() {
        let cmd = clap::Command::new("test")
            .about("Test CLI")
            .arg(
                clap::Arg::new("debug")
                    .long("debug")
                    .global(true)
                    .action(clap::ArgAction::SetTrue),
            )
            .subcommand(
                clap::Command::new("users")
                    .subcommand(clap::Command::new("get")),
            )
            .subcommand(
                clap::Command::new("files")
                    .subcommand(clap::Command::new("list")),
            );

        let wrapped = wrap_subcommands_under_namespace(cmd, "api");

        // The namespace should be the only top-level subcommand.
        let top_names: Vec<&str> = wrapped
            .get_subcommands()
            .map(|s| s.get_name())
            .collect();
        assert_eq!(top_names, vec!["api"]);

        // Original subcommands live under the namespace.
        let ns_cmd = wrapped
            .get_subcommands()
            .find(|s| s.get_name() == "api")
            .unwrap();
        let ns_sub_names: Vec<&str> = ns_cmd
            .get_subcommands()
            .map(|s| s.get_name())
            .collect();
        assert!(ns_sub_names.contains(&"users"));
        assert!(ns_sub_names.contains(&"files"));

        // Global arg is preserved on the outer command.
        assert!(wrapped
            .get_arguments()
            .any(|a| a.get_id().as_str() == "debug"));
    }

    #[test]
    fn prefix_schema_operations_leaf_object() {
        let input = serde_json::json!({
            "operation": "users.get",
            "httpMethod": "GET",
            "parameters": [],
        });
        let result = prefix_schema_operations(input, "api");
        assert_eq!(result["operation"], "api.users.get");
        assert_eq!(result["httpMethod"], "GET");
    }

    #[test]
    #[should_panic(expected = "collides with a reserved framework subcommand")]
    fn command_namespace_rejects_reserved_name() {
        OpenApiBinding::default().command_namespace("auth");
    }

    fn gp(name: &str, env: Option<&str>) -> crate::openapi::discovery::GlobalParameter {
        crate::openapi::discovery::GlobalParameter {
            name: name.into(),
            parameter_name: None,
            location: crate::openapi::discovery::GlobalParameterLocation::Query,
            target: name.into(),
            env: env.map(Into::into),
            default: None,
            optional: false,
            apply: crate::openapi::discovery::GlobalParameterApplyMode::Auto,
            docs: None,
        }
    }

    #[test]
    fn set_root_global_parameters_populates_binding() {
        // Root-declared params (like `CliApp::global_parameter`) are handed
        // to the binding via `set_root_global_parameters` and land in the
        // inner CliApp's builder_global_parameters.
        let mut binding = OpenApiBinding::new();
        binding.set_root_global_parameters(&[gp("currency", Some("CURRENCY_ENV")), gp("region", None)]);
        let names: Vec<&str> = binding
            .inner
            .builder_global_parameters
            .iter()
            .map(|p| p.name.as_str())
            .collect();
        assert_eq!(names, vec!["currency", "region"]);
    }

    #[test]
    fn set_root_global_parameters_binding_level_wins() {
        // A parameter declared directly on the binding takes precedence over
        // a same-named root parameter (dedup by name, binding wins), while
        // root-only params are still merged in.
        let binding = OpenApiBinding::new().global_parameter(gp("currency", Some("BINDING_ENV")));
        let mut binding = binding;
        binding.set_root_global_parameters(&[gp("currency", Some("ROOT_ENV")), gp("region", None)]);

        let params = &binding.inner.builder_global_parameters;
        let currency = params.iter().find(|p| p.name == "currency").unwrap();
        assert_eq!(
            currency.env.as_deref(),
            Some("BINDING_ENV"),
            "binding-level param must win over the same-named root param"
        );
        assert_eq!(
            params.iter().filter(|p| p.name == "currency").count(),
            1,
            "no duplicate currency entry"
        );
        assert!(
            params.iter().any(|p| p.name == "region"),
            "root-only param must still be merged in"
        );
    }
}
