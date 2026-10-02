//! High-level API for building CLIs from OpenAPI specs.
//!
//! [`CliApp`] provides a builder-style API that lets consumers create a
//! fully-functional CLI in just a few lines. [`AppContext`] exposes the
//! loaded spec and executor so that custom command handlers can call the
//! API programmatically.

use std::collections::HashMap;

use crate::auth::{AuthCredentialSource, AuthStrategy, DynAuthProvider, SchemeBinding};
use crate::error::CliError;
use crate::formatter;
use crate::openapi::discovery::{GlobalParameter, JsonSchema, RestDescription, RestMethod, RestResource};
use crate::openapi::executor;

/// Split a slash-delimited prefix string into its path components, dropping
/// empty segments so accidental leading/trailing slashes are forgiving.
fn split_prefix(prefix: &str) -> Vec<String> {
    prefix
        .split('/')
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect()
}

/// Merge `incoming` resources into `target` at the given nested namespace
/// path. Empty path = flat top-level merge. Multi-segment path = walk/create
/// intermediate resources, merge at the leaf.
///
/// **Stutter elision:** at the leaf, if `incoming` contains a top-level
/// resource whose name matches the leaf namespace, that resource's methods
/// and sub-resources are *hoisted* into the namespace itself — eliminating
/// the `bigcommerce v3 customers customers get` repetition that would
/// otherwise occur when a spec's primary domain matches the namespace name.
/// Other top-level resources from the spec become children of the
/// namespace as usual.
fn merge_into_path(
    target: &mut HashMap<String, RestResource>,
    path: &[String],
    mut incoming: HashMap<String, RestResource>,
) -> Result<(), CliError> {
    if path.is_empty() {
        for key in incoming.keys() {
            if target.contains_key(key) {
                return Err(CliError::Discovery(format!(
                    "Resource key collision: '{key}' appears in multiple specs"
                )));
            }
        }
        target.extend(incoming);
        return Ok(());
    }

    if path.len() == 1 {
        let leaf = path[0].clone();
        let entry = target.entry(leaf.clone()).or_insert_with(|| RestResource {
            resources: HashMap::new(),
            methods: HashMap::new(),
        });

        // Hoist a matching-name resource from the spec into the namespace.
        if let Some(matching) = incoming.remove(&leaf) {
            for (k, v) in matching.methods {
                if entry.methods.contains_key(&k) {
                    return Err(CliError::Discovery(format!(
                        "Method key collision: '{k}' under namespace '{leaf}'"
                    )));
                }
                entry.methods.insert(k, v);
            }
            for (k, v) in matching.resources {
                if entry.resources.contains_key(&k) {
                    return Err(CliError::Discovery(format!(
                        "Resource key collision: '{k}' under namespace '{leaf}'"
                    )));
                }
                entry.resources.insert(k, v);
            }
        }

        for (k, v) in incoming {
            if entry.resources.contains_key(&k) {
                return Err(CliError::Discovery(format!(
                    "Resource key collision: '{k}' under namespace '{leaf}'"
                )));
            }
            entry.resources.insert(k, v);
        }
        return Ok(());
    }

    let head = path[0].clone();
    let entry = target.entry(head).or_insert_with(|| RestResource {
        resources: HashMap::new(),
        methods: HashMap::new(),
    });
    merge_into_path(&mut entry.resources, &path[1..], incoming)
}

/// Replace `{name}` substrings in `s` with values from `subs`. Variables not
/// in the map are left literal so dry-run output and downstream errors can
/// still pinpoint what's missing.
fn substitute_url_vars(s: &str, subs: &HashMap<String, String>) -> String {
    let mut out = s.to_string();
    for (name, value) in subs {
        out = out.replace(&format!("{{{name}}}"), value);
    }
    out
}

/// Walk the merged doc and substitute server variables in every `root_url`
/// (top-level + per-method, since per-operation server overrides each have
/// their own URL).
fn apply_server_var_substitutions(
    doc: &mut crate::openapi::discovery::RestDescription,
    subs: &HashMap<String, String>,
) {
    if subs.is_empty() {
        return;
    }
    doc.root_url = substitute_url_vars(&doc.root_url, subs);
    for server in &mut doc.servers {
        server.url = substitute_url_vars(&server.url, subs);
    }
    fn walk(res: &mut crate::openapi::discovery::RestResource, subs: &HashMap<String, String>) {
        for method in res.methods.values_mut() {
            method.root_url = substitute_url_vars(&method.root_url, subs);
            for server in &mut method.servers {
                server.url = substitute_url_vars(&server.url, subs);
            }
        }
        for sub in res.resources.values_mut() {
            walk(sub, subs);
        }
    }
    for res in doc.resources.values_mut() {
        walk(res, subs);
    }
}

/// Collect every server variable declared in the spec's `servers:` blocks
/// (top-level first, then per-operation overrides sorted by name so the
/// flag order is stable across runs). First declaration wins on name
/// collisions — a variable of a given name is one CLI flag, however many
/// servers reference it.
pub(crate) fn collect_spec_server_variables(
    doc: &crate::openapi::discovery::RestDescription,
) -> Vec<crate::openapi::discovery::ServerVariable> {
    use crate::openapi::discovery::{RestResource, Server, ServerVariable};

    fn collect(
        servers: &[Server],
        seen: &mut std::collections::HashSet<String>,
        out: &mut Vec<ServerVariable>,
    ) {
        for server in servers {
            for var in &server.variables {
                if seen.insert(var.name.clone()) {
                    out.push(var.clone());
                }
            }
        }
    }

    fn walk(
        res: &RestResource,
        seen: &mut std::collections::HashSet<String>,
        out: &mut std::collections::BTreeMap<String, ServerVariable>,
    ) {
        for method in res.methods.values() {
            let mut per_op = Vec::new();
            collect(&method.servers, seen, &mut per_op);
            for var in per_op {
                out.insert(var.name.clone(), var);
            }
        }
        for sub in res.resources.values() {
            walk(sub, seen, out);
        }
    }

    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    collect(&doc.servers, &mut seen, &mut out);

    // Resources are stored in a `HashMap`, so per-operation variables are
    // gathered into a `BTreeMap` first to keep the emitted order stable.
    let mut per_op = std::collections::BTreeMap::new();
    for res in doc.resources.values() {
        walk(res, &mut seen, &mut per_op);
    }
    out.extend(per_op.into_values());
    out
}

/// Whether a spec declares anything for server-variable resolution to
/// act on: `servers[].variables` or `x-fern-default-url`, at the document
/// root or on an operation.
fn spec_declares_server_urls_to_resolve(
    doc: &crate::openapi::discovery::RestDescription,
) -> bool {
    use crate::openapi::discovery::{RestResource, Server};

    fn any_server(servers: &[Server]) -> bool {
        servers
            .iter()
            .any(|s| !s.variables.is_empty() || s.default_url.is_some())
    }

    fn walk(res: &RestResource) -> bool {
        res.methods.values().any(|m| any_server(&m.servers)) || res.resources.values().any(walk)
    }

    any_server(&doc.servers) || doc.resources.values().any(walk)
}

/// Swap every templated server URL for its `x-fern-default-url`.
///
/// The extension declares the concrete URL to use when the caller pins
/// none of the server's template variables — e.g. Twilio's
/// `https://api.{region}.twilio.com` defaults to `https://api.twilio.com`
/// rather than to the `region` variable's default substituted in. Only
/// called when no variable value was supplied (see
/// [`CliApp::apply_server_vars`]); otherwise the template wins so the
/// caller's value still routes the request.
fn apply_default_server_urls(doc: &mut crate::openapi::discovery::RestDescription) {
    use crate::openapi::discovery::{RestResource, Server};

    /// `url` -> `default_url` for every server that declares one, so a
    /// `root_url` copied from a server entry (the parser's fallback for
    /// operations without their own `servers:` block) is rewritten too.
    fn index(servers: &[Server], out: &mut HashMap<String, String>) {
        for server in servers {
            if let Some(default_url) = &server.default_url {
                out.insert(server.url.clone(), default_url.clone());
            }
        }
    }

    fn index_walk(res: &RestResource, out: &mut HashMap<String, String>) {
        for method in res.methods.values() {
            index(&method.servers, out);
        }
        for sub in res.resources.values() {
            index_walk(sub, out);
        }
    }

    let mut defaults_by_url = HashMap::new();
    index(&doc.servers, &mut defaults_by_url);
    for res in doc.resources.values() {
        index_walk(res, &mut defaults_by_url);
    }
    if defaults_by_url.is_empty() {
        return;
    }

    fn rewrite(url: &mut String, defaults_by_url: &HashMap<String, String>) {
        if let Some(default_url) = defaults_by_url.get(url.as_str()) {
            *url = default_url.clone();
        }
    }

    fn rewrite_walk(res: &mut RestResource, defaults_by_url: &HashMap<String, String>) {
        for method in res.methods.values_mut() {
            rewrite(&mut method.root_url, defaults_by_url);
            for server in &mut method.servers {
                rewrite(&mut server.url, defaults_by_url);
            }
        }
        for sub in res.resources.values_mut() {
            rewrite_walk(sub, defaults_by_url);
        }
    }

    rewrite(&mut doc.root_url, &defaults_by_url);
    for server in &mut doc.servers {
        rewrite(&mut server.url, &defaults_by_url);
    }
    for res in doc.resources.values_mut() {
        rewrite_walk(res, &defaults_by_url);
    }
}

/// Apply generator-supplied env-var overrides to every idempotent
/// operation's synthetic idempotency-header parameter. The parser
/// already populated `MethodParameter.env_var` from each
/// `IdempotencyHeader.env` declared in the spec; this pass overlays the
/// builder map so calls like `.idempotency_header_env("Idempotency-Key",
/// "API_IDEMPOTENCY_KEY")` win over a value baked into the spec.
///
/// Keys in `envs` are matched against the entry's `name` first, then
/// its `header` value — letting generators register against whichever
/// identifier they emit at the call site.
fn apply_idempotency_header_envs(
    doc: &mut crate::openapi::discovery::RestDescription,
    envs: &HashMap<String, String>,
) {
    if envs.is_empty() || doc.idempotency_headers.is_empty() {
        return;
    }

    // Resolve each idempotency header's wire header name to an env var,
    // checking the `name` field first and falling back to `header`.
    // Collected up front so the per-method walk below is O(headers) per
    // method instead of O(headers * builder_entries).
    let mut header_to_env: HashMap<String, String> = HashMap::new();
    for h in &doc.idempotency_headers {
        let resolved = h
            .name
            .as_deref()
            .and_then(|n| envs.get(n))
            .or_else(|| envs.get(&h.header));
        if let Some(env_var) = resolved {
            header_to_env.insert(h.header.clone(), env_var.clone());
        }
    }
    if header_to_env.is_empty() {
        return;
    }

    fn walk(
        res: &mut crate::openapi::discovery::RestResource,
        header_to_env: &HashMap<String, String>,
    ) {
        for method in res.methods.values_mut() {
            if !method.idempotent {
                continue;
            }
            for (header, env_var) in header_to_env {
                if let Some(param) = method.parameters.get_mut(header) {
                    if param.location.as_deref() == Some("header") {
                        param.env_var = Some(env_var.clone());
                    }
                }
            }
        }
        for sub in res.resources.values_mut() {
            walk(sub, header_to_env);
        }
    }
    for res in doc.resources.values_mut() {
        walk(res, &header_to_env);
    }
}

fn merge_schemas(
    acc: &mut HashMap<String, JsonSchema>,
    incoming: HashMap<String, JsonSchema>,
) -> Result<(), CliError> {
    // Multi-spec setups like BigCommerce's Management API share common schema
    // names (`ErrorResponse`, `Pagination`, `Meta`) across many specs that are
    // authored from the same template — collisions are the norm, not a bug.
    // First write wins; schemas are only used for best-effort request-body
    // validation, so a worst-case mismatch surfaces as a client-side
    // validation warning, not silent corruption. A future structural-equality
    // check could promote real differences back to an error.
    for (key, schema) in incoming {
        acc.entry(key).or_insert(schema);
    }
    Ok(())
}

/// Merge security-scheme declarations from another spec into the accumulator.
/// First write wins on collisions — multi-spec setups frequently re-declare a
/// shared `bearerAuth` from a common template, and a structural-equality check
/// would surface noise rather than help. Each operation's
/// `security_requirements` are denormalized into the operation itself at parse
/// time, so schemes only need to be merged at the top level for the eventual
/// `RoutingAuthProvider` registry.
fn merge_security_schemes(
    acc: &mut HashMap<String, crate::openapi::discovery::SecurityScheme>,
    incoming: HashMap<String, crate::openapi::discovery::SecurityScheme>,
) {
    for (key, scheme) in incoming {
        acc.entry(key).or_insert(scheme);
    }
}

/// Merge document-root OpenAPI tag descriptions across specs. First write
/// wins on normalized-name collisions, preserving deterministic metadata when
/// multiple specs declare the same tag.
fn merge_tag_descriptions(
    acc: &mut HashMap<String, String>,
    incoming: HashMap<String, String>,
) {
    for (name, description) in incoming {
        acc.entry(name).or_insert(description);
    }
}

fn merge_group_tag_names(
    acc: &mut HashMap<String, Vec<String>>,
    incoming: HashMap<String, Vec<String>>,
) {
    for (group, tags) in incoming {
        let existing = acc.entry(group).or_default();
        for tag in tags {
            if !existing.iter().any(|existing_tag| existing_tag == &tag) {
                existing.push(tag);
            }
        }
    }
}

fn merge_group_tag_operation_counts(
    acc: &mut HashMap<String, HashMap<String, usize>>,
    incoming: HashMap<String, HashMap<String, usize>>,
) {
    for (group, tags) in incoming {
        let existing = acc.entry(group).or_default();
        for (tag, count) in tags {
            *existing.entry(tag).or_default() += count;
        }
    }
}

fn merge_group_operation_counts(
    acc: &mut HashMap<String, usize>,
    incoming: HashMap<String, usize>,
) {
    for (group, count) in incoming {
        *acc.entry(group).or_default() += count;
    }
}

fn merge_tag_description_order(acc: &mut Vec<String>, incoming: Vec<String>) {
    for tag in incoming {
        if !acc.iter().any(|existing| existing == &tag) {
            acc.push(tag);
        }
    }
}

/// Merge `servers:` declarations across specs, deduplicated by URL and
/// keeping the first write. Only the first spec's `servers` (and the
/// `root_url` derived from them) survive as the document's defaults; the
/// rest are carried over so their template `variables` and
/// `x-fern-default-url` still reach URL resolution — a multi-spec CLI
/// otherwise sends the second spec's templated URL verbatim.
fn merge_servers(
    acc: &mut Vec<crate::openapi::discovery::Server>,
    incoming: Vec<crate::openapi::discovery::Server>,
) {
    use std::collections::HashSet;
    let existing: HashSet<String> = acc.iter().map(|s| s.url.clone()).collect();
    for server in incoming {
        if !existing.contains(&server.url) {
            acc.push(server);
        }
    }
}

/// Merge `x-fern-sdk-variables` declarations across specs. First write
/// wins on name collisions, mirroring [`merge_schemas`] and
/// [`merge_security_schemes`]. Multi-spec setups that share a common
/// variable across two OpenAPI files should only register the flag once
/// at the root, and a single source of truth is what makes resolution
/// deterministic.
fn merge_sdk_variables(
    acc: &mut Vec<crate::openapi::discovery::SdkVariable>,
    incoming: Vec<crate::openapi::discovery::SdkVariable>,
) {
    use std::collections::HashSet;
    let existing: HashSet<String> = acc.iter().map(|v| v.name.clone()).collect();
    for var in incoming {
        if !existing.contains(&var.name) {
            acc.push(var);
        }
    }
}

/// Returns true when the kebab-cased flag derived from an
/// `x-fern-sdk-variables` declaration collides with a built-in CLI flag
/// (`--params`, `--format`, `--dry-run`, …). Registering a global with
/// the same long name would panic clap's debug_assert at command tree
/// construction; the caller skips the offending entry and emits a
/// `tracing::warn!` so the spec author can rename the variable.
pub(crate) fn sdk_variable_collides_with_builtin(kebab: &str) -> bool {
    // Delegates so the two *config-dependent* reservations are covered too:
    // a rename via `userAgentSuffixFlag`, and `--profile` when profiles are
    // enabled. Checking `BUILTIN_FLAG_NAMES` alone let a spec whose server
    // variable happened to match either one register a duplicate long name,
    // which makes clap reject the whole command tree at startup.
    crate::openapi::commands::flag_name_is_reserved(kebab)
}

/// Merge `x-fern-global-headers` declarations across specs. First write
/// wins on header-name collisions, mirroring [`merge_sdk_variables`].
/// Multi-spec setups that share a common header across two OpenAPI files
/// should only register the flag once at the root.
fn merge_global_headers(
    acc: &mut Vec<crate::openapi::discovery::GlobalHeader>,
    incoming: Vec<crate::openapi::discovery::GlobalHeader>,
) {
    use std::collections::HashSet;
    let existing: HashSet<String> = acc.iter().map(|h| h.header.clone()).collect();
    for h in incoming {
        if !existing.contains(&h.header) {
            acc.push(h);
        }
    }
}

/// Derive the kebab-cased CLI flag (`--<flag>`) for a global header.
/// Prefers `name` (the SDK display identifier) when present; otherwise
/// falls back to kebab-casing the wire header name. Mirrors the
/// `flag_name_override` pathway used by `x-fern-idempotency-headers`.
pub(crate) fn global_header_flag_name(h: &crate::openapi::discovery::GlobalHeader) -> String {
    let source = h.name.as_deref().unwrap_or(h.header.as_str());
    crate::text::to_kebab_flag(source)
}

/// Merge `x-fern-global-parameters` declarations across specs. First
/// write wins on name collisions, mirroring [`merge_global_headers`].
fn merge_global_parameters(
    acc: &mut Vec<crate::openapi::discovery::GlobalParameter>,
    incoming: Vec<crate::openapi::discovery::GlobalParameter>,
) {
    use std::collections::HashSet;
    let existing: HashSet<String> = acc.iter().map(|p| p.name.clone()).collect();
    for p in incoming {
        if !existing.contains(&p.name) {
            acc.push(p);
        }
    }
}

/// Derive the kebab-cased CLI flag (`--<flag>`) for a global parameter.
/// Prefers `parameter_name` when present; otherwise falls back to
/// kebab-casing `name`.
pub(crate) fn global_parameter_flag_name(p: &crate::openapi::discovery::GlobalParameter) -> String {
    let source = p.parameter_name.as_deref().unwrap_or(p.name.as_str());
    crate::text::to_kebab_flag(source)
}

/// Derive a stable clap `Arg::new()` identifier for a global parameter.
/// Uses the format `global-param:<name>` to avoid collisions with
/// per-operation parameter flags.
fn global_parameter_arg_id(p: &crate::openapi::discovery::GlobalParameter) -> String {
    format!("global-param:{}", p.name)
}

/// Returns true when a global-parameter flag would collide with a
/// built-in CLI flag.
fn global_parameter_flag_collides_with_builtin(kebab: &str) -> bool {
    crate::openapi::commands::BUILTIN_FLAG_NAMES.contains(&kebab)
}

/// Resolve a global parameter value from clap matches (CLI flag > env >
/// default, handled by clap's `.env()` + `.default_value()`).
///
/// Uses `try_get_one` rather than `get_one` because the flag is not
/// guaranteed to be registered on every command: when its long name
/// collides with a per-operation parameter, the flag is dropped from
/// that operation's command (the per-op parameter wins — see
/// `register_global_header_on_nonconflicting_leaves`). On such a
/// command the arg id is unknown and `get_one` would panic;
/// `try_get_one` returns `Err`, which we map to `None`.
pub(crate) fn resolve_global_parameter_value(
    matches: &clap::ArgMatches,
    p: &crate::openapi::discovery::GlobalParameter,
) -> Option<String> {
    let arg_id = global_parameter_arg_id(p);
    match matches.try_get_one::<String>(&arg_id) {
        Ok(resolved) => normalize_global_value(resolved.map(String::as_str)),
        Err(_) => resolve_unregistered_global(p.env.as_deref(), p.default.as_deref()),
    }
}

