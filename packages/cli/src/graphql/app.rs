//! High-level API for building CLIs from GraphQL schemas.
//!
//! [`CliApp`] provides a builder-style API that lets consumers create a
//! fully-functional CLI in just a few lines. [`AppContext`] exposes the
//! loaded spec and executor so that custom command handlers can call the
//! API programmatically.

use crate::auth::{AuthCredentialSource, AuthStrategy, DynAuthProvider, SchemeBinding};
use crate::error::CliError;
use crate::formatter;
use crate::graphql::discovery::{GraphQLSchema as RestDescription, GraphQLOperation as RestMethod};
use crate::graphql::executor;

/// Builder for a schema-driven CLI application (GraphQL).
pub struct CliApp {
    pub(crate) name: String,
    pub(crate) spec_json: Option<String>,
    pub(crate) endpoint_url: Option<String>,
    /// Auth bindings; mirrors the OpenAPI variant. GraphQL introspection
    /// JSON doesn't carry per-operation security metadata, so the
    /// constructed provider is `Any` by default — generators can flip
    /// [`auth_strategy`](Self::auth_strategy) to `All` for APIs that
    /// require multiple schemes simultaneously.
    pub(crate) auth_bindings: Vec<(String, SchemeBinding)>,
    auth_strategy: AuthStrategy,
    /// Trust roots parsed at builder-call time. Storing parsed certs (not
    /// raw bytes) means the validation error message lives in one place
    /// — at the call site of `extra_root_cert`, where it's most useful.
    pub(crate) extra_root_certs: Vec<reqwest::Certificate>,
    /// Raw PEM bytes for each trust root added via `extra_root_cert`, kept
    /// alongside the parsed `extra_root_certs` above. Threaded through to
    /// `HttpConfig::with_parsed_root_certs` so transport-neutral callers
    /// (`HttpConfig::resolve`) can hand PEM to non-reqwest TLS connectors.
    pub(crate) extra_root_certs_pem: Vec<Vec<u8>>,
}

#[allow(dead_code)] // Methods available for binding wrappers to delegate to.
impl CliApp {
    /// Create a new CLI application with the given binary name.
    pub fn new(name: &str) -> Self {
        Self {
            name: name.to_string(),
            spec_json: None,
            endpoint_url: None,
            auth_bindings: Vec::new(),
            auth_strategy: AuthStrategy::Auto,
            extra_root_certs: Vec::new(),
            extra_root_certs_pem: Vec::new(),
        }
    }

    /// Set the GraphQL introspection JSON schema string. Typically used with `include_str!`.
    pub fn spec(mut self, json: &str) -> Self {
        self.spec_json = Some(json.to_string());
        self
    }

    /// Set the GraphQL endpoint URL.
    pub fn endpoint(mut self, url: &str) -> Self {
        self.endpoint_url = Some(url.to_string());
        self
    }

    /// Shorthand for `auth_scheme(name, AuthCredentialSource::from_env(env))`.
    pub fn auth_scheme_env(self, scheme_name: &str, env_var: &str) -> Self {
        self.auth_scheme(scheme_name, AuthCredentialSource::from_env(env_var))
    }

    /// Shorthand for `auth_scheme(name, AuthCredentialSource::cli(arg_name))`.
    /// Auto-registers a global `--<arg_name>` flag at run time.
    pub fn auth_scheme_cli(self, scheme_name: &str, arg_name: &str) -> Self {
        self.auth_scheme(scheme_name, AuthCredentialSource::cli(arg_name))
    }

    /// Shorthand for `auth_scheme(name, AuthCredentialSource::file(path))`.
    pub fn auth_scheme_file(self, scheme_name: &str, path: impl AsRef<std::path::Path>) -> Self {
        self.auth_scheme(scheme_name, AuthCredentialSource::file(path))
    }

    /// Bind a credential source to a named auth scheme. See
    /// [`crate::openapi::CliApp::auth_scheme`] for the OpenAPI version's
    /// detailed semantics — the GraphQL variant differs only in that there
    /// is no spec-declared scheme metadata, so single-value bindings always
    /// produce an `Authorization: Bearer <value>` provider.
    pub fn auth_scheme(mut self, scheme_name: &str, source: AuthCredentialSource) -> Self {
        self.auth_bindings
            .push((scheme_name.to_string(), SchemeBinding::Token(source)));
        self
    }

