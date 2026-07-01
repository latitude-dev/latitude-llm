//! [`GraphqlBinding`] — adapts [`super::CliApp`] to the root
//! [`crate::binding::Binding`] trait so it can be composed into
//! a root-level [`crate::app::CliApp`].

use std::io::IsTerminal;
use std::sync::Arc;

use crate::auth::{AuthCredentialSource, DynAuthProvider};
use crate::binding::{Binding, BoxFuture, DispatchResult};
use crate::error::CliError;
use crate::graphql::commands;
use crate::graphql::discovery::GraphQLSchema;
use crate::graphql::executor;

struct Prepared {
    doc: GraphQLSchema,
    http_config: crate::http::HttpConfig,
    auth_provider: DynAuthProvider,
}

/// A GraphQL binding that wraps [`super::CliApp`]'s internals and
/// exposes them through the [`Binding`] trait.
#[must_use]
pub struct GraphqlBinding {
    inner: super::CliApp,
    /// When set, the entire GraphQL surface is mounted under this single
    /// top-level command (e.g. `graphql`) instead of contributing its
    /// resource groups directly at the root. Lets a GraphQL binding
    /// coexist with another binding whose group names would otherwise
    /// collide (e.g. an OpenAPI binding for the same vendor).
    prefix: Option<String>,
    prepared: std::sync::Mutex<Option<Arc<Prepared>>>,
}

impl Default for GraphqlBinding {
    fn default() -> Self {
        Self {
            inner: super::CliApp::new(""),
            prefix: None,
            prepared: std::sync::Mutex::new(None),
        }
    }
}

impl GraphqlBinding {
    /// Create a new GraphQL binding. The CLI name is set automatically
    /// by `CliApp::binding()` — no need to pass it here.
    pub fn new() -> Self {
        Self::default()
    }

    pub fn spec(mut self, json: &str) -> Self {
        self.inner = self.inner.spec(json);
        self
    }

    pub fn endpoint(mut self, url: &str) -> Self {
        self.inner = self.inner.endpoint(url);
        self
    }

    /// Mount the entire GraphQL surface under a single top-level command.
    ///
    /// Without this, the binding contributes its resource groups directly
    /// at the CLI root (`<cli> payment …`). With `.under("graphql")`, the
    /// same surface is reachable as `<cli> graphql payment …`, freeing the
    /// root namespace for another binding (e.g. a REST `OpenApiBinding`).
    pub fn under(mut self, prefix: &str) -> Self {
        self.prefix = Some(prefix.to_string());
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

    pub fn auth_provider(
        mut self,
        scheme_name: &str,
        provider: impl crate::auth::provider::AuthProvider + 'static,
    ) -> Self {
        self.inner = self.inner.auth_provider(scheme_name, provider);
        self
    }

    fn ensure_prepared(&self) -> Result<Arc<Prepared>, CliError> {
        let mut guard = self.prepared.lock().unwrap();
        if let Some(ref arc) = *guard {
            return Ok(Arc::clone(arc));
        }

        let json = self.inner.spec_json.as_deref().ok_or_else(|| {
            CliError::Discovery("No spec provided. Call .spec() on GraphqlBinding.".to_string())
        })?;
        let endpoint = self.inner.endpoint_url.as_deref().ok_or_else(|| {
            CliError::Discovery(
                "No endpoint provided. Call .endpoint() on GraphqlBinding.".to_string(),
            )
        })?;
        let mut doc = crate::graphql::load_graphql_schema(json, &self.inner.name, endpoint)?;

        // If a prefix is configured, nest every top-level resource under a
        // single synthetic resource. `build_cli`, `resolve_method_from_matches`,
        // and the JSON-help walk all recurse through `resources`, so this is
        // all that's needed to mount the whole surface under `<prefix>`.
        if let Some(prefix) = &self.prefix {
            let original = std::mem::take(&mut doc.resources);
            let wrapper = crate::graphql::discovery::GraphQLResource {
                methods: std::collections::HashMap::new(),
                resources: original,
            };
            doc.resources = std::collections::HashMap::from([(prefix.clone(), wrapper)]);
        }

        let http_config = crate::http::HttpConfig::new(&self.inner.name)?
            .with_parsed_root_certs(
                self.inner.extra_root_certs.iter().cloned(),
                self.inner.extra_root_certs_pem.iter().cloned(),
            );
        let auth_provider = self.inner.build_auth_provider();

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
            self.inner.build_auth_provider_from_finalized(&finalized)
        };

        Ok(super::app::BindingEntry {
            doc: prepared.doc.clone(),
            auth_provider,
            http_config: prepared.http_config.clone(),
        })
    }

    /// Wrap a typed handler function into a [`CliCommandHandler`] that
    /// automatically downcasts the binding context to
    /// [`AppContext`](super::AppContext).
    ///
    /// Use this with [`CliApp::command()`](crate::app::CliApp::command)
    /// or [`CliApp::command_under()`](crate::app::CliApp::command_under).
    pub fn handler(
        f: fn(&clap::ArgMatches, &super::AppContext) -> Result<(), crate::error::CliError>,
    ) -> crate::app::CliCommandHandler {
        Box::new(move |matches: &clap::ArgMatches, ctx: &dyn std::any::Any| {
            let ctx = ctx.downcast_ref::<super::AppContext>().ok_or_else(|| {
                crate::error::CliError::Validation(
                    "handler requires a GraphQL binding context".into(),
                )
            })?;
            f(matches, ctx)
        })
    }


}