/// Trim a resolved global header/parameter value and drop it when the result
/// is empty or whitespace-only — callers shouldn't stamp a bare
/// `X-API-Stage:` on the wire. That's almost always a user mistake worth
/// surfacing as a required-value error, and it matches the env-var-handling
/// convention elsewhere.
fn normalize_global_value(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

/// Resolve a global header/parameter on a command where its flag was never
/// registered, so clap has no `.env()` / `.default_value()` binding to read
/// through.
///
/// Two ways to land here, and both still have to honor `env` and `default`:
///
///   * the flag's long name collided with a per-operation parameter, so it
///     was attached to individual leaves instead of the root as
///     `global(true)` (`register_global_header_on_nonconflicting_leaves`);
///   * the command is a **custom command**, which is grafted after that
///     registration and whose context resolves globals from the *root*
///     `ArgMatches` (`build_binding_entry`).
///
/// Without this fallback a colliding global was stamped on built-in commands
/// but silently dropped on custom ones — the header reached the wire on
/// spec-derived requests and vanished on hand-written ones. Only the CLI flag
/// is missing here, and it's missing for the user too (the arg was never
/// registered, so there is nothing to type), so `env > default` is the whole
/// chain that was ever reachable on such a command.
fn resolve_unregistered_global(env: Option<&str>, default: Option<&str>) -> Option<String> {
    let from_env = env.and_then(|name| std::env::var(name).ok());
    normalize_global_value(from_env.as_deref().or(default))
}

/// Stable clap arg ID for a global header. Anchored to the wire header
/// name so per-op parameter lookups (which key off the same string)
/// remain consistent with what clap returns.
pub(crate) fn global_header_arg_id(h: &crate::openapi::discovery::GlobalHeader) -> String {
    format!("__global_header::{}", h.header)
}

/// Returns true when the kebab-cased flag derived from an
/// `x-fern-global-headers` entry collides with a built-in CLI flag
/// (`--params`, `--format`, …) or an already-registered global. clap
/// would panic in debug builds on collision; we skip the offending entry
/// with a `tracing::warn!` so the spec still loads.
fn global_header_flag_collides_with_builtin(kebab: &str) -> bool {
    crate::openapi::commands::BUILTIN_FLAG_NAMES.contains(&kebab)
}

/// Returns true when some operation command in the tree rooted at `cli`
/// declares a flag whose long name equals `long`. A `global(true)` arg
/// that shares a long name with a per-operation parameter makes clap
/// panic at build time ("Long option names must be unique for each
/// argument"), so a global-header flag that collides with a parameter on
/// any operation cannot be registered globally — see the call site in
/// [`CliApp::decorate_command`].
///
/// Only descendant (subcommand) args are inspected; the root's own global
/// flags (`--format`, `--dry-run`, …) are screened separately by
/// [`global_header_flag_collides_with_builtin`].
fn global_header_long_collides_with_param(cli: &clap::Command, long: &str) -> bool {
    cli.get_subcommands().any(|sub| command_declares_long(sub, long))
}

/// Recursive worker for [`global_header_long_collides_with_param`]: true
/// if `cmd` or any of its descendants declares a flag with long name
/// `long`.
fn command_declares_long(cmd: &clap::Command, long: &str) -> bool {
    cmd.get_arguments().any(|a| a.get_long() == Some(long))
        || cmd
            .get_subcommands()
            .any(|sub| command_declares_long(sub, long))
}

/// Register `arg` (a global-header flag that is *not* marked
/// `global(true)`) on every leaf operation command whose flags don't
/// already include the arg's long name. Leaves that declare a same-named
/// per-operation parameter are left untouched so the per-op parameter
/// wins (mirroring the importer semantics documented on
/// [`GlobalHeader`](crate::openapi::discovery::GlobalHeader)).
///
/// Intermediate (resource) commands are recursed into but never carry
/// the flag themselves — the resolved value is read from the leaf's
/// `ArgMatches` (see [`build_global_header_overrides`]), so attaching it
/// to the leaf is what makes the flag, its env fallback, and its default
/// available on the operations that don't collide.
///
/// The copies are not `global(true)`, so the root post-pass that files
/// globals under [`crate::cli_args::HELP_HEADING_GLOBAL`] would miss them.
/// The heading is stamped here instead — once, before the walk — so they
/// still render alongside the other globals in `--help`.
fn register_global_header_on_nonconflicting_leaves(
    cmd: clap::Command,
    arg: &clap::Arg,
    long: &str,
) -> clap::Command {
    let arg = arg
        .clone()
        .help_heading(crate::cli_args::HELP_HEADING_GLOBAL);
    attach_global_arg_to_nonconflicting_leaves(cmd, &arg, long)
}

/// The recursive half of [`register_global_header_on_nonconflicting_leaves`],
/// split out so the help heading is applied to the arg once rather than
/// re-cloned and re-stamped at every level of the command tree.
fn attach_global_arg_to_nonconflicting_leaves(
    cmd: clap::Command,
    arg: &clap::Arg,
    long: &str,
) -> clap::Command {
    let sub_names: Vec<String> = cmd
        .get_subcommands()
        .map(|c| c.get_name().to_string())
        .collect();
    if sub_names.is_empty() {
        // Leaf operation command: attach the flag unless it already
        // declares one with the same long name (per-op param wins).
        if cmd.get_arguments().any(|a| a.get_long() == Some(long)) {
            return cmd;
        }
        return cmd.arg(arg.clone());
    }
    let mut out = cmd;
    for name in sub_names {
        let arg = arg.clone();
        let long = long.to_string();
        out = out.mut_subcommand(name, move |sub| {
            attach_global_arg_to_nonconflicting_leaves(sub, &arg, &long)
        });
    }
    out
}

/// Resolve a global header value from `matched_args`, the env, and the
/// configured default — in that order. Returns `None` when none of the
/// three sources produced a value, OR when the resolved value is empty
/// or whitespace-only (callers shouldn't stamp a header like `X-API-Stage:`
/// on the wire — that's almost always a user mistake worth surfacing as a
/// required-header error, and matches the env-var-handling convention).
///
/// `matched_args.try_get_one::<String>` already incorporates clap's
/// `.env()` and `.default_value()` bindings, so the lookup is a single
/// read; the explicit env/default fields on [`GlobalHeader`] are what
/// feed those clap bindings at registration time.
///
/// Uses `try_get_one` rather than `get_one` because the flag is not
/// guaranteed to be registered on every command: when its long name
/// collides with a per-operation parameter, the flag is dropped from
/// that operation's command (the per-op parameter wins — see
/// `register_global_header_on_nonconflicting_leaves`). On such a command
/// the arg id is unknown and `get_one` would panic. `try_get_one` returns
/// `Err` instead, and we fall back to reading `env` / `default` directly —
/// see [`resolve_unregistered_global`] for why that fallback exists.
pub(crate) fn resolve_global_header_value(
    matched_args: &clap::ArgMatches,
    h: &crate::openapi::discovery::GlobalHeader,
) -> Option<String> {
    match matched_args.try_get_one::<String>(&global_header_arg_id(h)) {
        Ok(resolved) => normalize_global_value(resolved.map(String::as_str)),
        Err(_) => resolve_unregistered_global(h.env.as_deref(), h.default.as_deref()),
    }
}

/// True when an operation declares a `header`-located parameter with
/// the same wire-name as a global header AND the user supplied a value
/// for it in `params`. HTTP header names are case-insensitive per RFC
/// 7230 §3.2, so the lookup is `eq_ignore_ascii_case` rather than
/// `HashMap::contains_key` / `HashMap::get`.
pub(crate) fn per_op_header_param_overrides_global(
    params: &serde_json::Map<String, serde_json::Value>,
    method: &RestMethod,
    wire_name: &str,
) -> bool {
    let supplied = params
        .keys()
        .any(|k| k.eq_ignore_ascii_case(wire_name));
    if !supplied {
        return false;
    }
    method
        .parameters
        .iter()
        .any(|(k, p)| k.eq_ignore_ascii_case(wire_name) && p.location.as_deref() == Some("header"))
}

/// Build the structured validation error used when a required global
/// header has neither a CLI/env/default value nor a per-op override.
/// Shared by both the built-in command path
/// ([`build_global_header_overrides`]) and the custom-command path
/// ([`AppContext::extra_headers_for`]) so users get the same message
/// regardless of which dispatcher they hit.
fn missing_required_global_header_error(h: &crate::openapi::discovery::GlobalHeader) -> CliError {
    let flag = global_header_flag_name(h);
    let env_hint = match &h.env {
        Some(e) => format!(" or set ${e}"),
        None => String::new(),
    };
    CliError::Validation(format!(
        "Missing required global header '{}': provide --{}{}",
        h.header, flag, env_hint
    ))
}

/// Shared implementation of the per-op-aware required-header walk.
/// Both [`build_global_header_overrides`] (built-in path) and
/// [`AppContext::extra_headers_for`] (custom-command path) call this
/// helper, differing only in how a header's value is resolved — the
/// built-in path reads directly from clap's `ArgMatches`, the
/// custom-command path looks up the pre-resolved map.
///
/// Walks `doc_global_headers` and for each entry:
///   * skips if the operation declares a same-named header param that
///     the user supplied (per-op wins);
///   * emits `(wire-name, value)` if the resolver returns a non-empty
///     value;
///   * errors if the header is required (`optional: false`) and neither
///     a resolved value nor a per-op override is present.
///
/// The resolver closure is responsible for any trimming / empty-string
/// filtering — see [`resolve_global_header_value`] for the canonical
/// implementation.
fn finalize_global_header_overrides<R>(
    doc_global_headers: &[crate::openapi::discovery::GlobalHeader],
    method: &RestMethod,
    per_op_params: &serde_json::Map<String, serde_json::Value>,
    mut resolver: R,
) -> Result<Vec<(String, String)>, CliError>
where
    R: FnMut(&crate::openapi::discovery::GlobalHeader) -> Option<String>,
{
    let mut out = Vec::new();
    for h in doc_global_headers {
        let overridden_by_per_op =
            per_op_header_param_overrides_global(per_op_params, method, &h.header);
        let resolved = resolver(h);
        match (resolved, overridden_by_per_op) {
            (Some(value), false) => out.push((h.header.clone(), value)),
            (Some(_), true) => { /* per-op wins, do not stamp */ }
            (None, true) => { /* per-op satisfies the required check */ }
            (None, false) => {
                if !h.optional {
                    return Err(missing_required_global_header_error(h));
                }
            }
        }
    }
    Ok(out)
}

/// Build the resolved `(wire-name, value)` list of `x-fern-global-headers`
/// to stamp on every outgoing request for this invocation.
///
/// The resolution chain per header is `CLI flag > env var > default`,
/// implemented by clap's `.env()` + `.default_value()` bindings — see
/// the registration loop in `run_async`.
///
/// Per-operation overrides: if the operation declares a `header`-located
/// parameter with the same (case-insensitive) wire-name AND the user
/// supplied a value for it (present in `params`), the global header is
/// suppressed; the per-op value wins both on the wire and in the
/// required-header satisfiability check. This mirrors Fern's importer
/// behavior where a header parameter declared on the operation replaces
/// the global.
///
/// Errors when a `required` (i.e. `optional: false`) global header has
/// neither a CLI/env/default value nor a per-op override.
pub(crate) fn build_global_header_overrides(
    matched_args: &clap::ArgMatches,
    doc: &RestDescription,
    method: &RestMethod,
    params: &serde_json::Map<String, serde_json::Value>,
) -> Result<Vec<(String, String)>, CliError> {
    finalize_global_header_overrides(&doc.global_headers, method, params, |h| {
        resolve_global_header_value(matched_args, h)
    })
}

/// A single resolved global parameter value, ready for injection into
/// an outgoing request. Carries the location and wire target so the
/// executor can route the value to the correct part of the request.
#[derive(Debug, Clone)]
pub struct ResolvedGlobalParam {
    /// Stable identity of the declaring `x-fern-global-parameters` entry
    /// (its `name`). Two parameters may share a `target` across different
    /// locations (e.g. `currency` in both `query` and `body`), so the
    /// declaration must be looked up by `name`, not `target`.
    pub name: String,
    /// Where the value is injected on the wire.
    pub location: crate::openapi::discovery::GlobalParameterLocation,
    /// Wire-level target (header name, query param name, body path, or
    /// path template variable).
    pub target: String,
    /// The resolved string value.
    pub value: String,
}

/// Whether a declared global parameter's apply mode admits it on
/// `method`: `auto` always applies; `explicit` applies only when the
/// operation opts in via `x-fern-global-parameter`. Shared by both the
/// built-in command path ([`build_global_parameter_overrides`]) and the
/// custom-command path ([`CliApp::extra_global_params_for_entry`]) so the
/// two cannot drift.
pub(crate) fn global_param_apply_mode_admits(
    decl: &crate::openapi::discovery::GlobalParameter,
    method: &RestMethod,
) -> bool {
    use crate::openapi::discovery::GlobalParameterApplyMode;
    match decl.apply {
        GlobalParameterApplyMode::Auto => true,
        GlobalParameterApplyMode::Explicit => {
            method.global_parameter_opt_ins.iter().any(|n| n == &decl.name)
        }
    }
}

/// Whether a per-operation parameter supplied by the caller overrides the
/// global targeting the same wire location (per-op wins). Shared by both
/// injection paths.
pub(crate) fn per_op_param_overrides_global(
    params: &serde_json::Map<String, serde_json::Value>,
    method: &RestMethod,
    location: crate::openapi::discovery::GlobalParameterLocation,
    target: &str,
) -> bool {
    use crate::openapi::discovery::GlobalParameterLocation;
    match location {
        GlobalParameterLocation::Header => {
            per_op_header_param_overrides_global(params, method, target)
        }
        GlobalParameterLocation::Query
        | GlobalParameterLocation::Body
        | GlobalParameterLocation::Path => params.contains_key(target),
    }
}

/// Build the resolved list of `x-fern-global-parameters` to inject on
/// this operation's request.
///
/// For each declared global parameter:
/// - `apply: auto` → always inject (unless a per-op parameter overrides)
/// - `apply: explicit` → only inject if the operation opts in via
///   `x-fern-global-parameter`
///
/// Per-operation parameters with the same wire-name suppress the global
/// (per-op wins). Required globals without a resolved value error.
pub(crate) fn build_global_parameter_overrides(
    matched_args: &clap::ArgMatches,
    doc: &RestDescription,
    method: &RestMethod,
    params: &serde_json::Map<String, serde_json::Value>,
) -> Result<Vec<ResolvedGlobalParam>, CliError> {
    let mut out = Vec::new();
    for p in &doc.global_parameters {
        // Apply mode: auto injects on all ops, explicit only on opted-in ops.
        if !global_param_apply_mode_admits(p, method) {
            continue;
        }

        // A per-operation parameter with the same target overrides the global.
        let overridden = per_op_param_overrides_global(params, method, p.location, &p.target);

        let resolved = resolve_global_parameter_value(matched_args, p);
        match (resolved, overridden) {
            (Some(value), false) => {
                out.push(ResolvedGlobalParam {
                    name: p.name.clone(),
                    location: p.location,
                    target: p.target.clone(),
                    value,
                });
            }
            (Some(_), true) => { /* per-op wins */ }
            (None, true) => { /* per-op satisfies */ }
            (None, false) => {
                if !p.optional {
                    let kebab = global_parameter_flag_name(p);
                    let mut msg = format!(
                        "Required global parameter '{}' has no value.",
                        p.name,
                    );
                    if let Some(ref env) = p.env {
                        msg.push_str(&format!(
                            " Provide it via --{kebab} or {env}."
                        ));
                    } else {
                        msg.push_str(&format!(" Provide it via --{kebab}."));
                    }
                    return Err(CliError::Validation(msg));
                }
            }
        }
    }
    Ok(out)
}

/// Compose the root `--help` footer from the optional global-headers
/// section, the optional global-parameters section, the optional auth
/// section, and the always-present runtime footer. Sections are joined
/// with a single newline; absent sections are skipped entirely (no
/// stray blank dividers).
///
/// Extracted so the section-skipping logic is unit-testable in
/// isolation — the clap `Command` it eventually feeds into is opaque
/// and harder to introspect from tests.
pub(crate) fn compose_root_after_help_sections(
    global_headers_section: Option<&str>,
    global_params_section: Option<&str>,
    auth_section: Option<&str>,
    footer: &str,
) -> String {
    let mut sections: Vec<&str> = Vec::with_capacity(4);
    if let Some(s) = global_headers_section {
        sections.push(s);
    }
    if let Some(s) = global_params_section {
        sections.push(s);
    }
    if let Some(s) = auth_section {
        sections.push(s);
    }
    sections.push(footer);
    sections.join("\n")
}

/// Internal entry describing one OpenAPI spec to be merged.
pub(crate) struct SpecEntry {
    yaml: String,
    /// Empty = flat at the top level. One entry = wrap under that prefix.
    /// Multiple = wrap under nested resources (`["v3", "customers"]` →
    /// `v3.customers.*`). Path is constructed from slash-delimited input on
    /// the public API.
    prefix_path: Vec<String>,
    /// Overlay documents to apply before parsing.
    overlays: Vec<String>,
    /// Optional overrides YAML strings that are deep-merged onto the base spec
    /// before parsing. Applied sequentially — later overrides take precedence.
    /// Matches the Fern CLI `generators.yml` `overrides:` key behavior:
    /// maps merge key-by-key, arrays replace wholesale, `null` deletes keys.
    overrides: Vec<String>,
}

/// A server-URL template variable like `{store_hash}` in
/// `https://api.bigcommerce.com/stores/{store_hash}/v3`. Resolved at runtime
/// from a CLI flag (`--<name>`), an env var, or a built-in default — first
/// match wins.
#[derive(Clone)]
pub(crate) struct ServerVar {
    /// OpenAPI variable name as it appears in the URL template (`store_hash`).
    name: String,
    /// Env var consulted when the flag isn't passed (e.g. `BIGCOMMERCE_STORE_HASH`).
    env_var: Option<String>,
    /// Fallback default (for variables that have one — most BigCommerce-style
    /// store identifiers don't).
    default: Option<String>,
    /// One-line `--help` string.
    description: Option<String>,
}

/// Builder for a schema-driven CLI application (OpenAPI).
pub struct CliApp {
    pub(crate) name: String,
    pub(crate) specs: Vec<SpecEntry>,
    title_override: Option<String>,
    description_override: Option<String>,
    /// Auth bindings registered via [`auth_scheme`](Self::auth_scheme),
    /// [`auth_basic_scheme`](Self::auth_basic_scheme), and
    /// [`auth_provider`](Self::auth_provider). The constructed provider is
    /// built from these (lowered against the spec's
    /// `components.securitySchemes`).
    pub(crate) auth_bindings: Vec<(String, SchemeBinding)>,
    /// Override for how bindings compose. Defaults to [`AuthStrategy::Auto`]
    /// — the spec drives the choice. Generators that already know the
    /// API's auth model can pin a specific strategy.
    auth_strategy: AuthStrategy,
    /// Optional additive auth layers registered via
    /// [`auth_layer`](Self::auth_layer). Each is applied on top of the
    /// composed primary provider whenever it has credentials — see
    /// [`LayeredAuthProvider`](crate::auth::LayeredAuthProvider). Empty by
    /// default; layers never affect whether the primary auth is satisfiable.
    pub(crate) auth_layers: Vec<DynAuthProvider>,
    /// Trust roots parsed at builder-call time. Storing parsed certs (not
    /// raw bytes) means the validation error message lives in one place
    /// — at the call site of `extra_root_cert`, where it's most useful.
    pub(crate) extra_root_certs: Vec<reqwest::Certificate>,
    /// Raw PEM bytes for each trust root added via `extra_root_cert`, kept
    /// alongside the parsed `extra_root_certs` above. Threaded through to
    /// `HttpConfig::with_parsed_root_certs` so transport-neutral callers
    /// (`HttpConfig::resolve`) can hand PEM to non-reqwest TLS connectors
    /// (e.g. `tokio-tungstenite`).
    pub(crate) extra_root_certs_pem: Vec<Vec<u8>>,
    pub(crate) server_vars: Vec<ServerVar>,
    /// Generator-supplied environment-variable overrides for spec-root
    /// idempotency headers (parsed from `x-fern-idempotency-headers`).
    /// Keyed by the entry's `name` (preferred) or `header` value;
    /// `CliApp::build_doc` applies these to every idempotent operation's
    /// synthetic header parameter so the `--<flag>` accepts the value
    /// from the env var as a fallback.
    idempotency_header_envs: HashMap<String, String>,
    /// Compile-time preset audiences. Operations whose
    /// `x-fern-audiences` doesn't intersect this set are dropped from
    /// the command tree before clap ever sees them. Empty (the default)
    /// = no filter — every operation is included.
    ///
    /// Configured by the binary's `main.rs` via [`Self::audiences`]; not
    /// exposed as a CLI flag, mirroring fern's intent that audience
    /// selection is a build-time decision baked into the generated SDK
    /// (`packages/cli/api-importers/openapi/openapi-ir-parser/src/openapi/v3/generateIr.ts:117-143`).
    pub(crate) audiences: Vec<String>,
    /// Global parameters registered via [`global_parameter`](Self::global_parameter).
    /// These are merged with (and take precedence over) parameters parsed
    /// from the spec's `x-fern-global-parameters` extension, letting the
    /// TypeScript codegen layer supply the authoritative set from the IR.
    pub(crate) builder_global_parameters: Vec<GlobalParameter>,
}

#[allow(dead_code)] // Methods available for binding wrappers to delegate to.
impl CliApp {
    /// Create a new CLI application with the given binary name.
    pub fn new(name: &str) -> Self {
        Self {
            name: name.to_string(),
            specs: Vec::new(),
            title_override: None,
            description_override: None,
            auth_bindings: Vec::new(),
            auth_strategy: AuthStrategy::Auto,
            auth_layers: Vec::new(),
            extra_root_certs: Vec::new(),
            extra_root_certs_pem: Vec::new(),
            server_vars: Vec::new(),
            idempotency_header_envs: HashMap::new(),
            audiences: Vec::new(),
            builder_global_parameters: Vec::new(),
        }
    }

    /// Pin the CLI surface to operations tagged with one of the given
    /// `x-fern-audiences` values. Operations without an
    /// `x-fern-audiences` tag, or whose tags don't intersect this set,
    /// are dropped from the command tree at build time — they don't
    /// appear in `--help`, `--schema`, completions, or anywhere else.
    ///
    /// Multiple audiences union (OR): an operation tagged with *any* of
    /// the listed audiences survives. Calling `.audiences([])` (or not
    /// calling this at all) is a no-op — every operation is included.
    ///
    /// Audience selection is a compile-time decision baked into each
    /// binary's `main.rs`, not a runtime flag. This mirrors fern's
    /// importer semantics
    /// (`packages/cli/api-importers/openapi/openapi-ir-parser/src/openapi/v3/generateIr.ts:117-143`),
    /// where the audience filter physically removes operations from the
    /// IR rather than hiding them at execution time.
    ///
    /// ```ignore
    /// CliApp::new("my-public-api")
    ///     .spec(include_str!("openapi.yaml"))
    ///     .audiences(["public"])
    ///     .run();
    /// ```
    pub fn audiences<I, S>(mut self, audiences: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        self.audiences = audiences
            .into_iter()
            .map(Into::into)
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        self
    }

    /// Register a global parameter that surfaces as a top-level CLI flag
    /// and is injected into outgoing requests at the configured wire location.
    ///
    /// This is the builder entry point emitted by the TypeScript codegen
    /// layer (`detectGlobalParams.ts`) from `ir.globalParameters`. Parameters
    /// registered here are merged with (and take precedence over) any
    /// parameters the Rust parser finds in the raw spec's
    /// `x-fern-global-parameters` extension — the IR is authoritative.
    ///
    /// ```ignore
    /// CliApp::new("api")
    ///     .spec(include_str!("openapi.yaml"))
    ///     .global_parameter(GlobalParameter {
    ///         name: "api-version".into(),
    ///         location: GlobalParameterLocation::Query,
    ///         target: "api-version".into(),
    ///         env: Some("API_VERSION".into()),
    ///         default: None,
    ///         optional: false,
    ///         apply: GlobalParameterApplyMode::Auto,
    ///         parameter_name: None,
    ///         docs: Some("The API version to use.".into()),
    ///     })
    ///     .run();
    /// ```
    pub fn global_parameter(mut self, param: GlobalParameter) -> Self {
        self.builder_global_parameters.push(param);
        self
    }

    /// Register an environment-variable fallback for a spec-root
    /// idempotency header (declared via `x-fern-idempotency-headers`).
    ///
    /// `name` matches against the entry's `name` field first, then its
    /// `header` field — whichever the generator finds most convenient at
    /// the call site. When the user invokes an idempotent operation
    /// without the corresponding `--<flag>`, the value is taken from the
    /// named environment variable.
    ///
    /// ```ignore
    /// CliApp::new("api")
    ///     .spec(include_str!("openapi.yaml"))
    ///     .idempotency_header_env("Idempotency-Key", "API_IDEMPOTENCY_KEY")
    ///     .run();
    /// ```
    ///
    /// This is the cli-sdk entry point referenced by FER-9852, where the
    /// generator emits one call per parsed idempotency header. The
    /// header itself is only sent on operations marked
    /// `x-fern-idempotent: true`; non-idempotent operations are
    /// unaffected.
    pub fn idempotency_header_env(mut self, name: &str, env_var: &str) -> Self {
        self.idempotency_header_envs.insert(name.to_string(), env_var.to_string());
        self
    }

    /// Register a server-URL template variable (e.g. `{store_hash}`).
    ///
    /// Auto-generates a global `--<name>` flag (with kebab-cased name) and
    /// resolves the value at request time from, in order:
    ///   1. The CLI flag
    ///   2. The given env var (if any)
    ///   3. The built-in default (if any)
    ///   4. Otherwise, errors with a helpful message
    ///
    /// Used for multi-tenant APIs where every URL is parameterized — the
    /// canonical example is BigCommerce's `{store_hash}`. Variables
    /// referenced in `servers[].url` but not registered here remain literal
    /// in the URL (and the request will fail at send time), so registering
    /// them is effectively required.
    pub fn server_var(
        mut self,
        name: &str,
        env_var: Option<&str>,
        default: Option<&str>,
        description: Option<&str>,
    ) -> Self {
        self.server_vars.push(ServerVar {
            name: name.to_string(),
            env_var: env_var.map(str::to_string),
            default: default.map(str::to_string),
            description: description.map(str::to_string),
        });
        self
    }

    /// Add an OpenAPI spec YAML string. May be called multiple times; specs are flat-merged.
    /// Typically used with `include_str!`.
    pub fn spec(mut self, yaml: &str) -> Self {
        self.specs.push(SpecEntry {
            yaml: yaml.to_string(),
            prefix_path: Vec::new(),
            overlays: Vec::new(),
            overrides: Vec::new(),
        });
        self
    }

    /// Add an OpenAPI spec with a Fern-style overrides file applied before parsing.
    ///
    /// The override YAML is deep-merged onto the spec: maps merge key-by-key
    /// (override wins on leaf collisions), arrays replace wholesale, and
    /// `null` values delete the corresponding key. This matches the Fern CLI's
    /// `generators.yml` `overrides:` behavior.
    ///
    /// Use this to add `x-fern-sdk-group-name`, `x-fern-sdk-method-name`, or
    /// any other spec-level patches without modifying the upstream spec.
    pub fn spec_with_overrides(mut self, yaml: &str, overrides: &str) -> Self {
        self.specs.push(SpecEntry {
            yaml: yaml.to_string(),
            prefix_path: Vec::new(),
            overlays: Vec::new(),
            overrides: vec![overrides.to_string()],
        });
        self
    }

    /// Add an OpenAPI spec whose resources are wrapped under `prefix`. Use
    /// slashes to nest: `"v3/customers"` puts the spec's resources under
    /// `v3.customers.*`. Multiple `spec_under` calls with the same path
    /// merge into a shared namespace; inner-resource collisions error.
    pub fn spec_under(mut self, prefix: &str, yaml: &str) -> Self {
        self.specs.push(SpecEntry {
            yaml: yaml.to_string(),
            prefix_path: split_prefix(prefix),
            overlays: Vec::new(),
            overrides: Vec::new(),
        });
        self
    }

    /// Like [`spec_under`](Self::spec_under), but with a Fern-style overrides
    /// file deep-merged onto the spec before parsing.
    pub fn spec_under_with_overrides(
        mut self,
        prefix: &str,
        yaml: &str,
        overrides: &str,
    ) -> Self {
        self.specs.push(SpecEntry {
            yaml: yaml.to_string(),
            prefix_path: split_prefix(prefix),
            overlays: Vec::new(),
            overrides: vec![overrides.to_string()],
        });
        self
    }

    /// Add multiple specs that all merge under the same `prefix` (flat).
    /// Equivalent to repeated `spec_under` calls; inner-resource collisions
    /// across the specs error at startup.
    pub fn specs_under<I, S>(mut self, prefix: &str, yamls: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: AsRef<str>,
    {
        let path = split_prefix(prefix);
        for yaml in yamls {
            self.specs.push(SpecEntry {
                yaml: yaml.as_ref().to_string(),
                prefix_path: path.clone(),
                overlays: Vec::new(),
                overrides: Vec::new(),
            });
        }
        self
    }

    /// Add multiple specs under `prefix`, each given its own sub-namespace.
    /// `specs_under_named("v3", [("customers", yaml1), ("orders", yaml2)])`
    /// produces `v3.customers.*` and `v3.orders.*` — what `specs_under`
    /// would flatten, this preserves per-spec scoping. Useful when specs
    /// share cross-cutting tags (`Metafields`) that would otherwise collide
    /// once flattened.
    pub fn specs_under_named<I, K, V>(mut self, prefix: &str, named: I) -> Self
    where
        I: IntoIterator<Item = (K, V)>,
        K: AsRef<str>,
        V: AsRef<str>,
    {
        let parent = split_prefix(prefix);
        for (sub, yaml) in named {
            let mut path = parent.clone();
            path.extend(split_prefix(sub.as_ref()));
            self.specs.push(SpecEntry {
                yaml: yaml.as_ref().to_string(),
                prefix_path: path,
                overlays: Vec::new(),
                overrides: Vec::new(),
            });
        }
        self
    }

    /// Like [`specs_under_named`](Self::specs_under_named), but each entry is
    /// a `(name, yaml, overrides_yaml)` triple. The overrides file is
    /// deep-merged onto the spec before parsing.
    ///
    /// ```ignore
    /// CliApp::new("bigcommerce")
    ///     .specs_under_named_with_overrides("v3", [
    ///         ("customers",
    ///          include_str!("specs/management/customers.v3.yml"),
    ///          include_str!("overrides/management/customers.v3.yml")),
    ///     ])
    /// ```
    pub fn specs_under_named_with_overrides<I, K, V, O>(
        mut self,
        prefix: &str,
        named: I,
    ) -> Self
    where
        I: IntoIterator<Item = (K, V, O)>,
        K: AsRef<str>,
        V: AsRef<str>,
        O: AsRef<str>,
    {
        let parent = split_prefix(prefix);
        for (sub, yaml, overrides) in named {
            let mut path = parent.clone();
            path.extend(split_prefix(sub.as_ref()));
            self.specs.push(SpecEntry {
                yaml: yaml.as_ref().to_string(),
                prefix_path: path,
                overlays: Vec::new(),
                overrides: vec![overrides.as_ref().to_string()],
            });
        }
        self
    }

    /// Add an [OpenAPI Overlay](https://spec.openapis.org/overlay/latest.html)
    /// to the most recently added spec. Overlays are applied in order before
    /// the spec is parsed into the internal representation.
    ///
    /// # Panics
    ///
    /// Panics if called before `.spec()` or `.spec_under()`.
    ///
    /// # Example
    ///
    /// ```rust,ignore
    /// use fern_cli_sdk::openapi::CliApp;
    ///
    /// CliApp::new("my-api")
    ///     .spec(include_str!("openapi.yaml"))
    ///     .overlay(include_str!("overlay.yaml"))
    ///     .auth_scheme_env("bearerAuth", "MY_API_TOKEN")
    ///     .run()
    /// ```
    pub fn overlay(mut self, overlay_yaml: &str) -> Self {
        let entry = self
            .specs
            .last_mut()
            .expect("overlay() called before spec(); add a spec first");
        entry.overlays.push(overlay_yaml.to_string());
        self
    }

    /// Override the top-level --help title, regardless of what the spec(s) declare.
    pub fn title(mut self, t: &str) -> Self {
        self.title_override = Some(t.to_string());
        self
    }

    /// Override the top-level --help description, regardless of what the spec(s) declare.
    pub fn description(mut self, d: &str) -> Self {
        self.description_override = Some(d.to_string());
        self
    }

    /// Build the merged `RestDescription` from all registered specs.
    pub(crate) fn build_doc(&self) -> Result<RestDescription, CliError> {
        if self.specs.is_empty() {
            return Err(CliError::Discovery(
                "No spec provided. Call .spec() on CliApp.".to_string(),
            ));
        }

        let mut merged: Option<RestDescription> = None;

        for entry in &self.specs {
            // 1. Apply overlays (RFC 7396 style) first.
            let effective_yaml = crate::openapi::overlay::apply_overlays_to_spec(
                &entry.yaml,
                &entry.overlays,
            )?;

            // 2. Apply Fern-style overrides (deep-merge) on top.
            let spec_doc = if entry.overrides.is_empty() {
                crate::openapi::load_openapi_spec(&effective_yaml, &self.name)?
            } else {
                let mut value: serde_yaml::Value = serde_yaml::from_str(&effective_yaml)
                    .map_err(|e| CliError::Discovery(
                        format!("Failed to parse OpenAPI spec: {e}"),
                    ))?;
                for ovr in &entry.overrides {
                    let override_value: serde_yaml::Value = serde_yaml::from_str(ovr)
                        .map_err(|e| CliError::Discovery(
                            format!("Failed to parse overrides YAML: {e}"),
                        ))?;
                    value = crate::openapi::deep_merge_yaml(value, override_value);
                }
                crate::openapi::load_openapi_spec_from_value(value, &self.name)?
            };

            match merged {
                None => {
                    let mut base = spec_doc;
                    let resources = std::mem::take(&mut base.resources);
                    base.resources = HashMap::new();
                    merge_into_path(&mut base.resources, &entry.prefix_path, resources)?;
                    merged = Some(base);
                }
                Some(ref mut acc) => {
                    merge_into_path(&mut acc.resources, &entry.prefix_path, spec_doc.resources)?;
                    merge_schemas(&mut acc.schemas, spec_doc.schemas)?;
                    merge_security_schemes(&mut acc.security_schemes, spec_doc.security_schemes);
                    merge_tag_descriptions(&mut acc.tag_descriptions, spec_doc.tag_descriptions);
                    merge_group_tag_names(&mut acc.group_tag_names, spec_doc.group_tag_names);
                    merge_group_tag_operation_counts(
                        &mut acc.group_tag_operation_counts,
                        spec_doc.group_tag_operation_counts,
                    );
                    merge_group_operation_counts(
                        &mut acc.group_operation_counts,
                        spec_doc.group_operation_counts,
                    );
                    merge_group_tag_names(&mut acc.tag_group_names, spec_doc.tag_group_names);
                    merge_tag_description_order(
                        &mut acc.tag_description_order,
                        spec_doc.tag_description_order,
                    );
                    merge_servers(&mut acc.servers, spec_doc.servers);
                    merge_sdk_variables(&mut acc.sdk_variables, spec_doc.sdk_variables);
                    merge_global_headers(&mut acc.global_headers, spec_doc.global_headers);
                    merge_global_parameters(&mut acc.global_parameters, spec_doc.global_parameters);
                }
            }
        }

        let mut doc = merged.expect("at least one spec was processed");
        if let Some(ref t) = self.title_override {
            doc.title = Some(t.clone());
        }
        if let Some(ref d) = self.description_override {
            doc.description = Some(d.clone());
        }

        // Merge builder-registered global parameters (from IR via
        // TypeScript codegen). Builder params are authoritative — they
        // replace any spec-parsed param with the same name.
        if !self.builder_global_parameters.is_empty() {
            // Remove spec-parsed params that the builder overrides by name.
            let builder_names: std::collections::HashSet<String> =
                self.builder_global_parameters.iter().map(|p| p.name.clone()).collect();
            doc.global_parameters.retain(|p| !builder_names.contains(&p.name));
            // Prepend builder params (they take precedence in flag order),
            // followed by the surviving spec-parsed params.
            let mut merged = self.builder_global_parameters.clone();
            merged.append(&mut doc.global_parameters);
            doc.global_parameters = merged;
        }

        // Apply generator-supplied idempotency-header env overrides.
        // The parser populates each idempotent operation's synthetic
        // header MethodParameter with `env_var = entry.env` from the
        // spec; this pass lets the generator override or supply that
        // mapping post-hoc (FER-9852 builder API) so end users don't
        // need to edit the spec to wire a new env var.
        if !self.idempotency_header_envs.is_empty() {
            apply_idempotency_header_envs(&mut doc, &self.idempotency_header_envs);
        }

        Ok(doc)
    }

    /// Return embedded spec(s) as a YAML string.
    ///
    /// - `raw == true` → byte-exact `SpecEntry.yaml` for each entry.
    /// - `raw == false` → effective spec with overlays + overrides merged
    ///   (same pipeline as `build_doc`, but stops before parsing to
    ///   `RestDescription` to preserve full OpenAPI fidelity).
    ///
    /// Multi-spec binaries emit a YAML stream (`---`-delimited).
    pub(crate) fn spec_yaml(&self, raw: bool) -> Result<Option<String>, crate::error::CliError> {
        if self.specs.is_empty() {
            return Ok(None);
        }

        let mut documents: Vec<String> = Vec::new();

        for entry in &self.specs {
            if raw {
                documents.push(entry.yaml.clone());
            } else {
                // Reproduce the overlay + override merge from build_doc,
                // stopping before parsing to RestDescription.
                let effective = crate::openapi::overlay::apply_overlays_to_spec(
                    &entry.yaml,
                    &entry.overlays,
                )?;

                if entry.overrides.is_empty() {
                    documents.push(effective);
                } else {
                    let mut value: serde_yaml::Value =
                        serde_yaml::from_str(&effective).map_err(|e| {
                            crate::error::CliError::Discovery(format!(
                                "Failed to parse OpenAPI spec: {e}"
                            ))
                        })?;
                    for ovr in &entry.overrides {
                        let override_value: serde_yaml::Value =
                            serde_yaml::from_str(ovr).map_err(|e| {
                                crate::error::CliError::Discovery(format!(
                                    "Failed to parse overrides YAML: {e}"
                                ))
                            })?;
                        value = crate::openapi::deep_merge_yaml(value, override_value);
                    }
                    let merged = serde_yaml::to_string(&value).map_err(|e| {
                        crate::error::CliError::Discovery(format!(
                            "Failed to serialize merged spec: {e}"
                        ))
                    })?;
                    documents.push(merged);
                }
            }
        }

        // Join as a YAML stream with document separators.
        let yaml = if documents.len() == 1 {
            documents.into_iter().next().unwrap()
        } else {
            let mut yaml = documents[0].clone();
            for doc in &documents[1..] {
                if !yaml.ends_with('\n') {
                    yaml.push('\n');
                }
                yaml.push_str("---\n");
                yaml.push_str(doc);
            }
            yaml
        };

        Ok(Some(yaml))
    }

    /// Shorthand for `auth_scheme(name, AuthCredentialSource::from_env(env))`.
    /// Covers the 80% case — most callers bind a scheme to one env var.
    ///
    /// ```ignore
    /// CliApp::new("api")
    ///     .spec(include_str!("openapi.yaml"))
    ///     .auth_scheme_env("bearerAuth", "API_TOKEN")
    ///     .run();
    /// ```
    pub fn auth_scheme_env(self, scheme_name: &str, env_var: &str) -> Self {
        self.auth_scheme(scheme_name, AuthCredentialSource::from_env(env_var))
    }

    /// Shorthand for `auth_scheme(name, AuthCredentialSource::cli(arg_name))`.
    /// Auto-registers a global `--<arg_name>` flag at run time. Accepts
    /// either `"api-token"` or `"--api-token"`.
    pub fn auth_scheme_cli(self, scheme_name: &str, arg_name: &str) -> Self {
        self.auth_scheme(scheme_name, AuthCredentialSource::cli(arg_name))
    }

    /// Shorthand for `auth_scheme(name, AuthCredentialSource::file(path))`.
    /// `~` and `~/` are expanded against `$HOME`.
    pub fn auth_scheme_file(self, scheme_name: &str, path: impl AsRef<std::path::Path>) -> Self {
        self.auth_scheme(scheme_name, AuthCredentialSource::file(path))
    }

    /// Bind a credential source to a single-value auth scheme declared in the
    /// spec's `components.securitySchemes` (bearer / apiKey / oauth2).
    ///
    /// `scheme_name` should match the spec key. The credential's resolved
    /// value is sent according to the scheme's declared shape:
    ///
    /// | Scheme               | Outgoing                              |
    /// | -------------------- | ------------------------------------- |
    /// | `http: bearer`       | `Authorization: Bearer <value>`       |
    /// | `apiKey, in: header` | `<name>: <value>`                     |
    /// | `oauth2`             | `Authorization: Bearer <value>`       |
    ///
    /// When any operation in the spec declares per-endpoint `security:`,
    /// the constructed provider is a [`RoutingAuthProvider`][rap] that picks
    /// the right scheme per request. Otherwise it's a plain
    /// [`AnyAuthProvider`][aap] that tries each binding in order.
    ///
    /// [rap]: crate::auth::RoutingAuthProvider
    /// [aap]: crate::auth::AnyAuthProvider
    pub fn auth_scheme(mut self, scheme_name: &str, source: AuthCredentialSource) -> Self {
        self.auth_bindings
            .push((scheme_name.to_string(), SchemeBinding::Token(source)));
        self
    }

    /// Bind separate username and password sources to an `http: basic` scheme.
    /// Both must resolve for the provider to attach `Authorization: Basic
    /// base64(user:pass)`; if either is missing the binding contributes no
    /// credentials.
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
    /// a scheme name. Useful when the spec uses a scheme the SDK doesn't
    /// model out-of-the-box (mTLS-derived headers, request signing, OAuth2
    /// client-credentials with token refresh, etc.).
    ///
    /// Accepts any concrete `AuthProvider` by value and wraps it in [`Arc`]
    /// internally. For pre-built `Arc<dyn AuthProvider>` values (sharing a
    /// provider across multiple binders), use [`auth_provider_shared`].
    ///
    /// [`auth_provider_shared`]: Self::auth_provider_shared
    pub fn auth_provider<P>(self, scheme_name: &str, provider: P) -> Self
    where
        P: crate::auth::AuthProvider + 'static,
    {
        self.auth_provider_shared(scheme_name, std::sync::Arc::new(provider))
    }

    /// Same as [`auth_provider`] but takes an already-built
    /// [`DynAuthProvider`]. Use this when sharing one provider across
    /// multiple bindings or storing custom providers in a registry.
    ///
    /// [`auth_provider`]: Self::auth_provider
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

    /// Register an *additive* auth layer: a provider whose headers are
    /// attached on top of the composed primary auth whenever it has
    /// credentials, regardless of the [`AuthStrategy`].
    ///
    /// Unlike [`auth_scheme`](Self::auth_scheme) bound under
    /// [`AuthStrategy::All`], a layer is strictly optional — it never makes
    /// the primary auth mandatory and is silently skipped when its credential
    /// is absent. Use it for a supplementary header that sits alongside real
    /// auth and is only present in some environments.
    ///
    /// The motivating case is Lattice Sandboxes, which require an extra
    /// `Anduril-Sandbox-Authorization: Bearer <token>` header in addition to
    /// the normal bearer token — but only when developing against a sandbox:
    ///
    /// ```ignore
    /// use fern_cli_sdk::auth::{AuthCredentialSource, HeaderAuthProvider};
    ///
    /// CliApp::new("lattice")
    ///     .spec(include_str!("openapi.yaml"))
    ///     .auth_scheme_env("bearerHttpAuthentication", "ENVIRONMENT_TOKEN")
    ///     .auth_layer(HeaderAuthProvider::new(
    ///         "sandboxAuthorization",
    ///         "Anduril-Sandbox-Authorization",
    ///         AuthCredentialSource::from_env("SANDBOXES_TOKEN"),
    ///         true, // emit "Bearer <token>"
    ///     ))
    ///     .run();
    /// ```
    pub fn auth_layer<P>(self, provider: P) -> Self
    where
        P: crate::auth::AuthProvider + 'static,
    {
        self.auth_layer_shared(std::sync::Arc::new(provider))
    }

    /// Same as [`auth_layer`](Self::auth_layer) but takes an already-built
    /// [`DynAuthProvider`] (for sharing one provider across bindings).
    pub fn auth_layer_shared(mut self, provider: DynAuthProvider) -> Self {
        self.auth_layers.push(provider);
        self
    }

    /// Pin how the bound auth schemes compose into a single provider.
    /// Defaults to [`AuthStrategy::Auto`], which derives the strategy from
    /// the spec (Routing if any operation declares per-endpoint security,
    /// otherwise Any).
    ///
    /// Generators that know their API's auth model statically can override
    /// this — most importantly to express the [`All`][a] case (every
    /// scheme on every request) which the spec doesn't always model.
    ///
    /// [a]: AuthStrategy::All
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
    ///     .spec(include_str!("openapi.yaml"))
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

    /// Decorate a clap `Command` with server-variable flags, SDK-variable
    /// flags, global-header flags, and the composed help footer.
    /// Called from `OpenApiBinding::build_command()` to replicate what the
    /// old `run_async` pipeline used to do inline.
    pub(crate) fn decorate_command(
        &self,
        doc: &RestDescription,
        mut cli: clap::Command,
    ) -> clap::Command {
        let auth_section = {
            let base = crate::auth::render_auth_help_section(&self.auth_bindings);
            let layer_rows: Vec<(String, Vec<String>)> = self
                .auth_layers
                .iter()
                .map(|p| (p.name().to_string(), p.credential_hints()))
                .collect();
            let layers = crate::auth::render_auth_layers_help(&layer_rows);
            match (base, layers) {
                (Some(b), Some(l)) => Some(format!("{b}{l}")),
                (Some(b), None) => Some(b),
                // No primary bindings but layers exist — supply the heading.
                (None, Some(l)) => Some(format!("Authentication:\n{l}")),
                (None, None) => None,
            }
        };

        // Server-variable flags (e.g. `--store-hash` for {store_hash}).
        for var in &self.server_vars {
            let kebab = crate::text::to_kebab_flag(&var.name);
            let help_text = var
                .description
                .clone()
                .unwrap_or_else(|| {
                    format!("Value for the {{{}}} URL template variable", var.name)
                });
            let mut arg = clap::Arg::new(var.name.clone())
                .long(kebab)
                .global(true)
                .value_name(var.name.to_uppercase())
                .help(help_text);
            if let Some(env) = &var.env_var {
                arg = arg.env(env.clone());
            }
            if let Some(default) = &var.default {
                arg = arg.default_value(default.clone());
            }
            cli = cli.arg(arg);
        }

        // Server-variable flags declared in the spec itself
        // (`servers[].variables`). Generator-registered variables above win
        // on name collisions — they carry env-var wiring the spec can't
        // express, and so do the SDK-variable flags registered below.
        //
        // A flag is only skipped, never force-registered: an unregistered
        // variable still resolves to its declared `default` in
        // [`CliApp::apply_server_vars`], so the URL stays valid — whereas
        // handing clap two args with the same long name makes it reject the
        // whole command tree ("Long option names must be unique").
        let generator_server_vars: std::collections::HashSet<&str> =
            self.server_vars.iter().map(|v| v.name.as_str()).collect();
        let mut reserved_longs: std::collections::HashSet<String> = self
            .server_vars
            .iter()
            .map(|v| crate::text::to_kebab_flag(&v.name))
            .chain(
                doc.sdk_variables
                    .iter()
                    .map(|v| crate::text::to_kebab_flag(&v.name)),
            )
            .collect();
        for var in collect_spec_server_variables(doc) {
            if generator_server_vars.contains(var.name.as_str()) {
                continue;
            }
            let kebab = crate::text::to_kebab_flag(&var.name);
            if sdk_variable_collides_with_builtin(&kebab) {
                tracing::warn!(
                    variable = %var.name,
                    flag = %kebab,
                    "Server variable flag collides with built-in; skipping"
                );
                continue;
            }
            if !reserved_longs.insert(kebab.clone()) {
                tracing::warn!(
                    variable = %var.name,
                    flag = %kebab,
                    "Server variable flag duplicates another global flag; skipping"
                );
                continue;
            }
            // Same clap constraint the global-header loop handles below: a
            // `global(true)` long name that a per-operation parameter also
            // uses is fatal. The per-op parameter wins; the variable falls
            // back to its declared default.
            if global_header_long_collides_with_param(&cli, &kebab) {
                tracing::warn!(
                    variable = %var.name,
                    flag = %kebab,
                    "Server variable flag collides with a per-operation parameter; \
                     skipping — the variable resolves to its declared default"
                );
                continue;
            }
            let screaming = crate::text::to_screaming_snake(&var.name);
            let mut arg = clap::Arg::new(var.name.clone())
                .long(kebab)
                .global(true)
                .value_name(screaming.clone())
                .help(var.description.clone().unwrap_or_else(|| {
                    format!("Value for the {{{}}} URL template variable", var.name)
                }));
            // Env rung, so the documented `flag > env > profile > spec default`
            // order holds for server variables too. Without it `--region` was
            // flag-or-default only, and a user pinning a region for a shell
            // session had to repeat the flag on every command.
            //
            // Prefixed with the binary name, unlike the `x-fern-sdk-variables`
            // loop below which uses the bare screaming-snake name: server
            // variables are overwhelmingly generic (`region`, `edge`, `env`,
            // `stage`), so a bare `REGION` would collide with unrelated
            // environment settings. Honoring the bare name too would be
            // additive later; narrowing from it would not.
            //
            // clap resolves CommandLine > EnvVariable > DefaultValue, and
            // `apply_server_vars` treats anything but `DefaultValue` as
            // caller-pinned — except under `-p`, where `outranks_env` demotes
            // env so the explicitly named profile wins.
            arg = arg.env(format!(
                "{}_{}",
                crate::text::env_var_prefix(&self.name),
                screaming
            ));
            if let Some(default) = &var.default {
                arg = arg.default_value(default.clone());
            }
            if !var.enum_values.is_empty() {
                arg = arg.value_parser(clap::builder::PossibleValuesParser::new(
                    var.enum_values.clone(),
                ));
            }
            cli = cli.arg(arg);
        }

        // SDK-variable flags (`x-fern-sdk-variables`).
        for var in &doc.sdk_variables {
            let kebab = crate::text::to_kebab_flag(&var.name);
            if sdk_variable_collides_with_builtin(&kebab) {
                tracing::warn!(
                    variable = %var.name,
                    flag = %kebab,
                    "SDK variable flag collides with built-in; skipping"
                );
                continue;
            }
            let screaming = crate::text::to_screaming_snake(&var.name);
            let mut arg = clap::Arg::new(var.name.clone())
                .long(kebab.clone())
                .global(true)
                .value_name(screaming.clone());

            // An SDK variable is the natural way to model a value that
            // appears on nearly every path — a tenant id, a workspace — so
            // it is exactly what a profile most wants to carry. Without this
            // the profile stored the value and the request still failed with
            // "Missing required SDK variable": the bound path parameter is
            // excluded from the per-operation flag surface, so the profile
            // default installed there is never consulted.
            let profile_value = crate::profiles::parameter_default(&var.name, &kebab);
            let profile_outranks_env = profile_value.is_some() && crate::profiles::outranks_env();
            if let Some(value) = profile_value {
                arg = arg.default_value(value);
            }
            // clap resolves EnvVariable above DefaultValue, which is the
            // documented order — except when the profile was named with
            // `-p`, where the only way to let it win is to not register the
            // env var for this arg.
            if !profile_outranks_env {
                arg = arg.env(screaming);
            }
            if let Some(desc) = &var.description {
                arg = arg.help(desc.clone());
            }
            cli = cli.arg(arg);
        }

        // Global-header flags (`x-fern-global-headers`).
        use std::collections::HashSet;
        let mut registered_kebabs: HashSet<String> = HashSet::new();
        let mut global_header_help_pairs: Vec<(String, String)> = Vec::new();
        for h in &doc.global_headers {
            let kebab = global_header_flag_name(h);
            if global_header_flag_collides_with_builtin(&kebab) {
                tracing::warn!(
                    header = %h.header,
                    flag = %kebab,
                    "Global-header flag collides with built-in; skipping"
                );
                continue;
            }
            if !registered_kebabs.insert(kebab.clone()) {
                tracing::warn!(
                    header = %h.header,
                    flag = %kebab,
                    "Duplicate global-header flag; skipping"
                );
                continue;
            }
            let arg_id = global_header_arg_id(h);
            let value_name = crate::text::to_screaming_snake(&kebab);
            let mut help_lines: Vec<String> =
                vec![format!("Global header `{}` (sent on every request).", h.header)];
            if let Some(env) = &h.env {
                help_lines.push(format!("Env: {env}."));
            }
            if let Some(def) = &h.default {
                help_lines.push(format!("Default: {def}."));
            } else if !h.optional {
                help_lines.push("Required.".to_string());
            }
            let help_text = help_lines.join(" ");
            let prefix = format!("--{kebab} <{value_name}>");
            global_header_help_pairs.push((prefix, help_text.clone()));
            let mut arg = clap::Arg::new(arg_id)
                .long(kebab.clone())
                .hide(true)
                .value_name(value_name)
                .help(help_text);
            if let Some(env) = &h.env {
                arg = arg.env(env.clone());
            }
            if let Some(def) = &h.default {
                arg = arg.default_value(def.clone());
            }
            // A `global(true)` arg whose long name matches a per-operation
            // parameter makes clap panic at build time ("Long option names
            // must be unique for each argument"). When the flag collides
            // with a parameter on some operation, register it per-command
            // on the non-colliding leaves and let the per-op parameter win
            // on the rest — rather than handing clap two args with the same
            // long name (FER-11145).
            if global_header_long_collides_with_param(&cli, &kebab) {
                tracing::debug!(
                    header = %h.header,
                    flag = %kebab,
                    "Global-header flag collides with a per-operation parameter; \
                     registering per-command so the per-op parameter wins"
                );
                cli = register_global_header_on_nonconflicting_leaves(cli, &arg, &kebab);
            } else {
                cli = cli.arg(arg.global(true));
            }
        }

        // Global-parameter flags (`x-fern-global-parameters`).
        // Reuse `registered_kebabs` from global headers so cross-feature
        // collisions (header + parameter producing the same flag) are
        // detected rather than panicking clap.
        let mut global_param_help_pairs: Vec<(String, String)> = Vec::new();
        for p in &doc.global_parameters {
            let kebab = global_parameter_flag_name(p);
            if global_parameter_flag_collides_with_builtin(&kebab) {
                tracing::warn!(
                    name = %p.name,
                    flag = %kebab,
                    "Global-parameter flag collides with built-in; skipping"
                );
                continue;
            }
            if !registered_kebabs.insert(kebab.clone()) {
                tracing::warn!(
                    name = %p.name,
                    flag = %kebab,
                    "Global-parameter flag collides with an already-registered flag; skipping"
                );
                continue;
            }
            let arg_id = global_parameter_arg_id(p);
            let value_name = crate::text::to_screaming_snake(&kebab);
            let location_label = match p.location {
                crate::openapi::discovery::GlobalParameterLocation::Header => "header",
                crate::openapi::discovery::GlobalParameterLocation::Query => "query",
                crate::openapi::discovery::GlobalParameterLocation::Body => "body",
                crate::openapi::discovery::GlobalParameterLocation::Path => "path",
            };
            let mut help_lines: Vec<String> = Vec::new();
            if let Some(ref docs) = p.docs {
                help_lines.push(docs.clone());
            } else {
                help_lines.push(format!(
                    "Global {location_label} parameter `{}`.",
                    p.target,
                ));
            }
            if let Some(ref env) = p.env {
                help_lines.push(format!("Env: {env}."));
            }
            if let Some(ref def) = p.default {
                help_lines.push(format!("Default: {def}."));
            } else if !p.optional {
                help_lines.push("Required.".to_string());
            }
            let help_text = help_lines.join(" ");
            let prefix = format!("--{kebab} <{value_name}>");
            global_param_help_pairs.push((prefix, help_text.clone()));
            let mut arg = clap::Arg::new(arg_id)
                .long(kebab.clone())
                .hide(true)
                .value_name(value_name)
                .help(help_text);
            if let Some(ref env) = p.env {
                arg = arg.env(env.clone());
            }
            if let Some(ref def) = p.default {
                arg = arg.default_value(def.clone());
            }
            if global_header_long_collides_with_param(&cli, &kebab) {
                tracing::debug!(
                    name = %p.name,
                    flag = %kebab,
                    "Global-parameter flag collides with a per-operation parameter; \
                     registering per-command so the per-op parameter wins"
                );
                cli = register_global_header_on_nonconflicting_leaves(cli, &arg, &kebab);
            } else {
                cli = cli.arg(arg.global(true));
            }
        }

        cli = cli.arg(
            clap::Arg::new("debug")
                .long("debug")
                .action(clap::ArgAction::SetTrue)
                .global(true)
                .help("Dump HTTP request and response to stderr")
        );

        // Compose the root --help footer. Preserves the section order
        // from the old run_async path: global headers → global params → auth → env vars.
        let existing_after_help = cli.get_after_help().map(|s| s.to_string());
        let global_headers_section: Option<String> = if global_header_help_pairs.is_empty() {
            None
        } else {
            let prefix_width = global_header_help_pairs
                .iter()
                .map(|(p, _)| p.chars().count())
                .max()
                .unwrap_or(0);
            let rows: Vec<String> = global_header_help_pairs
                .iter()
                .map(|(prefix, help)| {
                    let pad = prefix_width.saturating_sub(prefix.chars().count());
                    format!("  {prefix}{:pad$}  {help}", "", pad = pad)
                })
                .collect();
            Some(format!("Global headers:\n{}", rows.join("\n")))
        };
        let global_params_section: Option<String> = if global_param_help_pairs.is_empty() {
            None
        } else {
            let prefix_width = global_param_help_pairs
                .iter()
                .map(|(p, _)| p.chars().count())
                .max()
                .unwrap_or(0);
            let rows: Vec<String> = global_param_help_pairs
                .iter()
                .map(|(prefix, help)| {
                    let pad = prefix_width.saturating_sub(prefix.chars().count());
                    format!("  {prefix}{:pad$}  {help}", "", pad = pad)
                })
                .collect();
            Some(format!("Global parameters:\n{}", rows.join("\n")))
        };
        let env_footer = super::commands::after_help_footer(&doc.name);
        // `build_cli` already sets the env-var footer, so appending it
        // unconditionally renders the block twice on the root `--help`.
        let base_footer = match existing_after_help {
            Some(ref s) if s.contains(&env_footer) => s.clone(),
            Some(ref s) if !s.is_empty() => format!("{s}\n{env_footer}"),
            _ => env_footer,
        };
        cli = cli.after_help(compose_root_after_help_sections(
            global_headers_section.as_deref(),
            global_params_section.as_deref(),
            auth_section.as_deref(),
            &base_footer,
        ));

        cli
    }

    /// Resolve server variable values from clap matches and substitute
    /// them into the doc's URLs.
    ///
    /// Values come from generator-registered variables
    /// ([`server_var`](Self::server_var)) and from the spec's own
    /// `servers[].variables` block, whose flags carry the variable's
    /// `default` — so a templated URL resolves to a sendable one even when
    /// the caller passes nothing. When the caller pins no variable at all
    /// and the server declares `x-fern-default-url`, that URL wins over
    /// substituting the defaults.
    /// Whether [`apply_server_vars`](Self::apply_server_vars) has anything
    /// to do for `doc` — generator-registered variables, or a spec that
    /// declares `servers[].variables` / `x-fern-default-url`. Callers use
    /// it to skip cloning the doc when there is nothing to resolve.
    pub(crate) fn needs_server_var_resolution(&self, doc: &RestDescription) -> bool {
        !self.server_vars.is_empty() || spec_declares_server_urls_to_resolve(doc)
    }

    /// Names of the generator-registered server variables. Unioned with the
    /// spec-declared ones to form the `profiles create` vocabulary.
    pub(crate) fn server_var_names(&self) -> Vec<String> {
        self.server_vars.iter().map(|v| v.name.clone()).collect()
    }

    pub(crate) fn apply_server_vars(
        &self,
        doc: &mut RestDescription,
        matches: &clap::ArgMatches,
    ) {
        let spec_vars = collect_spec_server_variables(doc);
        let names = self
            .server_vars
            .iter()
            .map(|v| &v.name)
            .chain(spec_vars.iter().map(|v| &v.name));

        let mut subs = std::collections::HashMap::new();
        let mut caller_pinned_any = false;
        for name in names {
            if subs.contains_key(name) {
                continue;
            }
            // `try_get_one` rather than `get_one`: a variable whose flag was
            // skipped (built-in collision) is not a registered arg id, and
            // `get_one` panics on unknown ids.
            let clap_value = matches.try_get_one::<String>(name).ok().flatten();
            // `CommandLine` / `EnvVariable` mean the caller pinned this
            // variable; `DefaultValue` means clap fell back to the spec's
            // `default`, which the profile outranks.
            // An explicitly named profile outranks the variable's env var, so
            // only a command-line value counts as "pinned" in that case.
            //
            // `value_source` panics on an unregistered id exactly as
            // `get_one` does, and a variable whose flag was skipped (built-in
            // collision) has no arg — so it is only consulted once
            // `try_get_one` has confirmed the arg exists.
            let pinned_by_caller = clap_value.is_some() && {
                let source = matches.value_source(name);
                if crate::profiles::outranks_env() {
                    source == Some(clap::parser::ValueSource::CommandLine)
                } else {
                    source != Some(clap::parser::ValueSource::DefaultValue)
                }
            };

            if pinned_by_caller {
                caller_pinned_any = true;
                subs.insert(name.clone(), clap_value.expect("pinned implies present").clone());
                continue;
            }
            // Profile sits above the spec default. It also counts as pinning:
            // without that, `apply_default_server_urls` would prefer
            // `x-fern-default-url` and quietly discard the region the profile
            // just selected.
            if let Some(value) = crate::profiles::server_variable(name) {
                caller_pinned_any = true;
                subs.insert(name.clone(), value);
                continue;
            }
            if let Some(value) = clap_value {
                subs.insert(name.clone(), value.clone());
            }
        }

        // A spec variable whose flag was skipped (built-in or per-operation
        // parameter collision) has no arg to read, so fall back to the
        // `default` the spec declares for it — an unsubstituted `{var}` would
        // otherwise reach the request builder as a literal.
        for var in &spec_vars {
            if subs.contains_key(&var.name) {
                continue;
            }
            if let Some(default) = &var.default {
                subs.insert(var.name.clone(), default.clone());
            }
        }

        if !caller_pinned_any {
            apply_default_server_urls(doc);
        }
        apply_server_var_substitutions(doc, &subs);
    }

    /// Handle the `generate-skills` subcommand: validate the output
    /// path, emit SKILL.md files, and report to stderr.
    pub(crate) fn handle_generate_skills(
        &self,
        output_dir: Option<&str>,
        doc: &RestDescription,
    ) -> Result<(), CliError> {
        let out_dir = output_dir.unwrap_or("skills").to_string();
        let resolved = crate::validate::validate_safe_output_dir(&out_dir)?;

        let files =
            crate::openapi::skill_emitter::generate_skills(doc, &self.name, &self.auth_bindings, self.auth_strategy);

        for (rel_path, content) in &files {
            let full_path = resolved.join(rel_path);
            if let Some(parent) = full_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| {
                    CliError::Validation(format!(
                        "Failed to create directory {}: {e}",
                        parent.display()
                    ))
                })?;
            }
            std::fs::write(&full_path, content).map_err(|e| {
                CliError::Validation(format!(
                    "Failed to write {}: {e}",
                    full_path.display()
                ))
            })?;
        }

        eprintln!(
            "Wrote {} skill file(s) to {}/",
            files.len(),
            resolved.display()
        );
        Ok(())
    }

    /// Construct the [`DynAuthProvider`] used for this run from the
    /// registered bindings. With no bindings, returns a `NoAuthProvider`
    /// — the CLI runs unauthenticated.
    pub(crate) fn build_auth_provider(&self, doc: &RestDescription) -> DynAuthProvider {
        let has_per_endpoint = doc.resources.values().any(resource_has_per_endpoint_security);
        let primary = crate::auth::build_provider_with_strategy(
            &self.auth_bindings,
            &doc.security_schemes,
            self.auth_strategy,
            has_per_endpoint,
        );
        self.wrap_auth_layers(primary)
    }

    /// Layer any registered additive providers on top of the composed
    /// primary. A no-op when no layers were registered, so the common case
    /// pays nothing.
    fn wrap_auth_layers(&self, primary: DynAuthProvider) -> DynAuthProvider {
        if self.auth_layers.is_empty() {
            primary
        } else {
            std::sync::Arc::new(crate::auth::LayeredAuthProvider::new(
                primary,
                self.auth_layers.clone(),
            ))
        }
    }

    /// Build an auth provider from externally-finalized bindings.
    /// Used by `OpenApiBinding::dispatch` after CLI-bound auth sources
    /// have been resolved against the parsed clap matches.
    pub(crate) fn build_auth_provider_from_finalized(
        &self,
        finalized: &[(String, crate::auth::SchemeBinding)],
        doc: &RestDescription,
    ) -> DynAuthProvider {
        let has_per_endpoint = doc.resources.values().any(resource_has_per_endpoint_security);
        let primary = crate::auth::build_provider_with_strategy(
            finalized,
            &doc.security_schemes,
            self.auth_strategy,
            has_per_endpoint,
        );
        self.wrap_auth_layers(primary)
    }
}