    /// Bind separate username and password sources to a basic-auth scheme.
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

    /// Plug in a fully-custom [`AuthProvider`][crate::auth::AuthProvider] for
    /// a scheme name. Wraps the provider in [`Arc`] internally; use
    /// [`auth_provider_shared`](Self::auth_provider_shared) if you already
    /// have a `DynAuthProvider`.
    pub fn auth_provider<P>(self, scheme_name: &str, provider: P) -> Self
    where
        P: crate::auth::AuthProvider + 'static,
    {
        self.auth_provider_shared(scheme_name, std::sync::Arc::new(provider))
    }

    /// Variant of [`auth_provider`](Self::auth_provider) that takes an
    /// already-built [`DynAuthProvider`].
    pub fn auth_provider_shared(
        mut self,
        scheme_name: &str,
        provider: DynAuthProvider,
    ) -> Self {
        self.auth_bindings.push((
            scheme_name.to_string(),
            SchemeBinding::Custom(provider),
        ));
        self
    }

    /// Pin how the bound auth schemes compose. See
    /// [`crate::openapi::CliApp::auth_strategy`] for details. GraphQL has
    /// no per-endpoint security metadata, so [`AuthStrategy::Routing`]
    /// degenerates to `Any` here.
    pub fn auth_strategy(mut self, strategy: AuthStrategy) -> Self {
        self.auth_strategy = strategy;
        self
    }

    /// Register an extra trust root that this CLI will accept on top of the
    /// system's default roots. `pem` must be a PEM-encoded certificate (or
    /// concatenated PEM bundle), typically loaded with `include_bytes!`.
    ///
    /// Useful for distributing a CLI inside an organization where every
    /// machine should trust the company's internal CA out of the box, without
    /// asking each user to set `<NAME>_CA_BUNDLE`.
    ///
    /// ```ignore
    /// # // ignored: needs a real PEM file at the include path.
    /// CliApp::new("internal-tool")
    ///     .spec(include_str!("schema.json"))
    ///     .endpoint("https://internal.example.com/graphql")
    ///     .extra_root_cert(include_bytes!("../certs/corp-ca.pem"))
    ///     .run()
    /// ```
    ///
    /// Panics if the bytes don't parse as PEM, or if the PEM contains no
    /// certificates. Failing fast at startup is preferable to silently
    /// shipping a CLI that ignores its bundled cert.
    pub fn extra_root_cert(mut self, pem: &[u8]) -> Self {
        // Share the validation path with `HttpConfig::with_extra_root_cert`
        // so error wording stays in sync between the panicking builder API
        // and the Result-returning lower-level API.
        let certs = crate::http::parse_extra_root_cert(pem)
            .unwrap_or_else(|e| panic!("CliApp::extra_root_cert: {e}"));
        self.extra_root_certs.extend(certs);
        self.extra_root_certs_pem.push(pem.to_vec());
        self
    }

    /// Decorate a clap `Command` with the auth help section and built-in debug flags.
    /// Called from `GraphqlBinding::build_command()`.
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
        cli = cli.arg(
            clap::Arg::new("debug")
                .long("debug")
                .action(clap::ArgAction::SetTrue)
                .global(true)
                .help("Dump HTTP request and response to stderr"),
        );
        cli
    }


    /// Construct the [`DynAuthProvider`] used for this run from the
    /// registered bindings. GraphQL has no spec-declared schemes; with no
    /// bindings, returns a `NoAuthProvider`.
    pub(crate) fn build_auth_provider(&self) -> DynAuthProvider {
        crate::auth::build_provider_with_strategy(
            &self.auth_bindings,
            &std::collections::HashMap::new(),
            self.auth_strategy,
            false,
        )
    }

    /// Build an auth provider from externally-finalized bindings.
    /// Used by `GraphqlBinding::dispatch` after CLI-bound auth sources
    /// have been resolved against the parsed clap matches.
    pub(crate) fn build_auth_provider_from_finalized(
        &self,
        finalized: &[(String, crate::auth::SchemeBinding)],
    ) -> DynAuthProvider {
        crate::auth::build_provider_with_strategy(
            finalized,
            &std::collections::HashMap::new(),
            self.auth_strategy,
            false,
        )
    }
}

