//! CLI Command Builder
//!
//! Builds a dynamic `clap::Command` tree from the internal API representation.

use clap::builder::{PossibleValue, PossibleValuesParser};
use clap::{Arg, Command};

use std::borrow::Cow;
use std::collections::HashMap;

use crate::openapi::discovery::{
    Availability, FernEnumValue, MethodParameter, MultipartField, RestDescription, RestResource,
    SdkGroupInfo,
};
use crate::text::{sanitize_flag_name, to_kebab_flag};

/// Filter the document in-place so only operations matching at least
/// one of `active_audiences` survive into the command tree. Mirrors
/// fern-api/fern's OpenAPI importer behavior in
/// `packages/cli/api-importers/openapi/openapi-ir-parser/src/openapi/v3/generateIr.ts:117-143`:
///
/// ```text
/// if (audiences.length > 0
///     && !audiences.some(a => operationAudiences.includes(a))) {
///     continue;
/// }
/// ```
///
/// Semantics, mirroring fern verbatim:
///
/// 1. **No active audience** (`active_audiences` is empty) — every
///    operation survives regardless of its tags.
/// 2. **One or more active audiences** — an operation is kept only if
///    its `audiences` set intersects `active_audiences` (set OR, not
///    AND). Operations with empty `audiences` are dropped, since
///    `[].some(...)` is always false.
/// 3. **Untagged operations are NOT included** when a filter is active —
///    deliberate fern parity (a "no audience" tag is treated as "belongs
///    to no audience", not "belongs to all audiences").
///
/// After the per-operation prune, empty resource groups (no methods,
/// no non-empty children) are collapsed so they don't surface as bare
/// subcommands with no leaves — same approach used by the
/// `x-fern-ignore` pass in `parser.rs::prune_empty_resources`.
pub fn filter_doc_by_audiences(doc: &mut RestDescription, active_audiences: &[String]) {
    if active_audiences.is_empty() {
        return;
    }
    filter_resources_by_audiences(&mut doc.resources, active_audiences);
}

/// Recursive worker for [`filter_doc_by_audiences`]. Drops methods that
/// don't intersect `active`, then recurses into nested resources, then
/// finally prunes resources that ended up empty.
fn filter_resources_by_audiences(
    resources: &mut std::collections::HashMap<String, RestResource>,
    active: &[String],
) {
    resources.retain(|_, resource| {
        resource
            .methods
            .retain(|_, method| method_matches_audiences(&method.audiences, active));
        filter_resources_by_audiences(&mut resource.resources, active);
        !resource.methods.is_empty() || !resource.resources.is_empty()
    });
}

/// Membership check mirroring fern's
/// `audiences.some(a => operationAudiences.includes(a))`. The names are
/// compared as opaque strings (case-sensitive, no normalization) so a
/// preset `audiences(["Public"])` and an operation tagged
/// `x-fern-audiences: [public]` deliberately do NOT match — matching
/// how the upstream importer treats audience names as identifiers.
fn method_matches_audiences(method_audiences: &[String], active: &[String]) -> bool {
    active.iter().any(|a| method_audiences.iter().any(|m| m == a))
}

/// Prepends the availability badge (e.g. `[BETA] `) to `text` when one is
/// present. Falls back to `text` unchanged for generally-available items
/// and items with no availability marker.
fn with_availability_badge(text: &str, availability: Option<Availability>) -> String {
    match availability.and_then(Availability::badge) {
        Some(badge) if text.is_empty() => badge.to_string(),
        Some(badge) => format!("{badge} {text}"),
        None => text.to_string(),
    }
}

/// Names of built-in flags that must not be duplicated by parameter-derived flags.
pub(crate) const BUILTIN_FLAG_NAMES: &[&str] = &[
    "params",
    "output",
    "json",
    "format",
    "dry-run",
    "base-url",
    "page-all",
    "page-limit",
    "page-delay",
    "no-pager",
    "no-extract",
    "no-retry",
    "no-stream",
    "quiet",
    "query",
    "help",
    "debug",
    "schema",
];

/// The non-auth portion of the `--help` footer. Auth env vars are
/// computed dynamically from bindings by `CliApp::run_async` and
/// prepended via `Command::after_help` — keeping them out of this string
/// avoids stale `{NAME}_API_KEY` boilerplate.
pub fn after_help_footer(binary_name: &str) -> String {
    let prefix = binary_name.to_uppercase().replace('-', "_");
    format!(
        "Environment variables:\n  \
         {prefix}_BASE_URL             Override the API base URL\n  \
         {prefix}_CA_BUNDLE            Path to PEM file with extra trust roots (or SSL_CERT_FILE)\n  \
         {prefix}_INSECURE=1           Skip TLS verification (debugging only)\n  \
         {prefix}_PROXY                HTTP(S) proxy URL\n  \
         {prefix}_TIMEOUT_SECS         Total request timeout\n\n\
         Standard env vars (HTTPS_PROXY / HTTP_PROXY / NO_PROXY / SSL_CERT_FILE) are also honored."
    )
}

/// Builds the full CLI command tree from an API description.
pub fn build_cli(doc: &RestDescription) -> Command {
    let about_text = doc
        .title
        .clone()
        .unwrap_or_else(|| format!("{} CLI", doc.name));
    let after_help = after_help_footer(&doc.name);
    let mut root = Command::new(doc.name.clone())
        .about(about_text)
        .after_help(after_help)
        .term_width(200)
        .subcommand_required(true)
        .arg_required_else_help(true)
        .arg(
            clap::Arg::new("dry-run")
                .long("dry-run")
                .help("Validate the request locally without sending it to the API")
                .action(clap::ArgAction::SetTrue)
                .global(true),
        )
        .arg(
            clap::Arg::new("format")
                .long("format")
                .help("Output format: json, table, yaml, csv, raw, jsonl, http. Default: table when stdout is a TTY, json when piped. Override default with <NAME>_OUTPUT env var. raw emits unmodified server response bytes. jsonl emits one compact JSON value per line (NDJSON). http emits the full HTTP response (status line + headers + body).")
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
        .arg(
            clap::Arg::new("quiet")
                .long("quiet")
                .short('q')
                .help("Suppress stdout output on success (errors still go to stderr)")
                .action(clap::ArgAction::SetTrue)
                .global(true),
        )
        .arg(
            clap::Arg::new("query")
                .long("query")
                .help(
                    "JMESPath expression applied to the response before formatting. \
                     For streaming responses, events whose projection is null are \
                     suppressed (use as a per-event filter).",
                )
                .value_name("EXPR")
                .global(true),
        );

    // Add resource subcommands
    let mut resource_names: Vec<_> = doc.resources.keys().collect();
    resource_names.sort();
    for name in resource_names {
        let resource = &doc.resources[name];
        if let Some(cmd) = build_resource_command(name, resource, &doc.groups) {
            root = root.subcommand(cmd);
        }
    }

    root
}

/// Resolve the `about()` line for a group's clap subcommand. Returns
/// the `summary` from a matching [`SdkGroupInfo`] entry (sourced from
/// the document-root `x-fern-groups` extension) when present; falls
/// back to the legacy `Operations on '<name>'` label otherwise. The
/// fallback preserves the current default behavior unchanged for any
/// group identifier that doesn't appear in `x-fern-groups`.
pub(crate) fn group_about_text(name: &str, groups: &HashMap<String, SdkGroupInfo>) -> String {
    groups
        .get(name)
        .and_then(|info| info.summary.clone())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| format!("Operations on '{name}'"))
}

/// Resolve the `long_about()` line for a group's clap subcommand from
/// the document-root `x-fern-groups` extension's `description` field.
/// `None` when the group has no entry or the entry omits `description`
/// — clap then falls back to the `about()` text for `--help`.
pub(crate) fn group_long_about_text(
    name: &str,
    groups: &HashMap<String, SdkGroupInfo>,
) -> Option<String> {
    groups
        .get(name)
        .and_then(|info| info.description.clone())
        .filter(|s| !s.is_empty())
}

/// Stringify a parameter's resolved client-side default value for
/// clap's `Arg::default_value`. Strings pass through verbatim; numbers
/// and booleans use their natural lexical form (e.g. `100`, `true`);
/// other JSON shapes (arrays, objects) fall through to compact JSON —
/// but in practice `x-fern-default` only carries scalar literals so the
/// scalar branch is the load-bearing case.
///
/// Returns `None` for `Value::Null` and the `None` input so the caller
/// can skip setting any clap default.
pub(crate) fn default_value_for_clap(value: &Option<serde_json::Value>) -> Option<String> {
    match value.as_ref()? {
        serde_json::Value::Null => None,
        serde_json::Value::String(s) => Some(s.clone()),
        serde_json::Value::Bool(b) => Some(b.to_string()),
        serde_json::Value::Number(n) => Some(n.to_string()),
        other => Some(other.to_string()),
    }
}