/// One binding's worth of prepared state inside an [`AppContext`].
///
/// When a CLI registers multiple `OpenApiBinding`s, each contributes one
/// entry. Method lookups and execution are routed to the entry whose
/// spec owns the target method.
pub(crate) struct BindingEntry {
    pub(crate) doc: RestDescription,
    pub(crate) auth_provider: DynAuthProvider,
    pub(crate) http_config: crate::http::HttpConfig,
    pub(crate) global_headers: Vec<(String, String)>,
    /// Pre-resolved global parameter values (from CLI flags / env / defaults).
    /// The executor splits these by location at dispatch time.
    pub(crate) global_params: Vec<ResolvedGlobalParam>,
}

/// Runtime context passed to custom command handlers.
///
/// Provides access to the loaded API spec(s), the constructed auth
/// provider(s), and convenience methods for executing API methods.
///
/// When multiple `OpenApiBinding`s are registered on the same `CliApp`,
/// `AppContext` holds all of their specs. Method lookups and
/// `execute()`/`invoke()` calls are automatically routed to the binding
/// that owns the target method — callers do not need to know which
/// binding a method came from.
pub struct AppContext {
    entries: Vec<BindingEntry>,
    /// Whether `--quiet` was passed on the command line. Threaded into
    /// `OutputPipeline` by [`AppContext::execute`] so custom commands
    /// honor the flag.
    pub(crate) quiet: bool,
    /// Base URL override resolved from `--base-url` / `{NAME}_BASE_URL`.
    /// Threaded into `invoke()` so custom command handlers respect the
    /// override the same way direct CLI dispatch does.
    pub(crate) base_url_override: Option<String>,
    /// Whether `--debug` was passed on the command line. Stored for
    /// use by the executor (DBO-1.3) to dump HTTP traffic to stderr.
    pub(crate) debug: bool,
}