/// One binding's worth of prepared state inside an [`AppContext`].
pub(crate) struct BindingEntry {
    pub(crate) doc: RestDescription,
    pub(crate) auth_provider: DynAuthProvider,
    pub(crate) http_config: crate::http::HttpConfig,
}

/// Runtime context passed to custom command handlers.
///
/// Provides access to the loaded API spec(s) and the constructed auth
/// provider(s). When multiple `GraphqlBinding`s are registered,
/// method lookups and execution are automatically routed to the
/// binding that owns the target method.
pub struct AppContext {
    entries: Vec<BindingEntry>,
    /// Whether `--quiet` was passed on the command line.
    pub(crate) quiet: bool,
    /// Whether `--debug` was passed on the command line. When true, the
    /// executor dumps HTTP request/response traffic to stderr.
    pub(crate) debug: bool,
}

impl AppContext {
    pub(crate) fn new(
        doc: RestDescription,
        auth_provider: DynAuthProvider,
        http_config: crate::http::HttpConfig,
    ) -> Self {
        Self {
            entries: vec![BindingEntry { doc, auth_provider, http_config }],
            quiet: false,
            debug: false,
        }
    }

    pub(crate) fn with_quiet(mut self, quiet: bool) -> Self {
        self.quiet = quiet;
        self
    }

    pub(crate) fn with_debug(mut self, debug: bool) -> Self {
        self.debug = debug;
        self
    }

    /// Add another binding's prepared state to this context.
    pub(crate) fn add_entry(&mut self, entry: BindingEntry) {
        self.entries.push(entry);
    }

    /// Find which entry owns `method` by pointer identity.
    fn entry_for_method(&self, method: &RestMethod) -> &BindingEntry {
        for entry in &self.entries {
            if resource_tree_contains_method(&entry.doc.resources, method) {
                return entry;
            }
        }
        &self.entries[0]
    }

    /// Execute an API method by name, using the same executor as built-in
    /// commands. Automatically routes to the binding that owns `method`.
    pub fn execute(
        &self,
        method: &RestMethod,
        params_json: Option<&str>,
        body_json: Option<&str>,
        output_format: &formatter::OutputFormat,
    ) -> Result<(), CliError> {
        let entry = self.entry_for_method(method);
        let pagination = executor::PaginationConfig::default();
        let pipeline = formatter::OutputPipeline {
            format: output_format.clone(),
            color_mode: formatter::ColorMode::default(),
            quiet: self.quiet,
            query: None,
        };

        // Programmatic execution from custom command handlers honors the
        // default retry policy; there is no `--no-retry` opt-out on this path.
        let retry_policy = executor::resolve_retry_policy(false);

        tokio::runtime::Handle::current()
            .block_on(executor::execute_method(
                &entry.doc,
                method,
                params_json,
                body_json,
                &entry.auth_provider,
                false,
                &pagination,
                &pipeline,
                false,
                None,
                &entry.http_config,
                &retry_policy,
                false,
                false, // debug: programmatic callers never use the HTTP dump
            ))
            .map(|_| ())
    }

    /// Returns a reference to the loaded API spec.
    ///
    /// When multiple `GraphqlBinding`s are registered, this returns the
    /// first binding's spec. Use [`find_method`](Self::find_method) to
    /// search across all bindings.
    pub fn spec(&self) -> &RestDescription {
        &self.entries[0].doc
    }

    /// Returns references to all loaded API specs.
    pub fn specs(&self) -> Vec<&RestDescription> {
        self.entries.iter().map(|e| &e.doc).collect()
    }

    /// Search all registered specs for a method at `resource.method_name`.
    pub fn find_method(
        &self,
        resource: &str,
        method_name: &str,
    ) -> Result<&RestMethod, CliError> {
        for entry in &self.entries {
            if let Some(r) = entry.doc.resources.get(resource) {
                if let Some(m) = r.methods.get(method_name) {
                    return Ok(m);
                }
            }
        }
        Err(CliError::Validation(format!(
            "no method '{method_name}' found in resource '{resource}' across {} binding(s)",
            self.entries.len(),
        )))
    }

    /// Returns a reference to the HTTP/TLS configuration for this CLI run.
    ///
    /// See [`crate::openapi::AppContext::http_config`] for the design
    /// rationale and how non-reqwest transports consume this.
    pub fn http_config(&self) -> &crate::http::HttpConfig {
        &self.entries[0].http_config
    }
}