/// Format an OpenAPI standard `default:` value as a trailing
/// documentation suffix to append to a flag's help text. Renders as
/// `[default: <value>]` so the user sees the same shape as clap's
/// auto-generated `[default: ...]` for `x-fern-default` — the help
/// surface intentionally does not distinguish client-side defaults
/// (sent on the wire) from server-side defaults (doc-only). The split
/// stays a wire-behavior concern, not a documentation concern.
///
/// Returns the bare scalar rendering with a leading space so callers
/// can concatenate it directly onto `Arg::help`.
pub(crate) fn documentation_default_help_suffix(
    value: &Option<serde_json::Value>,
) -> Option<String> {
    let rendered = match value.as_ref()? {
        serde_json::Value::Null => return None,
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Bool(b) => b.to_string(),
        serde_json::Value::Number(n) => n.to_string(),
        other => other.to_string(),
    };
    Some(format!(" [default: {rendered}]"))
}

/// Recursively builds a Command for a resource.
/// Returns None if the resource has no methods or sub-resources.
///
/// `groups` carries the parsed document-root `x-fern-groups` block; when
/// a matching entry exists for `name` it overrides the `about()`/
/// `long_about()` text rendered in `--help`. Unmatched resources retain
/// the legacy `Operations on '<name>'` label and alphabetical placement
/// so adding `x-fern-groups` is strictly additive.
fn build_resource_command(
    name: &str,
    resource: &RestResource,
    groups: &HashMap<String, SdkGroupInfo>,
) -> Option<Command> {
    let mut cmd = Command::new(name.to_string())
        .about(group_about_text(name, groups))
        .subcommand_required(true)
        .arg_required_else_help(true);

    if let Some(long_about) = group_long_about_text(name, groups) {
        cmd = cmd.long_about(long_about);
    }

    let mut has_children = false;

    // Add method subcommands
    let mut method_names: Vec<_> = resource.methods.keys().collect();
    method_names.sort();
    for method_name in method_names {
        let method = &resource.methods[method_name];

        has_children = true;

        let about = crate::text::truncate_description(
            method.description.as_deref().unwrap_or(""),
            crate::text::CLI_DESCRIPTION_LIMIT,
            true,
        );
        let about = with_availability_badge(&about, method.availability);

        let mut method_cmd = Command::new(method_name.to_string())
            .about(about)
            .arg(
                Arg::new("params")
                    .long("params")
                    .help("Additional parameters as JSON (overrides individual flags)")
                    .value_name("JSON"),
            );

        // `-o, --output PATH` is only meaningful for operations that can
        // return a binary body — the JSON path in `process_response` never
        // consults `output_path`, so on pure-JSON ops the flag would
        // silently no-op. Hide it where it does nothing rather than
        // surface a misleading affordance in `--help`. Mixed-response ops
        // (binary 2xx + JSON 4xx) still get the flag because the success
        // path is what writes a file.
        if method.has_binary_response {
            method_cmd = method_cmd.arg(
                Arg::new("output")
                    .long("output")
                    .short('o')
                    .help("Output file path for binary responses (use '-' to stream to stdout)")
                    .value_name("PATH"),
            );
        }

        // Add --json flag for REST request bodies
        if method.request.is_some() {
            method_cmd = method_cmd.arg(
                Arg::new("json")
                    .long("json")
                    .help("JSON request body (use `-` to read from stdin; auto-detected, errors if no data piped)")
                    .value_name("JSON|-"),
            );
        }

        // Add a typed flag for operations with a binary request body
        // (e.g. application/octet-stream). The file is streamed as the body
        // with the content type declared in the spec. The flag name comes from
        // `x-fern-parameter-name` on the requestBody, or defaults to `file`
        // for `format: binary` schemas (else `body`).
        //
        // Accepts four forms: <PATH>, @<PATH> (curl-style), `\@<REST>` (escape
        // — send the literal value `@<REST>`), or `-` for stdin.
        if let Some(ref binary) = method.binary_request_body {
            method_cmd = method_cmd.arg(
                Arg::new(binary.flag_name.clone())
                    .long(binary.flag_name.clone())
                    .value_name("PATH|@PATH|\\@LITERAL|-")
                    .help(format!(
                        "Body for the request (Content-Type: {}). Accepts:\n  \
                         <PATH>      plain filesystem path\n  \
                         @<PATH>     same path (curl-style prefix)\n  \
                         \\@<REST>    escape: send literal value @<REST>\n  \
                         -           read from stdin (sent chunked)",
                        binary.content_type,
                    )),
            );
        }

        // Add per-field flags for multipart/form-data operations.
        // Skip fields whose kebab name collides with a builtin flag,
        // matching the regular-param convention above.
        for field in &method.multipart_fields {
            let kebab = to_kebab_flag(&field.wire_name);
            if BUILTIN_FLAG_NAMES.contains(&kebab.as_str()) {
                continue;
            }
            method_cmd = method_cmd.arg(build_multipart_field_arg(field));
        }

        // Pagination flags
        method_cmd = method_cmd
            .arg(
                Arg::new("page-all")
                    .long("page-all")
                    .help("Auto-paginate through all results (NDJSON)")
                    .action(clap::ArgAction::SetTrue),
            )
            .arg(
                Arg::new("page-limit")
                    .long("page-limit")
                    .help("Maximum number of pages to fetch (default: 10)")
                    .value_name("N")
                    .value_parser(clap::value_parser!(u32)),
            )
            .arg(
                Arg::new("page-delay")
                    .long("page-delay")
                    .help("Delay in milliseconds between page fetches (default: 100)")
                    .value_name("MS")
                    .value_parser(clap::value_parser!(u64)),
            )
            .arg(
                Arg::new("no-pager")
                    .long("no-pager")
                    .help("Disable pager even on interactive terminals")
                    .action(clap::ArgAction::SetTrue),
            )
            .arg(
                Arg::new("no-extract")
                    .long("no-extract")
                    .help(
                        "Disable x-fern-sdk-return-value extraction and print the full response body",
                    )
                    .action(clap::ArgAction::SetTrue),
            )
            .arg(
                Arg::new("no-retry")
                    .long("no-retry")
                    .help(
                        "Disable retries declared by x-fern-retries on this operation, \
                         including network errors. Useful for debugging.",
                    )
                    .action(clap::ArgAction::SetTrue),
            );

        // `--no-stream` is only meaningful on operations with
        // `x-fern-streaming`. Registering it unconditionally would let
        // clap accept it on unrelated ops and silently no-op, which
        // hides spec/runtime mismatches; instead, expose it only where
        // it does something so non-streaming siblings reject the flag
        // up-front.
        if method.streaming.is_some() {
            method_cmd = method_cmd.arg(
                Arg::new("no-stream")
                    .long("no-stream")
                    .help(
                        "Buffer the streaming response and print it as a single value once \
                        complete (handy for piping into another JSON tool)",
                    )
                    .action(clap::ArgAction::SetTrue),
            );
        }

        // Generate individual flags from method parameters.
        //
        // Track (sanitized_flag → wire_name) to detect collisions where
        // two distinct wire names produce the same CLI flag.
        let mut flag_to_wire: HashMap<String, String> = HashMap::new();

        let mut param_names: Vec<_> = method.parameters.keys().collect();
        param_names.sort();
        for param_name in param_names {
            let param = &method.parameters[param_name];

            // Flag name resolution uses `resolve_param_flag_name` — the
            // single source of truth shared with the executor's
            // missing-param hint (FER-10430).
            let kebab_name = match resolve_param_flag_name(param, param_name) {
                Some(name) => name,
                None => {
                    tracing::warn!(
                        param = %param_name,
                        "skipping parameter with unsanitizable name",
                    );
                    continue;
                }
            };

            // Variable-bound path parameters get their value from a
            // root-level global flag (registered in `app::run_async` from
            // `doc.sdk_variables`) plus its env-var fallback. Skip before
            // inserting into flag_to_wire so variable-bound params don't
            // occupy a collision slot and block a later non-variable-bound
            // param that sanitizes to the same flag name.
            if param.variable_reference.is_some() {
                continue;
            }

            // Cross-parameter collision: two different wire names mapping
            // to the same flag. Skip the second occurrence with a warning
            // (load-time error would be ideal but the builder is infallible).
            if let Some(existing_wire) = flag_to_wire.get(&kebab_name) {
                tracing::warn!(
                    flag = %kebab_name,
                    wire1 = %existing_wire,
                    wire2 = %param_name,
                    "two parameters sanitize to the same flag --{kebab_name}; \
                     keeping '{existing_wire}', skipping '{param_name}'",
                );
                continue;
            }
            flag_to_wire.insert(kebab_name.clone(), param_name.clone());

            let base_value_name = match param.param_type.as_deref() {
                Some("string") => "STRING",
                Some("integer") => "NUMBER",
                Some("number") => "NUMBER",
                Some("boolean") => "BOOLEAN",
                Some("array") => "JSON_ARRAY",
                Some("object") => "JSON_OBJECT",
                _ => "VALUE",
            };
            // Composite types never set `param.nullable`, so the `|null`
            // sentinel suffix stays scalar-only without an explicit guard.
            let value_name: Cow<'static, str> = if param.nullable {
                Cow::Owned(format!("{base_value_name}|null"))
            } else {
                Cow::Borrowed(base_value_name)
            };

            let help_text = crate::text::truncate_description(
                param.description.as_deref().unwrap_or(""),
                crate::text::CLI_DESCRIPTION_LIMIT,
                true,
            );
            let help_text = with_availability_badge(&help_text, param.availability);
            // When the CLI flag differs from the wire name — whether via
            // `x-fern-parameter-name` rename or sanitization — surface
            // the original wire name in `--help` so users can correlate
            // the flag with the API docs / `--params` JSON. Synthetic
            // `flag_name_override` injections already encode the wire
            // name in their description, so they skip this.
            let flag_differs_from_wire = param.flag_name_override.is_none()
                && kebab_name != *param_name;
            let help_text = if flag_differs_from_wire {
                if help_text.is_empty() {
                    format!("(api: {param_name})")
                } else {
                    format!("{help_text} (api: {param_name})")
                }
            } else {
                help_text
            };
            // Append the OpenAPI standard `default:` value as a
            // `[default: ...]` suffix when it is the only default
            // source. Same visual shape as clap's auto-rendered
            // `[default: ...]` for `x-fern-default` — the user sees
            // "there is a default" without being told whether the CLI
            // or the server applies it. The CLI itself does not send
            // this value on the wire (only `x-fern-default` populates
            // `default_value` below).
            let help_text = match documentation_default_help_suffix(
                &param.documentation_default_value,
            ) {
                Some(suffix) => format!("{help_text}{suffix}"),
                None => help_text,
            };

            let arg_id = param_clap_arg_id(param_name);
            let mut arg = Arg::new(arg_id)
                .long(kebab_name)
                .value_name(value_name)
                .help(help_text);

            // Only `x-fern-default` (lowered into `default_value`)
            // becomes a clap default. The standard `default:` keyword
            // is doc-only and handled above via the help-text suffix.
            if let Some(default_str) = default_value_for_clap(&param.default_value) {
                arg = arg.default_value(default_str);
            }

            // Environment-variable fallback (currently populated by the
            // OpenAPI parser for synthetic idempotency-header params from
            // `x-fern-idempotency-headers`, with overrides applied by
            // `CliApp::idempotency_header_env`). Clap reads `.env(...)`
            // when the flag is absent on the command line, giving us the
            // same priority order — flag → env → default — used for auth
            // sources.
            if let Some(ref env_var) = param.env_var {
                arg = arg.env(env_var.clone());
            }

            if let Some(ref enum_values) = param.enum_values {
                arg = arg.value_parser(build_enum_value_parser(enum_values, param));
            }

            if param.repeated {
                arg = arg.action(clap::ArgAction::Append);
            }

            method_cmd = method_cmd.arg(arg);
        }

        cmd = cmd.subcommand(method_cmd);
    }

    // Add sub-resource subcommands (recursive)
    let mut sub_names: Vec<_> = resource.resources.keys().collect();
    sub_names.sort();
    for sub_name in sub_names {
        let sub_resource = &resource.resources[sub_name];
        if let Some(sub_cmd) = build_resource_command(sub_name, sub_resource, groups) {
            has_children = true;
            cmd = cmd.subcommand(sub_cmd);
        }
    }

    if has_children {
        Some(cmd)
    } else {
        None
    }
}