impl Binding for GraphqlBinding {
    fn name(&self) -> &str {
        &self.inner.name
    }

    fn set_cli_name(&mut self, name: &str) {
        self.inner.name = name.to_string();
    }

    fn set_root_auth(&mut self, bindings: &[(String, crate::auth::SchemeBinding)]) {
        let mut merged = bindings.to_vec();
        merged.extend(std::mem::take(&mut self.inner.auth_bindings));
        self.inner.auth_bindings = merged;
    }

    fn schema(&self, path: &[String]) -> Result<Option<serde_json::Value>, CliError> {
        let prepared = self.ensure_prepared()?;
        Ok(super::help::build_schema(&prepared.doc, path))
    }

    fn build_command(&self) -> Result<clap::Command, CliError> {
        let prepared = self.ensure_prepared()?;
        let cli = commands::build_cli(&prepared.doc);
        let mut cli = self.inner.decorate_command(cli);

        // Register global --<name> flags for CLI-bound auth sources
        // so clap knows about them before parsing.
        let cli_auth_args = crate::auth::collect_binding_cli_args(&self.inner.auth_bindings);
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

        Ok(cli)
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
                self.inner.build_auth_provider_from_finalized(&finalized)
            };

            let (method, matched_args) =
                super::resolve_method_from_matches(&prepared.doc, root_matches)?;

            let params_override = matched_args
                .get_one::<String>("params")
                .map(|s| s.as_str());
            let params = super::app::collect_params_from_flags(
                matched_args,
                method,
                params_override,
            )?;
            let params_json_string = serde_json::to_string(&params)
                .map_err(|e| CliError::Validation(format!("Failed to serialize params: {e}")))?;
            let params_json: Option<&str> = if params.is_empty() {
                None
            } else {
                Some(&params_json_string)
            };

            let body_json_owned = crate::cli_args::resolve_body_json(matched_args)?;
            let body_json = body_json_owned.as_deref();

            // Both `--dry-run` and `--no-retry` are global debug flags; read
            // them with `try_get_one` so an unmatched flag yields a clean
            // `false` rather than a panic (defensive against future callers
            // that do not register every built-in flag).
            let dry_run = matched_args
                .try_get_one::<bool>("dry-run")
                .ok()
                .flatten()
                .copied()
                .unwrap_or(false);
            let debug = root_matches
                .try_get_one::<bool>("debug")
                .ok()
                .flatten()
                .copied()
                .unwrap_or(false);
            let pagination = super::app::build_pagination_config(matched_args, &self.inner.name);
            let no_retry = matched_args
                .try_get_one::<bool>("no-retry")
                .ok()
                .flatten()
                .copied()
                .unwrap_or(false);
            let retry_policy = executor::resolve_retry_policy(no_retry);

            let base_url_override_owned =
                crate::cli_args::resolve_base_url_override(root_matches, &self.inner.name)?;
            let base_url_override = base_url_override_owned.as_deref();

            // When --page-all is active on a TTY without --no-pager,
            // let the executor write directly to the pager (capture_output
            // = false). The executor spawns the pager and returns None,
            // which maps to DispatchResult::Handled below.
            let use_pager = pagination.page_all
                && !pagination.no_pager
                && std::io::stdout().is_terminal();
            let capture_output = !use_pager;

            let pipeline = crate::formatter::OutputPipeline::from_matches(root_matches, &self.inner.name)
                    .map_err(|e| CliError::Validation(e.to_string()))?;
            if pipeline.is_http() {
                return Err(CliError::Validation(
                    "the `http` output format is only supported for OpenAPI-based CLIs".to_string(),
                ));
            }

            let result = executor::execute_method(
                &prepared.doc,
                method,
                params_json,
                body_json,
                &auth_provider,
                dry_run,
                &pagination,
                &pipeline,
                capture_output,
                base_url_override,
                &prepared.http_config,
                &retry_policy,
                no_retry,
                debug,
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
        let ctx = super::AppContext::new(
            entry.doc,
            entry.auth_provider,
            entry.http_config,
        ).with_quiet(quiet).with_debug(debug);
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
        match existing {
            Some(ctx_box) => match ctx_box.downcast::<super::AppContext>() {
                Ok(mut ctx) => {
                    ctx.add_entry(entry);
                    ctx.debug = debug;
                    ctx.quiet = quiet;
                    Ok(Some(ctx as Box<dyn std::any::Any + Send + Sync>))
                }
                Err(original) => {
                    let ctx = super::AppContext::new(
                        entry.doc,
                        entry.auth_provider,
                        entry.http_config,
                    ).with_quiet(quiet).with_debug(debug);
                    let _ = original;
                    Ok(Some(Box::new(ctx)))
                }
            },
            None => {
                let ctx = super::AppContext::new(
                    entry.doc,
                    entry.auth_provider,
                    entry.http_config,
                ).with_quiet(quiet).with_debug(debug);
                Ok(Some(Box::new(ctx)))
            }
        }
    }
}