/// Recursively check whether any method in the resource tree is
/// pointer-equal to `target`.
fn resource_tree_contains_method(
    resources: &std::collections::HashMap<String, crate::graphql::discovery::GraphQLResource>,
    target: &RestMethod,
) -> bool {
    for resource in resources.values() {
        for m in resource.methods.values() {
            if std::ptr::eq(m, target) {
                return true;
            }
        }
        if resource_tree_contains_method(&resource.resources, target) {
            return true;
        }
    }
    false
}

/// Recursively walks clap ArgMatches to find the leaf method and its matches.
pub fn resolve_method_from_matches<'a>(
    doc: &'a RestDescription,
    matches: &'a clap::ArgMatches,
) -> Result<(&'a RestMethod, &'a clap::ArgMatches), CliError> {
    let mut path: Vec<&str> = Vec::new();
    let mut current_matches = matches;

    while let Some((sub_name, sub_matches)) = current_matches.subcommand() {
        path.push(sub_name);
        current_matches = sub_matches;
    }

    if path.is_empty() {
        return Err(CliError::Validation(
            "No resource or method specified".to_string(),
        ));
    }

    let resource_name = path[0];
    let resource = doc
        .resources
        .get(resource_name)
        .ok_or_else(|| CliError::Validation(format!("Resource '{resource_name}' not found")))?;

    let mut current_resource = resource;

    for &name in &path[1..path.len() - 1] {
        if let Some(sub) = current_resource.resources.get(name) {
            current_resource = sub;
        } else {
            return Err(CliError::Validation(format!(
                "Sub-resource '{name}' not found"
            )));
        }
    }

    let method_name = path[path.len() - 1];

    if let Some(method) = current_resource.methods.get(method_name) {
        return Ok((method, current_matches));
    }

    Err(CliError::Validation(format!(
        "Method '{method_name}' not found on resource. Available methods: {:?}",
        current_resource.methods.keys().collect::<Vec<_>>()
    )))
}

/// Collect individual flag values into a params map.
/// Values from --params JSON override individual flags.
pub(crate) fn collect_params_from_flags(
    matched_args: &clap::ArgMatches,
    method: &crate::graphql::discovery::GraphQLOperation,
    params_override: Option<&str>,
) -> Result<serde_json::Map<String, serde_json::Value>, CliError> {
    let mut params = serde_json::Map::new();

    // Collect values from individual flags
    for param_name in method.parameters.keys() {
        if let Some(value) = matched_args.get_one::<String>(param_name) {
            params.insert(param_name.clone(), serde_json::Value::String(value.clone()));
        }
    }

    // Override with --params JSON if provided (--params wins)
    if let Some(json_str) = params_override {
        let overrides: serde_json::Map<String, serde_json::Value> =
            serde_json::from_str(json_str)
                .map_err(|e| CliError::Validation(format!("Invalid --params JSON: {e}")))?;
        for (key, value) in overrides {
            params.insert(key, value);
        }
    }

    Ok(params)
}

pub(crate) fn build_pagination_config(
    matches: &clap::ArgMatches,
    cli_name: &str,
) -> executor::PaginationConfig {
    executor::PaginationConfig {
        page_all: matches.get_flag("page-all"),
        page_limit: matches
            .get_one::<u32>("page-limit")
            .copied()
            .unwrap_or(10),
        page_delay_ms: matches
            .get_one::<u64>("page-delay")
            .copied()
            .unwrap_or(100),
        no_pager: matches.get_flag("no-pager"),
        cli_name: cli_name.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_graphql_cli_app_builder() {
        let app = CliApp::new("test").spec("{}");
        assert_eq!(app.name, "test");
        assert!(app.spec_json.is_some());
    }

    #[test]
    fn test_graphql_auth_scheme_records_binding() {
        let app = CliApp::new("t")
            .spec("{}")
            .auth_scheme("bearerAuth", AuthCredentialSource::from_env("T"));
        assert_eq!(app.auth_bindings.len(), 1);
    }

    #[test]
    fn test_graphql_cli_app_endpoint() {
        let app = CliApp::new("graphql-fixture")
            .spec("{}")
            .endpoint("https://example.com/graphql");
        assert_eq!(app.endpoint_url.as_deref(), Some("https://example.com/graphql"));
    }

}