/// Compute the clap arg ID for a parameter given its wire name.
///
/// Normally the arg ID equals the wire name so the executor can look
/// values up by wire name directly. When the wire name itself collides
/// with a built-in flag's arg ID (e.g. `format`, `output`, `json`), we
/// suffix it with `-param` to avoid a clap duplicate-arg-ID panic.
///
/// This function is also called by `collect_params_from_flags` so the
/// executor uses the same mangled ID that the command builder registered.
pub(crate) fn param_clap_arg_id(wire_name: &str) -> String {
    if BUILTIN_FLAG_NAMES.contains(&wire_name) {
        format!("{wire_name}-param")
    } else {
        wire_name.to_string()
    }
}

/// Resolve the CLI flag name for a parameter, replicating every step that
/// `build_resource_command` applies: override -> body-kebab vs
/// non-body-sanitize -> builtin-collision `-param` suffix. Both the
/// command builder and the executor's missing-param hint must agree on
/// what flag a parameter maps to — this shared helper is the single
/// source of truth.
///
/// Returns `None` only when `sanitize_flag_name` rejects the name
/// (control characters, CJK, etc.). The caller should fall back to
/// `--params` guidance in that case.
pub(crate) fn resolve_param_flag_name(param: &MethodParameter, wire_name: &str) -> Option<String> {
    let mut flag = if let Some(override_flag) = param.flag_name_override.as_deref() {
        override_flag.to_string()
    } else {
        let is_body = param.location.as_deref() == Some("body");
        let source = param.display_name.as_deref().unwrap_or(wire_name);
        if is_body {
            to_kebab_flag(source)
        } else {
            match sanitize_flag_name(source) {
                Ok(name) => name,
                Err(_) => return None,
            }
        }
    };
    if BUILTIN_FLAG_NAMES.contains(&flag.as_str()) {
        flag = format!("{flag}-param");
    }
    Some(flag)
}

/// Build a `PossibleValuesParser` that respects an optional `x-fern-enum`
/// override. When the parameter has no `fern_enum` map, this is a plain
/// `PossibleValuesParser::new(wire_values)`. When it does, each wire value
/// gets an alias + per-value help string so `--help` renders the display
/// name and description while either the display name or wire value parses
/// successfully on the command line.
fn build_enum_value_parser(
    wire_values: &[String],
    param: &MethodParameter,
) -> PossibleValuesParser {
    let mut possible: Vec<PossibleValue> = wire_values
        .iter()
        .map(|wire| {
            let cfg = param
                .fern_enum
                .as_ref()
                .and_then(|m| m.get(wire));
            build_possible_value(wire, cfg)
        })
        .collect();
    // Null sentinel: when the param is nullable, accept `null` as a
    // fourth (etc.) possible value so clap admits it. The conversion to
    // `Value::Null` happens later in `collect_params_from_flags`.
    if param.nullable {
        possible.push(PossibleValue::new("null").help("Send JSON null."));
    }
    PossibleValuesParser::from(possible)
}

/// Construct a single `PossibleValue` from a wire value and its optional
/// `x-fern-enum` config. The display name (if set and different from the
/// wire value) becomes the canonical rendered name, with the wire value
/// as a parse-time alias. Descriptions surface as long-help text.
fn build_possible_value(wire: &str, cfg: Option<&FernEnumValue>) -> PossibleValue {
    let display = cfg.and_then(|c| c.display_name.as_deref());
    let mut pv = match display {
        Some(name) if name != wire => PossibleValue::new(name.to_string()).alias(wire.to_string()),
        _ => PossibleValue::new(wire.to_string()),
    };
    if let Some(desc) = cfg.and_then(|c| c.description.as_deref()) {
        pv = pv.help(desc.to_string());
    }
    pv
}