impl AppContext {
    pub(crate) fn new(
        doc: RestDescription,
        auth_provider: DynAuthProvider,
        http_config: crate::http::HttpConfig,
        global_headers: Vec<(String, String)>,
        global_params: Vec<ResolvedGlobalParam>,
    ) -> Self {
        Self {
            entries: vec![BindingEntry { doc, auth_provider, http_config, global_headers, global_params }],
            quiet: false,
            base_url_override: None,
            debug: false,
        }
    }

    pub(crate) fn with_quiet(mut self, quiet: bool) -> Self {
        self.quiet = quiet;
        self
    }

    pub(crate) fn with_base_url_override(mut self, base_url_override: Option<String>) -> Self {
        self.base_url_override = base_url_override;
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

    /// Compute the per-op `extra_headers` slice from the pre-resolved
    /// global headers, suppressing entries whose wire-name is also
    /// supplied as a per-op `header` parameter via `params_json`
    /// (per-op wins, mirroring the built-in command path).
    ///
    /// Required-header validation lives here rather than at
    /// `AppContext` construction time because per-op overrides depend
    /// on the specific operation being invoked: a required global
    /// header with no resolved value is allowed when the operation
    /// itself declares the same header as a per-op parameter (the
    /// per-op value takes its place on the wire). This mirrors
    /// `build_global_header_overrides` on the built-in command path so
    /// custom-command handlers get the same validation error shape.
    #[cfg(test)]
    fn extra_headers_for(
        &self,
        method: &RestMethod,
        params_json: Option<&str>,
    ) -> Result<Vec<(String, String)>, CliError> {
        let entry = self.entry_for_method(method);
        self.extra_headers_for_entry(entry, method, params_json)
    }

    fn extra_headers_for_entry(
        &self,
        entry: &BindingEntry,
        method: &RestMethod,
        params_json: Option<&str>,
    ) -> Result<Vec<(String, String)>, CliError> {
        let params: serde_json::Map<String, serde_json::Value> = match params_json {
            Some(s) if !s.trim().is_empty() => serde_json::from_str(s)
                .map_err(|e| CliError::Validation(format!("Invalid params JSON: {e}")))?,
            _ => serde_json::Map::new(),
        };
        // HTTP header names are case-insensitive per RFC 7230 §3.2 — key
        // the lookup table by lowercased wire-name so a custom-command
        // handler that resolved `x-api-stage` still satisfies the spec's
        // declared `X-API-Stage` global.
        let resolved_by_wire: std::collections::HashMap<String, &str> = entry
            .global_headers
            .iter()
            .map(|(n, v)| (n.to_ascii_lowercase(), v.as_str()))
            .collect();
        finalize_global_header_overrides(&entry.doc.global_headers, method, &params, |h| {
            resolved_by_wire
                .get(&h.header.to_ascii_lowercase())
                .map(|v| (*v).to_string())
        })
    }

    /// Compute the per-op `extra_global_params` slice from the
    /// pre-resolved global parameters, applying the same apply-mode
    /// filtering and per-op override suppression as
    /// `build_global_parameter_overrides` on the built-in command path.
    ///
    /// Note: `entry.global_params` is already resolved (CLI flag > env >
    /// default) in `binding.rs`; a global with no resolved value was
    /// dropped there. Unlike the built-in path, this path does not raise
    /// a "required global has no value" error — a custom command's own
    /// handler owns request assembly, so the built-in required-param
    /// enforcement is intentionally not duplicated here.
    fn extra_global_params_for_entry(
        &self,
        entry: &BindingEntry,
        method: &RestMethod,
        params_json: Option<&str>,
    ) -> Vec<ResolvedGlobalParam> {
        let params: serde_json::Map<String, serde_json::Value> = match params_json {
            Some(s) if !s.trim().is_empty() => serde_json::from_str(s).unwrap_or_default(),
            _ => serde_json::Map::new(),
        };

        entry
            .global_params
            .iter()
            .filter(|gp| {
                // Look up the declaration by identity (`name`), not `target`:
                // two params can share a target across locations.
                let decl = entry.doc.global_parameters.iter().find(|d| d.name == gp.name);
                if let Some(d) = decl {
                    if !global_param_apply_mode_admits(d, method) {
                        return false;
                    }
                }
                !per_op_param_overrides_global(&params, method, gp.location, &gp.target)
            })
            .cloned()
            .collect()
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
        let pagination = executor::PaginationConfig {
            page_all: false,
            page_limit: 10,
            page_delay_ms: 100,
            token_query_param: entry
                .doc
                .pagination_token_query_param
                .clone()
                .unwrap_or_else(|| "pageToken".to_string()),
            token_response_path: entry
                .doc
                .pagination_token_response_path
                .clone()
                .unwrap_or_else(|| "nextPageToken".to_string()),
            no_pager: true,
            cli_name: String::new(),
        };

        let pipeline = formatter::OutputPipeline {
            format: output_format.clone(),
            color_mode: formatter::ColorMode::default(),
            quiet: self.quiet,
            query: None,
        };
        let extra_headers = self.extra_headers_for_entry(entry, method, params_json)?;
        let filtered_global_params = self.extra_global_params_for_entry(entry, method, params_json);

        // Custom commands dispatch from inside `run_async`, which is itself
        // driven by a tokio runtime. Naively calling `block_on` from a sync
        // handler panics ("Cannot start a runtime from within a runtime").
        // `block_in_place` parks the current worker so `block_on` is legal.
        tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current().block_on(executor::execute_method(
                &entry.doc,
                method,
                params_json,
                body_json,
                &entry.auth_provider,
                None,
                None,
                None,
                None, // no multipart for programmatic callers
                false,
                &pagination,
                &pipeline,
                false,
                self.base_url_override.as_deref(),
                &entry.http_config,
                // TODO(mcp/programmatic): programmatic callers always
                // honor `x-fern-sdk-return-value` (matches typed-SDK
                // semantics). If/when an MCP-tool surface wraps this
                // path and needs to expose `--no-extract` to its
                // clients, plumb a flag through `AppContext::execute`
                // rather than flipping this constant.
                false,
                // Programmatic callers always honor `x-fern-retries`
                // — the debug-only `--no-retry` flag is intentionally
                // a CLI-only surface. If/when an MCP-tool path needs
                // to disable retries for stability/debugging, plumb
                // a flag through `AppContext::execute` rather than
                // flipping this constant.
                false,
                // Same trade-off for `--no-stream`: programmatic callers
                // chaining streaming endpoints almost always want the
                // events emitted as they arrive (stdout printing path);
                // forcing buffered mode here would block the entire
                // response in memory. The CLI surface keeps the
                // streaming default; only the CLI front-end exposes the
                // opt-in buffered toggle.
                false,
                self.debug,
                &extra_headers,
                &filtered_global_params,
            ))
        })
        .map(|_| ())
    }

    /// Invoke an API method and return the parsed JSON response.
    ///
    /// Like [`execute`](Self::execute) but captures the response instead of
    /// printing it, and accepts a `binary_body_path` for operations with a
    /// binary request body (e.g. AssemblyAI's `/v2/upload`). Designed for
    /// custom commands that chain multiple API calls.
    pub fn invoke(
        &self,
        method: &RestMethod,
        params_json: Option<&str>,
        body_json: Option<&str>,
        binary_body_path: Option<&str>,
    ) -> Result<serde_json::Value, CliError> {
        let entry = self.entry_for_method(method);
        let pagination = executor::PaginationConfig {
            page_all: false,
            page_limit: 10,
            page_delay_ms: 100,
            token_query_param: entry
                .doc
                .pagination_token_query_param
                .clone()
                .unwrap_or_else(|| "pageToken".to_string()),
            token_response_path: entry
                .doc
                .pagination_token_response_path
                .clone()
                .unwrap_or_else(|| "nextPageToken".to_string()),
            no_pager: true,
            cli_name: String::new(),
        };

        let extra_headers = self.extra_headers_for_entry(entry, method, params_json)?;
        let filtered_global_params = self.extra_global_params_for_entry(entry, method, params_json);
        // See note in `execute` — `block_in_place` is required because the
        // handler runs inside the outer tokio runtime.
        let value = tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current().block_on(executor::execute_method(
                &entry.doc,
                method,
                params_json,
                body_json,
                &entry.auth_provider,
                None,
                None,
                binary_body_path,
                None, // no multipart for programmatic callers
                false,
                &pagination,
                &formatter::OutputPipeline::default(),
                true, // capture_output
                self.base_url_override.as_deref(),
                &entry.http_config,
                // See TODO in `execute` above — same trade-off applies
                // here: chained custom commands expect the
                // spec-promised subvalue, not the raw envelope.
                false,
                // Programmatic callers always honor `x-fern-retries`
                // (see note in `execute`).
                false,
                // `invoke` captures the response into a `serde_json::Value`
                // for callers that chain multiple API calls. Stream-mode
                // makes no sense here — the executor would have to invent
                // an ordering decision (last event? array of events?)
                // when the caller just wants a typed value back. Force
                // buffered semantics so the captured value mirrors the
                // unary-response shape callers already handle.
                true,
                // Programmatic callers (invoke) never use the debug dump —
                // debug mode is a CLI-only surface.
                false,
                &extra_headers,
                &filtered_global_params,
            ))
        })?;

        value.ok_or_else(|| {
            CliError::Other(anyhow::anyhow!(
                "API method returned no value (non-JSON or empty body)"
            ))
        })
    }

    /// Returns a reference to the loaded API spec.
    ///
    /// When multiple `OpenApiBinding`s are registered, this returns the
    /// first binding's spec. Use [`find_method`](Self::find_method) to
    /// search across all bindings.
    pub fn spec(&self) -> &RestDescription {
        &self.entries[0].doc
    }

    /// Returns references to all loaded API specs.
    ///
    /// Each entry corresponds to one `OpenApiBinding` registered on the
    /// `CliApp`. For single-binding CLIs the slice has exactly one element.
    pub fn specs(&self) -> Vec<&RestDescription> {
        self.entries.iter().map(|e| &e.doc).collect()
    }

    /// Search all registered specs for a method at `resource.method_name`.
    ///
    /// This is the recommended way to look up methods in a multi-binding
    /// CLI — it searches across all bindings and returns the first match.
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
    /// Holds the binary name (used to scope `<NAME>_*` env vars) and any
    /// compile-time trust roots. Non-reqwest transports — e.g. the
    /// [`websocket`](crate::websocket) module — call
    /// [`HttpConfig::resolve`](crate::http::HttpConfig::resolve) on this to
    /// build their own TLS connectors while honoring the same env vars
    /// users already configure for the HTTP path.
    ///
    /// Auth credentials are intentionally *not* exposed via `AppContext`:
    /// transports needing a credential value take an
    /// [`AuthCredentialSource`](crate::auth::AuthCredentialSource) directly
    /// at the call site. See `docs/adr/0001-auth-provider-no-cred-extraction.md`.
    pub fn http_config(&self) -> &crate::http::HttpConfig {
        &self.entries[0].http_config
    }

    /// Returns the base-URL override resolved from `--base-url` /
    /// `{NAME}_BASE_URL`, or `None` if not set.
    pub fn base_url_override(&self) -> Option<&str> {
        self.base_url_override.as_deref()
    }

    /// The base URL requests from this context go to, resolved the same way
    /// the built-in command path resolves it: `--base-url` / `{NAME}_BASE_URL`
    /// override first, then the spec's explicit `base_url`, then the server
    /// root plus any Discovery `service_path`.
    ///
    /// Exposed for the generated custom-command SDK bridge, which has to seed
    /// the co-generated SDK's `ClientConfig.base_url`. `ClientConfig::default()`
    /// is not a usable substitute: the Rust SDK generator emits
    /// `base_url: String::new()` for an API that declares no environment, so a
    /// bridge built on the default produced a client with no host and every
    /// custom command failed before the injected executor could help. The
    /// executor's own `resolve_url` only rewrites the host when `--base-url`
    /// was passed, so it cannot recover an empty base either.
    pub fn effective_base_url(&self) -> String {
        if let Some(override_url) = self.base_url_override.as_deref() {
            return override_url.trim_end_matches('/').to_string();
        }
        let doc = &self.entries[0].doc;
        if let Some(base) = &doc.base_url {
            return base.clone();
        }
        // A spec can declare its server per-operation rather than at the root
        // (`paths./x.get.servers`), which the built-in path handles via
        // `effective_root_url(method, doc)`. There is no operation in scope
        // here, so fall back to the first operation that declares one, walked
        // in sorted order for determinism. Without this the bridge produced an
        // empty base for exactly the specs the fix was meant to serve.
        let root_url = if doc.root_url.is_empty() {
            first_method_root_url(&doc.resources).unwrap_or_default()
        } else {
            doc.root_url.clone()
        };
        format!("{}{}", root_url, doc.service_path)
    }

    /// Build a [`CliExecutor`] wired to this context's HTTP/auth/retry stack.
    ///
    /// The executor is constructed from the first binding entry's config
    /// and shared via `Arc` across all SDK client instances. This method
    /// keeps `auth_provider` and `global_headers` internal to `AppContext`,
    /// satisfying ADR-0001 (no credential exposure via public getters).
    pub fn build_sdk_executor(&self) -> std::sync::Arc<crate::sdk_executor::CliExecutor> {
        // `--debug` is threaded in so it works for custom commands too. Spec
        // -declared credential header names come with it, so an
        // `apiKey`-in-header value is redacted here exactly as on the OpenAPI
        // path rather than printed in full.
        let sensitive_headers: Vec<String> =
            crate::openapi::executor::spec_sensitive_header_names(&self.entries[0].doc)
                .into_iter()
                .map(str::to_string)
                .collect();
        std::sync::Arc::new(
            crate::sdk_executor::CliExecutor::new(
                self.entries[0].http_config.clone(),
                self.entries[0].auth_provider.clone(),
                self.entries[0].global_headers.clone(),
                self.base_url_override.as_ref().map(|s| s.to_string()),
            )
            .with_debug(self.debug, sensitive_headers),
        )
    }
}


/// First non-empty per-operation `root_url` in the resource tree, visiting
/// resources and methods in sorted-name order so the answer is stable across
/// runs (the trees are `HashMap`s).
fn first_method_root_url(
    resources: &std::collections::HashMap<String, RestResource>,
) -> Option<String> {
    let mut resource_names: Vec<&String> = resources.keys().collect();
    resource_names.sort();
    for name in resource_names {
        let resource = &resources[name];
        let mut method_names: Vec<&String> = resource.methods.keys().collect();
        method_names.sort();
        for method_name in method_names {
            let root_url = &resource.methods[method_name].root_url;
            if !root_url.is_empty() {
                return Some(root_url.clone());
            }
        }
        if let Some(found) = first_method_root_url(&resource.resources) {
            return Some(found);
        }
    }
    None
}