/// Build a `clap::Arg` for a single [`MultipartField`]. File fields
/// accept a path (`<PATH>` / `@<PATH>` / `-` for stdin), or a `\@<REST>`
/// escape that sends the literal text `@<REST>` as the part value;
/// text fields accept a plain string value.
fn build_multipart_field_arg(field: &MultipartField) -> Arg {
    let kebab = to_kebab_flag(&field.wire_name);
    let (value_name, help_prefix) = if field.is_file {
        ("PATH|@PATH|\\@LITERAL|-", "File to upload")
    } else {
        ("VALUE", "")
    };

    let help_text = match (&field.description, help_prefix) {
        (Some(desc), "") => desc.clone(),
        (Some(desc), prefix) => format!("{prefix}. {desc}"),
        (None, prefix) if !prefix.is_empty() => prefix.to_string(),
        _ => String::new(),
    };

    let mut arg = Arg::new(field.wire_name.clone())
        .long(kebab)
        .value_name(value_name)
        .help(help_text);

    if field.required {
        arg = arg.required(true);
    }

    arg
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::openapi::discovery::{FernEnumValue, MethodParameter, RestMethod, RestResource};
    use std::collections::HashMap;

    fn make_doc() -> RestDescription {
        let mut methods = HashMap::new();
        methods.insert(
            "list".to_string(),
            RestMethod {
                http_method: "GET".to_string(),
                path: "list".to_string(),
                ..Default::default()
            },
        );
        methods.insert(
            "delete".to_string(),
            RestMethod {
                http_method: "DELETE".to_string(),
                path: "delete".to_string(),
                ..Default::default()
            },
        );

        let mut resources = HashMap::new();
        resources.insert(
            "files".to_string(),
            RestResource {
                methods,
                resources: HashMap::new(),
            },
        );

        RestDescription {
            name: "test-cli".to_string(),
            resources,
            ..Default::default()
        }
    }

    #[test]
    fn test_all_commands_always_shown() {
        let doc = make_doc();
        let cmd = build_cli(&doc);

        let files_cmd = cmd
            .find_subcommand("files")
            .expect("files resource missing");

        assert!(files_cmd.find_subcommand("list").is_some());
        assert!(files_cmd.find_subcommand("delete").is_some());
    }

    #[test]
    fn test_root_uses_doc_name() {
        let doc = make_doc();
        let cmd = build_cli(&doc);
        assert_eq!(cmd.get_name(), "test-cli");
    }

    #[test]
    fn test_method_params_become_flags() {
        let mut params = HashMap::new();
        params.insert(
            "uuid".to_string(),
            MethodParameter {
                param_type: Some("string".to_string()),
                description: Some("The user UUID".to_string()),
                location: Some("path".to_string()),
                required: true,
                ..Default::default()
            },
        );
        params.insert(
            "status".to_string(),
            MethodParameter {
                param_type: Some("string".to_string()),
                description: Some("Filter by status".to_string()),
                location: Some("query".to_string()),
                enum_values: Some(vec!["active".to_string(), "inactive".to_string()]),
                ..Default::default()
            },
        );

        let mut methods = HashMap::new();
        methods.insert(
            "get-user".to_string(),
            RestMethod {
                http_method: "GET".to_string(),
                path: "/users/{uuid}".to_string(),
                parameters: params,
                ..Default::default()
            },
        );

        let mut resources = HashMap::new();
        resources.insert(
            "users".to_string(),
            RestResource {
                methods,
                resources: HashMap::new(),
            },
        );

        let doc = RestDescription {
            name: "test-cli".to_string(),
            resources,
            ..Default::default()
        };

        let cmd = build_cli(&doc);
        let users_cmd = cmd.find_subcommand("users").expect("users resource missing");
        let get_user_cmd = users_cmd
            .find_subcommand("get-user")
            .expect("get-user method missing");

        // Verify individual flags exist
        let args: Vec<String> = get_user_cmd
            .get_arguments()
            .map(|a| a.get_id().to_string())
            .collect();
        assert!(args.contains(&"uuid".to_string()), "uuid flag missing");
        assert!(args.contains(&"status".to_string()), "status flag missing");
        assert!(args.contains(&"params".to_string()), "params flag missing");
    }

    #[test]
    fn test_variable_bound_param_skipped_from_per_op_flags() {
        // Path parameters that carry `x-fern-sdk-variable` must NOT appear
        // as per-operation flags. Their value comes from a root-level
        // global flag registered in `app::run_async` from
        // `doc.sdk_variables` (with env-var fallback). Mirrors Fern's
        // openapi-ir-parser semantics: variables are constructor-style
        // globals, not per-method arguments.
        let mut params = HashMap::new();
        params.insert(
            "gardenId".to_string(),
            MethodParameter {
                param_type: Some("string".to_string()),
                description: Some("Garden tenant".to_string()),
                location: Some("path".to_string()),
                required: true,
                variable_reference: Some("gardenId".to_string()),
                ..Default::default()
            },
        );
        // A plain (non-variable-bound) path param on the same op still
        // surfaces as a per-op flag.
        params.insert(
            "zoneId".to_string(),
            MethodParameter {
                param_type: Some("string".to_string()),
                description: Some("Zone id".to_string()),
                location: Some("path".to_string()),
                required: true,
                ..Default::default()
            },
        );

        let mut methods = HashMap::new();
        methods.insert(
            "get".to_string(),
            RestMethod {
                http_method: "GET".to_string(),
                path: "/gardens/{gardenId}/zones/{zoneId}".to_string(),
                parameters: params,
                ..Default::default()
            },
        );
        let mut resources = HashMap::new();
        resources.insert(
            "zones".to_string(),
            RestResource {
                methods,
                resources: HashMap::new(),
            },
        );
        let doc = RestDescription {
            name: "garden-cli".to_string(),
            resources,
            ..Default::default()
        };
        let cmd = build_cli(&doc);
        let zones_cmd = cmd
            .find_subcommand("zones")
            .expect("zones resource missing");
        let get_cmd = zones_cmd
            .find_subcommand("get")
            .expect("zones.get missing");
        let arg_ids: Vec<String> = get_cmd
            .get_arguments()
            .map(|a| a.get_id().to_string())
            .collect();
        assert!(
            !arg_ids.contains(&"gardenId".to_string()),
            "variable-bound path param should NOT be a per-op flag, got: {arg_ids:?}",
        );
        assert!(
            arg_ids.contains(&"zoneId".to_string()),
            "plain path param should still surface as a per-op flag, got: {arg_ids:?}",
        );
    }

    #[test]
    fn test_nullable_scalar_renders_value_name_with_null_suffix() {
        // A nullable scalar body param renders its value_name as `<TYPE>|null`
        // so users discover the null sentinel from `--help`.
        let mut params = HashMap::new();
        params.insert(
            "userId".to_string(),
            MethodParameter {
                param_type: Some("string".to_string()),
                location: Some("body".to_string()),
                nullable: true,
                ..Default::default()
            },
        );
        params.insert(
            "count".to_string(),
            MethodParameter {
                param_type: Some("integer".to_string()),
                location: Some("body".to_string()),
                nullable: true,
                ..Default::default()
            },
        );
        params.insert(
            "code".to_string(),
            MethodParameter {
                param_type: Some("string".to_string()),
                location: Some("body".to_string()),
                nullable: false,
                ..Default::default()
            },
        );
        let mut methods = HashMap::new();
        methods.insert(
            "create".to_string(),
            RestMethod {
                http_method: "POST".to_string(),
                path: "/things".to_string(),
                parameters: params,
                ..Default::default()
            },
        );
        let mut resources = HashMap::new();
        resources.insert(
            "things".to_string(),
            RestResource {
                methods,
                resources: HashMap::new(),
            },
        );
        let doc = RestDescription {
            name: "test-cli".to_string(),
            resources,
            ..Default::default()
        };
        let cmd = build_cli(&doc);
        let create = cmd
            .find_subcommand("things")
            .unwrap()
            .find_subcommand("create")
            .unwrap();

        let value_name_for = |id: &str| -> String {
            let arg = create
                .get_arguments()
                .find(|a| a.get_id().as_str() == id)
                .unwrap_or_else(|| panic!("arg '{id}' missing"));
            arg.get_value_names()
                .unwrap_or(&[])
                .iter()
                .map(|s| s.to_string())
                .collect::<Vec<_>>()
                .join(",")
        };

        assert_eq!(value_name_for("userId"), "STRING|null");
        assert_eq!(value_name_for("count"), "NUMBER|null");
        assert_eq!(
            value_name_for("code"),
            "STRING",
            "non-nullable scalar must NOT gain the |null suffix",
        );
    }

    #[test]
    fn test_builtin_flag_names_renamed_with_param_suffix() {
        let mut params = HashMap::new();
        params.insert(
            "format".to_string(),
            MethodParameter {
                param_type: Some("string".to_string()),
                description: Some("Response format".to_string()),
                ..Default::default()
            },
        );
        params.insert(
            "output".to_string(),
            MethodParameter {
                param_type: Some("string".to_string()),
                description: Some("Output type".to_string()),
                ..Default::default()
            },
        );
        params.insert(
            "real_param".to_string(),
            MethodParameter {
                param_type: Some("string".to_string()),
                description: Some("A real param".to_string()),
                ..Default::default()
            },
        );

        let mut methods = HashMap::new();
        methods.insert(
            "test-method".to_string(),
            RestMethod {
                http_method: "GET".to_string(),
                path: "/test".to_string(),
                parameters: params,
                ..Default::default()
            },
        );

        let mut resources = HashMap::new();
        resources.insert(
            "things".to_string(),
            RestResource {
                methods,
                resources: HashMap::new(),
            },
        );

        let doc = RestDescription {
            name: "test-cli".to_string(),
            resources,
            ..Default::default()
        };

        let cmd = build_cli(&doc);
        let things_cmd = cmd
            .find_subcommand("things")
            .expect("things resource missing");
        let test_cmd = things_cmd
            .find_subcommand("test-method")
            .expect("test-method missing");

        let args: Vec<String> = test_cmd
            .get_arguments()
            .map(|a| a.get_id().to_string())
            .collect();

        assert!(
            args.contains(&"real_param".to_string()),
            "real_param flag missing"
        );

        // Wire names that collide with builtins get a `-param` suffix on
        // both the arg ID and the long flag (FER-10430).
        assert!(
            args.contains(&"format-param".to_string()),
            "format should be renamed to format-param, got: {args:?}"
        );
        assert!(
            args.contains(&"output-param".to_string()),
            "output should be renamed to output-param, got: {args:?}"
        );

        // The long flags should also be suffixed.
        let format_arg = test_cmd
            .get_arguments()
            .find(|a| a.get_id() == "format-param")
            .expect("format-param arg missing");
        assert_eq!(
            format_arg.get_long().unwrap(),
            "format-param",
            "format param should have --format-param long flag",
        );
    }

    #[test]
    fn test_sanitized_param_name_produces_correct_flag() {
        let mut params = HashMap::new();
        params.insert(
            "id:in".to_string(),
            MethodParameter {
                param_type: Some("string".to_string()),
                description: Some("Filter by ID".to_string()),
                location: Some("query".to_string()),
                ..Default::default()
            },
        );
        params.insert(
            "date_created:min".to_string(),
            MethodParameter {
                param_type: Some("string".to_string()),
                description: Some("Min date".to_string()),
                location: Some("query".to_string()),
                ..Default::default()
            },
        );

        let mut methods = HashMap::new();
        methods.insert(
            "list".to_string(),
            RestMethod {
                http_method: "GET".to_string(),
                path: "/things".to_string(),
                parameters: params,
                ..Default::default()
            },
        );
        let mut resources = HashMap::new();
        resources.insert(
            "things".to_string(),
            RestResource {
                methods,
                resources: HashMap::new(),
            },
        );
        let doc = RestDescription {
            name: "test-cli".to_string(),
            resources,
            ..Default::default()
        };

        let cmd = build_cli(&doc);
        let list_cmd = cmd
            .find_subcommand("things")
            .and_then(|c| c.find_subcommand("list"))
            .expect("things list missing");

        // The arg IDs are the wire names (no builtin collision).
        let arg_ids: Vec<String> = list_cmd
            .get_arguments()
            .map(|a| a.get_id().to_string())
            .collect();
        assert!(
            arg_ids.contains(&"id:in".to_string()),
            "arg ID should be the wire name 'id:in', got: {arg_ids:?}",
        );
        assert!(
            arg_ids.contains(&"date_created:min".to_string()),
            "arg ID should be the wire name 'date_created:min', got: {arg_ids:?}",
        );

        // But the long flags are sanitized.
        let id_in = list_cmd
            .get_arguments()
            .find(|a| a.get_id() == "id:in")
            .unwrap();
        assert_eq!(id_in.get_long().unwrap(), "id-in");

        let date_min = list_cmd
            .get_arguments()
            .find(|a| a.get_id() == "date_created:min")
            .unwrap();
        assert_eq!(date_min.get_long().unwrap(), "date-created-min");
    }

    #[test]
    fn test_sanitized_flag_help_shows_wire_name() {
        let mut params = HashMap::new();
        params.insert(
            "id:in".to_string(),
            MethodParameter {
                param_type: Some("string".to_string()),
                description: Some("Filter by ID".to_string()),
                location: Some("query".to_string()),
                ..Default::default()
            },
        );

        let mut methods = HashMap::new();
        methods.insert(
            "list".to_string(),
            RestMethod {
                http_method: "GET".to_string(),
                path: "/things".to_string(),
                parameters: params,
                ..Default::default()
            },
        );
        let mut resources = HashMap::new();
        resources.insert(
            "things".to_string(),
            RestResource {
                methods,
                resources: HashMap::new(),
            },
        );
        let doc = RestDescription {
            name: "test-cli".to_string(),
            resources,
            ..Default::default()
        };

        let cmd = build_cli(&doc);
        let list_cmd = cmd
            .find_subcommand("things")
            .and_then(|c| c.find_subcommand("list"))
            .unwrap();
        let id_in = list_cmd
            .get_arguments()
            .find(|a| a.get_id() == "id:in")
            .unwrap();
        let help = id_in.get_help().unwrap().to_string();
        assert!(
            help.contains("api: id:in"),
            "help text should include the wire name; got: {help}",
        );
    }
    #[test]
    fn test_variable_bound_param_does_not_block_same_named_normal_param() {
        // Finding 1: a variable-bound param (e.g. `projectId`) that
        // sanitizes to the same flag as a normal param (e.g.
        // `project_id` -> `project-id`) must not occupy a collision
        // slot and prevent the normal param from getting a flag.
        let mut params = HashMap::new();
        params.insert(
            "projectId".to_string(),
            MethodParameter {
                param_type: Some("string".to_string()),
                location: Some("path".to_string()),
                variable_reference: Some("projectId".to_string()),
                ..Default::default()
            },
        );
        params.insert(
            "project_id".to_string(),
            MethodParameter {
                param_type: Some("string".to_string()),
                description: Some("Filter by project".to_string()),
                location: Some("query".to_string()),
                ..Default::default()
            },
        );

        let mut methods = HashMap::new();
        methods.insert(
            "list".to_string(),
            RestMethod {
                http_method: "GET".to_string(),
                path: "/projects/{projectId}/items".to_string(),
                parameters: params,
                ..Default::default()
            },
        );
        let mut resources = HashMap::new();
        resources.insert(
            "items".to_string(),
            RestResource {
                methods,
                resources: HashMap::new(),
            },
        );
        let doc = RestDescription {
            name: "test-cli".to_string(),
            resources,
            ..Default::default()
        };

        let cmd = build_cli(&doc);
        let list_cmd = cmd
            .find_subcommand("items")
            .and_then(|c| c.find_subcommand("list"))
            .expect("items list missing");

        let arg_ids: Vec<String> = list_cmd
            .get_arguments()
            .map(|a| a.get_id().to_string())
            .collect();

        // The normal query param `project_id` should be registered
        // even though `projectId` (variable-bound) sanitizes to the
        // same flag name `project-id`.
        assert!(
            arg_ids.contains(&"project_id".to_string()),
            "project_id flag should be registered despite variable-bound projectId; got: {arg_ids:?}",
        );

        // The variable-bound param should NOT have a per-op flag.
        assert!(
            !arg_ids.contains(&"projectId".to_string()),
            "variable-bound projectId should not appear as a per-op flag; got: {arg_ids:?}",
        );

        // Verify the long flag is correct.
        let proj_arg = list_cmd
            .get_arguments()
            .find(|a| a.get_id() == "project_id")
            .unwrap();
        assert_eq!(proj_arg.get_long().unwrap(), "project-id");
    }

    #[test]
    fn test_resolve_param_flag_name_body_preserves_dots() {
        // Finding 2: body params use to_kebab_flag which preserves
        // dot-notation; the helper must replicate this.
        let param = MethodParameter {
            param_type: Some("string".to_string()),
            location: Some("body".to_string()),
            ..Default::default()
        };
        let flag = resolve_param_flag_name(&param, "address.street").unwrap();
        assert_eq!(
            flag, "address.street",
            "body param dots should be preserved via to_kebab_flag",
        );
    }

    #[test]
    fn test_resolve_param_flag_name_builtin_collision() {
        // Finding 2: params colliding with builtins get `-param` suffix.
        let param = MethodParameter {
            param_type: Some("string".to_string()),
            location: Some("query".to_string()),
            ..Default::default()
        };
        let flag = resolve_param_flag_name(&param, "format").unwrap();
        assert_eq!(
            flag, "format-param",
            "builtin collision should append -param",
        );
    }

    #[test]
    fn test_resolve_param_flag_name_sanitizes_non_body() {
        let param = MethodParameter {
            param_type: Some("string".to_string()),
            location: Some("query".to_string()),
            ..Default::default()
        };
        let flag = resolve_param_flag_name(&param, "status:in").unwrap();
        assert_eq!(flag, "status-in");
    }

    #[test]
    fn test_resolve_param_flag_name_uses_override() {
        let param = MethodParameter {
            flag_name_override: Some("custom-flag".to_string()),
            location: Some("header".to_string()),
            ..Default::default()
        };
        let flag = resolve_param_flag_name(&param, "X-Custom-Header").unwrap();
        assert_eq!(flag, "custom-flag");
    }

    #[test]
    fn test_resolve_param_flag_name_uses_display_name() {
        let param = MethodParameter {
            display_name: Some("searchQuery".to_string()),
            location: Some("query".to_string()),
            ..Default::default()
        };
        let flag = resolve_param_flag_name(&param, "filter_term").unwrap();
        assert_eq!(flag, "search-query");
    }

    #[test]
    fn test_resolve_param_flag_name_is_idempotent() {
        // Applying the helper twice must equal applying it once. The
        // function calls sanitize_flag_name (idempotent) and may append
        // `-param`. Since `format-param` is NOT in BUILTIN_FLAG_NAMES,
        // a second application stays `format-param`.

        // Case 1: body param with dot-notation (`address.street`).
        let body_param = MethodParameter {
            location: Some("body".to_string()),
            ..Default::default()
        };
        let once = resolve_param_flag_name(&body_param, "address.street").unwrap();
        let twice = resolve_param_flag_name(&body_param, &once).unwrap();
        assert_eq!(once, twice, "body dot-notation must be idempotent");

        // Case 2: flag_name_override — the override is used verbatim.
        let override_param = MethodParameter {
            flag_name_override: Some("custom-flag".to_string()),
            location: Some("header".to_string()),
            ..Default::default()
        };
        let once = resolve_param_flag_name(&override_param, "X-Custom-Header").unwrap();
        let twice = resolve_param_flag_name(&override_param, &once).unwrap();
        assert_eq!(once, twice, "override case must be idempotent");

        // Case 3: sanitize case (`id:in` → `id-in`).
        let query_param = MethodParameter {
            location: Some("query".to_string()),
            ..Default::default()
        };
        let once = resolve_param_flag_name(&query_param, "id:in").unwrap();
        let twice = resolve_param_flag_name(&query_param, &once).unwrap();
        assert_eq!(once, twice, "sanitize case must be idempotent");

        // Case 4: builtin-collision case (`format` → `format-param`).
        let collision_param = MethodParameter {
            location: Some("query".to_string()),
            ..Default::default()
        };
        let once = resolve_param_flag_name(&collision_param, "format").unwrap();
        assert_eq!(once, "format-param", "sanity: first application appends -param");
        let twice = resolve_param_flag_name(&collision_param, &once).unwrap();
        assert_eq!(once, twice, "builtin-collision case must be idempotent");
    }

    // ------------------------------------------------------------------
    // x-fern-enum → clap PossibleValue wiring
    //
    // These tests target `build_enum_value_parser` directly so the
    // mapping between the `MethodParameter.fern_enum` map and clap's
    // `PossibleValue` (canonical name + alias + help) can't drift.
    // ------------------------------------------------------------------
    fn param_with_fern_enum(
        wire_values: &[&str],
        entries: &[(&str, Option<&str>, Option<&str>)],
    ) -> MethodParameter {
        let mut map = HashMap::new();
        for (wire, name, desc) in entries {
            map.insert(
                (*wire).to_string(),
                FernEnumValue {
                    display_name: name.map(|s| s.to_string()),
                    description: desc.map(|s| s.to_string()),
                },
            );
        }
        MethodParameter {
            param_type: Some("string".to_string()),
            enum_values: Some(wire_values.iter().map(|s| s.to_string()).collect()),
            fern_enum: Some(map),
            ..Default::default()
        }
    }

    /// Drive `build_enum_value_parser` through a real `clap::Command`
    /// `--help` render so the assertions cover what the user sees, not
    /// just internals. Returns the lower-cased help text so substring
    /// matches are case-insensitive.
    fn render_arg_long_help(param: &MethodParameter) -> String {
        let parser = build_enum_value_parser(param.enum_values.as_ref().unwrap(), param);
        let cmd = Command::new("test").arg(
            Arg::new("status")
                .long("status")
                .value_parser(parser)
                .help("Filter by status"),
        );
        let mut buf = Vec::new();
        cmd.clone()
            .write_long_help(&mut buf)
            .expect("clap should render long help");
        String::from_utf8(buf).expect("clap long help is utf-8")
    }

    #[test]
    fn test_build_enum_value_parser_no_fern_enum_uses_wire_values() {
        let param = MethodParameter {
            param_type: Some("string".to_string()),
            enum_values: Some(vec!["a".to_string(), "b".to_string()]),
            ..Default::default()
        };
        let help = render_arg_long_help(&param);
        assert!(
            help.contains("possible values") && help.contains("a") && help.contains("b"),
            "wire values must be listed in long help when no fern_enum is set; got:\n{help}",
        );
    }

    #[test]
    fn test_build_enum_value_parser_renders_display_name_and_per_value_help() {
        let param = param_with_fern_enum(
            &["all", "managed", "external"],
            &[
                ("all", Some("All"), Some("Every user.")),
                (
                    "managed",
                    Some("Managed"),
                    Some("Enterprise-managed users."),
                ),
                ("external", None, Some("External collaborators only.")),
            ],
        );
        let help = render_arg_long_help(&param);

        // Display names are the rendered option labels in long help.
        assert!(
            help.contains("All") && help.contains("Managed"),
            "display names must appear in long help, got:\n{help}",
        );
        // The un-overridden entry still surfaces its wire value.
        assert!(
            help.contains("external"),
            "wire value must appear when no display override is set, got:\n{help}",
        );
        // Per-value descriptions land in long help.
        assert!(
            help.contains("Every user."),
            "missing first description in:\n{help}"
        );
        assert!(
            help.contains("Enterprise-managed users."),
            "missing second description in:\n{help}",
        );
        assert!(
            help.contains("External collaborators only."),
            "missing third description in:\n{help}",
        );
    }

    /// Both the display alias and the wire value must successfully parse
    /// when `display_name` is set — this is the key affordance promised
    /// by `x-fern-enum` for CLI users who only know one of the names.
    #[test]
    fn test_build_enum_value_parser_accepts_both_display_and_wire() {
        let param = param_with_fern_enum(
            &["all", "managed", "external"],
            &[
                ("all", Some("All"), None),
                ("managed", Some("Managed"), None),
            ],
        );
        let parser = build_enum_value_parser(param.enum_values.as_ref().unwrap(), &param);
        let cmd = Command::new("test").arg(Arg::new("status").long("status").value_parser(parser));

        for input in ["All", "all", "Managed", "managed", "external"] {
            let matches = cmd
                .clone()
                .try_get_matches_from(vec!["test", "--status", input])
                .unwrap_or_else(|e| panic!("input `{input}` should parse; got error: {e}"));
            let parsed = matches.get_one::<String>("status").unwrap();
            assert_eq!(
                parsed, input,
                "clap returns the user-typed value verbatim; display->wire mapping happens later",
            );
        }

        // A bogus value still fails — guards against accidentally
        // accepting arbitrary strings when fern_enum is set.
        assert!(
            cmd.clone()
                .try_get_matches_from(vec!["test", "--status", "Bogus"])
                .is_err(),
            "values not in the enum must still be rejected",
        );
    }

    /// `name == wire` is a no-op: clap rejects an alias equal to the
    /// canonical name, so the builder must dedupe instead of crashing.
    /// Build the parser into a `Command` to confirm clap accepts it.
    #[test]
    fn test_build_enum_value_parser_skips_alias_when_display_equals_wire() {
        let param = param_with_fern_enum(
            &["managed"],
            &[("managed", Some("managed"), Some("Same wire & display."))],
        );
        let parser = build_enum_value_parser(param.enum_values.as_ref().unwrap(), &param);
        let cmd = Command::new("test").arg(Arg::new("status").long("status").value_parser(parser));
        let matches = cmd
            .try_get_matches_from(vec!["test", "--status", "managed"])
            .expect("clap should accept a PossibleValue without a self-alias");
        assert_eq!(matches.get_one::<String>("status").unwrap(), "managed");
    }

    #[test]
    fn test_build_enum_value_parser_accepts_null_when_param_nullable() {
        // A nullable enum field must accept the literal `null` alongside its
        // wire values. The sentinel→Value::Null transform happens later in
        // collect_params_from_flags; clap's job is just to admit the string.
        let param = MethodParameter {
            param_type: Some("string".to_string()),
            enum_values: Some(vec!["red".to_string(), "blue".to_string()]),
            nullable: true,
            ..Default::default()
        };
        let parser = build_enum_value_parser(param.enum_values.as_ref().unwrap(), &param);
        let cmd = Command::new("test").arg(Arg::new("color").long("color").value_parser(parser));

        for input in ["red", "blue", "null"] {
            cmd.clone()
                .try_get_matches_from(vec!["test", "--color", input])
                .unwrap_or_else(|e| panic!("nullable enum should accept `{input}`; got: {e}"));
        }

        assert!(
            cmd.clone()
                .try_get_matches_from(vec!["test", "--color", "purple"])
                .is_err(),
            "values outside the enum (and not the null sentinel) must still be rejected",
        );
    }

    #[test]
    fn test_build_enum_value_parser_rejects_null_when_non_nullable() {
        // Regression guard: a non-nullable enum field must NOT accept "null".
        let param = MethodParameter {
            param_type: Some("string".to_string()),
            enum_values: Some(vec!["red".to_string(), "blue".to_string()]),
            nullable: false,
            ..Default::default()
        };
        let parser = build_enum_value_parser(param.enum_values.as_ref().unwrap(), &param);
        let cmd = Command::new("test").arg(Arg::new("color").long("color").value_parser(parser));
        assert!(
            cmd.try_get_matches_from(vec!["test", "--color", "null"])
                .is_err(),
            "non-nullable enum must reject `null` (closed set)",
        );
    }

    #[test]
    fn test_build_enum_value_parser_nullable_lists_null_in_help() {
        // The clap-rendered help must include `null` in the [possible values]
        // listing so users can discover the sentinel from `--help` alone.
        let param = MethodParameter {
            param_type: Some("string".to_string()),
            enum_values: Some(vec!["red".to_string(), "blue".to_string()]),
            nullable: true,
            ..Default::default()
        };
        let help = render_arg_long_help(&param);
        assert!(
            help.contains("null"),
            "nullable enum's long help must list `null` as a possible value, got:\n{help}",
        );
    }

    #[test]
    fn test_json_help_text_rest_method() {
        use crate::openapi::discovery::SchemaRef;

        // REST method with a request body → --json should describe the request body.
        let mut rest_methods = HashMap::new();
        rest_methods.insert(
            "create".to_string(),
            RestMethod {
                http_method: "POST".to_string(),
                path: "/things".to_string(),
                request: Some(SchemaRef {
                    schema_ref: Some("Thing".to_string()),
                    parameter_name: None,
                }),
                ..Default::default()
            },
        );
        let mut rest_resources = HashMap::new();
        rest_resources.insert(
            "things".to_string(),
            RestResource {
                methods: rest_methods,
                resources: HashMap::new(),
            },
        );
        let rest_doc = RestDescription {
            name: "rest-cli".to_string(),
            resources: rest_resources,
            ..Default::default()
        };
        let rest_cmd = build_cli(&rest_doc);
        let rest_json = rest_cmd
            .find_subcommand("things")
            .and_then(|c| c.find_subcommand("create"))
            .and_then(|c| c.get_arguments().find(|a| a.get_id() == "json"))
            .expect("REST --json arg missing");
        let rest_help = rest_json
            .get_help()
            .map(|s| s.to_string())
            .unwrap_or_default();
        assert!(
            rest_help.contains("request body"),
            "REST --json help should describe the request body, got: {rest_help}",
        );
    }

    // ------------------------------------------------------------------
    // filter_doc_by_audiences — fern parity
    // ------------------------------------------------------------------

    /// Build a doc with four operations covering every audience-tag
    /// shape used by the fixture spec: one tagged, one with a
    /// distinct tag, one untagged, and one multi-tagged. Used by all
    /// `filter_doc_by_audiences` tests below.
    fn doc_with_audiences() -> RestDescription {
        let mut methods = HashMap::new();
        methods.insert(
            "public-only".to_string(),
            RestMethod {
                http_method: "GET".to_string(),
                path: "/p".to_string(),
                audiences: vec!["public".to_string()],
                ..Default::default()
            },
        );
        methods.insert(
            "internal-only".to_string(),
            RestMethod {
                http_method: "GET".to_string(),
                path: "/i".to_string(),
                audiences: vec!["internal".to_string()],
                ..Default::default()
            },
        );
        methods.insert(
            "untagged".to_string(),
            RestMethod {
                http_method: "GET".to_string(),
                path: "/u".to_string(),
                audiences: vec![],
                ..Default::default()
            },
        );
        methods.insert(
            "multi-tagged".to_string(),
            RestMethod {
                http_method: "GET".to_string(),
                path: "/m".to_string(),
                audiences: vec!["public".to_string(), "internal".to_string()],
                ..Default::default()
            },
        );
        let mut resources = HashMap::new();
        resources.insert(
            "audiences".to_string(),
            RestResource {
                methods,
                resources: HashMap::new(),
            },
        );
        RestDescription {
            name: "fixture".to_string(),
            resources,
            ..Default::default()
        }
    }

    fn method_names(doc: &RestDescription, group: &str) -> Vec<String> {
        let mut names: Vec<String> = doc
            .resources
            .get(group)
            .map(|r| r.methods.keys().cloned().collect())
            .unwrap_or_default();
        names.sort();
        names
    }

    /// Empty audience filter is a no-op. Mirrors fern's
    /// `audiences.length > 0 && ...` guard in
    /// `openapi-ir-parser/generateIr.ts:141` — when no audiences are
    /// active, every operation passes through.
    #[test]
    fn test_filter_doc_by_audiences_empty_is_noop() {
        let mut doc = doc_with_audiences();
        filter_doc_by_audiences(&mut doc, &[]);
        assert_eq!(
            method_names(&doc, "audiences"),
            vec!["internal-only", "multi-tagged", "public-only", "untagged"],
        );
    }

    /// Single audience keeps only operations whose `x-fern-audiences`
    /// contains that tag. Untagged operations are dropped — matches
    /// fern's `operationAudiences.includes(...)` over an empty array
    /// always evaluating false.
    #[test]
    fn test_filter_doc_by_audiences_single_keeps_matching_only() {
        let mut doc = doc_with_audiences();
        filter_doc_by_audiences(&mut doc, &["public".to_string()]);
        assert_eq!(
            method_names(&doc, "audiences"),
            vec!["multi-tagged", "public-only"],
        );
    }

    /// Multiple active audiences union the matches (OR, not AND).
    /// Mirrors fern's `audiences.some(a => operationAudiences.includes(a))`:
    /// any one match keeps the operation.
    #[test]
    fn test_filter_doc_by_audiences_multiple_unions_matches() {
        let mut doc = doc_with_audiences();
        filter_doc_by_audiences(
            &mut doc,
            &["public".to_string(), "internal".to_string()],
        );
        assert_eq!(
            method_names(&doc, "audiences"),
            vec!["internal-only", "multi-tagged", "public-only"],
        );
    }

    /// An audience that no operation declares prunes every operation
    /// and then collapses the now-empty resource group. Matches fern's
    /// behavior: a preset audience with no matches in the spec yields
    /// an empty IR.
    #[test]
    fn test_filter_doc_by_audiences_nonexistent_prunes_empty_resources() {
        let mut doc = doc_with_audiences();
        filter_doc_by_audiences(&mut doc, &["nonexistent".to_string()]);
        assert!(
            doc.resources.is_empty(),
            "filtering all ops out of a group should also prune the empty group itself: \
             {:?}",
            doc.resources
        );
    }

    /// Audience names are compared as opaque strings — case sensitive,
    /// no normalization — to match fern's treatment of audience tags
    /// as identifiers. `Public` and `public` do NOT match.
    #[test]
    fn test_filter_doc_by_audiences_is_case_sensitive() {
        let mut doc = doc_with_audiences();
        filter_doc_by_audiences(&mut doc, &["Public".to_string()]);
        assert!(
            doc.resources.is_empty(),
            "case-mismatched audience should match nothing"
        );
    }

    /// Nested resources are walked recursively, and an outer resource
    /// with only an empty child is itself collapsed. Guards against the
    /// recursive prune accidentally leaving orphan parent groups in the
    /// command tree.
    #[test]
    fn test_filter_doc_by_audiences_recurses_into_nested_resources() {
        let mut inner_methods = HashMap::new();
        inner_methods.insert(
            "ping".to_string(),
            RestMethod {
                http_method: "GET".to_string(),
                path: "/p".to_string(),
                audiences: vec!["public".to_string()],
                ..Default::default()
            },
        );
        let mut inner_resources = HashMap::new();
        inner_resources.insert(
            "v2".to_string(),
            RestResource {
                methods: inner_methods,
                resources: HashMap::new(),
            },
        );
        let outer = RestResource {
            methods: HashMap::new(),
            resources: inner_resources,
        };
        let mut resources = HashMap::new();
        resources.insert("audiences".to_string(), outer);
        let mut doc = RestDescription {
            name: "fixture".to_string(),
            resources,
            ..Default::default()
        };

        filter_doc_by_audiences(&mut doc, &["public".to_string()]);
        let nested = &doc.resources["audiences"].resources["v2"];
        assert!(nested.methods.contains_key("ping"));

        filter_doc_by_audiences(&mut doc, &["nonexistent".to_string()]);
        assert!(
            doc.resources.is_empty(),
            "nested empty groups should propagate up and prune the outer"
        );
    }

    // ------------------------------------------------------------------
    // x-fern-groups (FER-9864 P3): document-root metadata that
    // re-labels `x-fern-sdk-group-name` group subcommands for the
    // help surface. No tree restructuring; the `--help` `about` /
    // `long_about` lines for the group's clap Command change when a
    // matching entry exists, otherwise the legacy `Operations on
    // '<name>'` fallback applies (preserving prior behavior).
    // ------------------------------------------------------------------

    fn make_doc_with_things_resource() -> RestDescription {
        let mut methods = HashMap::new();
        methods.insert(
            "list".to_string(),
            RestMethod {
                http_method: "GET".to_string(),
                path: "/things".to_string(),
                ..Default::default()
            },
        );
        let mut resources = HashMap::new();
        resources.insert(
            "things".to_string(),
            RestResource {
                methods,
                resources: HashMap::new(),
            },
        );
        RestDescription {
            name: "test-cli".to_string(),
            resources,
            ..Default::default()
        }
    }

    /// Precondition for the rest of the suite: without `x-fern-groups`
    /// metadata, the group's clap Command uses the legacy
    /// `Operations on '<name>'` about text. This is the fallback the
    /// "missing metadata" integration case verifies end-to-end.
    #[test]
    fn test_group_about_falls_back_to_legacy_label_when_no_metadata() {
        let doc = make_doc_with_things_resource();
        let cmd = build_cli(&doc);
        let things = cmd
            .find_subcommand("things")
            .expect("things subcommand missing");
        assert_eq!(
            things.get_about().map(|s| s.to_string()).unwrap_or_default(),
            "Operations on 'things'",
        );
        assert!(things.get_long_about().is_none());
    }

    /// A matching `x-fern-groups` entry with `summary` overrides the
    /// fallback `Operations on '<name>'` label on the clap `about()`
    /// line. The `summary` text surfaces in both the parent's command
    /// table (next to the subcommand name) and in `--help` for the
    /// group itself.
    #[test]
    fn test_group_summary_overrides_about_text() {
        let mut doc = make_doc_with_things_resource();
        doc.groups.insert(
            "things".to_string(),
            SdkGroupInfo {
                summary: Some("Things Operations".to_string()),
                description: None,
            },
        );
        let cmd = build_cli(&doc);
        let things = cmd
            .find_subcommand("things")
            .expect("things subcommand missing");
        assert_eq!(
            things.get_about().map(|s| s.to_string()).unwrap_or_default(),
            "Things Operations",
        );
        // No `description` → no long_about override; clap will fall
        // back to `about` for `--help`.
        assert!(things.get_long_about().is_none());
    }

    /// `description` populates `long_about()` so `--help` shows the
    /// detailed prose for the group. Setting `description` alone
    /// (without `summary`) keeps the legacy short label — fern's IR
    /// allows either field to be present without the other and we
    /// preserve that asymmetry.
    #[test]
    fn test_group_description_sets_long_about_only() {
        let mut doc = make_doc_with_things_resource();
        doc.groups.insert(
            "things".to_string(),
            SdkGroupInfo {
                summary: None,
                description: Some("Long-form prose about things.".to_string()),
            },
        );
        let cmd = build_cli(&doc);
        let things = cmd
            .find_subcommand("things")
            .expect("things subcommand missing");
        assert_eq!(
            things.get_about().map(|s| s.to_string()).unwrap_or_default(),
            "Operations on 'things'",
        );
        assert_eq!(
            things
                .get_long_about()
                .map(|s| s.to_string())
                .unwrap_or_default(),
            "Long-form prose about things.",
        );
    }

    /// Both fields set: `summary` becomes `about`, `description`
    /// becomes `long_about`. This is the canonical case the
    /// integration test exercises against `--help`.
    #[test]
    fn test_group_summary_and_description_populate_both_about_fields() {
        let mut doc = make_doc_with_things_resource();
        doc.groups.insert(
            "things".to_string(),
            SdkGroupInfo {
                summary: Some("Things Operations".to_string()),
                description: Some("Long-form prose about things.".to_string()),
            },
        );
        let cmd = build_cli(&doc);
        let things = cmd
            .find_subcommand("things")
            .expect("things subcommand missing");
        assert_eq!(
            things.get_about().map(|s| s.to_string()).unwrap_or_default(),
            "Things Operations",
        );
        assert_eq!(
            things
                .get_long_about()
                .map(|s| s.to_string())
                .unwrap_or_default(),
            "Long-form prose about things.",
        );
    }

    /// Integration case (a) — matched group: spec carries
    /// `x-fern-groups: { foo: { summary: "Foo Operations" } }`, two
    /// operations are tagged `x-fern-sdk-group-name: foo`, and one is
    /// untagged. Verifies the `foo` subcommand's `about()` line is
    /// `Foo Operations` (driven by `summary`) and that the untagged
    /// op lands on its tag-derived sibling group with the legacy
    /// fallback label.
    ///
    /// Drives the parser end-to-end so the full path
    /// (YAML → `OpenApiSpec` → `RestDescription` → `Command`) is
    /// covered.
    #[test]
    fn test_x_fern_groups_summary_drives_about_for_matched_group() {
        let yaml = r#"
openapi: 3.0.2
info:
  title: t
  version: "1"
servers:
  - url: https://api.example.com
x-fern-groups:
  foo:
    summary: Foo Operations
    description: Operations on foo resources.
paths:
  /foo/list:
    get:
      x-fern-sdk-group-name: [foo]
      x-fern-sdk-method-name: list
      operationId: foo_list
      responses:
        "200": { description: ok }
  /foo/create:
    post:
      x-fern-sdk-group-name: [foo]
      x-fern-sdk-method-name: create
      operationId: foo_create
      responses:
        "200": { description: ok }
  /misc:
    get:
      tags: [Misc]
      x-fern-sdk-method-name: list
      operationId: misc_list
      responses:
        "200": { description: ok }
"#;
        let doc = crate::openapi::load_openapi_spec(yaml, "test-cli").unwrap();
        let cmd = build_cli(&doc);

        // Matched group: `summary` wins over the legacy fallback.
        let foo = cmd
            .find_subcommand("foo")
            .expect("foo subcommand should exist");
        assert_eq!(
            foo.get_about().map(|s| s.to_string()).unwrap_or_default(),
            "Foo Operations",
        );
        assert_eq!(
            foo.get_long_about().map(|s| s.to_string()).unwrap_or_default(),
            "Operations on foo resources.",
        );
        // Group children are still present — `x-fern-groups` does not
        // restructure the clap tree.
        assert!(foo.find_subcommand("list").is_some());
        assert!(foo.find_subcommand("create").is_some());
    }

    /// Integration case (b) — missing-metadata fallback: an operation
    /// carries `x-fern-sdk-group-name: [bar]` but the spec has no
    /// matching `x-fern-groups: bar` entry. The CLI must build
    /// without error and the `bar` subcommand keeps the legacy
    /// `Operations on 'bar'` about line. Verifies no crash and clean
    /// fallback when only one side of the pair is present.
    #[test]
    fn test_x_fern_groups_missing_entry_falls_back_to_default_label() {
        let yaml = r#"
openapi: 3.0.2
info:
  title: t
  version: "1"
servers:
  - url: https://api.example.com
paths:
  /bar/list:
    get:
      x-fern-sdk-group-name: [bar]
      x-fern-sdk-method-name: list
      operationId: bar_list
      responses:
        "200": { description: ok }
"#;
        let doc = crate::openapi::load_openapi_spec(yaml, "test-cli").unwrap();
        assert!(
            doc.groups.is_empty(),
            "no x-fern-groups → groups map should be empty",
        );
        let cmd = build_cli(&doc);
        let bar = cmd
            .find_subcommand("bar")
            .expect("bar subcommand should exist");
        assert_eq!(
            bar.get_about().map(|s| s.to_string()).unwrap_or_default(),
            "Operations on 'bar'",
        );
        assert!(bar.get_long_about().is_none());
        assert!(bar.find_subcommand("list").is_some());
    }

    /// `x-fern-groups` is purely metadata for rendering — adding it
    /// must NOT change which subcommands exist, their nesting, or
    /// their leaf method commands. This guards the hard constraint
    /// that the clap tree structure stays untouched.
    #[test]
    fn test_x_fern_groups_does_not_restructure_clap_tree() {
        let yaml_without = r#"
openapi: 3.0.2
info:
  title: t
  version: "1"
servers:
  - url: https://api.example.com
paths:
  /foo/list:
    get:
      x-fern-sdk-group-name: [foo]
      x-fern-sdk-method-name: list
      operationId: foo_list
      responses:
        "200": { description: ok }
"#;
        let yaml_with = r#"
openapi: 3.0.2
info:
  title: t
  version: "1"
servers:
  - url: https://api.example.com
x-fern-groups:
  foo:
    summary: Foo Operations
paths:
  /foo/list:
    get:
      x-fern-sdk-group-name: [foo]
      x-fern-sdk-method-name: list
      operationId: foo_list
      responses:
        "200": { description: ok }
"#;
        let collect_tree = |yaml: &str| -> Vec<String> {
            let doc = crate::openapi::load_openapi_spec(yaml, "test-cli").unwrap();
            let cmd = build_cli(&doc);
            let mut out = Vec::new();
            for sub in cmd.get_subcommands() {
                for leaf in sub.get_subcommands() {
                    out.push(format!("{}.{}", sub.get_name(), leaf.get_name()));
                }
            }
            out.sort();
            out
        };
        assert_eq!(collect_tree(yaml_without), collect_tree(yaml_with));
    }

    #[test]
    fn test_multipart_field_builtin_collision_skipped() {
        use crate::openapi::discovery::MultipartField;

        let mut methods = HashMap::new();
        methods.insert(
            "upload".to_string(),
            RestMethod {
                http_method: "POST".to_string(),
                path: "/uploads".to_string(),
                multipart_fields: vec![
                    MultipartField {
                        wire_name: "format".to_string(),
                        is_file: false,
                        description: Some("Collides with builtin --format".to_string()),
                        required: false,
                        content_type: None,
                    },
                    MultipartField {
                        wire_name: "output".to_string(),
                        is_file: false,
                        description: Some("Collides with builtin --output".to_string()),
                        required: false,
                        content_type: None,
                    },
                    MultipartField {
                        wire_name: "file".to_string(),
                        is_file: true,
                        description: Some("No collision".to_string()),
                        required: true,
                        content_type: Some("application/octet-stream".to_string()),
                    },
                ],
                ..Default::default()
            },
        );

        let mut resources = HashMap::new();
        resources.insert(
            "uploads".to_string(),
            RestResource {
                methods,
                resources: HashMap::new(),
            },
        );

        let doc = RestDescription {
            name: "test-cli".to_string(),
            resources,
            ..Default::default()
        };

        // Must not panic from duplicate arg names.
        let cmd = build_cli(&doc);
        let uploads_cmd = cmd
            .find_subcommand("uploads")
            .expect("uploads resource missing");
        let upload_cmd = uploads_cmd
            .find_subcommand("upload")
            .expect("upload method missing");

        let arg_ids: Vec<String> = upload_cmd
            .get_arguments()
            .map(|a| a.get_id().to_string())
            .collect();

        // "file" should be present (no collision).
        assert!(
            arg_ids.contains(&"file".to_string()),
            "non-colliding multipart field 'file' should be present, got: {arg_ids:?}",
        );
        // "format" and "output" appear exactly once (from the global builtins).
        let format_count = arg_ids.iter().filter(|a| *a == "format").count();
        assert!(
            format_count <= 1,
            "multipart 'format' should be skipped to avoid duplicate; found {format_count} in {arg_ids:?}",
        );
        let output_count = arg_ids.iter().filter(|a| *a == "output").count();
        assert!(
            output_count <= 1,
            "multipart 'output' should be skipped to avoid duplicate; found {output_count} in {arg_ids:?}",
        );
    }
}