/// Recursively check whether any method in the resource tree is the
/// same object (pointer-equal) as `target`. Used by
/// [`AppContext::entry_for_method`] to route `execute()`/`invoke()`
/// to the correct binding's auth and HTTP config.
fn resource_tree_contains_method(
    resources: &std::collections::HashMap<String, RestResource>,
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

/// Walk a resource (and its sub-resources) for any method that declares
/// `security_requirements`. Used by `build_auth_provider` to feed the
/// per-endpoint flag into `build_provider_with_strategy`.
fn resource_has_per_endpoint_security(resource: &RestResource) -> bool {
    if resource
        .methods
        .values()
        .any(|m| m.security_requirements.is_some())
    {
        return true;
    }
    resource.resources.values().any(resource_has_per_endpoint_security)
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
///
/// When a parameter has a `default_value` from `x-fern-default` and
/// the user did not supply the flag, clap surfaces the default as a
/// stringified value. We detect this via `ArgMatches::value_source`
/// and substitute the originally-typed JSON so numbers and booleans
/// keep their wire type — strings pass through unchanged.
///
/// Parameters whose only default comes from the OpenAPI standard
/// `default:` keyword (stored on `documentation_default_value`) do
/// **not** get a clap default, so `get_one` returns `None` and the
/// `let-else continue` below correctly omits them from the outgoing
/// request — the API server applies its own default.
pub(crate) fn collect_params_from_flags(
    matched_args: &clap::ArgMatches,
    method: &crate::openapi::discovery::RestMethod,
    params_override: Option<&str>,
) -> Result<serde_json::Map<String, serde_json::Value>, CliError> {
    let mut params = serde_json::Map::new();

    // Collect values from individual flags. Three extensions interact here:
    //
    // 1. `x-fern-sdk-variable`: variable-bound path params are NOT
    //    registered as per-op flags (see `commands::build_resource_command`);
    //    their value comes from the root-level global flag registered in
    //    `run_async` from `doc.sdk_variables`. clap propagates global args
    //    down to subcommand matches so we look them up by the variable
    //    name on the same `matched_args`. If the global is unset, defer
    //    the validation error until AFTER the `--params` JSON override is
    //    applied below — `--params` is documented as "overrides individual
    //    flags" and must be allowed to act as a fallback here too,
    //    mirroring how plain path params behave when their per-op flag is
    //    absent.
    //
    // 2. `x-fern-default`: when clap surfaced an `x-fern-default` value
    //    (i.e. the user omitted the flag and the parameter had a
    //    `default_value` populated by `x-fern-default`), use the
    //    originally-typed JSON value so numbers/booleans keep their
    //    wire type instead of arriving as strings.
    //
    // 3. `x-fern-enum`: for user-supplied values on (non-variable-bound)
    //    parameters that declare enum aliases, resolve the display
    //    alias back to the wire value so the executor only ever sees
    //    what the server expects.
    // Whether the user passed a whole-body `--json`. Body-located parameters
    // whose value came from a *default* (a `const` field, or `x-fern-default`)
    // must not be collected in that case: the executor treats any body key in
    // `params` as a per-field body flag and refuses to combine it with `--json`,
    // so a defaulted field the user never typed made `--json` impossible to use
    // — the conflicting flag could never be absent. An explicit `--json` is the
    // user's whole-body intent, so it wins over defaults; a per-field flag the
    // user actually typed still conflicts, as it should.
    let body_json_supplied = matched_args
        .try_get_one::<String>("json")
        .ok()
        .flatten()
        .is_some();
    let is_body_param = |param_def: &crate::openapi::discovery::MethodParameter| {
        param_def.location.as_deref() == Some("body")
    };
    // A defaulted nested leaf (`platform_settings.guardrails.version`) must
    // also stand down when the user typed an *ancestor* object-shorthand
    // flag (`--platform-settings.guardrails '{...}'`): the executor refuses
    // to combine an object flag with a leaf flag underneath it, so an
    // injected leaf would make its own parent's flag unusable.
    let ancestor_flag_typed = |param_name: &str| -> bool {
        let mut rest = param_name;
        while let Some((prefix, _)) = rest.rsplit_once('.') {
            let ancestor_id = crate::openapi::commands::param_clap_arg_id(prefix);
            if matched_args.value_source(&ancestor_id)
                == Some(clap::parser::ValueSource::CommandLine)
            {
                return true;
            }
            rest = prefix;
        }
        false
    };

    let mut missing_variable_bound: Vec<(String, String)> = Vec::new();
    for (param_name, param_def) in &method.parameters {
        if let Some(var_name) = param_def.variable_reference.as_deref() {
            match matched_args.get_one::<String>(var_name) {
                Some(value) => {
                    params.insert(
                        param_name.clone(),
                        serde_json::Value::String(value.clone()),
                    );
                }
                None => {
                    missing_variable_bound.push((param_name.clone(), var_name.to_string()));
                }
            }
            continue;
        }

        // The clap arg ID may differ from the wire name when the wire
        // name collides with a built-in flag. Use the same resolution
        // function the command builder uses (FER-10430).
        let arg_id = crate::openapi::commands::param_clap_arg_id(param_name);

        if param_def.repeated {
            if matched_args.value_source(&arg_id)
                == Some(clap::parser::ValueSource::DefaultValue)
                && is_body_param(param_def)
                && (body_json_supplied || ancestor_flag_typed(param_name))
            {
                continue;
            }
            if let Some(values) = matched_args.get_many::<String>(&arg_id) {
                // A value that parses as a JSON array is spliced in element
                // by element (`--to '["a","b"]'` ≡ `--to a --to b`); anything
                // else — including non-array JSON like "123" — stays a
                // literal string.
                let mut arr: Vec<serde_json::Value> = Vec::new();
                let mut explicit_null = false;
                for v in values {
                    // Null sentinel (ADR-0003): on a nullable list, a lone
                    // `null` is the user asking to send JSON null rather
                    // than a one-element list containing "null".
                    if param_def.nullable && v == "null" {
                        explicit_null = true;
                        continue;
                    }
                    match serde_json::from_str::<serde_json::Value>(v) {
                        Ok(serde_json::Value::Array(elems)) => arr.extend(elems),
                        // A non-string element type means each occurrence is
                        // itself JSON — `--inputs '{"text":"hi"}'` is one
                        // object, not the literal text of one. Keeping it a
                        // string made an array-of-objects flag impossible to
                        // use one element at a time, while `--schema` now
                        // advertises `items: {type: object}`.
                        Ok(decoded)
                            if param_def
                                .item_type
                                .as_deref()
                                .is_some_and(|t| t != "string") =>
                        {
                            arr.push(decoded)
                        }
                        // Anything else — including non-array JSON like "123"
                        // on a string-element flag — stays a literal string.
                        _ => arr.push(serde_json::Value::String(v.clone())),
                    }
                }
                if explicit_null && arr.is_empty() {
                    params.insert(param_name.clone(), serde_json::Value::Null);
                    continue;
                }
                // For oneOf [string, array<string>] unions, a single scalar
                // value stays a plain string — only multiple values (or an
                // explicit JSON array) produce an array on the wire.
                let value = if param_def.scalar_or_array && arr.len() == 1 {
                    arr.into_iter().next().unwrap()
                } else {
                    serde_json::Value::Array(arr)
                };
                params.insert(param_name.clone(), value);
            }
            continue;
        }

        let Some(value) = matched_args.get_one::<String>(&arg_id) else {
            continue;
        };
        let from_default = matched_args.value_source(&arg_id)
            == Some(clap::parser::ValueSource::DefaultValue);
        if from_default
            && is_body_param(param_def)
            && (body_json_supplied || ancestor_flag_typed(param_name))
        {
            continue;
        }
        // A profile-supplied default also arrives as clap `DefaultValue`, but
        // it is a *string the user wrote*, not the spec's typed
        // `x-fern-default`. Taking the typed branch for it would silently
        // discard the profile's value and send the spec default instead —
        // exactly the failure the profile exists to prevent. So the typed
        // branch is reserved for the case where the spec default is really
        // what clap surfaced.
        let profile_supplied =
            crate::openapi::commands::profile_parameter_default(param_def, param_name).is_some();
        let json_value = match (from_default && !profile_supplied, &param_def.default_value) {
            (true, Some(typed)) => typed.clone(),
            _ => {
                // Null sentinel, gated to user-supplied input so a
                // default-injected "null" string is never reinterpreted.
                // See ADR-0003.
                if param_def.nullable && value == "null" {
                    serde_json::Value::Null
                } else if matches!(
                    param_def.param_type.as_deref(),
                    Some("object") | Some("array")
                ) {
                    // For object- and array-typed params (e.g. deepObject /
                    // form / spaceDelimited / pipeDelimited query parameters,
                    // or simple-style header parameters), attempt JSON parsing
                    // so the style-aware serializer receives a `Value::Object` /
                    // `Value::Array` rather than a verbatim string. Falls back
                    // to the raw string when the value isn't valid JSON.
                    match serde_json::from_str::<serde_json::Value>(value.as_str()) {
                        Ok(mut parsed) => {
                            // Resolve `@filename` references inside nested
                            // string values — mirrors Stainless's CLI shorthand
                            // semantics (e.g. `--profile '{"pic":"@abe.jpg"}'`).
                            // FER-10436.
                            executor::resolve_file_refs(&mut parsed)?;
                            parsed
                        }
                        Err(_) => serde_json::Value::String(value.clone()),
                    }
                } else {
                    let wire = param_def
                        .resolve_enum_display_to_wire(value.as_str())
                        .into_owned();
                    serde_json::Value::String(wire)
                }
            }
        };
        params.insert(param_name.clone(), json_value);
    }

    // Override with --params JSON if provided (--params wins).
    if let Some(json_str) = params_override {
        let overrides: serde_json::Map<String, serde_json::Value> =
            serde_json::from_str(json_str)
                .map_err(|e| CliError::Validation(format!("Invalid --params JSON: {e}")))?;
        for (key, value) in overrides {
            params.insert(key, value);
        }
    }

    // Now that --params has had its say, check whether any variable-bound
    // parameter is still unsupplied. Only then emit the validation error
    // naming both the global CLI flag and its env-var fallback.
    for (param_name, var_name) in missing_variable_bound {
        if !params.contains_key(&param_name) {
            let kebab = crate::text::to_kebab_flag(&var_name);
            let env = crate::text::to_screaming_snake(&var_name);
            return Err(CliError::Validation(format!(
                "Missing required SDK variable '{var_name}': provide --{kebab}, \
                 set ${env}, or include it in --params"
            )));
        }
    }

    Ok(params)
}

/// Collect multipart/form-data parts from CLI arg matches. Returns `None`
/// when the operation has no multipart fields. File-typed fields reject
/// control characters (matching `binary_body_path` validation) but allow
/// absolute paths since users may upload files from anywhere on disk.
///
/// Array-typed fields are repeatable (`--files a.mp3 --files b.mp3`) and
/// contribute one part per occurrence, all carrying the same `name` — the
/// multipart encoding of a list.
///
/// `params` carries the `--params` JSON. Multipart fields live in
/// `method.multipart_fields` rather than `method.parameters`, so the
/// executor has no `location: body` to route them by and would send them as
/// query parameters. Any key naming a multipart field is therefore *moved*
/// out of `params` into the form body here, keeping `--params` equivalent to
/// the individual flags (which it overrides, as everywhere else).
pub(crate) fn collect_multipart_parts(
    method: &RestMethod,
    matches: &clap::ArgMatches,
    params: &mut serde_json::Map<String, serde_json::Value>,
) -> Result<Option<Vec<executor::MultipartPart>>, crate::error::CliError> {
    if method.multipart_fields.is_empty() {
        return Ok(None);
    }

    let mut parts = Vec::new();
    for field in &method.multipart_fields {
        // Skip fields whose kebab name collides with a builtin flag — the
        // arg was never registered so any value would come from the builtin.
        let kebab = crate::text::to_kebab_flag(&field.wire_name);
        if crate::openapi::commands::BUILTIN_FLAG_NAMES.contains(&kebab.as_str()) {
            continue;
        }

        let values: Vec<String> = match params.remove(&field.wire_name) {
            Some(from_params) => multipart_values_from_params(&from_params, field.repeated),
            None if field.repeated => matches
                .try_get_many::<String>(&field.wire_name)
                .ok()
                .flatten()
                .map(|vals| vals.cloned().collect())
                .unwrap_or_default(),
            None => matches
                .try_get_one::<String>(&field.wire_name)
                .ok()
                .flatten()
                .cloned()
                .into_iter()
                .collect(),
        };

        for value in values {
            push_multipart_part(field, &value, &mut parts)?;
        }
    }

    if parts.is_empty() {
        Ok(None)
    } else {
        Ok(Some(parts))
    }
}

/// Lower a `--params` value for a multipart field into the part values it
/// stands for. A JSON array on a repeated field splices out element by
/// element (`{"files": ["a", "b"]}` ≡ `--files a --files b`); everything
/// else becomes a single value, with non-strings re-encoded as compact JSON
/// so structured parts keep their shape.
fn multipart_values_from_params(value: &serde_json::Value, repeated: bool) -> Vec<String> {
    match value {
        serde_json::Value::Array(elems) if repeated => {
            elems.iter().map(multipart_scalar_to_string).collect()
        }
        other => vec![multipart_scalar_to_string(other)],
    }
}

fn multipart_scalar_to_string(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::String(s) => s.clone(),
        other => other.to_string(),
    }
}

/// Append the part(s) for one occurrence of a multipart field's flag.
fn push_multipart_part(
    field: &crate::openapi::discovery::MultipartField,
    value: &str,
    parts: &mut Vec<executor::MultipartPart>,
) -> Result<(), crate::error::CliError> {
    if field.is_file {
        let raw = value;
        // `\@literal` — escape syntax for sending a literal `@`-prefixed
        // value on a file-typed field (FER-10436). The value is sent as a
        // plain text part; no file read is attempted, and the path-safety
        // validators that normally guard file inputs are skipped because
        // there is no path to validate.
        if executor::is_escaped_literal(raw) {
            let literal = executor::strip_or_escape_at(raw).into_owned();
            parts.push(executor::MultipartPart::Text {
                name: field.wire_name.clone(),
                value: literal,
                content_type: field.content_type.clone(),
            });
            return Ok(());
        }
        // Validate the inner filesystem path — the same string the executor
        // will eventually pass to `tokio::fs::read`. `parse_at_ref` strips
        // the `@`, `@file://`, or `@data://` prefix so an adversarial
        // `@file://evil\x00path` is rejected before disk I/O regardless of
        // which encoding mode was requested (FER-10532). Stdin is only the
        // `Auto`-mode `-` sentinel; an explicit-scheme `-` is a literal
        // filename and still gets validated.
        let (inner, mode) = match executor::parse_at_ref(raw) {
            executor::AtRef::File { path, mode } => (path, mode),
            executor::AtRef::Plain(s) => (std::borrow::Cow::Borrowed(s), executor::AtMode::Auto),
            // `\@literal` was handled above; reachable only as a defensive
            // fallback if the escape branch is ever skipped.
            executor::AtRef::Escaped(_) => return Ok(()),
        };
        let is_stdin = mode == executor::AtMode::Auto && inner.as_ref() == "-";
        if !is_stdin {
            crate::output::reject_dangerous_chars(
                inner.as_ref(),
                &format!("--{}", crate::text::to_kebab_flag(&field.wire_name)),
            )?;
        }
        parts.push(executor::MultipartPart::File {
            name: field.wire_name.clone(),
            path: raw.to_string(),
            content_type: field.content_type.clone(),
        });
    } else {
        parts.push(executor::MultipartPart::Text {
            name: field.wire_name.clone(),
            value: value.to_string(),
            content_type: field.content_type.clone(),
        });
    }

    Ok(())
}

pub(crate) fn build_pagination_config(
    matches: &clap::ArgMatches,
    doc: &RestDescription,
    cli_name: &str,
) -> executor::PaginationConfig {
    // `try_*` rather than `get_*`: the pagination flags are only registered
    // on operations the spec describes how to page (see
    // `commands::method_has_pagination`). On every other operation the arg id
    // is unknown and `get_flag` panics, so absence has to read as "off".
    executor::PaginationConfig {
        page_all: matches
            .try_get_one::<bool>("page-all")
            .ok()
            .flatten()
            .copied()
            .unwrap_or(false),
        page_limit: matches
            .try_get_one::<u32>("page-limit")
            .ok()
            .flatten()
            .copied()
            .unwrap_or(10),
        page_delay_ms: matches
            .try_get_one::<u64>("page-delay")
            .ok()
            .flatten()
            .copied()
            .unwrap_or(100),
        token_query_param: doc
            .pagination_token_query_param
            .clone()
            .unwrap_or_else(|| "pageToken".to_string()),
        token_response_path: doc
            .pagination_token_response_path
            .clone()
            .unwrap_or_else(|| "nextPageToken".to_string()),
        no_pager: matches
            .try_get_one::<bool>("no-pager")
            .ok()
            .flatten()
            .copied()
            .unwrap_or(false),
        cli_name: cli_name.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ------------------------------------------------------------------
    // x-fern-global-headers (FER-9864 P2) — registration helpers.
    // ------------------------------------------------------------------

    /// `global_header_flag_name` honors `name:` (kebab-cased) when set,
    /// otherwise falls back to kebab-casing the wire header. This is
    /// the same precedence the upstream Fern importer uses.
    #[test]
    fn test_global_header_flag_name_respects_name_field_then_header() {
        let h_with_name = crate::openapi::discovery::GlobalHeader {
            header: "X-API-Stage".into(),
            name: Some("apiStage".into()),
            optional: false,
            env: None,
            default: None,
        };
        assert_eq!(global_header_flag_name(&h_with_name), "api-stage");

        let h_no_name = crate::openapi::discovery::GlobalHeader {
            header: "X-Tenant-Id".into(),
            name: None,
            optional: false,
            env: None,
            default: None,
        };
        assert_eq!(global_header_flag_name(&h_no_name), "x-tenant-id");
    }

    /// The clap arg ID for a global header must be namespaced so it
    /// can't collide with any per-op parameter HashMap key. The wire
    /// header is preserved verbatim so the executor's lookup against
    /// `RestMethod.parameters` stays straightforward.
    #[test]
    fn test_global_header_arg_id_is_namespaced_by_wire_name() {
        let h = crate::openapi::discovery::GlobalHeader {
            header: "X-API-Stage".into(),
            name: Some("apiStage".into()),
            optional: false,
            env: None,
            default: None,
        };
        assert_eq!(global_header_arg_id(&h), "__global_header::X-API-Stage");
    }

    #[test]
    fn test_effective_base_url_falls_back_to_per_operation_server() {
        // A spec can declare its server per-operation (`paths./x.get.servers`)
        // and carry no root-level one. The built-in path handles that via
        // `effective_root_url(method, doc)`; the SDK bridge has no operation in
        // scope, so without a fallback it produced an empty base and every
        // custom command failed on a relative URL — on exactly the specs this
        // accessor exists to serve.
        let mut methods = std::collections::HashMap::new();
        methods.insert(
            "list".to_string(),
            RestMethod {
                root_url: "https://api.example.com".to_string(),
                ..Default::default()
            },
        );
        let mut resources = std::collections::HashMap::new();
        resources.insert(
            "things".to_string(),
            RestResource {
                methods,
                ..Default::default()
            },
        );
        assert_eq!(
            first_method_root_url(&resources).as_deref(),
            Some("https://api.example.com"),
        );
        // No operation declares one either — nothing to invent.
        assert_eq!(first_method_root_url(&std::collections::HashMap::new()), None);
    }

    /// A global header/parameter whose flag was never registered on the
    /// command still resolves from `env` and `default`.
    ///
    /// Regression: colliding globals are attached per-leaf rather than
    /// `global(true)`, and the custom-command path reads the *root*
    /// `ArgMatches` — so `try_get_one` returned `Err` and the header was
    /// silently dropped. The result was a global stamped on spec-derived
    /// requests and missing on custom-command ones.
    #[test]
    fn test_unregistered_global_falls_back_to_env_then_default() {
        // Matches on a command that declares no global-header arg at all,
        // standing in for both the colliding-leaf and custom-command cases.
        let matches = clap::Command::new("test").get_matches_from(["test"]);

        let with_default = crate::openapi::discovery::GlobalHeader {
            header: "X-Source".to_string(),
            optional: true,
            default: Some("cli".to_string()),
            ..Default::default()
        };
        assert_eq!(
            resolve_global_header_value(&matches, &with_default),
            Some("cli".to_string()),
            "an unregistered global must still honor its default",
        );

        // env wins over default, mirroring clap's own precedence.
        let env_var = "FERN_TEST_UNREGISTERED_GLOBAL_HEADER";
        // SAFETY: single-threaded test-local mutation; removed below.
        unsafe { std::env::set_var(env_var, "  from-env  ") };
        let with_env = crate::openapi::discovery::GlobalHeader {
            header: "X-Source".to_string(),
            optional: true,
            env: Some(env_var.to_string()),
            default: Some("cli".to_string()),
            ..Default::default()
        };
        assert_eq!(
            resolve_global_header_value(&matches, &with_env),
            Some("from-env".to_string()),
            "env must win over default, and the value must be trimmed",
        );

        // A whitespace-only resolution is dropped, not stamped as an empty
        // header — same rule the registered path applies.
        unsafe { std::env::set_var(env_var, "   ") };
        let blank = crate::openapi::discovery::GlobalHeader {
            header: "X-Source".to_string(),
            optional: true,
            env: Some(env_var.to_string()),
            ..Default::default()
        };
        assert_eq!(resolve_global_header_value(&matches, &blank), None);
        unsafe { std::env::remove_var(env_var) };

        // Nothing declared anywhere still resolves to nothing.
        let bare = crate::openapi::discovery::GlobalHeader {
            header: "X-Source".to_string(),
            optional: true,
            ..Default::default()
        };
        assert_eq!(resolve_global_header_value(&matches, &bare), None);
    }

    /// `build_global_header_overrides` errors with a message naming the
    /// flag, env var, and wire-header name when a required header has
    /// no value source. Pins the human-facing error shape required by
    /// the FER-9864 acceptance criteria ("required-without-value
    /// fails"), at the level where the validation actually lives.
    #[test]
    fn test_build_global_header_overrides_errors_when_required_missing() {
        use crate::openapi::discovery::{GlobalHeader, RestDescription, RestMethod};
        use clap::Command;

        let doc = RestDescription {
            global_headers: vec![GlobalHeader {
                header: "X-API-Stage".into(),
                name: Some("apiStage".into()),
                optional: false,
                env: Some("FIXTURE_API_STAGE".into()),
                default: None,
            }],
            ..Default::default()
        };
        let method = RestMethod::default();

        // Use a clap Command with NO defaults bound for the arg —
        // simulating "user passed nothing, env unset, no default".
        let cmd = Command::new("test").arg(
            clap::Arg::new(global_header_arg_id(&doc.global_headers[0]))
                .long(global_header_flag_name(&doc.global_headers[0]))
                .global(true),
        );
        let matches = cmd.try_get_matches_from(["test"]).unwrap();
        let params = serde_json::Map::new();

        let err = build_global_header_overrides(&matches, &doc, &method, &params).unwrap_err();
        let msg = format!("{err}");
        assert!(
            msg.contains("--api-stage"),
            "error should name the CLI flag: {msg}"
        );
        assert!(
            msg.contains("FIXTURE_API_STAGE"),
            "error should name the env var: {msg}"
        );
        assert!(
            msg.contains("X-API-Stage"),
            "error should name the wire header: {msg}"
        );
    }

    /// When the user supplies a per-op header parameter with the same
    /// wire-name as a global header, the per-op value wins and the
    /// global is dropped from the override list. Mirrors the upstream
    /// Fern importer's per-op-wins behavior so operators get a single
    /// override surface for collision cases.
    #[test]
    fn test_build_global_header_overrides_per_op_param_wins() {
        use crate::openapi::discovery::{
            GlobalHeader, MethodParameter, RestDescription, RestMethod,
        };
        use clap::Command;
        use std::collections::HashMap;

        let doc = RestDescription {
            global_headers: vec![GlobalHeader {
                header: "X-API-Stage".into(),
                name: Some("apiStage".into()),
                optional: false,
                env: None,
                default: Some("production".into()),
            }],
            ..Default::default()
        };

        // Per-op method declares `X-API-Stage` as a header parameter.
        let mut parameters: HashMap<String, MethodParameter> = HashMap::new();
        parameters.insert(
            "X-API-Stage".into(),
            MethodParameter {
                location: Some("header".into()),
                ..Default::default()
            },
        );
        let method = RestMethod {
            parameters,
            ..Default::default()
        };

        // Simulate clap matches with the global default applied.
        let cmd = Command::new("test").arg(
            clap::Arg::new(global_header_arg_id(&doc.global_headers[0]))
                .long(global_header_flag_name(&doc.global_headers[0]))
                .default_value("production")
                .global(true),
        );
        let matches = cmd.try_get_matches_from(["test"]).unwrap();

        // The per-op `params` map contains a value for the same wire-name.
        let mut params = serde_json::Map::new();
        params.insert("X-API-Stage".into(), serde_json::json!("canary"));

        let overrides =
            build_global_header_overrides(&matches, &doc, &method, &params).unwrap();
        assert!(
            overrides.is_empty(),
            "per-op param suppresses the global override, got: {overrides:?}",
        );
    }

    /// `global_header_long_collides_with_param` inspects descendant
    /// (subcommand) args only — a long shared with a per-op param is a
    /// collision; a long that only exists as a root-level global is not.
    #[test]
    fn test_global_header_long_collides_with_param_scopes_to_subcommands() {
        let cli = clap::Command::new("cli")
            // A root-level global flag must NOT count as a collision.
            .arg(clap::Arg::new("format").long("format").global(true))
            .subcommand(
                clap::Command::new("products").subcommand(
                    clap::Command::new("retrieve")
                        .arg(clap::Arg::new("country").long("country")),
                ),
            );
        assert!(
            global_header_long_collides_with_param(&cli, "country"),
            "a per-op param on a leaf must register as a collision",
        );
        assert!(
            !global_header_long_collides_with_param(&cli, "format"),
            "a root-level global flag must not register as a collision",
        );
        assert!(
            !global_header_long_collides_with_param(&cli, "language"),
            "a long that exists nowhere in the tree is not a collision",
        );
    }

    /// `register_global_header_on_nonconflicting_leaves` attaches the flag
    /// to leaves that don't already declare it and leaves colliding leaves
    /// untouched.
    #[test]
    fn test_register_global_header_skips_conflicting_leaf() {
        let cli = clap::Command::new("cli").subcommand(
            clap::Command::new("products")
                .subcommand(
                    clap::Command::new("retrieve")
                        .arg(clap::Arg::new("country").long("country")),
                )
                .subcommand(clap::Command::new("list")),
        );
        let arg = clap::Arg::new("__global_header::X-Country").long("country");
        let cli = register_global_header_on_nonconflicting_leaves(cli, &arg, "country");
        // Same post-pass `run_async` applies to the finished tree.
        let cli = crate::cli_args::apply_global_help_heading(cli);
        let products = cli.find_subcommand("products").unwrap();
        let retrieve = products.find_subcommand("retrieve").unwrap();
        let list = products.find_subcommand("list").unwrap();
        // retrieve already declares --country → no global-header arg added.
        assert!(
            !retrieve
                .get_arguments()
                .any(|a| a.get_id().as_str() == "__global_header::X-Country"),
            "colliding leaf must keep only its per-op param",
        );
        // list has no --country → global-header arg attached, filed with
        // the other globals in `--help`.
        let copy = list
            .get_arguments()
            .find(|a| a.get_id().as_str() == "__global_header::X-Country")
            .expect("non-colliding leaf must receive the global-header flag");
        assert_eq!(
            copy.get_help_heading(),
            Some(crate::cli_args::HELP_HEADING_GLOBAL)
        );
        // Rendered help on the sibling files the copy under Global options
        // with no residual `Options:` section.
        let help = list.clone().render_help().to_string();
        let global_pos = help
            .find(crate::cli_args::HELP_HEADING_GLOBAL)
            .expect("Global options heading must render");
        let country_pos = help.find("--country").expect("--country must render");
        assert!(global_pos < country_pos, "{help}");
        assert!(!help.contains("\nOptions:"), "{help}");
    }

    /// Full regression for FER-11145: a global header whose flag name
    /// matches a per-operation parameter must not make clap panic, and the
    /// per-op param must win on the colliding command while the global
    /// flag stays available on non-colliding siblings.
    #[test]
    fn test_decorate_command_global_header_param_collision_no_panic() {
        use crate::openapi::discovery::{
            GlobalHeader, MethodParameter, RestDescription, RestMethod, RestResource,
        };
        use std::collections::HashMap;

        // products.retrieve declares a per-op `country` query param.
        let mut retrieve_params: HashMap<String, MethodParameter> = HashMap::new();
        retrieve_params.insert(
            "country".into(),
            MethodParameter {
                location: Some("query".into()),
                param_type: Some("string".into()),
                ..Default::default()
            },
        );
        let retrieve = RestMethod {
            http_method: "GET".into(),
            parameters: retrieve_params,
            ..Default::default()
        };
        // products.list carries no `country` param.
        let list = RestMethod {
            http_method: "GET".into(),
            ..Default::default()
        };
        let mut products = RestResource::default();
        products.methods.insert("retrieve".into(), retrieve);
        products.methods.insert("list".into(), list);
        let mut resources = HashMap::new();
        resources.insert("products".into(), products);

        let doc = RestDescription {
            name: "channel3".into(),
            resources,
            global_headers: vec![GlobalHeader {
                header: "X-Channel3-Country".into(),
                name: Some("country".into()),
                optional: true,
                env: Some("CHANNEL3_COUNTRY".into()),
                default: None,
            }],
            ..Default::default()
        };

        let app = CliApp::new("channel3");
        let cli = crate::openapi::commands::build_cli(&doc);
        let cli = app.decorate_command(&doc, cli);

        // Before the fix, building this command panicked because
        // `--country` was registered twice (global header + per-op param).
        cli.clone().debug_assert();

        // Colliding command: `--country` binds to the per-op param, and the
        // global-header arg id is absent (per-op param wins).
        let matches = cli
            .clone()
            .try_get_matches_from(["channel3", "products", "retrieve", "--country", "US"])
            .expect("retrieve should parse --country as the per-op param");
        let (_, products_m) = matches.subcommand().unwrap();
        let (_, retrieve_m) = products_m.subcommand().unwrap();
        assert_eq!(
            retrieve_m.get_one::<String>("country").map(String::as_str),
            Some("US"),
        );
        assert!(
            resolve_global_header_value(retrieve_m, &doc.global_headers[0]).is_none(),
            "global header must be dropped from the colliding command",
        );

        // Non-colliding sibling: `--country` binds to the global header.
        let matches = cli
            .try_get_matches_from(["channel3", "products", "list", "--country", "CA"])
            .expect("list should parse --country as the global-header flag");
        let (_, products_m) = matches.subcommand().unwrap();
        let (_, list_m) = products_m.subcommand().unwrap();
        assert_eq!(
            resolve_global_header_value(list_m, &doc.global_headers[0]).as_deref(),
            Some("CA"),
        );
    }

    #[test]
    fn test_sdk_variable_collides_with_builtin_flags() {
        // Variables whose kebab form matches any built-in per-op flag
        // must be flagged as colliding so the global registration site
        // can skip them with a warning instead of letting clap panic.
        // Cover the names that are most likely to be picked accidentally.
        for builtin in ["params", "format", "dry-run", "base-url", "page-all", "output", "json", "debug"] {
            assert!(
                sdk_variable_collides_with_builtin(builtin),
                "expected '{builtin}' to collide with a built-in flag",
            );
        }
        // Plain identifiers and innocuous variable names must NOT collide.
        for ok in ["garden-id", "tenant-id", "page-token", "uuid", "client-id"] {
            assert!(
                !sdk_variable_collides_with_builtin(ok),
                "expected '{ok}' NOT to collide with a built-in flag",
            );
        }
    }

    #[test]
    fn test_cli_app_builder() {
        let app = CliApp::new("test-cli")
            .spec("openapi: 3.0.0\ninfo:\n  title: Test\n  version: '1.0'\npaths: {}")
            .auth_scheme_env("bearer", "TEST_TOKEN");

        assert_eq!(app.name, "test-cli");
        assert_eq!(app.specs.len(), 1);
        assert_eq!(app.auth_bindings.len(), 1);
        assert_eq!(app.auth_bindings[0].0, "bearer");
    }

    #[test]
    fn test_auth_scheme_records_token_binding() {
        let app = CliApp::new("t")
            .spec("openapi: 3.0.0\ninfo:\n  title: T\n  version: '1.0'\npaths: {}")
            .auth_scheme("bearerAuth", AuthCredentialSource::from_env("API_TOKEN"));
        assert_eq!(app.auth_bindings.len(), 1);
        assert_eq!(app.auth_bindings[0].0, "bearerAuth");
        match &app.auth_bindings[0].1 {
            SchemeBinding::Token(_) => {}
            other => panic!("expected Token, got {other:?}"),
        }
    }

    #[test]
    fn test_auth_basic_scheme_records_basic_binding() {
        let app = CliApp::new("t")
            .spec("openapi: 3.0.0\ninfo:\n  title: T\n  version: '1.0'\npaths: {}")
            .auth_basic_scheme(
                "basic",
                AuthCredentialSource::from_env("U"),
                AuthCredentialSource::from_env("P"),
            );
        assert!(matches!(
            app.auth_bindings[0].1,
            SchemeBinding::Basic { .. },
        ));
    }

    #[test]
    fn test_resolve_method_from_matches_basic() {
        let mut resources = std::collections::HashMap::new();
        let mut files_res = crate::openapi::discovery::RestResource::default();
        files_res.methods.insert(
            "list".to_string(),
            crate::openapi::discovery::RestMethod {
                id: Some("files.list".to_string()),
                http_method: "GET".to_string(),
                ..Default::default()
            },
        );
        resources.insert("files".to_string(), files_res);

        let doc = RestDescription {
            name: "test".to_string(),
            resources,
            ..Default::default()
        };

        let cmd = clap::Command::new("cli")
            .subcommand(clap::Command::new("files").subcommand(clap::Command::new("list")));

        let matches = cmd.get_matches_from(vec!["cli", "files", "list"]);
        let (method, _) = resolve_method_from_matches(&doc, &matches).unwrap();
        assert_eq!(method.id.as_deref(), Some("files.list"));
    }

    #[test]
    fn test_resolve_method_from_matches_nested() {
        let mut resources = std::collections::HashMap::new();
        let mut files_res = crate::openapi::discovery::RestResource::default();
        let mut permissions_res = crate::openapi::discovery::RestResource::default();
        permissions_res.methods.insert(
            "get".to_string(),
            crate::openapi::discovery::RestMethod {
                id: Some("files.permissions.get".to_string()),
                ..Default::default()
            },
        );
        files_res
            .resources
            .insert("permissions".to_string(), permissions_res);
        resources.insert("files".to_string(), files_res);

        let doc = RestDescription {
            name: "test".to_string(),
            resources,
            ..Default::default()
        };

        let cmd =
            clap::Command::new("cli").subcommand(clap::Command::new("files").subcommand(
                clap::Command::new("permissions").subcommand(clap::Command::new("get")),
            ));

        let matches = cmd.get_matches_from(vec!["cli", "files", "permissions", "get"]);
        let (method, _) = resolve_method_from_matches(&doc, &matches).unwrap();
        assert_eq!(method.id.as_deref(), Some("files.permissions.get"));
    }

    #[test]
    fn test_resolve_method_empty_path() {
        let doc = RestDescription {
            name: "test".to_string(),
            ..Default::default()
        };

        let cmd = clap::Command::new("cli");
        let matches = cmd.get_matches_from(vec!["cli"]);
        let result = resolve_method_from_matches(&doc, &matches);
        assert!(result.is_err());
    }

    /// `AppContext::extra_headers_for` mirrors the built-in command
    /// path: a required global header with no resolved value and no
    /// per-op override fails with a validation error that names both
    /// the CLI flag and the env var. This is the regression test for
    /// the custom-command-handler path that previously dropped the
    /// header silently.
    #[test]
    fn test_app_context_extra_headers_required_missing_errors() {
        use crate::openapi::discovery::{GlobalHeader, RestDescription, RestMethod};

        let doc = RestDescription {
            global_headers: vec![GlobalHeader {
                header: "X-API-Stage".into(),
                name: Some("apiStage".into()),
                optional: false,
                env: Some("FIXTURE_API_STAGE".into()),
                default: None,
            }],
            ..Default::default()
        };
        let ctx = AppContext::new(
            doc,
            crate::auth::no_auth_provider(),
            crate::http::HttpConfig::new("test").unwrap(),
            // Note: the custom-command path's filter_map silently
            // dropped this required header. With the fix,
            // extra_headers_for surfaces a validation error.
            Vec::new(),
            Vec::new(),
        );
        let method = RestMethod::default();
        let err = ctx.extra_headers_for(&method, None).unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("--api-stage"), "should name flag: {msg}");
        assert!(msg.contains("FIXTURE_API_STAGE"), "should name env: {msg}");
        assert!(msg.contains("X-API-Stage"), "should name wire header: {msg}");
    }

    /// A required global header with no resolved value is permitted
    /// when the operation itself declares a same-named header
    /// parameter that the user supplied — the per-op value will be
    /// sent on the wire in place of the global. Mirrors the built-in
    /// command path's per-op-wins behavior.
    #[test]
    fn test_app_context_extra_headers_per_op_param_satisfies_required() {
        use crate::openapi::discovery::{
            GlobalHeader, MethodParameter, RestDescription, RestMethod,
        };
        use std::collections::HashMap;

        let doc = RestDescription {
            global_headers: vec![GlobalHeader {
                header: "X-API-Stage".into(),
                name: Some("apiStage".into()),
                optional: false,
                env: None,
                default: None,
            }],
            ..Default::default()
        };
        let ctx = AppContext::new(
            doc,
            crate::auth::no_auth_provider(),
            crate::http::HttpConfig::new("test").unwrap(),
            Vec::new(),
            Vec::new(),
        );
        let mut parameters: HashMap<String, MethodParameter> = HashMap::new();
        parameters.insert(
            "X-API-Stage".into(),
            MethodParameter {
                location: Some("header".into()),
                ..Default::default()
            },
        );
        let method = RestMethod {
            parameters,
            ..Default::default()
        };
        let params_json = r#"{"X-API-Stage":"canary"}"#;
        let headers = ctx
            .extra_headers_for(&method, Some(params_json))
            .expect("per-op override should satisfy the required global header");
        assert!(headers.is_empty(), "per-op wins: globals dropped: {headers:?}");
    }

    /// An optional global header with no resolved value is silently
    /// omitted (no error). Pins the negative case so a future
    /// over-strict change to the required-header guard doesn't start
    /// failing optional headers too.
    #[test]
    fn test_app_context_extra_headers_optional_missing_is_ok() {
        use crate::openapi::discovery::{GlobalHeader, RestDescription, RestMethod};

        let doc = RestDescription {
            global_headers: vec![GlobalHeader {
                header: "X-Tenant-Id".into(),
                name: None,
                optional: true,
                env: None,
                default: None,
            }],
            ..Default::default()
        };
        let ctx = AppContext::new(
            doc,
            crate::auth::no_auth_provider(),
            crate::http::HttpConfig::new("test").unwrap(),
            Vec::new(),
            Vec::new(),
        );
        let method = RestMethod::default();
        let headers = ctx.extra_headers_for(&method, None).expect("optional ok");
        assert!(headers.is_empty(), "optional with no value: {headers:?}");
    }

    /// Multi-spec merge: when two specs declare the same wire-name in
    /// `x-fern-global-headers`, the first write wins and the second is
    /// silently dropped. Mirrors `merge_sdk_variables` and keeps the
    /// resolved flag registry deterministic across spec ordering.
    #[test]
    fn test_merge_global_headers_first_write_wins() {
        use crate::openapi::discovery::GlobalHeader;

        let mut acc = vec![GlobalHeader {
            header: "X-API-Stage".into(),
            name: Some("apiStage".into()),
            optional: false,
            env: Some("FIRST_STAGE".into()),
            default: Some("production".into()),
        }];
        let incoming = vec![
            // Same wire-name → must be dropped, preserving the first env / default.
            GlobalHeader {
                header: "X-API-Stage".into(),
                name: Some("stage".into()),
                optional: true,
                env: Some("SECOND_STAGE".into()),
                default: Some("staging".into()),
            },
            // Distinct wire-name → must be appended.
            GlobalHeader {
                header: "X-Tenant-Id".into(),
                name: None,
                optional: true,
                env: None,
                default: None,
            },
        ];
        merge_global_headers(&mut acc, incoming);
        assert_eq!(acc.len(), 2, "got: {acc:?}");
        assert_eq!(acc[0].header, "X-API-Stage");
        assert_eq!(acc[0].env.as_deref(), Some("FIRST_STAGE"));
        assert_eq!(acc[0].default.as_deref(), Some("production"));
        assert!(!acc[0].optional);
        assert_eq!(acc[1].header, "X-Tenant-Id");
    }

    /// Per-op-override match must be case-insensitive per RFC 7230 §3.2.
    /// A spec that declares `X-API-Stage` globally and `x-api-stage` as a
    /// header param on a single op should treat them as the same header
    /// — the per-op value wins and the global is suppressed (rather than
    /// both landing on the wire).
    #[test]
    fn test_per_op_header_param_override_is_case_insensitive() {
        use crate::openapi::discovery::{GlobalHeader, MethodParameter, RestDescription, RestMethod};
        use std::collections::HashMap;

        let doc = RestDescription {
            global_headers: vec![GlobalHeader {
                header: "X-API-Stage".into(),
                name: Some("apiStage".into()),
                optional: false,
                env: None,
                default: None,
            }],
            ..Default::default()
        };
        // Per-op param uses lowercase wire-name; case-insensitive lookup
        // must still treat this as an override of the global.
        let mut parameters: HashMap<String, MethodParameter> = HashMap::new();
        parameters.insert(
            "x-api-stage".into(),
            MethodParameter {
                location: Some("header".into()),
                ..Default::default()
            },
        );
        let method = RestMethod {
            parameters,
            ..Default::default()
        };
        let ctx = AppContext::new(
            doc,
            crate::auth::no_auth_provider(),
            crate::http::HttpConfig::new("test").unwrap(),
            Vec::new(),
            Vec::new(),
        );
        // User supplied the per-op param under a third casing — the
        // override should still kick in, satisfying the required check
        // without a CLI flag / env value.
        let headers = ctx
            .extra_headers_for(&method, Some(r#"{"X-Api-Stage": "canary"}"#))
            .expect(
                "per-op override should satisfy required-header check regardless of casing",
            );
        assert!(
            headers.is_empty(),
            "global header must be suppressed when per-op param overrides it: {headers:?}",
        );
    }

    /// `--api-stage ""` (or trimming-only whitespace) must NOT resolve
    /// to `Some("")`. `resolve_global_header_value` trims and treats
    /// empties as "no value supplied", so the required-header guard
    /// fires instead of silently sending an empty `X-API-Stage:` header.
    /// Pins the fix for the self-review finding noted in PR #45.
    #[test]
    fn test_resolve_global_header_value_filters_empty_and_whitespace() {
        use crate::openapi::discovery::GlobalHeader;

        let h = GlobalHeader {
            header: "X-API-Stage".into(),
            name: Some("apiStage".into()),
            optional: false,
            env: None,
            default: None,
        };
        let cmd = clap::Command::new("t").arg(
            clap::Arg::new(global_header_arg_id(&h))
                .long(global_header_flag_name(&h)),
        );
        // Empty string flag value → None.
        let m = cmd.clone().get_matches_from(["t", "--api-stage", ""]);
        assert!(
            resolve_global_header_value(&m, &h).is_none(),
            "empty flag value must resolve to None",
        );
        // Whitespace-only flag value → None.
        let m = cmd.clone().get_matches_from(["t", "--api-stage", "   "]);
        assert!(
            resolve_global_header_value(&m, &h).is_none(),
            "whitespace-only flag value must resolve to None",
        );
        // Normal value → Some(trimmed).
        let m = cmd.get_matches_from(["t", "--api-stage", "  canary  "]);
        assert_eq!(
            resolve_global_header_value(&m, &h).as_deref(),
            Some("canary"),
        );
    }

    /// `compose_root_after_help_sections` joins present sections with
    /// the footer and skips any `None` sections cleanly. Pins the
    /// neither-auth-nor-global-headers regression target raised in PR
    /// #45's self-review.
    #[test]
    fn test_compose_root_after_help_sections_skips_absent() {
        let footer = "Standard env vars: …";
        let g = "Global headers:\n  --api-stage <STAGE>  …";
        let a = "Authentication:\n  bearer  …";

        // All absent: only the footer.
        assert_eq!(
            compose_root_after_help_sections(None, None, None, footer),
            footer,
            "no global headers, no global params, no auth → only the footer is rendered",
        );
        // Auth only: same as the pre-FER-9864 baseline.
        assert_eq!(
            compose_root_after_help_sections(None, None, Some(a), footer),
            format!("{a}\n{footer}"),
        );
        // Globals only: no auth section.
        assert_eq!(
            compose_root_after_help_sections(Some(g), None, None, footer),
            format!("{g}\n{footer}"),
        );
        // Both present: globals first, then auth, then footer.
        assert_eq!(
            compose_root_after_help_sections(Some(g), None, Some(a), footer),
            format!("{g}\n{a}\n{footer}"),
        );
    }

    /// `build_cli` sets the env-var footer and `decorate_command` used to
    /// append it again, so the root `--help` printed the section twice.
    #[test]
    fn test_root_help_renders_env_footer_once() {
        let doc = RestDescription {
            name: "channel3".into(),
            ..Default::default()
        };
        let cli = crate::openapi::commands::build_cli(&doc);
        let cli = CliApp::new("channel3").decorate_command(&doc, cli);

        let after_help = cli.get_after_help().expect("footer").to_string();
        assert_eq!(
            after_help.matches("Environment variables:").count(),
            1,
            "env-var footer should appear once, got:\n{after_help}",
        );
    }

    #[test]
    fn test_app_context_spec_accessor() {
        let doc = RestDescription {
            name: "test".to_string(),
            ..Default::default()
        };
        let ctx = AppContext::new(
            doc,
            crate::auth::no_auth_provider(),
            crate::http::HttpConfig::new("test").unwrap(),
            Vec::new(),
            Vec::new(),
        );
        assert_eq!(ctx.spec().name, "test");
    }

    #[test]
    fn test_find_method_across_entries() {
        use std::collections::HashMap;

        let mut res_a = HashMap::new();
        let mut methods_a = HashMap::new();
        methods_a.insert("upload".to_string(), RestMethod {
            id: Some("files.upload".to_string()),
            ..Default::default()
        });
        res_a.insert("files".to_string(), RestResource {
            methods: methods_a,
            ..Default::default()
        });

        let mut res_b = HashMap::new();
        let mut methods_b = HashMap::new();
        methods_b.insert("list".to_string(), RestMethod {
            id: Some("users.list".to_string()),
            ..Default::default()
        });
        res_b.insert("users".to_string(), RestResource {
            methods: methods_b,
            ..Default::default()
        });

        let doc_a = RestDescription {
            name: "spec-a".to_string(),
            resources: res_a,
            ..Default::default()
        };
        let doc_b = RestDescription {
            name: "spec-b".to_string(),
            resources: res_b,
            ..Default::default()
        };

        let mut ctx = AppContext::new(
            doc_a,
            crate::auth::no_auth_provider(),
            crate::http::HttpConfig::new("test").unwrap(),
            Vec::new(),
            Vec::new(),
        );
        ctx.add_entry(BindingEntry {
            doc: doc_b,
            auth_provider: crate::auth::no_auth_provider(),
            http_config: crate::http::HttpConfig::new("test").unwrap(),
            global_headers: Vec::new(),
            global_params: Vec::new(),
        });

        // find_method should find methods from either entry.
        let m1 = ctx.find_method("files", "upload").expect("should find files.upload");
        assert_eq!(m1.id.as_deref(), Some("files.upload"));

        let m2 = ctx.find_method("users", "list").expect("should find users.list");
        assert_eq!(m2.id.as_deref(), Some("users.list"));

        // entry_for_method routes to the correct entry.
        let entry1 = ctx.entry_for_method(m1);
        assert_eq!(entry1.doc.name, "spec-a");

        let entry2 = ctx.entry_for_method(m2);
        assert_eq!(entry2.doc.name, "spec-b");

        // Missing method returns error.
        assert!(ctx.find_method("orders", "get").is_err());

        // specs() returns both.
        assert_eq!(ctx.specs().len(), 2);
    }

    #[test]
    fn test_collect_params_individual_flags() {
        let mut params = std::collections::HashMap::new();
        params.insert(
            "uuid".to_string(),
            crate::openapi::discovery::MethodParameter {
                param_type: Some("string".to_string()),
                location: Some("path".to_string()),
                required: true,
                ..Default::default()
            },
        );

        let method = crate::openapi::discovery::RestMethod {
            parameters: params,
            ..Default::default()
        };

        let cmd = clap::Command::new("test")
            .arg(clap::Arg::new("uuid").long("uuid"))
            .arg(clap::Arg::new("params").long("params"));

        let matches = cmd.get_matches_from(vec!["test", "--uuid", "abc-123"]);
        let result = collect_params_from_flags(&matches, &method, None).unwrap();
        assert_eq!(result.get("uuid").unwrap().as_str().unwrap(), "abc-123");
    }

    /// Method with one `const`-style body field carrying a clap default, plus a
    /// plain body field — the shape that made `--json` unusable.
    fn method_with_defaulted_body_field() -> crate::openapi::discovery::RestMethod {
        let mut params = std::collections::HashMap::new();
        params.insert(
            "type".to_string(),
            crate::openapi::discovery::MethodParameter {
                param_type: Some("string".to_string()),
                location: Some("body".to_string()),
                ..Default::default()
            },
        );
        params.insert(
            "name".to_string(),
            crate::openapi::discovery::MethodParameter {
                param_type: Some("string".to_string()),
                location: Some("body".to_string()),
                ..Default::default()
            },
        );
        crate::openapi::discovery::RestMethod {
            parameters: params,
            ..Default::default()
        }
    }

    fn command_with_defaulted_type() -> clap::Command {
        clap::Command::new("test")
            .arg(clap::Arg::new("type").long("type").default_value("new"))
            .arg(clap::Arg::new("name").long("name"))
            .arg(clap::Arg::new("json").long("json"))
            .arg(clap::Arg::new("params").long("params"))
    }

    #[test]
    fn test_defaulted_body_field_is_dropped_when_json_is_supplied() {
        // The bug: `--type` carries a clap default (from a `const` field), so it
        // was collected on every invocation and the executor rejected `--json`
        // with "Cannot combine --json with per-field body flags (--type)" — for a
        // flag the user never typed, and could not avoid.
        let method = method_with_defaulted_body_field();
        let matches = command_with_defaulted_type()
            .get_matches_from(vec!["test", "--json", r#"{"type":"new","name":"n"}"#]);
        let result = collect_params_from_flags(&matches, &method, None).unwrap();
        assert!(
            !result.contains_key("type"),
            "a default-sourced body field must not look like a per-field flag under --json, got: {result:?}"
        );
        assert!(result.is_empty(), "no body params should be collected, got: {result:?}");
    }

    #[test]
    fn test_defaulted_body_field_still_applies_without_json() {
        // Without `--json` the default must still reach the body, or `const`
        // fields would stop being sent on the flag-driven path.
        let method = method_with_defaulted_body_field();
        let matches = command_with_defaulted_type().get_matches_from(vec!["test", "--name", "n"]);
        let result = collect_params_from_flags(&matches, &method, None).unwrap();
        assert_eq!(result.get("type").unwrap().as_str().unwrap(), "new");
        assert_eq!(result.get("name").unwrap().as_str().unwrap(), "n");
    }

    #[test]
    fn test_defaulted_leaf_is_dropped_when_ancestor_object_flag_is_typed() {
        // A `const` leaf under a nested object (`platform_settings.guardrails
        // .version`) used to be materialized from its clap default even when
        // the user typed the parent's object-shorthand flag, and the executor
        // then refused the combination — making `--platform-settings
        // .guardrails` unusable on any const-bearing nested schema.
        let mut params = std::collections::HashMap::new();
        for key in [
            "platform_settings.guardrails",
            "platform_settings.guardrails.version",
        ] {
            params.insert(
                key.to_string(),
                crate::openapi::discovery::MethodParameter {
                    param_type: Some("string".to_string()),
                    location: Some("body".to_string()),
                    ..Default::default()
                },
            );
        }
        let method = crate::openapi::discovery::RestMethod {
            parameters: params,
            ..Default::default()
        };
        let matches = clap::Command::new("test")
            .arg(
                clap::Arg::new("platform_settings.guardrails").long("platform-settings.guardrails"),
            )
            .arg(
                clap::Arg::new("platform_settings.guardrails.version")
                    .long("platform-settings.guardrails.version")
                    .default_value("1"),
            )
            .arg(clap::Arg::new("json").long("json"))
            .arg(clap::Arg::new("params").long("params"))
            .get_matches_from(vec![
                "test",
                "--platform-settings.guardrails",
                r#"{"enabled":true}"#,
            ]);
        let result = collect_params_from_flags(&matches, &method, None).unwrap();
        assert!(
            !result.contains_key("platform_settings.guardrails.version"),
            "a defaulted leaf must stand down under a typed ancestor flag, got: {result:?}",
        );
    }

    /// Multipart method with one repeatable (array) file field, one plain
    /// text field, and one repeatable text field.
    fn multipart_method() -> crate::openapi::discovery::RestMethod {
        use crate::openapi::discovery::MultipartField;
        crate::openapi::discovery::RestMethod {
            multipart_fields: vec![
                MultipartField {
                    wire_name: "files".to_string(),
                    is_file: true,
                    description: None,
                    required: false,
                    content_type: None,
                    repeated: true,
                },
                MultipartField {
                    wire_name: "name".to_string(),
                    is_file: false,
                    description: None,
                    required: false,
                    content_type: None,
                    repeated: false,
                },
                MultipartField {
                    wire_name: "tags".to_string(),
                    is_file: false,
                    description: None,
                    required: false,
                    content_type: None,
                    repeated: true,
                },
            ],
            ..Default::default()
        }
    }

    fn multipart_command() -> clap::Command {
        clap::Command::new("test")
            .arg(
                clap::Arg::new("files")
                    .long("files")
                    .action(clap::ArgAction::Append),
            )
            .arg(clap::Arg::new("name").long("name"))
            .arg(
                clap::Arg::new("tags")
                    .long("tags")
                    .action(clap::ArgAction::Append),
            )
    }

    #[test]
    fn test_multipart_array_field_emits_one_part_per_occurrence() {
        // The bug: an array-typed multipart field was a single-value flag, so
        // multi-sample uploads (`--files a --files b`) were rejected outright
        // and no alternative input path existed.
        let method = multipart_method();
        let matches = multipart_command().get_matches_from(vec![
            "test", "--name", "V", "--files", "a.mp3", "--files", "b.mp3",
        ]);
        let mut params = serde_json::Map::new();
        let parts = collect_multipart_parts(&method, &matches, &mut params)
            .unwrap()
            .expect("multipart parts");
        let files: Vec<&str> = parts
            .iter()
            .filter_map(|p| match p {
                executor::MultipartPart::File { name, path, .. } if name == "files" => {
                    Some(path.as_str())
                }
                _ => None,
            })
            .collect();
        assert_eq!(files, vec!["a.mp3", "b.mp3"]);
        assert!(parts.iter().any(|p| matches!(
            p,
            executor::MultipartPart::Text { name, value, .. } if name == "name" && value == "V"
        )));
    }

    #[test]
    fn test_multipart_fields_are_moved_out_of_params() {
        // Multipart fields live in `multipart_fields`, not `parameters`, so a
        // `--params` key naming one had no `location: body` to route on and
        // was appended to the query string instead of the form body.
        let method = multipart_method();
        let matches = multipart_command().get_matches_from(vec!["test"]);
        let mut params = serde_json::Map::new();
        params.insert("tags".to_string(), serde_json::json!(["a", "b"]));
        params.insert("unrelated".to_string(), serde_json::json!("keep"));
        let parts = collect_multipart_parts(&method, &matches, &mut params)
            .unwrap()
            .expect("multipart parts");
        let tags: Vec<&str> = parts
            .iter()
            .filter_map(|p| match p {
                executor::MultipartPart::Text { name, value, .. } if name == "tags" => {
                    Some(value.as_str())
                }
                _ => None,
            })
            .collect();
        assert_eq!(tags, vec!["a", "b"]);
        assert!(!params.contains_key("tags"), "left in params: {params:?}");
        assert!(params.contains_key("unrelated"), "dropped: {params:?}");
    }

    #[test]
    fn test_explicit_body_flag_still_conflicts_with_json() {
        // A per-field flag the user actually typed must still be collected, so
        // the executor's mutual-exclusion check fires as intended.
        let method = method_with_defaulted_body_field();
        let matches = command_with_defaulted_type().get_matches_from(vec![
            "test",
            "--type",
            "new",
            "--json",
            r#"{"name":"n"}"#,
        ]);
        let result = collect_params_from_flags(&matches, &method, None).unwrap();
        assert_eq!(
            result.get("type").unwrap().as_str().unwrap(),
            "new",
            "an explicitly-typed body flag must still conflict with --json"
        );
    }

    #[test]
    fn test_json_does_not_drop_defaulted_non_body_params() {
        // The exemption is scoped to body params: a defaulted query/path/header
        // value is not a "per-field body flag" and must survive `--json`.
        let mut params = std::collections::HashMap::new();
        params.insert(
            "page_size".to_string(),
            crate::openapi::discovery::MethodParameter {
                param_type: Some("string".to_string()),
                location: Some("query".to_string()),
                ..Default::default()
            },
        );
        let method = crate::openapi::discovery::RestMethod {
            parameters: params,
            ..Default::default()
        };
        let cmd = clap::Command::new("test")
            .arg(clap::Arg::new("page_size").long("page-size").default_value("25"))
            .arg(clap::Arg::new("json").long("json"))
            .arg(clap::Arg::new("params").long("params"));
        let matches = cmd.get_matches_from(vec!["test", "--json", r#"{"a":1}"#]);
        let result = collect_params_from_flags(&matches, &method, None).unwrap();
        assert_eq!(
            result.get("page_size").unwrap().as_str().unwrap(),
            "25",
            "a defaulted query param must still be sent alongside --json"
        );
    }

    #[test]
    fn test_collect_params_override_wins() {
        let mut params = std::collections::HashMap::new();
        params.insert(
            "uuid".to_string(),
            crate::openapi::discovery::MethodParameter::default(),
        );

        let method = crate::openapi::discovery::RestMethod {
            parameters: params,
            ..Default::default()
        };

        let cmd = clap::Command::new("test")
            .arg(clap::Arg::new("uuid").long("uuid"))
            .arg(clap::Arg::new("params").long("params"));

        let matches = cmd.get_matches_from(vec![
            "test",
            "--uuid",
            "from-flag",
            "--params",
            r#"{"uuid":"from-json"}"#,
        ]);
        let override_str = matches.get_one::<String>("params").map(|s| s.as_str());
        let result = collect_params_from_flags(&matches, &method, override_str).unwrap();
        assert_eq!(result.get("uuid").unwrap().as_str().unwrap(), "from-json");
    }

    #[test]
    fn test_collect_params_null_sentinel_on_nullable_param() {
        // `--user-id null` on a nullable scalar body param must produce
        // serde_json::Value::Null, not Value::String("null").
        let mut params = std::collections::HashMap::new();
        params.insert(
            "userId".to_string(),
            crate::openapi::discovery::MethodParameter {
                param_type: Some("string".to_string()),
                location: Some("body".to_string()),
                nullable: true,
                ..Default::default()
            },
        );
        let method = crate::openapi::discovery::RestMethod {
            parameters: params,
            ..Default::default()
        };
        let cmd = clap::Command::new("test")
            .arg(clap::Arg::new("userId").long("user-id"))
            .arg(clap::Arg::new("params").long("params"));
        let matches = cmd.get_matches_from(vec!["test", "--user-id", "null"]);
        let result = collect_params_from_flags(&matches, &method, None).unwrap();
        assert_eq!(result.get("userId"), Some(&serde_json::Value::Null));
    }

    #[test]
    fn test_collect_params_null_string_on_non_nullable_param_unchanged() {
        // `--field null` on a non-nullable string param keeps current
        // behavior: passes the four-character string through unchanged.
        let mut params = std::collections::HashMap::new();
        params.insert(
            "code".to_string(),
            crate::openapi::discovery::MethodParameter {
                param_type: Some("string".to_string()),
                location: Some("body".to_string()),
                nullable: false,
                ..Default::default()
            },
        );
        let method = crate::openapi::discovery::RestMethod {
            parameters: params,
            ..Default::default()
        };
        let cmd = clap::Command::new("test")
            .arg(clap::Arg::new("code").long("code"))
            .arg(clap::Arg::new("params").long("params"));
        let matches = cmd.get_matches_from(vec!["test", "--code", "null"]);
        let result = collect_params_from_flags(&matches, &method, None).unwrap();
        assert_eq!(
            result.get("code").and_then(|v| v.as_str()),
            Some("null"),
            "literal 'null' must pass through unchanged on non-nullable fields",
        );
    }

    #[test]
    fn test_collect_params_array_typed_param_parsed_from_json() {
        // An array-typed param (e.g. a simple/array path param) carries a
        // JSON-array string on the CLI; it must be parsed into a
        // `Value::Array` so the path serializer can comma-join the elements
        // instead of sending the verbatim `["a","b"]` string.
        let mut params = std::collections::HashMap::new();
        params.insert(
            "ids".to_string(),
            crate::openapi::discovery::MethodParameter {
                param_type: Some("array".to_string()),
                location: Some("path".to_string()),
                ..Default::default()
            },
        );
        let method = crate::openapi::discovery::RestMethod {
            parameters: params,
            ..Default::default()
        };
        let cmd = clap::Command::new("test")
            .arg(clap::Arg::new("ids").long("ids"))
            .arg(clap::Arg::new("params").long("params"));
        let matches = cmd.get_matches_from(vec!["test", "--ids", r#"["a","b"]"#]);
        let result = collect_params_from_flags(&matches, &method, None).unwrap();
        assert_eq!(
            result.get("ids"),
            Some(&serde_json::json!(["a", "b"])),
            "array-typed param must be JSON-parsed into a Value::Array",
        );
    }

    #[test]
    fn test_collect_params_array_typed_param_invalid_json_falls_back_to_string() {
        // Malformed JSON for an array-typed param keeps the verbatim string
        // (no behavior change / no hard error for non-JSON input).
        let mut params = std::collections::HashMap::new();
        params.insert(
            "ids".to_string(),
            crate::openapi::discovery::MethodParameter {
                param_type: Some("array".to_string()),
                location: Some("path".to_string()),
                ..Default::default()
            },
        );
        let method = crate::openapi::discovery::RestMethod {
            parameters: params,
            ..Default::default()
        };
        let cmd = clap::Command::new("test")
            .arg(clap::Arg::new("ids").long("ids"))
            .arg(clap::Arg::new("params").long("params"));
        let matches = cmd.get_matches_from(vec!["test", "--ids", "not-json"]);
        let result = collect_params_from_flags(&matches, &method, None).unwrap();
        assert_eq!(
            result.get("ids").and_then(|v| v.as_str()),
            Some("not-json"),
        );
    }

    #[test]
    fn test_collect_params_repeated_param_json_array_value_flattened() {
        // A repeated string flag (array body props and string|array<string>
        // unions both lower to this shape) carrying a JSON-array literal must
        // be parsed and its elements spliced in — not wrapped verbatim as a
        // single array element.
        let mut params = std::collections::HashMap::new();
        params.insert(
            "to".to_string(),
            crate::openapi::discovery::MethodParameter {
                param_type: Some("string".to_string()),
                location: Some("body".to_string()),
                repeated: true,
                ..Default::default()
            },
        );
        let method = crate::openapi::discovery::RestMethod {
            parameters: params,
            ..Default::default()
        };
        let cmd = clap::Command::new("test")
            .arg(
                clap::Arg::new("to")
                    .long("to")
                    .action(clap::ArgAction::Append),
            )
            .arg(clap::Arg::new("params").long("params"));
        let matches =
            cmd.get_matches_from(vec!["test", "--to", r#"["a@example.com","b@example.com"]"#]);
        let result = collect_params_from_flags(&matches, &method, None).unwrap();
        assert_eq!(
            result.get("to"),
            Some(&serde_json::json!(["a@example.com", "b@example.com"])),
            "JSON-array value on a repeated flag must be parsed, not passed verbatim",
        );
    }

    #[test]
    fn test_collect_params_repeated_param_mixed_json_array_and_literal() {
        // Occurrences can mix: a JSON-array literal flattens in place while
        // plain values stay literal strings.
        let mut params = std::collections::HashMap::new();
        params.insert(
            "to".to_string(),
            crate::openapi::discovery::MethodParameter {
                param_type: Some("string".to_string()),
                location: Some("body".to_string()),
                repeated: true,
                ..Default::default()
            },
        );
        let method = crate::openapi::discovery::RestMethod {
            parameters: params,
            ..Default::default()
        };
        let cmd = clap::Command::new("test")
            .arg(
                clap::Arg::new("to")
                    .long("to")
                    .action(clap::ArgAction::Append),
            )
            .arg(clap::Arg::new("params").long("params"));
        let matches = cmd.get_matches_from(vec![
            "test",
            "--to",
            r#"["a@example.com"]"#,
            "--to",
            "b@example.com",
        ]);
        let result = collect_params_from_flags(&matches, &method, None).unwrap();
        assert_eq!(
            result.get("to"),
            Some(&serde_json::json!(["a@example.com", "b@example.com"])),
        );
    }

    #[test]
    fn test_collect_params_repeated_param_non_array_json_stays_literal() {
        // Values that parse as non-array JSON ("123", "null", "{}") keep the
        // old literal-string behavior — only arrays flatten.
        let mut params = std::collections::HashMap::new();
        params.insert(
            "tags".to_string(),
            crate::openapi::discovery::MethodParameter {
                param_type: Some("string".to_string()),
                location: Some("body".to_string()),
                repeated: true,
                ..Default::default()
            },
        );
        let method = crate::openapi::discovery::RestMethod {
            parameters: params,
            ..Default::default()
        };
        let cmd = clap::Command::new("test")
            .arg(
                clap::Arg::new("tags")
                    .long("tags")
                    .action(clap::ArgAction::Append),
            )
            .arg(clap::Arg::new("params").long("params"));
        let matches =
            cmd.get_matches_from(vec!["test", "--tags", "123", "--tags", "null", "--tags", "{}"]);
        let result = collect_params_from_flags(&matches, &method, None).unwrap();
        assert_eq!(
            result.get("tags"),
            Some(&serde_json::json!(["123", "null", "{}"])),
            "non-array values must stay literal strings",
        );
    }

    #[test]
    fn test_collect_params_scalar_or_array_single_value_stays_scalar() {
        // For oneOf [string, array<string>] unions, a single value should be
        // sent as a plain string, not wrapped in a length-1 array.
        let mut params = std::collections::HashMap::new();
        params.insert(
            "to".to_string(),
            crate::openapi::discovery::MethodParameter {
                param_type: Some("string".to_string()),
                location: Some("body".to_string()),
                repeated: true,
                scalar_or_array: true,
                ..Default::default()
            },
        );
        let method = crate::openapi::discovery::RestMethod {
            parameters: params,
            ..Default::default()
        };
        let cmd = clap::Command::new("test")
            .arg(
                clap::Arg::new("to")
                    .long("to")
                    .action(clap::ArgAction::Append),
            )
            .arg(clap::Arg::new("params").long("params"));
        let matches = cmd.get_matches_from(vec!["test", "--to", "a@example.com"]);
        let result = collect_params_from_flags(&matches, &method, None).unwrap();
        assert_eq!(
            result.get("to"),
            Some(&serde_json::json!("a@example.com")),
            "single value on scalar_or_array param must be a plain string",
        );
    }

    #[test]
    fn test_collect_params_scalar_or_array_multiple_values_become_array() {
        // Multiple values on a scalar_or_array param should produce an array.
        let mut params = std::collections::HashMap::new();
        params.insert(
            "to".to_string(),
            crate::openapi::discovery::MethodParameter {
                param_type: Some("string".to_string()),
                location: Some("body".to_string()),
                repeated: true,
                scalar_or_array: true,
                ..Default::default()
            },
        );
        let method = crate::openapi::discovery::RestMethod {
            parameters: params,
            ..Default::default()
        };
        let cmd = clap::Command::new("test")
            .arg(
                clap::Arg::new("to")
                    .long("to")
                    .action(clap::ArgAction::Append),
            )
            .arg(clap::Arg::new("params").long("params"));
        let matches = cmd.get_matches_from(vec![
            "test", "--to", "a@example.com", "--to", "b@example.com",
        ]);
        let result = collect_params_from_flags(&matches, &method, None).unwrap();
        assert_eq!(
            result.get("to"),
            Some(&serde_json::json!(["a@example.com", "b@example.com"])),
        );
    }

    #[test]
    fn test_collect_params_scalar_or_array_json_array_stays_array() {
        // A JSON-array literal on a scalar_or_array param with >1 element
        // produces an array.
        let mut params = std::collections::HashMap::new();
        params.insert(
            "to".to_string(),
            crate::openapi::discovery::MethodParameter {
                param_type: Some("string".to_string()),
                location: Some("body".to_string()),
                repeated: true,
                scalar_or_array: true,
                ..Default::default()
            },
        );
        let method = crate::openapi::discovery::RestMethod {
            parameters: params,
            ..Default::default()
        };
        let cmd = clap::Command::new("test")
            .arg(
                clap::Arg::new("to")
                    .long("to")
                    .action(clap::ArgAction::Append),
            )
            .arg(clap::Arg::new("params").long("params"));
        let matches = cmd.get_matches_from(vec![
            "test", "--to", r#"["a@example.com","b@example.com"]"#,
        ]);
        let result = collect_params_from_flags(&matches, &method, None).unwrap();
        assert_eq!(
            result.get("to"),
            Some(&serde_json::json!(["a@example.com", "b@example.com"])),
        );
    }

    #[test]
    fn test_collect_params_null_sentinel_does_not_apply_to_defaults() {
        // When clap injects an `x-fern-default` value that happens to be the
        // string "null", we must NOT convert it to Value::Null — the user
        // didn't ask for null, the default did. The value_source check is
        // load-bearing here.
        let mut params = std::collections::HashMap::new();
        params.insert(
            "userId".to_string(),
            crate::openapi::discovery::MethodParameter {
                param_type: Some("string".to_string()),
                location: Some("body".to_string()),
                nullable: true,
                default_value: Some(serde_json::Value::String("fallback".into())),
                ..Default::default()
            },
        );
        let method = crate::openapi::discovery::RestMethod {
            parameters: params,
            ..Default::default()
        };
        let cmd = clap::Command::new("test")
            .arg(
                clap::Arg::new("userId")
                    .long("user-id")
                    .default_value("fallback"),
            )
            .arg(clap::Arg::new("params").long("params"));
        // Omit the flag → clap fills "fallback" from default.
        let matches = cmd.get_matches_from(vec!["test"]);
        let result = collect_params_from_flags(&matches, &method, None).unwrap();
        // The typed default flows through, NOT a JSON null.
        assert_eq!(
            result.get("userId"),
            Some(&serde_json::Value::String("fallback".into())),
        );
    }

    #[test]
    fn test_collect_params_empty_when_no_flags() {
        let method = crate::openapi::discovery::RestMethod::default();
        let cmd = clap::Command::new("test").arg(clap::Arg::new("params").long("params"));
        let matches = cmd.get_matches_from(vec!["test"]);
        let result = collect_params_from_flags(&matches, &method, None).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_collect_params_array_value_parsed_from_json() {
        // An `array`-typed param carrying a JSON array string is parsed
        // into a Value::Array so the style-aware serializer can explode /
        // join it. Previously only `object` params were parsed.
        let mut params = std::collections::HashMap::new();
        params.insert(
            "tag".to_string(),
            crate::openapi::discovery::MethodParameter {
                param_type: Some("array".to_string()),
                location: Some("query".to_string()),
                ..Default::default()
            },
        );
        let method = crate::openapi::discovery::RestMethod {
            parameters: params,
            ..Default::default()
        };
        let cmd = clap::Command::new("test")
            .arg(clap::Arg::new("tag").long("tag"))
            .arg(clap::Arg::new("params").long("params"));
        let matches = cmd.get_matches_from(vec!["test", "--tag", r#"["a","b"]"#]);
        let result = collect_params_from_flags(&matches, &method, None).unwrap();
        assert_eq!(result.get("tag"), Some(&serde_json::json!(["a", "b"])));
    }

    #[test]
    fn test_collect_params_array_invalid_json_falls_back_to_string() {
        // Non-JSON input for an `array` param degrades to the raw string
        // rather than erroring, mirroring the object branch.
        let mut params = std::collections::HashMap::new();
        params.insert(
            "tag".to_string(),
            crate::openapi::discovery::MethodParameter {
                param_type: Some("array".to_string()),
                location: Some("query".to_string()),
                ..Default::default()
            },
        );
        let method = crate::openapi::discovery::RestMethod {
            parameters: params,
            ..Default::default()
        };
        let cmd = clap::Command::new("test")
            .arg(clap::Arg::new("tag").long("tag"))
            .arg(clap::Arg::new("params").long("params"));
        let matches = cmd.get_matches_from(vec!["test", "--tag", "not-json"]);
        let result = collect_params_from_flags(&matches, &method, None).unwrap();
        assert_eq!(
            result.get("tag").and_then(|v| v.as_str()),
            Some("not-json"),
        );
    }

    // ------------------------------------------------------------------
    // CliApp::idempotency_header_env — generator-side env-var wiring for
    // FER-9852, implemented in cli-sdk for FER-9864 P1. Verifies the
    // builder overlays env vars on every idempotent operation's
    // synthetic header MethodParameter (and skips non-idempotent
    // siblings).
    // ------------------------------------------------------------------

    const IDEMPOTENCY_SPEC: &str = r#"
openapi: 3.0.2
info:
  title: Idempotency Builder Test
  version: "1.0"
servers:
  - url: https://api.example.com
x-fern-idempotency-headers:
  - header: Idempotency-Key
    name: idempotency_key
paths:
  /payments:
    get:
      x-fern-sdk-group-name: [payments]
      x-fern-sdk-method-name: list
      operationId: payments_list
      responses:
        "200":
          description: ok
    post:
      x-fern-sdk-group-name: [payments]
      x-fern-sdk-method-name: create
      operationId: payments_create
      x-fern-idempotent: true
      responses:
        "201":
          description: ok
"#;

    #[test]
    fn test_idempotency_header_env_matches_by_name() {
        // Generator wires env var by `name` field (kebab/snake form,
        // not the wire header). Should land on the idempotent op's
        // synthetic param.
        let doc = CliApp::new("test")
            .spec(IDEMPOTENCY_SPEC)
            .idempotency_header_env("idempotency_key", "API_IDEMPOTENCY_KEY")
            .build_doc()
            .unwrap();
        let create = &doc.resources["payments"].methods["create"];
        let p = create.parameters.get("Idempotency-Key").unwrap();
        assert_eq!(p.env_var.as_deref(), Some("API_IDEMPOTENCY_KEY"));
    }

    #[test]
    fn test_idempotency_header_env_matches_by_header() {
        // Falls back to the wire header name when `name` isn't matched.
        let doc = CliApp::new("test")
            .spec(IDEMPOTENCY_SPEC)
            .idempotency_header_env("Idempotency-Key", "API_IDEMPOTENCY_KEY")
            .build_doc()
            .unwrap();
        let create = &doc.resources["payments"].methods["create"];
        let p = create.parameters.get("Idempotency-Key").unwrap();
        assert_eq!(p.env_var.as_deref(), Some("API_IDEMPOTENCY_KEY"));
    }

    #[test]
    fn test_idempotency_header_env_skips_non_idempotent_ops() {
        let doc = CliApp::new("test")
            .spec(IDEMPOTENCY_SPEC)
            .idempotency_header_env("idempotency_key", "API_IDEMPOTENCY_KEY")
            .build_doc()
            .unwrap();
        let list = &doc.resources["payments"].methods["list"];
        assert!(!list.idempotent);
        assert!(
            !list.parameters.contains_key("Idempotency-Key"),
            "non-idempotent op must have no idempotency-header param at all",
        );
    }

    fn pagination_cmd() -> clap::Command {
        clap::Command::new("test")
            .arg(
                clap::Arg::new("page-all")
                    .long("page-all")
                    .action(clap::ArgAction::SetTrue),
            )
            .arg(
                clap::Arg::new("page-limit")
                    .long("page-limit")
                    .value_parser(clap::value_parser!(u32)),
            )
            .arg(
                clap::Arg::new("page-delay")
                    .long("page-delay")
                    .value_parser(clap::value_parser!(u64)),
            )
            .arg(
                clap::Arg::new("no-pager")
                    .long("no-pager")
                    .action(clap::ArgAction::SetTrue),
            )
    }

    #[test]
    fn test_build_pagination_config_defaults() {
        let doc = RestDescription::default();
        let matches = pagination_cmd().get_matches_from(vec!["test"]);
        let config = build_pagination_config(&matches, &doc, "test");
        assert!(!config.page_all);
        assert_eq!(config.page_limit, 10);
        assert_eq!(config.page_delay_ms, 100);
        assert_eq!(config.token_query_param, "pageToken");
        assert_eq!(config.token_response_path, "nextPageToken");
    }

    #[test]
    fn test_build_pagination_config_uses_doc_token_names() {
        let doc = RestDescription {
            pagination_token_query_param: Some("cursor".to_string()),
            pagination_token_response_path: Some("meta.next_cursor".to_string()),
            ..Default::default()
        };
        let matches = pagination_cmd().get_matches_from(vec!["test"]);
        let config = build_pagination_config(&matches, &doc, "test");
        assert_eq!(config.token_query_param, "cursor");
        assert_eq!(config.token_response_path, "meta.next_cursor");
    }

    #[test]
    fn test_resolve_method_resource_not_found() {
        let doc = RestDescription::default();
        let cmd =
            clap::Command::new("cli").subcommand(clap::Command::new("unknown"));
        let matches = cmd.get_matches_from(vec!["cli", "unknown"]);
        let err = resolve_method_from_matches(&doc, &matches).unwrap_err();
        assert!(err.to_string().contains("Resource 'unknown' not found"));
    }

    #[test]
    fn test_resolve_method_method_not_found() {
        let mut resources = std::collections::HashMap::new();
        resources.insert("files".to_string(), crate::openapi::discovery::RestResource::default());
        let doc = RestDescription { resources, ..Default::default() };

        let cmd = clap::Command::new("cli")
            .subcommand(clap::Command::new("files").subcommand(clap::Command::new("delete")));
        let matches = cmd.get_matches_from(vec!["cli", "files", "delete"]);
        let err = resolve_method_from_matches(&doc, &matches).unwrap_err();
        assert!(err.to_string().contains("Method 'delete' not found"));
    }

    #[test]
    fn test_resolve_method_sub_resource_not_found() {
        let mut resources = std::collections::HashMap::new();
        resources.insert("files".to_string(), crate::openapi::discovery::RestResource::default());
        let doc = RestDescription { resources, ..Default::default() };

        let cmd = clap::Command::new("cli").subcommand(
            clap::Command::new("files").subcommand(
                clap::Command::new("permissions").subcommand(clap::Command::new("list")),
            ),
        );
        let matches = cmd.get_matches_from(vec!["cli", "files", "permissions", "list"]);
        let err = resolve_method_from_matches(&doc, &matches).unwrap_err();
        assert!(err.to_string().contains("Sub-resource 'permissions' not found"));
    }

    #[test]
    fn test_collect_params_invalid_json_override() {
        let method = crate::openapi::discovery::RestMethod::default();
        let cmd = clap::Command::new("test").arg(clap::Arg::new("params").long("params"));
        let matches = cmd.get_matches_from(vec!["test"]);
        let err =
            collect_params_from_flags(&matches, &method, Some("{not valid json}")).unwrap_err();
        assert!(err.to_string().contains("Invalid --params JSON"));
    }

    #[test]
    fn test_multi_spec_flat_merge() {
        // Two specs with non-overlapping resources should merge
        let spec_a = r#"
openapi: "3.0.0"
info:
  title: "API A"
  version: "1.0"
tags:
  - name: users
    description: User operations.
servers:
  - url: "https://api-a.example.com"
paths:
  /users:
    get:
      x-fern-sdk-group-name: ["users"]
      x-fern-sdk-method-name: list
      responses:
        "200":
          description: ok
"#;
        let spec_b = r#"
openapi: "3.0.0"
info:
  title: "API B"
  version: "1.0"
tags:
  - name: orders
    description: Order operations.
servers:
  - url: "https://api-b.example.com"
paths:
  /orders:
    get:
      x-fern-sdk-group-name: ["orders"]
      x-fern-sdk-method-name: list
      responses:
        "200":
          description: ok
"#;
        let app = CliApp::new("test").spec(spec_a).spec(spec_b);
        let doc = app.build_doc().unwrap();
        assert!(doc.resources.contains_key("users"));
        assert!(doc.resources.contains_key("orders"));
        assert_eq!(
            doc.tag_descriptions.get("users").map(String::as_str),
            Some("User operations."),
        );
        assert_eq!(
            doc.tag_descriptions.get("orders").map(String::as_str),
            Some("Order operations."),
        );
    }

    #[test]
    fn test_multi_spec_tag_descriptions_first_write_wins() {
        let spec_a = r#"
openapi: "3.0.0"
info: { title: "API A", version: "1.0" }
tags:
  - name: shared
    description: First description.
paths:
  /users:
    get:
      x-fern-sdk-group-name: ["users"]
      x-fern-sdk-method-name: list
      responses: { "200": { description: ok } }
"#;
        let spec_b = r#"
openapi: "3.0.0"
info: { title: "API B", version: "1.0" }
tags:
  - name: shared
    description: Second description.
paths:
  /orders:
    get:
      x-fern-sdk-group-name: ["orders"]
      x-fern-sdk-method-name: list
      responses: { "200": { description: ok } }
"#;
        let doc = CliApp::new("test")
            .spec(spec_a)
            .spec(spec_b)
            .build_doc()
            .unwrap();
        assert_eq!(
            doc.tag_descriptions.get("shared").map(String::as_str),
            Some("First description."),
        );
    }

    #[test]
    fn test_multi_spec_collision_error() {
        let spec = r#"
openapi: "3.0.0"
info:
  title: "API"
  version: "1.0"
paths:
  /users:
    get:
      x-fern-sdk-group-name: ["users"]
      x-fern-sdk-method-name: list
      responses:
        "200":
          description: ok
"#;
        let app = CliApp::new("test").spec(spec).spec(spec);
        let result = app.build_doc();
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains("users"), "error should name the colliding key");
    }

    #[test]
    fn test_title_description_override() {
        let spec = r#"
openapi: "3.0.0"
info:
  title: "Original Title"
  description: "Original description"
  version: "1.0"
paths: {}
"#;
        let app = CliApp::new("test")
            .spec(spec)
            .title("My Custom Title")
            .description("My custom description");
        let doc = app.build_doc().unwrap();
        assert_eq!(doc.title.as_deref(), Some("My Custom Title"));
        assert_eq!(doc.description.as_deref(), Some("My custom description"));
    }

    #[test]
    fn test_spec_under_namespaces_resources() {
        let spec = r#"
openapi: "3.0.0"
info:
  title: "Billing API"
  version: "1.0"
servers:
  - url: "https://billing.example.com"
paths:
  /invoices:
    get:
      x-fern-sdk-group-name: ["invoices"]
      x-fern-sdk-method-name: list
      responses:
        "200":
          description: ok
"#;
        let app = CliApp::new("test").spec_under("billing", spec);
        let doc = app.build_doc().unwrap();
        assert!(doc.resources.contains_key("billing"));
        let billing = doc.resources.get("billing").unwrap();
        assert!(billing.resources.contains_key("invoices"));
    }

    #[test]
    fn test_security_schemes_merge_across_multi_spec() {
        // When two specs each declare `components.securitySchemes`, the
        // merged doc should contain the union. Without merging, the second
        // spec's schemes would silently disappear and the eventual
        // RoutingAuthProvider registry would be missing entries — operations
        // referencing those schemes would fall through to passthrough.
        let spec_a = r#"
openapi: "3.0.0"
info: { title: A, version: "1.0" }
servers: [{ url: "https://a.example.com" }]
components:
  securitySchemes:
    bearerAuth: { type: http, scheme: bearer }
paths:
  /alpha:
    get:
      x-fern-sdk-group-name: ["alpha"]
      x-fern-sdk-method-name: list
      responses: { "200": { description: ok } }
"#;
        let spec_b = r#"
openapi: "3.0.0"
info: { title: B, version: "1.0" }
servers: [{ url: "https://b.example.com" }]
components:
  securitySchemes:
    apiKey: { type: apiKey, in: header, name: X-Api-Key }
paths:
  /beta:
    get:
      x-fern-sdk-group-name: ["beta"]
      x-fern-sdk-method-name: list
      responses: { "200": { description: ok } }
"#;
        let doc = CliApp::new("multi").spec(spec_a).spec(spec_b).build_doc().unwrap();
        // Both schemes from both specs survive the merge.
        assert!(
            doc.security_schemes.contains_key("bearerAuth"),
            "spec A's scheme missing: {:?}",
            doc.security_schemes,
        );
        assert!(
            doc.security_schemes.contains_key("apiKey"),
            "spec B's scheme missing: {:?}",
            doc.security_schemes,
        );
    }

    #[test]
    fn test_merge_security_schemes_first_write_wins() {
        use crate::openapi::discovery::SecurityScheme;
        let mut acc = HashMap::new();
        acc.insert("bearerAuth".to_string(), SecurityScheme::HttpBearer);
        let mut incoming = HashMap::new();
        // Same name, different shape — first write wins, like merge_schemas.
        incoming.insert(
            "bearerAuth".to_string(),
            SecurityScheme::ApiKeyHeader {
                name: "X-Api-Key".to_string(),
            },
        );
        merge_security_schemes(&mut acc, incoming);
        assert_eq!(acc["bearerAuth"], SecurityScheme::HttpBearer);
    }

    #[test]
    fn test_merge_schemas_first_write_wins_on_duplicate() {
        // Multi-spec setups commonly share schema names (`ErrorResponse`,
        // `Pagination`). Strict-error policy made BigCommerce-style use
        // unworkable; first-write-wins lets specs share without manual
        // de-duplication.
        let mut acc = HashMap::new();
        acc.insert(
            "ErrorResponse".to_string(),
            crate::openapi::discovery::JsonSchema {
                description: Some("first".to_string()),
                ..Default::default()
            },
        );
        let mut incoming = HashMap::new();
        incoming.insert(
            "ErrorResponse".to_string(),
            crate::openapi::discovery::JsonSchema {
                description: Some("second".to_string()),
                ..Default::default()
            },
        );
        merge_schemas(&mut acc, incoming).expect("collision should not error");
        assert_eq!(
            acc["ErrorResponse"].description.as_deref(),
            Some("first"),
            "first write should win"
        );
    }

    #[test]
    fn test_specs_under_batch_helper() {
        // specs_under accepts an iterator of yamls and registers each under
        // the same prefix. Sanity check it actually wires through.
        let s1 = r#"
openapi: "3.0.0"
info: { title: A, version: "1.0" }
servers: [{ url: "https://x.com" }]
paths:
  /alpha:
    get:
      x-fern-sdk-group-name: ["alpha"]
      x-fern-sdk-method-name: list
      responses: { "200": { description: ok } }
"#;
        let s2 = r#"
openapi: "3.0.0"
info: { title: B, version: "1.0" }
servers: [{ url: "https://x.com" }]
paths:
  /beta:
    get:
      x-fern-sdk-group-name: ["beta"]
      x-fern-sdk-method-name: list
      responses: { "200": { description: ok } }
"#;
        let app = CliApp::new("t").specs_under("ns", [s1, s2]);
        let doc = app.build_doc().unwrap();
        let ns = &doc.resources["ns"];
        assert!(ns.resources.contains_key("alpha"));
        assert!(ns.resources.contains_key("beta"));
    }

    #[test]
    fn test_spec_under_accepts_slash_delimited_path() {
        // Slash splits into nested namespaces equivalent to specs_under_named.
        let spec = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://x.com" }]
paths:
  /widgets:
    get:
      x-fern-sdk-group-name: ["widgets"]
      x-fern-sdk-method-name: list
      responses: { "200": { description: ok } }
"#;
        let doc = CliApp::new("t")
            .spec_under("v3/products", spec)
            .build_doc()
            .unwrap();
        let v3 = doc.resources.get("v3").expect("v3 namespace");
        let products = v3.resources.get("products").expect("nested products");
        assert!(products.resources.contains_key("widgets"));
    }

    #[test]
    fn test_spec_under_merges_multiple_specs_into_same_prefix() {
        // Two specs sharing a prefix should merge under it (not error).
        // Prevents BigCommerce-style use cases where many v2 specs all need
        // to live under a single `v2` namespace.
        let spec_a = r#"
openapi: "3.0.0"
info: { title: "A", version: "1.0" }
servers: [{ url: "https://a.example.com" }]
paths:
  /alpha:
    get:
      x-fern-sdk-group-name: ["alpha"]
      x-fern-sdk-method-name: list
      responses: { "200": { description: ok } }
"#;
        let spec_b = r#"
openapi: "3.0.0"
info: { title: "B", version: "1.0" }
servers: [{ url: "https://b.example.com" }]
paths:
  /beta:
    get:
      x-fern-sdk-group-name: ["beta"]
      x-fern-sdk-method-name: list
      responses: { "200": { description: ok } }
"#;
        let app = CliApp::new("test")
            .spec_under("v2", spec_a)
            .spec_under("v2", spec_b);
        let doc = app.build_doc().unwrap();
        let v2 = doc.resources.get("v2").expect("v2 prefix should exist");
        assert!(v2.resources.contains_key("alpha"));
        assert!(v2.resources.contains_key("beta"));
    }

    #[test]
    fn test_spec_under_collides_on_inner_resource() {
        // Two specs with the same inner resource under the same prefix collide.
        let spec = r#"
openapi: "3.0.0"
info: { title: "T", version: "1.0" }
servers: [{ url: "https://x.example.com" }]
paths:
  /things:
    get:
      x-fern-sdk-group-name: ["things"]
      x-fern-sdk-method-name: list
      responses: { "200": { description: ok } }
"#;
        let err = CliApp::new("test")
            .spec_under("v2", spec)
            .spec_under("v2", spec)
            .build_doc()
            .expect_err("inner-key collision should error");
        assert!(err.to_string().contains("things"), "error: {err}");
    }

    #[test]
    fn test_spec_under_hoists_matching_top_level_resource() {
        // When the namespace name matches a top-level resource in the spec,
        // hoist that resource's methods into the namespace itself — so users
        // type `customers get` instead of `customers customers get`.
        let spec = r#"
openapi: "3.0.0"
info: { title: "T", version: "1.0" }
servers: [{ url: "https://api.example.com" }]
paths:
  /customers:
    get:
      tags: [Customers]
      operationId: getCustomers
      responses: { "200": { description: ok } }
  /customers/{id}/addresses:
    get:
      tags: [Addresses]
      operationId: getAddresses
      responses: { "200": { description: ok } }
"#;
        let app = CliApp::new("t").spec_under("customers", spec);
        let doc = app.build_doc().unwrap();
        let customers = doc.resources.get("customers").expect("namespace exists");
        // Methods from the spec's `customers` resource hoisted into namespace.
        assert!(customers.methods.contains_key("get-customers"));
        // Sibling top-level resources (`addresses`) become children of the namespace.
        assert!(customers.resources.contains_key("addresses"));
        // No double-nested `customers.customers` from the hoist.
        assert!(!customers.resources.contains_key("customers"));
    }

    #[test]
    fn test_specs_under_named_creates_nested_namespaces() {
        let spec_a = r#"
openapi: "3.0.0"
info: { title: "A", version: "1.0" }
servers: [{ url: "https://a.example.com" }]
paths:
  /alpha:
    get:
      x-fern-sdk-group-name: ["alpha"]
      x-fern-sdk-method-name: list
      responses: { "200": { description: ok } }
"#;
        let spec_b = r#"
openapi: "3.0.0"
info: { title: "B", version: "1.0" }
servers: [{ url: "https://b.example.com" }]
paths:
  /beta:
    get:
      x-fern-sdk-group-name: ["beta"]
      x-fern-sdk-method-name: list
      responses: { "200": { description: ok } }
"#;
        let app = CliApp::new("t").specs_under_named(
            "v3",
            [("alpha", spec_a), ("beta", spec_b)],
        );
        let doc = app.build_doc().unwrap();
        let v3 = doc.resources.get("v3").expect("v3 namespace");
        // Both specs nested under their own sub-namespace inside v3 (with hoist).
        assert!(v3.resources.contains_key("alpha"));
        assert!(v3.resources.contains_key("beta"));
        let alpha = &v3.resources["alpha"];
        assert!(alpha.methods.contains_key("list"));
    }

    #[test]
    fn test_substitute_url_vars_replaces_known_and_leaves_unknown() {
        let mut subs = HashMap::new();
        subs.insert("store_hash".to_string(), "abc123".to_string());
        let url = "https://api.bigcommerce.com/stores/{store_hash}/v3/customers/{customer_id}";
        let out = substitute_url_vars(url, &subs);
        // Known var substituted, unknown left literal so the failure mode is
        // visible in dry-run output and downstream error messages.
        assert_eq!(
            out,
            "https://api.bigcommerce.com/stores/abc123/v3/customers/{customer_id}"
        );
    }

    #[test]
    fn test_apply_server_var_substitutions_walks_nested_resources() {
        let spec = r#"
openapi: "3.0.0"
info: { title: "T", version: "1.0" }
servers: [{ url: "https://api.example.com/stores/{store_hash}/v3" }]
paths:
  /a/{id}/b:
    get:
      x-fern-sdk-group-name: ["a", "b"]
      x-fern-sdk-method-name: get
      responses: { "200": { description: ok } }
"#;
        let mut doc = CliApp::new("t").spec(spec).build_doc().unwrap();
        let mut subs = HashMap::new();
        subs.insert("store_hash".to_string(), "xyz".to_string());
        apply_server_var_substitutions(&mut doc, &subs);

        let nested_method = doc.resources["a"].resources["b"].methods.get("get").unwrap();
        assert_eq!(nested_method.root_url, "https://api.example.com/stores/xyz/v3");
    }

    #[test]
    fn test_apply_server_var_substitutions_walks_named_servers() {
        // Spec combines `{store_hash}` URL template variables with
        // `x-fern-server-name` named servers. The substitution pass
        // must rewrite the named-server URLs too — otherwise
        // `resolve_named_server_url` reads back an unsubstituted URL
        // and the executor sends the request to a literal
        // `{store_hash}` host.
        let spec = r#"
openapi: "3.0.0"
info: { title: "T", version: "1.0" }
servers:
  - url: "https://api.example.com/stores/{store_hash}/v3"
    x-fern-server-name: Production
  - url: "https://staging.example.com/stores/{store_hash}/v3"
    x-fern-server-name: Staging
paths:
  /uploads:
    post:
      x-fern-sdk-group-name: ["uploads"]
      x-fern-sdk-method-name: create
      servers:
        - url: "https://upload.example.com/stores/{store_hash}/v3"
          x-fern-server-name: Upload
      responses: { "200": { description: ok } }
"#;
        let mut doc = CliApp::new("t").spec(spec).build_doc().unwrap();
        let mut subs = HashMap::new();
        subs.insert("store_hash".to_string(), "abc123".to_string());
        apply_server_var_substitutions(&mut doc, &subs);

        // Top-level named servers are substituted.
        assert_eq!(doc.servers.len(), 2);
        assert_eq!(doc.servers[0].name.as_deref(), Some("Production"));
        assert_eq!(doc.servers[0].url, "https://api.example.com/stores/abc123/v3");
        assert_eq!(doc.servers[1].name.as_deref(), Some("Staging"));
        assert_eq!(doc.servers[1].url, "https://staging.example.com/stores/abc123/v3");

        // Per-operation `servers:` overrides are substituted too.
        let create = doc.resources["uploads"].methods.get("create").unwrap();
        assert_eq!(create.servers.len(), 1);
        assert_eq!(create.servers[0].name.as_deref(), Some("Upload"));
        assert_eq!(
            create.servers[0].url,
            "https://upload.example.com/stores/abc123/v3",
        );
    }

    /// Twilio's spec shape: a templated server URL plus the concrete
    /// `x-fern-default-url` to fall back to.
    const TWILIO_SHAPED_SPEC: &str = r#"
openapi: "3.0.0"
info: { title: "T", version: "1.0" }
servers:
  - url: "https://api.{region}.twilio.com"
    x-fern-server-name: Production
    x-fern-default-url: "https://api.twilio.com"
    variables:
      region:
        default: us1
        description: The Twilio region
        enum: [us1, ie1, au1]
paths:
  /Messages:
    get:
      x-fern-sdk-group-name: ["messages"]
      x-fern-sdk-method-name: list-message
      responses: { "200": { description: ok } }
"#;

    #[test]
    fn test_spec_server_variables_survive_parsing() {
        let doc = CliApp::new("t").spec(TWILIO_SHAPED_SPEC).build_doc().unwrap();
        assert_eq!(doc.servers.len(), 1);
        let server = &doc.servers[0];
        assert_eq!(server.default_url.as_deref(), Some("https://api.twilio.com"));
        assert_eq!(server.variables.len(), 1);
        assert_eq!(server.variables[0].name, "region");
        assert_eq!(server.variables[0].default.as_deref(), Some("us1"));
        assert_eq!(server.variables[0].description.as_deref(), Some("The Twilio region"));
        assert_eq!(server.variables[0].enum_values, vec!["us1", "ie1", "au1"]);

        // Same metadata reachable through the collector the CLI layer uses.
        let collected = collect_spec_server_variables(&doc);
        assert_eq!(collected.len(), 1);
        assert_eq!(collected[0].name, "region");
    }

    #[test]
    fn test_multi_spec_preserves_later_spec_server_metadata() {
        // Twilio's shape: dozens of `spec_under` entries, with the
        // templated server declared by one that is not the first.
        let app = CliApp::new("t")
            .spec_under(
                "accounts",
                r#"
openapi: "3.0.0"
info: { title: "A", version: "1.0" }
servers: [{ url: "https://accounts.twilio.com" }]
paths:
  /Accounts:
    get:
      x-fern-sdk-group-name: ["accounts"]
      x-fern-sdk-method-name: list
      responses: { "200": { description: ok } }
"#,
            )
            .spec_under("core", TWILIO_SHAPED_SPEC);
        let mut doc = app.build_doc().unwrap();

        let collected = collect_spec_server_variables(&doc);
        assert_eq!(collected.len(), 1, "later spec's `variables` must survive the merge");
        assert_eq!(collected[0].name, "region");
        assert!(app.needs_server_var_resolution(&doc));

        let cli = app.decorate_command(&doc, crate::openapi::commands::build_cli(&doc));
        let matches = cli
            .try_get_matches_from(["t", "core", "messages", "list-message"])
            .expect("parses with no flags");
        app.apply_server_vars(&mut doc, &matches);

        let list = doc.resources["core"].resources["messages"]
            .methods
            .get("list-message")
            .unwrap();
        assert_eq!(list.root_url, "https://api.twilio.com");
    }

    #[test]
    fn test_spec_server_variable_flag_colliding_with_operation_param_falls_back_to_default() {
        // A `global(true)` long name that a per-operation parameter also uses
        // makes clap reject the whole command tree, so the flag is skipped —
        // and the variable resolves to its declared `default` instead, which
        // still yields a sendable URL.
        let app = CliApp::new("t").spec(
            r#"
openapi: "3.0.0"
info: { title: "T", version: "1.0" }
servers:
  - url: "https://api.{region}.example.com"
    variables:
      region: { default: us1 }
paths:
  /things:
    get:
      x-fern-sdk-group-name: ["things"]
      x-fern-sdk-method-name: list
      parameters:
        - { name: region, in: query, schema: { type: string } }
      responses: { "200": { description: ok } }
"#,
        );
        let mut doc = app.build_doc().unwrap();
        let cli = app.decorate_command(&doc, crate::openapi::commands::build_cli(&doc));
        let matches = cli
            .try_get_matches_from(["t", "things", "list"])
            .expect("command tree must still build and parse");
        app.apply_server_vars(&mut doc, &matches);

        assert_eq!(doc.root_url, "https://api.us1.example.com");
        let list = doc.resources["things"].methods.get("list").unwrap();
        assert_eq!(list.root_url, "https://api.us1.example.com");
    }

    #[test]
    fn test_needs_server_var_resolution_for_spec_declared_variables() {
        // The resolution pass must run for specs that declare their own
        // `servers[].variables` / `x-fern-default-url`, even when the
        // generator registered no `.server_var()` of its own.
        let app = CliApp::new("t").spec(TWILIO_SHAPED_SPEC);
        assert!(app.needs_server_var_resolution(&app.build_doc().unwrap()));

        let plain = CliApp::new("t").spec(
            r#"
openapi: "3.0.0"
info: { title: "T", version: "1.0" }
servers: [{ url: "https://api.example.com" }]
paths:
  /things:
    get:
      x-fern-sdk-group-name: ["things"]
      x-fern-sdk-method-name: list
      responses: { "200": { description: ok } }
"#,
        );
        assert!(!plain.needs_server_var_resolution(&plain.build_doc().unwrap()));
    }

    #[test]
    fn test_apply_server_vars_uses_default_url_when_caller_pins_nothing() {
        // `./cli messages list-message` with no flags: the templated URL is
        // not a valid URI, so `x-fern-default-url` must take over.
        let app = CliApp::new("t").spec(TWILIO_SHAPED_SPEC);
        let mut doc = app.build_doc().unwrap();
        let cli = app.decorate_command(&doc, crate::openapi::commands::build_cli(&doc));
        let matches = cli
            .try_get_matches_from(["t", "messages", "list-message"])
            .expect("parses with no flags");
        app.apply_server_vars(&mut doc, &matches);

        assert_eq!(doc.root_url, "https://api.twilio.com");
        assert_eq!(doc.servers[0].url, "https://api.twilio.com");
        let list = doc.resources["messages"].methods.get("list-message").unwrap();
        assert_eq!(list.root_url, "https://api.twilio.com");
    }

    #[test]
    fn test_apply_server_vars_caller_value_beats_default_url() {
        // An explicit `--region` must route the request, not be discarded in
        // favour of `x-fern-default-url`.
        let app = CliApp::new("t").spec(TWILIO_SHAPED_SPEC);
        let mut doc = app.build_doc().unwrap();
        let cli = app.decorate_command(&doc, crate::openapi::commands::build_cli(&doc));
        let matches = cli
            .try_get_matches_from(["t", "--region", "ie1", "messages", "list-message"])
            .expect("parses --region from the spec's server variables");
        app.apply_server_vars(&mut doc, &matches);

        assert_eq!(doc.root_url, "https://api.ie1.twilio.com");
        let list = doc.resources["messages"].methods.get("list-message").unwrap();
        assert_eq!(list.root_url, "https://api.ie1.twilio.com");
    }

    #[test]
    fn test_spec_server_variable_flag_rejects_off_enum_value() {
        let app = CliApp::new("t").spec(TWILIO_SHAPED_SPEC);
        let doc = app.build_doc().unwrap();
        let cli = app.decorate_command(&doc, crate::openapi::commands::build_cli(&doc));
        cli.clone().debug_assert();
        assert!(
            cli.try_get_matches_from(["t", "--region", "mars1", "messages", "list-message"])
                .is_err(),
            "spec `enum` must constrain the generated flag",
        );
    }

    #[test]
    fn test_apply_server_vars_substitutes_variable_default_without_default_url() {
        // No `x-fern-default-url`: the variable's own `default` resolves the
        // template so the URL is still sendable.
        let spec = r#"
openapi: "3.0.0"
info: { title: "T", version: "1.0" }
servers:
  - url: "https://api.{region}.example.com"
    variables:
      region: { default: us-east-1 }
paths:
  /things:
    get:
      x-fern-sdk-group-name: ["things"]
      x-fern-sdk-method-name: list
      responses: { "200": { description: ok } }
"#;
        let app = CliApp::new("t").spec(spec);
        let mut doc = app.build_doc().unwrap();
        let cli = app.decorate_command(&doc, crate::openapi::commands::build_cli(&doc));
        let matches = cli.try_get_matches_from(["t", "things", "list"]).unwrap();
        app.apply_server_vars(&mut doc, &matches);

        assert_eq!(doc.root_url, "https://api.us-east-1.example.com");
    }

    #[test]
    fn test_apply_server_vars_handles_per_operation_server_variables() {
        let spec = r#"
openapi: "3.0.0"
info: { title: "T", version: "1.0" }
servers:
  - url: "https://api.example.com"
paths:
  /uploads:
    post:
      x-fern-sdk-group-name: ["uploads"]
      x-fern-sdk-method-name: create
      servers:
        - url: "https://upload.{region}.example.com"
          x-fern-default-url: "https://upload.example.com"
          variables:
            region: { default: us1 }
      responses: { "200": { description: ok } }
"#;
        let app = CliApp::new("t").spec(spec);
        let doc = app.build_doc().unwrap();
        let cli = app.decorate_command(&doc, crate::openapi::commands::build_cli(&doc));

        // No caller value: the per-operation server falls back to its default URL.
        let mut doc_default = doc.clone();
        let matches = cli
            .clone()
            .try_get_matches_from(["t", "uploads", "create"])
            .unwrap();
        app.apply_server_vars(&mut doc_default, &matches);
        let create = doc_default.resources["uploads"].methods.get("create").unwrap();
        assert_eq!(create.servers[0].url, "https://upload.example.com");

        // Caller value: substituted into the per-operation server.
        let mut doc_pinned = doc;
        let matches = cli
            .try_get_matches_from(["t", "--region", "ie1", "uploads", "create"])
            .unwrap();
        app.apply_server_vars(&mut doc_pinned, &matches);
        let create = doc_pinned.resources["uploads"].methods.get("create").unwrap();
        assert_eq!(create.servers[0].url, "https://upload.ie1.example.com");
    }

    #[test]
    fn test_spec_under_root_url_on_methods() {
        let spec = r#"
openapi: "3.0.0"
info:
  title: "Billing API"
  version: "1.0"
servers:
  - url: "https://billing.example.com"
paths:
  /invoices:
    get:
      x-fern-sdk-group-name: ["invoices"]
      x-fern-sdk-method-name: list
      responses:
        "200":
          description: ok
"#;
        let app = CliApp::new("test").spec_under("billing", spec);
        let doc = app.build_doc().unwrap();
        let billing = doc.resources.get("billing").unwrap();
        let invoices = billing.resources.get("invoices").unwrap();
        let list = invoices.methods.get("list").unwrap();
        assert_eq!(list.root_url, "https://billing.example.com");
    }

    #[test]
    fn test_per_method_root_url_set_by_openapi_parser() {
        let spec = r#"
openapi: "3.0.0"
info:
  title: "API"
  version: "1.0"
servers:
  - url: "https://myapi.example.com"
paths:
  /things:
    get:
      x-fern-sdk-group-name: ["things"]
      x-fern-sdk-method-name: list
      responses:
        "200":
          description: ok
"#;
        let doc = crate::openapi::load_openapi_spec(spec, "myapi").unwrap();
        let method = doc.resources["things"].methods["list"].clone();
        assert_eq!(method.root_url, "https://myapi.example.com");
    }

    #[test]
    fn test_overlay_applied_before_parsing() {
        let spec = r#"
openapi: "3.0.0"
info:
  title: Plant API
  version: "1.0"
servers:
  - url: https://api.plants.example.com
paths:
  /plants:
    get:
      operationId: list-plants
      summary: List plants
      x-fern-sdk-group-name:
        - plants
      x-fern-sdk-method-name: list
      responses:
        "200":
          description: ok
"#;
        let overlay = r#"
overlay: "1.0.0"
info:
  title: Add description
  version: "1.0"
actions:
  - target: "$.info"
    update:
      description: "A plant management API"
"#;
        let app = CliApp::new("plant-api").spec(spec).overlay(overlay);
        let doc = app.build_doc().unwrap();
        assert_eq!(doc.description, Some("A plant management API".to_string()));
        assert!(doc.resources.contains_key("plants"));
    }

    #[test]
    fn test_overlay_adds_fern_extensions() {
        let spec = r#"
openapi: "3.0.0"
info:
  title: Plant API
  version: "1.0"
servers:
  - url: https://api.plants.example.com
paths:
  /plants:
    get:
      operationId: list-plants
      summary: List plants
      responses:
        "200":
          description: ok
"#;
        // Overlay adds the fern extensions that were missing
        let overlay = r#"
overlay: "1.0.0"
info:
  title: Add fern extensions
  version: "1.0"
actions:
  - target: "$.paths['/plants'].get"
    update:
      x-fern-sdk-group-name:
        - plants
      x-fern-sdk-method-name: list
"#;
        let app = CliApp::new("plant-api").spec(spec).overlay(overlay);
        let doc = app.build_doc().unwrap();
        assert!(doc.resources.contains_key("plants"));
        assert!(doc.resources["plants"].methods.contains_key("list"));
    }

    #[test]
    fn test_multiple_overlays_on_same_spec() {
        let spec = r#"
openapi: "3.0.0"
info:
  title: Plant API
  version: "1.0"
servers:
  - url: https://api.plants.example.com
paths:
  /plants:
    get:
      operationId: list-plants
      summary: List plants
      x-fern-sdk-group-name:
        - plants
      x-fern-sdk-method-name: list
      responses:
        "200":
          description: ok
"#;
        let overlay1 = r#"
overlay: "1.0.0"
info:
  title: Overlay 1
  version: "1.0"
actions:
  - target: "$.info"
    update:
      description: "Plant API v1"
"#;
        let overlay2 = r#"
overlay: "1.0.0"
info:
  title: Overlay 2
  version: "1.0"
actions:
  - target: "$.info"
    update:
      contact:
        name: "Plant Store"
"#;
        let app = CliApp::new("plant-api")
            .spec(spec)
            .overlay(overlay1)
            .overlay(overlay2);
        let doc = app.build_doc().unwrap();
        assert_eq!(doc.description, Some("Plant API v1".to_string()));
        assert!(doc.resources.contains_key("plants"));
    }

    // -----------------------------------------------------------------------
    // Overrides integration tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_spec_with_overrides_applies_fern_extensions() {
        let base = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://api.example.com" }]
paths:
  /customers:
    get:
      tags: [Customers]
      operationId: getCustomers
      responses: { "200": { description: ok } }
"#;
        let overrides = r#"
paths:
  /customers:
    get:
      x-fern-sdk-group-name: [customers]
      x-fern-sdk-method-name: list
"#;
        let app = CliApp::new("test").spec_with_overrides(base, overrides);
        let doc = app.build_doc().unwrap();
        let customers = &doc.resources["customers"];
        assert!(
            customers.methods.contains_key("list"),
            "overrides should rename method to 'list', got: {:?}",
            customers.methods.keys().collect::<Vec<_>>()
        );
    }

    #[test]
    fn test_spec_under_with_overrides() {
        let base = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://api.example.com" }]
paths:
  /items:
    get:
      tags: [Items]
      operationId: getItems
      responses: { "200": { description: ok } }
"#;
        let overrides = r#"
paths:
  /items:
    get:
      x-fern-sdk-group-name: [items]
      x-fern-sdk-method-name: list
"#;
        let app = CliApp::new("test").spec_under_with_overrides("v3", base, overrides);
        let doc = app.build_doc().unwrap();
        let v3 = &doc.resources["v3"];
        let items = &v3.resources["items"];
        assert!(
            items.methods.contains_key("list"),
            "overrides under prefix should rename method to 'list'"
        );
    }

    #[test]
    fn test_specs_under_named_with_overrides() {
        let spec_a = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://api.example.com" }]
paths:
  /orders:
    get:
      tags: [Orders]
      operationId: getOrders
      responses: { "200": { description: ok } }
"#;
        let overrides_a = r#"
paths:
  /orders:
    get:
      x-fern-sdk-group-name: [orders]
      x-fern-sdk-method-name: list
"#;
        let app = CliApp::new("test")
            .specs_under_named_with_overrides("v3", [("orders", spec_a, overrides_a)]);
        let doc = app.build_doc().unwrap();
        let v3 = &doc.resources["v3"];
        // merge_into_path hoists: prefix "v3/orders" + group-name "orders" → v3 > orders > list
        let orders = &v3.resources["orders"];
        assert!(
            orders.methods.contains_key("list"),
            "named overrides should rename method to 'list', got: {:?}",
            orders.methods.keys().collect::<Vec<_>>()
        );
    }

    #[test]
    fn test_spec_without_overrides_unchanged() {
        // Verify that `.spec()` (no overrides) still works identically.
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://api.example.com" }]
paths:
  /pets:
    get:
      tags: [Pets]
      operationId: getPets
      responses: { "200": { description: ok } }
"#;
        let app = CliApp::new("test").spec(yaml);
        let doc = app.build_doc().unwrap();
        let pets = &doc.resources["pets"];
        assert!(
            pets.methods.contains_key("get-pets"),
            "without overrides, method name should come from operationId"
        );
    }

    #[test]
    fn test_overrides_null_removes_field() {
        let base = r#"
openapi: "3.0.0"
info:
  title: T
  version: "1.0"
  description: "Remove me"
servers: [{ url: "https://api.example.com" }]
paths:
  /items:
    get:
      tags: [Items]
      operationId: listItems
      summary: "Original summary"
      responses: { "200": { description: ok } }
"#;
        let overrides = r#"
paths:
  /items:
    get:
      summary: null
      x-fern-sdk-group-name: [items]
      x-fern-sdk-method-name: list
"#;
        let app = CliApp::new("test").spec_with_overrides(base, overrides);
        let doc = app.build_doc().unwrap();
        let items = &doc.resources["items"];
        assert!(
            items.methods.contains_key("list"),
            "overrides should rename method even when combined with null deletions"
        );
    }

    /// Array-of-objects merge via overrides: servers array elements are merged
    /// by index (Fern parity), so the override can patch just one field.
    #[test]
    fn test_overrides_array_of_objects_merged_by_index() {
        let base = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers:
  - url: "https://api.example.com"
    description: Production
  - url: "https://staging.example.com"
    description: Staging
paths:
  /items:
    get:
      tags: [Items]
      operationId: listItems
      responses: { "200": { description: ok } }
"#;
        let overrides = r#"
servers:
  - url: "https://api-patched.example.com"
"#;
        let app = CliApp::new("test").spec_with_overrides(base, overrides);
        let doc = app.build_doc().unwrap();
        // Server[0] should be merged (url patched, description preserved)
        assert_eq!(doc.root_url, "https://api-patched.example.com");
    }

    /// Primitive array replacement via overrides: tags are primitives so the
    /// override replaces rather than merging by index.
    #[test]
    fn test_overrides_primitive_array_replaced() {
        let base = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://api.example.com" }]
paths:
  /items:
    get:
      tags: [OldTag]
      operationId: listItems
      responses: { "200": { description: ok } }
"#;
        let overrides = r#"
paths:
  /items:
    get:
      tags: [NewTag]
      x-fern-sdk-group-name: [items]
      x-fern-sdk-method-name: list
"#;
        let app = CliApp::new("test").spec_with_overrides(base, overrides);
        let doc = app.build_doc().unwrap();
        let items = &doc.resources["items"];
        assert!(
            items.methods.contains_key("list"),
            "overrides with replaced tags should still apply fern extensions"
        );
    }

    /// Sequential overrides: two overrides applied in order.
    #[test]
    fn test_sequential_overrides_chain() {
        use crate::openapi::parser::deep_merge_yaml;

        let base = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://api.example.com" }]
paths:
  /a:
    get:
      tags: [A]
      operationId: getA
      responses: { "200": { description: ok } }
  /b:
    get:
      tags: [B]
      operationId: getB
      responses: { "200": { description: ok } }
"#;
        let ovr1 = r#"
paths:
  /a:
    get:
      x-fern-sdk-group-name: [alpha]
      x-fern-sdk-method-name: list
"#;
        let ovr2 = r#"
paths:
  /b:
    get:
      x-fern-sdk-group-name: [beta]
      x-fern-sdk-method-name: list
"#;
        let base_val: serde_yaml::Value = serde_yaml::from_str(base).unwrap();
        let ovr1_val: serde_yaml::Value = serde_yaml::from_str(ovr1).unwrap();
        let ovr2_val: serde_yaml::Value = serde_yaml::from_str(ovr2).unwrap();
        let merged = deep_merge_yaml(deep_merge_yaml(base_val, ovr1_val), ovr2_val);
        let doc = crate::openapi::parser::load_openapi_spec_from_value(merged, "t").unwrap();
        assert!(doc.resources["alpha"].methods.contains_key("list"));
        assert!(doc.resources["beta"].methods.contains_key("list"));
    }

    // ── Global Parameters ─────────────────────────────────────────

    #[test]
    fn test_global_parameter_flag_name_uses_parameter_name_when_present() {
        let p = crate::openapi::discovery::GlobalParameter {
            name: "max-retries".into(),
            parameter_name: Some("maxRetries".into()),
            location: crate::openapi::discovery::GlobalParameterLocation::Header,
            target: "X-Max-Retries".into(),
            env: None,
            default: None,
            optional: false,
            apply: crate::openapi::discovery::GlobalParameterApplyMode::Auto,
            docs: None,
        };
        assert_eq!(global_parameter_flag_name(&p), "max-retries");
    }

    #[test]
    fn test_global_parameter_flag_name_falls_back_to_name() {
        let p = crate::openapi::discovery::GlobalParameter {
            name: "api-version".into(),
            parameter_name: None,
            location: crate::openapi::discovery::GlobalParameterLocation::Query,
            target: "api-version".into(),
            env: None,
            default: None,
            optional: false,
            apply: crate::openapi::discovery::GlobalParameterApplyMode::Auto,
            docs: None,
        };
        assert_eq!(global_parameter_flag_name(&p), "api-version");
    }

    #[test]
    fn test_global_parameter_arg_id_format() {
        let p = crate::openapi::discovery::GlobalParameter {
            name: "currency".into(),
            parameter_name: None,
            location: crate::openapi::discovery::GlobalParameterLocation::Body,
            target: "currency".into(),
            env: None,
            default: None,
            optional: false,
            apply: crate::openapi::discovery::GlobalParameterApplyMode::Auto,
            docs: None,
        };
        assert_eq!(global_parameter_arg_id(&p), "global-param:currency");
    }

    #[test]
    fn test_merge_global_parameters_first_write_wins() {
        use crate::openapi::discovery::{
            GlobalParameter, GlobalParameterApplyMode, GlobalParameterLocation,
        };

        let mut acc = vec![GlobalParameter {
            name: "currency".into(),
            parameter_name: None,
            location: GlobalParameterLocation::Query,
            target: "currency".into(),
            env: Some("FIRST_ENV".into()),
            default: Some("USD".into()),
            optional: false,
            apply: GlobalParameterApplyMode::Auto,
            docs: None,
        }];
        let incoming = vec![
            GlobalParameter {
                name: "currency".into(),
                parameter_name: None,
                location: GlobalParameterLocation::Query,
                target: "currency".into(),
                env: Some("SECOND_ENV".into()),
                default: Some("EUR".into()),
                optional: true,
                apply: GlobalParameterApplyMode::Auto,
                docs: None,
            },
            GlobalParameter {
                name: "region".into(),
                parameter_name: None,
                location: GlobalParameterLocation::Header,
                target: "X-Region".into(),
                env: None,
                default: None,
                optional: true,
                apply: GlobalParameterApplyMode::Auto,
                docs: None,
            },
        ];
        merge_global_parameters(&mut acc, incoming);
        assert_eq!(acc.len(), 2, "duplicate dropped, new appended: {acc:?}");
        assert_eq!(acc[0].env.as_deref(), Some("FIRST_ENV"));
        assert_eq!(acc[0].default.as_deref(), Some("USD"));
        assert_eq!(acc[1].name, "region");
    }

    #[test]
    fn test_build_global_parameter_overrides_auto_mode() {
        use crate::openapi::discovery::{
            GlobalParameter, GlobalParameterApplyMode, GlobalParameterLocation,
            RestDescription, RestMethod,
        };

        let doc = RestDescription {
            global_parameters: vec![GlobalParameter {
                name: "api-version".into(),
                parameter_name: None,
                location: GlobalParameterLocation::Query,
                target: "api-version".into(),
                env: None,
                default: Some("2024-01-01".into()),
                optional: false,
                apply: GlobalParameterApplyMode::Auto,
                docs: None,
            }],
            ..Default::default()
        };
        let method = RestMethod::default();
        let cmd = clap::Command::new("test")
            .arg(clap::Arg::new("global-param:api-version").long("api-version").default_value("2024-06-01"));
        let matches = cmd.get_matches_from(vec!["test"]);
        let params = serde_json::Map::new();
        let overrides =
            build_global_parameter_overrides(&matches, &doc, &method, &params)
                .expect("auto mode should always apply");
        assert_eq!(overrides.len(), 1);
        assert_eq!(overrides[0].target, "api-version");
        assert_eq!(overrides[0].value, "2024-06-01");
        assert!(matches!(
            overrides[0].location,
            GlobalParameterLocation::Query
        ));
    }

    #[test]
    fn test_build_global_parameter_overrides_explicit_mode_included() {
        use crate::openapi::discovery::{
            GlobalParameter, GlobalParameterApplyMode, GlobalParameterLocation,
            RestDescription, RestMethod,
        };

        let doc = RestDescription {
            global_parameters: vec![GlobalParameter {
                name: "currency".into(),
                parameter_name: None,
                location: GlobalParameterLocation::Body,
                target: "currency".into(),
                env: None,
                default: Some("USD".into()),
                optional: false,
                apply: GlobalParameterApplyMode::Explicit,
                docs: None,
            }],
            ..Default::default()
        };
        let method = RestMethod {
            global_parameter_opt_ins: vec!["currency".to_string()],
            ..Default::default()
        };
        let cmd = clap::Command::new("test")
            .arg(clap::Arg::new("global-param:currency").long("currency").default_value("USD"));
        let matches = cmd.get_matches_from(vec!["test"]);
        let params = serde_json::Map::new();
        let overrides =
            build_global_parameter_overrides(&matches, &doc, &method, &params)
                .expect("explicit mode with opt-in should apply");
        assert_eq!(overrides.len(), 1);
        assert_eq!(overrides[0].target, "currency");
        assert_eq!(overrides[0].value, "USD");
    }

    #[test]
    fn test_build_global_parameter_overrides_explicit_mode_excluded() {
        use crate::openapi::discovery::{
            GlobalParameter, GlobalParameterApplyMode, GlobalParameterLocation,
            RestDescription, RestMethod,
        };

        let doc = RestDescription {
            global_parameters: vec![GlobalParameter {
                name: "currency".into(),
                parameter_name: None,
                location: GlobalParameterLocation::Body,
                target: "currency".into(),
                env: None,
                default: Some("USD".into()),
                optional: true,
                apply: GlobalParameterApplyMode::Explicit,
                docs: None,
            }],
            ..Default::default()
        };
        let method = RestMethod::default(); // no opt-ins
        let cmd = clap::Command::new("test")
            .arg(clap::Arg::new("global-param:currency").long("currency").default_value("USD"));
        let matches = cmd.get_matches_from(vec!["test"]);
        let params = serde_json::Map::new();
        let overrides =
            build_global_parameter_overrides(&matches, &doc, &method, &params)
                .expect("explicit mode without opt-in should skip");
        assert!(
            overrides.is_empty(),
            "explicit param not opted-in should not appear: {overrides:?}"
        );
    }

    #[test]
    fn test_build_global_parameter_overrides_per_op_override_suppresses_global() {
        use crate::openapi::discovery::{
            GlobalParameter, GlobalParameterApplyMode, GlobalParameterLocation,
            MethodParameter, RestDescription, RestMethod,
        };

        let mut parameters = std::collections::HashMap::new();
        parameters.insert(
            "X-Api-Version".to_string(),
            MethodParameter {
                location: Some("header".to_string()),
                ..Default::default()
            },
        );
        let doc = RestDescription {
            global_parameters: vec![GlobalParameter {
                name: "api-version".into(),
                parameter_name: None,
                location: GlobalParameterLocation::Header,
                target: "X-Api-Version".into(),
                env: None,
                default: Some("v1".into()),
                optional: false,
                apply: GlobalParameterApplyMode::Auto,
                docs: None,
            }],
            ..Default::default()
        };
        let method = RestMethod {
            parameters,
            ..Default::default()
        };
        let cmd = clap::Command::new("test")
            .arg(clap::Arg::new("global-param:api-version").long("api-version").default_value("v2"));
        let matches = cmd.get_matches_from(vec!["test"]);
        let mut params = serde_json::Map::new();
        params.insert("X-Api-Version".to_string(), serde_json::Value::String("v3-per-op".to_string()));
        let overrides = build_global_parameter_overrides(
            &matches,
            &doc,
            &method,
            &params,
        )
        .expect("per-op override should suppress global");
        assert!(
            overrides.is_empty(),
            "per-op param wins, global should be suppressed: {overrides:?}"
        );
    }

    #[test]
    fn test_build_global_parameter_overrides_required_missing_errors() {
        use crate::openapi::discovery::{
            GlobalParameter, GlobalParameterApplyMode, GlobalParameterLocation,
            RestDescription, RestMethod,
        };

        let doc = RestDescription {
            global_parameters: vec![GlobalParameter {
                name: "api-key".into(),
                parameter_name: None,
                location: GlobalParameterLocation::Header,
                target: "X-Api-Key".into(),
                env: Some("API_KEY".into()),
                default: None,
                optional: false,
                apply: GlobalParameterApplyMode::Auto,
                docs: None,
            }],
            ..Default::default()
        };
        let method = RestMethod::default();
        // Register the arg so clap recognizes it, but don't provide a value
        let cmd = clap::Command::new("test")
            .arg(clap::Arg::new("global-param:api-key").long("api-key").required(false));
        let matches = cmd.get_matches_from(vec!["test"]);
        let params = serde_json::Map::new();
        let err =
            build_global_parameter_overrides(&matches, &doc, &method, &params)
                .unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("api-key"), "error names param: {msg}");
    }

    #[test]
    fn test_build_global_parameter_overrides_optional_missing_skips() {
        use crate::openapi::discovery::{
            GlobalParameter, GlobalParameterApplyMode, GlobalParameterLocation,
            RestDescription, RestMethod,
        };

        let doc = RestDescription {
            global_parameters: vec![GlobalParameter {
                name: "trace-id".into(),
                parameter_name: None,
                location: GlobalParameterLocation::Header,
                target: "X-Trace-Id".into(),
                env: None,
                default: None,
                optional: true,
                apply: GlobalParameterApplyMode::Auto,
                docs: None,
            }],
            ..Default::default()
        };
        let method = RestMethod::default();
        // Register the arg so clap recognizes it, but don't provide a value
        let cmd = clap::Command::new("test")
            .arg(clap::Arg::new("global-param:trace-id").long("trace-id").required(false));
        let matches = cmd.get_matches_from(vec!["test"]);
        let params = serde_json::Map::new();
        let overrides =
            build_global_parameter_overrides(&matches, &doc, &method, &params)
                .expect("optional missing should succeed");
        assert!(
            overrides.is_empty(),
            "optional with no value should be omitted: {overrides:?}"
        );
    }
}
