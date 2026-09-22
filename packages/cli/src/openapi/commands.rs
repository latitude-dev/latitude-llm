//! CLI Command Builder
//!
//! Builds a dynamic `clap::Command` tree from the internal API representation.

use clap::builder::{PossibleValue, PossibleValuesParser};
use clap::{Arg, Command};

use std::borrow::Cow;
use std::collections::HashMap;

use crate::cli_args::{HELP_HEADING_OPTIONAL, HELP_HEADING_REQUEST, HELP_HEADING_REQUIRED};
use crate::openapi::discovery::{
    Availability, FernEnumValue, MethodParameter, MultipartField, RestDescription, RestMethod,
    RestResource, SdkGroupInfo,
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
    "retries",
    "no-retry",
    "no-stream",
    "quiet",
    "query",
    "help",
    "debug",
    "schema",
    "user-agent-suffix",
];

/// The non-auth portion of the `--help` footer. Auth env vars are
/// computed dynamically from bindings by `CliApp::run_async` and
/// prepended via `Command::after_help` — keeping them out of this string
/// avoids stale `{NAME}_API_KEY` boilerplate.
pub fn after_help_footer(binary_name: &str) -> String {
    let prefix = binary_name.to_uppercase().replace('-', "_");
    // The suffix flag/env names default to `--user-agent-suffix` /
    // `<NAME>_USER_AGENT_SUFFIX` but can be renamed at generation time.
    let ua_env = format!("{prefix}{}", crate::user_agent::suffix_env_segment());
    let ua_flag = crate::user_agent::suffix_flag();
    format!(
        "Environment variables:\n  \
         {prefix}_BASE_URL             Override the API base URL\n  \
         {prefix}_CA_BUNDLE            Path to PEM file with extra trust roots (or SSL_CERT_FILE)\n  \
         {prefix}_INSECURE=1           Skip TLS verification (debugging only)\n  \
         {prefix}_PROXY                HTTP(S) proxy URL\n  \
         {prefix}_TIMEOUT_SECS         Total request timeout\n  \
         {ua_env}    Product token appended to the User-Agent (e.g. my-app/1.0; --{ua_flag} wins)\n\n\
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
            clap::Arg::new("user-agent-suffix")
                .long(crate::user_agent::suffix_flag())
                .help(format!(
                    "Product token appended to the User-Agent (e.g. my-app/1.0), so a tool built on top of this CLI can tag its traffic. Takes precedence over <NAME>{}.",
                    crate::user_agent::suffix_env_segment()
                ))
                .value_name("TOKEN")
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
        if let Some(cmd) = build_resource_command(
            name,
            resource,
            &doc.groups,
            &doc.tag_descriptions,
            &doc.group_tag_names,
            &doc.group_tag_operation_counts,
            &doc.group_operation_counts,
            &doc.tag_group_names,
            &doc.tag_description_order,
            doc.pagination_token_query_param.is_some()
                || doc.pagination_token_response_path.is_some(),
        )
        {
            root = root.subcommand(cmd);
        }
    }

    root
}

pub(crate) fn group_tag_description_for_group(
    name: &str,
    group_tags: Option<&[String]>,
    tag_descriptions: &HashMap<String, String>,
    group_tag_operation_counts: Option<&HashMap<String, usize>>,
    group_operation_count: Option<usize>,
    tag_group_names: &HashMap<String, Vec<String>>,
    tag_description_order: &[String],
) -> Option<String> {
    find_tag_description(
        name,
        group_tags,
        tag_descriptions,
        group_tag_operation_counts,
        group_operation_count,
        tag_group_names,
        tag_description_order,
    )
    .map(|description| {
        crate::text::truncate_description(
            &crate::text::first_sentence(description),
            crate::text::CLI_SHORT_DESCRIPTION_LIMIT,
            true,
        )
        .trim()
        .to_string()
    })
}

fn tag_match_key(value: &str) -> String {
    value
        .chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn find_tag_description<'a>(
    name: &str,
    group_tags: Option<&[String]>,
    tag_descriptions: &'a HashMap<String, String>,
    group_tag_operation_counts: Option<&HashMap<String, usize>>,
    group_operation_count: Option<usize>,
    tag_group_names: &HashMap<String, Vec<String>>,
    tag_description_order: &[String],
) -> Option<&'a String> {
    if let Some(group_tags) = group_tags {
        let name_key = tag_match_key(name);
        for declared_tag in tag_description_order {
            let declared_tag_key = tag_match_key(declared_tag);
            if declared_tag_key == name_key
                && group_tags
                    .iter()
                    .any(|tag| tag_match_key(tag) == declared_tag_key)
            {
                if let Some(description) = tag_descriptions.get(declared_tag) {
                    return Some(description);
                }
            }
        }
        // A tag named after the group is the group's own identity. When the
        // group's operations declare it, it is the only tag allowed to
        // describe the group: the loop above already returned if it carries a
        // description, so reaching here means it documents nothing and the
        // group has no description of its own. Borrowing a sibling tag's
        // prose there mislabels the group — an ElevenLabs `voices` group whose
        // ops carry both `voices` (no description) and `pvc-voices` would be
        // announced as "Create and manage Professional Voice Clones (PVCs)",
        // naming a subset of what the group actually does.
        let group_declares_own_name_tag = group_tags
            .iter()
            .any(|tag| tag_match_key(tag) == name_key);
        if group_declares_own_name_tag {
            return None;
        }

        let operation_count = group_operation_count.unwrap_or(0);
        // The group's most-declared tag, counting tags that carry no root
        // description. A tag the group's own operations declare *less* often
        // than another describes a subset of the group, not the group — e.g.
        // a `voices` group whose ops split 19 `voices` / 14 `pvc-voices`
        // would otherwise be labelled "Professional Voice Clones (PVCs)"
        // purely because the dominant tag happens to document nothing.
        let dominant_tag_operation_count = group_tag_operation_counts
            .and_then(|counts| counts.values().copied().max())
            .unwrap_or(0);
        if operation_count > 0 {
            let mut candidates = group_tags
                .iter()
                .filter_map(|operation_tag| {
                    let tag_key = tag_match_key(operation_tag);
                    let declared_tag = tag_description_order
                        .iter()
                        .find(|declared| tag_match_key(declared) == tag_key)?;
                    if operation_tag.contains(':')
                        || declared_tag.contains(':')
                        || !tag_group_names
                            .get(&tag_key)
                            .is_some_and(|groups| groups.len() == 1 && groups[0] == name)
                    {
                        return None;
                    }
                    let count = group_tag_operation_counts
                        .and_then(|counts| counts.get(&tag_key))
                        .copied()
                        .unwrap_or(0);
                    if count * 2 < operation_count || count < dominant_tag_operation_count {
                        return None;
                    }
                    let declaration_index = tag_description_order
                        .iter()
                        .position(|declared| declared == declared_tag)?;
                    Some((count, declaration_index, declared_tag))
                })
                .collect::<Vec<_>>();
            candidates.sort_by_key(|(count, declaration_index, _)| {
                (std::cmp::Reverse(*count), *declaration_index)
            });
            if let Some((_, _, declared_tag)) = candidates.first() {
                if let Some(description) = tag_descriptions.get(*declared_tag) {
                    return Some(description);
                }
            }
        }
    }

    tag_descriptions
        .get(name)
        .or_else(|| {
            let normalized_name = tag_match_key(name);
            tag_descriptions
                .iter()
                .find(|(tag_name, _)| tag_match_key(tag_name) == normalized_name)
                .map(|(_, description)| description)
        })
}

/// Return the generic `about()` line for a group without usable metadata.
pub(crate) fn generic_group_about(name: &str) -> String {
    format!("Operations on '{name}'")
}

/// Resolve the `about()` line for a group's clap subcommand. The legacy
/// fallback is unchanged for groups without metadata.
fn group_about_text_for_group(
    name: &str,
    groups: &HashMap<String, SdkGroupInfo>,
    tag_descriptions: &HashMap<String, String>,
    group_tag_names: &HashMap<String, Vec<String>>,
    group_tag_operation_counts: &HashMap<String, HashMap<String, usize>>,
    group_operation_counts: &HashMap<String, usize>,
    tag_group_names: &HashMap<String, Vec<String>>,
    tag_description_order: &[String],
) -> String {
    let tag_description = group_tag_description_for_group(
        name,
        group_tag_names.get(name).map(Vec::as_slice),
        tag_descriptions,
        group_tag_operation_counts.get(name),
        group_operation_counts.get(name).copied(),
        tag_group_names,
        tag_description_order,
    )
    .filter(|description| !description.is_empty());

    // An explicit `x-fern-groups.description` is Fern-side configuration, so
    // it outranks prose inferred from the spec's tags — the same precedence
    // the agent-skill emitter already applies. Only its first sentence
    // reaches the command table; `long_about` keeps the full text.
    let configured_description = groups
        .get(name)
        .and_then(|info| info.description.as_deref())
        .filter(|description| !description.trim().is_empty())
        .map(|description| {
            crate::text::truncate_description(
                &crate::text::first_sentence(description),
                crate::text::CLI_SHORT_DESCRIPTION_LIMIT,
                true,
            )
            .trim()
            .to_string()
        })
        .filter(|description| !description.is_empty());

    if let Some(summary) = groups
        .get(name)
        .and_then(|info| info.summary.clone())
        .filter(|s| !s.is_empty())
    {
        if !crate::text::is_name_restating(&summary, name)
            || (configured_description.is_none() && tag_description.is_none())
        {
            return summary;
        }
    }

    configured_description
        .or(tag_description)
        .unwrap_or_else(|| generic_group_about(name))
}

/// Resolve the `long_about()` line for a group's clap subcommand. Fern group
/// descriptions take precedence over full OpenAPI tag descriptions. A
/// description equal to the about line is omitted to avoid redundant help.
fn group_long_about_text_for_group(
    name: &str,
    groups: &HashMap<String, SdkGroupInfo>,
    tag_descriptions: &HashMap<String, String>,
    group_tag_names: &HashMap<String, Vec<String>>,
    group_tag_operation_counts: &HashMap<String, HashMap<String, usize>>,
    group_operation_counts: &HashMap<String, usize>,
    tag_group_names: &HashMap<String, Vec<String>>,
    tag_description_order: &[String],
) -> Option<String> {
    let about = group_about_text_for_group(
        name,
        groups,
        tag_descriptions,
        group_tag_names,
        group_tag_operation_counts,
        group_operation_counts,
        tag_group_names,
        tag_description_order,
    );
    groups
        .get(name)
        .and_then(|info| info.description.clone())
        .filter(|s| !s.is_empty())
        .or_else(|| {
            find_tag_description(
                name,
                group_tag_names.get(name).map(Vec::as_slice),
                tag_descriptions,
                group_tag_operation_counts.get(name),
                group_operation_counts.get(name).copied(),
                tag_group_names,
                tag_description_order,
            )
            .cloned()
        })
        .filter(|description| description.trim() != about.trim())
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
    tag_descriptions: &HashMap<String, String>,
    group_tag_names: &HashMap<String, Vec<String>>,
    group_tag_operation_counts: &HashMap<String, HashMap<String, usize>>,
    group_operation_counts: &HashMap<String, usize>,
    tag_group_names: &HashMap<String, Vec<String>>,
    tag_description_order: &[String],
    // True when the spec root declares the token query-param /
    // response-path pair the generic pager falls back on. Passed down rather
    // than read from the doc because this builder is recursive and never
    // holds it.
    doc_has_pagination_defaults: bool,
) -> Option<Command> {
    let mut cmd = Command::new(name.to_string())
        .about(group_about_text_for_group(
            name,
            groups,
            tag_descriptions,
            group_tag_names,
            group_tag_operation_counts,
            group_operation_counts,
            tag_group_names,
            tag_description_order,
        ))
        .subcommand_required(true)
        .arg_required_else_help(true);

    if let Some(long_about) = group_long_about_text_for_group(
        name,
        groups,
        tag_descriptions,
        group_tag_names,
        group_tag_operation_counts,
        group_operation_counts,
        tag_group_names,
        tag_description_order,
    ) {
        cmd = cmd.long_about(long_about);
    }

    let mut has_children = false;

    // Add method subcommands
    let mut method_names: Vec<_> = resource.methods.keys().collect();
    method_names.sort();
    for method_name in method_names {
        let method = &resource.methods[method_name];

        has_children = true;

        // `about` is the one-line entry in the parent's command table, so it
        // stays a single short sentence. `long_about` is what `<method>
        // --help` renders, where the user has asked for detail — keep the
        // fuller prose there, still capped so a verbose spec can't flood the
        // terminal.
        let description = method.description.as_deref().unwrap_or("");
        let short_description = crate::text::truncate_description(
            &crate::text::first_sentence(description),
            crate::text::CLI_SHORT_DESCRIPTION_LIMIT,
            true,
        );
        // Prefer the operation's own prose when the spec carries it apart
        // from the terse summary; otherwise the long form is just the
        // untruncated summary.
        let long_description = crate::text::truncate_description(
            method.long_description.as_deref().unwrap_or(description),
            crate::text::CLI_LONG_DESCRIPTION_LIMIT,
            true,
        );
        let about = with_availability_badge(&short_description, method.availability);
        let long_about = (long_description.trim() != short_description.trim())
            .then(|| with_availability_badge(&long_description, method.availability));

        let mut method_cmd = Command::new(method_name.to_string()).about(about);

        if let Some(long_about) = long_about {
            method_cmd = method_cmd.long_about(long_about);
        }

        // Spec parameters are registered before the per-operation request
        // controls and split by whether the operation can run without them.
        // clap renders custom help headings in first-seen order, so this
        // insertion order is what puts "Required parameters" at the top of
        // `--help`, ahead of everything the caller may leave out.
        let (required_args, optional_args) = build_parameter_args(method);
        for arg in required_args {
            method_cmd = method_cmd.arg(arg.help_heading(HELP_HEADING_REQUIRED));
        }
        for arg in optional_args {
            method_cmd = method_cmd.arg(arg.help_heading(HELP_HEADING_OPTIONAL));
        }

        method_cmd = method_cmd.arg(
            Arg::new("params")
                .long("params")
                .help("Additional parameters as JSON (overrides individual flags)")
                .value_name("JSON")
                .help_heading(HELP_HEADING_REQUEST),
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
                    .value_name("PATH")
                    .help_heading(HELP_HEADING_REQUEST),
            );
        }

        // Add --json flag for REST request bodies
        if method.request.is_some() {
            method_cmd = method_cmd.arg(
                Arg::new("json")
                    .long("json")
                    .help("JSON request body (use `-` to read from stdin; auto-detected, errors if no data piped)")
                    .value_name("JSON|-")
                    .help_heading(HELP_HEADING_REQUEST),
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
                    ))
                    .help_heading(HELP_HEADING_REQUEST),
            );
        }

        // Pagination flags — only where the spec actually describes how to
        // page. Registering them unconditionally advertised `--page-all` on
        // every list operation of a spec with no pagination metadata at all,
        // and the executor then fell back to guessing `pageToken` /
        // `nextPageToken`: one request went out and the command exited 0 with
        // page 1. Silent partial data is the worst outcome for an agent
        // consumer, so the flags are hidden where they cannot work — the same
        // treatment `--no-stream` already gets on non-streaming operations.
        if method_has_pagination(method, doc_has_pagination_defaults) {
            method_cmd = method_cmd
                .arg(
                    Arg::new("page-all")
                        .long("page-all")
                        .help("Auto-paginate through all results (NDJSON)")
                        .action(clap::ArgAction::SetTrue)
                        .help_heading(HELP_HEADING_REQUEST),
                )
                .arg(
                    Arg::new("page-limit")
                        .long("page-limit")
                        .help("Maximum number of pages to fetch (default: 10)")
                        .value_name("N")
                        .value_parser(clap::value_parser!(u32))
                        .help_heading(HELP_HEADING_REQUEST),
                )
                .arg(
                    Arg::new("page-delay")
                        .long("page-delay")
                        .help("Delay in milliseconds between page fetches (default: 100)")
                        .value_name("MS")
                        .value_parser(clap::value_parser!(u64))
                        .help_heading(HELP_HEADING_REQUEST),
                )
                .arg(
                    Arg::new("no-pager")
                        .long("no-pager")
                        .help("Disable pager even on interactive terminals")
                        .action(clap::ArgAction::SetTrue)
                        .help_heading(HELP_HEADING_REQUEST),
                );
        }

        method_cmd = method_cmd
            .arg(
                Arg::new("no-extract")
                    .long("no-extract")
                    .help(
                        "Disable x-fern-sdk-return-value extraction and print the full response body",
                    )
                    .action(clap::ArgAction::SetTrue)
                    .help_heading(HELP_HEADING_REQUEST),
            )
            .arg(
                Arg::new("retries")
                    .long("retries")
                    .value_name("N")
                    .value_parser(clap::value_parser!(u32))
                    .help(
                        "Retry a failed request up to N additional times, overriding \
                         x-fern-retries on this operation. 0 is the same as --no-retry. \
                         Falls back to <NAME>_RETRIES, then the active profile.",
                    )
                    .help_heading(HELP_HEADING_REQUEST),
            )
            .arg(
                Arg::new("no-retry")
                    .long("no-retry")
                    .help(
                        "Disable retries declared by x-fern-retries on this operation, \
                         including network errors. Useful for debugging.",
                    )
                    .action(clap::ArgAction::SetTrue)
                    .help_heading(HELP_HEADING_REQUEST),
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
                    .action(clap::ArgAction::SetTrue)
                    .help_heading(HELP_HEADING_REQUEST),
            );
        }

        cmd = cmd.subcommand(method_cmd);
    }

    // Add sub-resource subcommands (recursive)
    let mut sub_names: Vec<_> = resource.resources.keys().collect();
    sub_names.sort();
    let no_nested_tag_descriptions = HashMap::new();
    for sub_name in sub_names {
        let sub_resource = &resource.resources[sub_name];
        if let Some(sub_cmd) = build_resource_command(
            sub_name,
            sub_resource,
            groups,
            &no_nested_tag_descriptions,
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            &HashMap::new(),
            &[],
            doc_has_pagination_defaults,
        )
        {
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

/// A parameter flag the operation cannot run without: the spec marks it
/// required (`required`, or `required_by_spec` for an object shorthand whose
/// clap flag is deliberately optional) and no client-side `x-fern-default`
/// fills it in when omitted.
///
/// A parent object flag and its dotted leaves are mutually exclusive on the
/// command line, so when both are spec-required only the leaves are listed as
/// required — the parent shorthand is an alternative form, not an extra
/// obligation. This is the same rule `--schema` applies to `input.required`
/// (see `openapi::help`), so the two surfaces agree.
///
/// Requiredness of a dotted leaf is also conditional on its ancestors:
/// `flatten_body_params_prefix` reads each nested schema's own `required`
/// list without gating on whether the parent property is required, so
/// `settings.region` arrives `required: true` even when `settings` itself is
/// optional. Such a leaf is only required *if* the caller opts into the
/// parent, and listing it under `Required parameters` (or spelling it into
/// the usage line) would demand a flag the operation runs fine without.
fn is_required_parameter_flag(
    param: &MethodParameter,
    param_name: &str,
    all_params: &HashMap<String, MethodParameter>,
) -> bool {
    if !unconditionally_required(param, param_name, all_params) {
        return false;
    }
    // A required leaf supersedes its ancestor shorthand — but only a leaf that
    // is itself unconditionally required. Testing bare `required` here would
    // let a conditional grandchild (required within an *optional* intermediate
    // object) demote a genuinely required parent, leaving the operation with
    // nothing listed as required at all.
    let child_prefix = format!("{param_name}.");
    !all_params.iter().any(|(name, p)| {
        name.starts_with(&child_prefix) && unconditionally_required(p, name, all_params)
    })
}

/// The spec requires this parameter, no client-side `x-fern-default` fills it
/// in when omitted, and every ancestor object on its dotted path is itself
/// required — so the caller cannot avoid it by declining an optional parent.
///
/// An ancestor with no entry of its own does not disqualify: the parser emits
/// the object shorthand alongside every recursion that produced leaves, so a
/// gap means the ancestor is not a flag the caller chooses between, not that
/// it is optional.
fn unconditionally_required(
    param: &MethodParameter,
    param_name: &str,
    all_params: &HashMap<String, MethodParameter>,
) -> bool {
    if !(param.required || param.required_by_spec)
        || default_value_for_clap(&param.default_value).is_some()
    {
        return false;
    }
    let mut rest = param_name;
    while let Some((parent, _)) = rest.rsplit_once('.') {
        if let Some(ancestor) = all_params.get(parent) {
            if !(ancestor.required || ancestor.required_by_spec)
                || default_value_for_clap(&ancestor.default_value).is_some()
            {
                return false;
            }
        }
        rest = parent;
    }
    true
}

/// Builds the per-parameter flags for one operation — spec parameters
/// (path/query/header/body) followed by multipart form fields — and splits
/// them into `(required, optional)` so the caller can register each group
/// under its own help heading.
///
/// Neither group carries a heading yet; the caller assigns it. The
/// executor, not clap, enforces required-ness (a required body property
/// can also arrive via `--json`/`--params`), so spec parameters stay
/// clap-optional here regardless of which bucket they land in.
fn build_parameter_args(method: &RestMethod) -> (Vec<Arg>, Vec<Arg>) {
    let mut required_args: Vec<Arg> = Vec::new();
    let mut optional_args: Vec<Arg> = Vec::new();

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

        let base_value_name = value_name_for(param);
        // A composite only sets `param.nullable` when it came from a
        // promoted nullable composition (`anyOf: [$ref, null]`), where
        // the schema genuinely admits `null` — so the sentinel suffix
        // is accurate for `JSON_OBJECT|null` too.
        let value_name: Cow<'static, str> = if param.nullable {
            Cow::Owned(format!("{base_value_name}|null"))
        } else {
            Cow::Borrowed(base_value_name)
        };

        // When the CLI flag differs from the wire name — whether via
        // `x-fern-parameter-name` rename or sanitization — surface
        // the original wire name in `--help` so users can correlate
        // the flag with the API docs / `--params` JSON. Synthetic
        // `flag_name_override` injections already encode the wire
        // name in their description, so they skip this.
        let flag_differs_from_wire =
            param.flag_name_override.is_none() && kebab_name != *param_name;
        // Both tiers carry the same annotations; only the amount of
        // prose differs. The `[default: ...]` suffix mirrors the shape
        // clap renders for `x-fern-default`, so the user sees "there is
        // a default" without being told who applies it. The CLI itself
        // does not send the documentation default on the wire.
        let decorate = |text: &str| -> String {
            let text = with_availability_badge(text, param.availability);
            let text = if flag_differs_from_wire {
                if text.is_empty() {
                    format!("(api: {param_name})")
                } else {
                    format!("{text} (api: {param_name})")
                }
            } else {
                text
            };
            match documentation_default_help_suffix(&param.documentation_default_value) {
                Some(suffix) => format!("{text}{suffix}"),
                None => text,
            }
        };
        let description =
            crate::text::collapse_whitespace(param.description.as_deref().unwrap_or(""));
        let help_text = decorate(&crate::text::truncate_description(
            &crate::text::first_sentence(&description),
            crate::text::CLI_SHORT_DESCRIPTION_LIMIT,
            true,
        ));
        let long_help_text = {
            let text = decorate(&crate::text::truncate_description(
                &description,
                crate::text::CLI_LONG_DESCRIPTION_LIMIT,
                true,
            ));
            // A repeated flag accepts two forms and the value name can only
            // show one. It used to read `<JSON_ARRAY>`, which at least
            // hinted at the array form; now that it correctly shows the
            // element type, nothing on the surface says the flag can be
            // repeated or handed a whole array. Both work, so say so — in
            // the long help only, since the short form is width-limited and
            // truncated.
            if param.repeated {
                let hint = "Repeatable: pass the flag once per value, \
                                or supply a JSON array as a single value.";
                if text.is_empty() {
                    hint.to_string()
                } else {
                    format!("{text}\n\n{hint}")
                }
            } else {
                text
            }
        };

        let arg_id = param_clap_arg_id(param_name);
        // Read before `kebab_name` is moved into `.long(...)`.
        let profile_default = profile_parameter_default(param, param_name);
        // clap resolves EnvVariable above DefaultValue, so a profile value
        // installed as the default normally loses to the parameter's env var
        // — which is the documented order. When the profile was named with
        // `-p` it has to win instead, and the only way to express that in
        // clap is to not register the env var at all for this arg.
        let profile_outranks_env_var = profile_default.is_some() && crate::profiles::outranks_env();
        let mut arg = Arg::new(arg_id)
            .long(kebab_name)
            .value_name(value_name)
            .help(help_text.clone());
        // `-h` shows the one-line form, `--help` the fuller prose. Only
        // set the long form when it actually says more, so `-h` and
        // `--help` do not print identical blocks.
        if long_help_text != help_text {
            arg = arg.long_help(long_help_text);
        }

        // Only `x-fern-default` (lowered into `default_value`)
        // becomes a clap default. The standard `default:` keyword
        // is doc-only and handled above via the help-text suffix.
        //
        // A profile-supplied value takes that slot instead when the active
        // profile names this parameter. That places the profile *above* the
        // spec default and, because clap resolves `CommandLine` >
        // `EnvVariable` > `DefaultValue`, *below* both the flag and the env
        // var — which is exactly the documented precedence, with no new arg
        // plumbing.
        //
        // This one line is what makes `--account-sid` stop being typed.
        // With no profile selected `parameter_default` is `None` and the
        // behaviour is byte-identical to before.
        if let Some(value) = profile_default {
            arg = arg.default_value(value);
        } else if let Some(default_str) = default_value_for_clap(&param.default_value) {
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
            if !profile_outranks_env_var {
                arg = arg.env(env_var.clone());
            }
        }

        if let Some(ref enum_values) = param.enum_values {
            arg = arg.value_parser(build_enum_value_parser(enum_values, param));
        }

        if param.repeated {
            arg = arg.action(clap::ArgAction::Append);
        }

        if is_required_parameter_flag(param, param_name, &method.parameters) {
            required_args.push(arg);
        } else {
            optional_args.push(arg);
        }
    }

    // Per-field flags for multipart/form-data operations. Skip fields
    // whose kebab name collides with a builtin flag, matching the
    // regular-param convention above.
    for field in &method.multipart_fields {
        if resolve_multipart_field_flag_name(&field.wire_name).is_none() {
            continue;
        }
        let arg = build_multipart_field_arg(field);
        if field.required {
            required_args.push(arg);
        } else {
            optional_args.push(arg);
        }
    }

    (required_args, optional_args)
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
    // `is_reserved_flag_name` rather than `BUILTIN_FLAG_NAMES` alone, so the
    // two config-dependent reservations (the user-agent suffix flag and
    // `--profile`) mangle the *id* as well as the long name. Leaving the id
    // un-mangled makes clap silently skip propagating the root's global into
    // that leaf instead of erroring — the flag then means the spec parameter
    // on that one command and the global everywhere else.
    if flag_name_is_reserved(wire_name) {
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
/// The active profile's default for `param`, if it names one.
///
/// The single source of truth for "does the profile supply this parameter?".
/// Two call sites need the answer and must agree: the command builder, which
/// installs it as the clap `default_value`, and
/// [`collect_params_from_flags`](crate::openapi::app::collect_params_from_flags),
/// which has to know a `DefaultValue` came from the profile rather than from
/// `x-fern-default` — those two are typed differently and only one of them
/// is the caller's.
///
/// Falls back to the plain kebab-cased wire name when
/// [`resolve_param_flag_name`] rejects it, so a parameter whose name cannot
/// become a flag can still be matched by its wire name.
pub(crate) fn profile_parameter_default(
    param: &MethodParameter,
    wire_name: &str,
) -> Option<String> {
    let flag_name = resolve_param_flag_name(param, wire_name)
        .unwrap_or_else(|| crate::text::to_kebab_flag(wire_name));
    crate::profiles::parameter_default(wire_name, &flag_name)
}

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
    if flag_name_is_reserved(&flag) {
        flag = format!("{flag}-param");
    }
    Some(flag)
}

/// Resolve the CLI flag name for a multipart field, replicating what
/// `build_resource_command` registers. `None` when the kebab name is
/// reserved by the runtime: the builder skips those args, so no flag
/// exists and the field is reachable only through `--params`.
pub(crate) fn resolve_multipart_field_flag_name(wire_name: &str) -> Option<String> {
    let kebab = to_kebab_flag(wire_name);
    if flag_name_is_reserved(&kebab) {
        None
    } else {
        Some(kebab)
    }
}

/// Whether a parameter-derived flag long name is reserved by the runtime
/// and therefore must be mangled (`-param` suffix) to avoid a clap
/// duplicate-flag panic. Covers the always-present built-in flags plus a
/// customer-configured `userAgentSuffixFlag` name that would otherwise
/// clash with the consumer suffix flag.
pub(crate) fn flag_name_is_reserved(flag: &str) -> bool {
    BUILTIN_FLAG_NAMES.contains(&flag)
        || crate::user_agent::collides_with_suffix_flag(flag)
        || crate::profiles::collides_with_profile_flag(flag)
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
    PossibleValuesParser::from(enum_possible_values(wire_values, param))
}

/// The `PossibleValue`s an enum parameter admits, with `x-fern-enum` display
/// names and help text applied.
fn enum_possible_values(wire_values: &[String], param: &MethodParameter) -> Vec<PossibleValue> {
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
    possible
}

/// Every string this parameter's flag accepts, or `None` when it is
/// unconstrained.
///
/// Derived from the *same* `PossibleValue`s the clap `value_parser` is built
/// from, so the two cannot drift. That matters because `profiles create
/// --set` validates against this list: a stricter list would reject a value
/// the command itself accepts (notably an `x-fern-enum` display name, which
/// is only an alias of the wire value), and a looser one would let a profile
/// store a default that fails every command carrying the parameter.
pub(crate) fn enum_accepted_values(param: &MethodParameter) -> Option<Vec<String>> {
    let wire_values = param.enum_values.as_ref()?;
    if wire_values.is_empty() {
        return None;
    }
    Some(
        enum_possible_values(wire_values, param)
            .iter()
            .flat_map(|value| {
                value
                    .get_name_and_aliases()
                    .map(str::to_string)
                    .collect::<Vec<_>>()
            })
            .collect(),
    )
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

/// `--help` value-name placeholder for a parameter.
///
/// On a repeated flag `param_type` is the *flag* surface — clap collects
/// strings — so the spec's real element type lives in `item_type`. Reading
/// `param_type` here made an array-of-objects flag advertise `<STRING>` while
/// `--schema` (correctly) said `items: {type: object}` and the collector
/// decoded objects: three surfaces, two answers.
///
/// The `param_type` fallback is only correct for *body* arrays, where
/// `param_type` already holds the element type. On a query, header or path
/// array it is the container type `"array"`, so those must arrive with
/// `item_type` resolved — `convert_parameter` spells it out, defaulting to
/// `Some("string")`, rather than leaving it `None` and falling through here.
fn value_name_for(param: &MethodParameter) -> &'static str {
    let value_type = if param.repeated {
        param.item_type.as_deref().or(param.param_type.as_deref())
    } else {
        param.param_type.as_deref()
    };
    match value_type {
        Some("string") => "STRING",
        Some("integer") => "NUMBER",
        Some("number") => "NUMBER",
        Some("boolean") => "BOOLEAN",
        Some("array") => "JSON_ARRAY",
        Some("object") => "JSON_OBJECT",
        _ => "VALUE",
    }
}

/// True when the spec says enough for `--page-all` to actually work on this
/// operation: either the operation carries a resolved `x-fern-pagination`
/// block, or the spec root declares the token query-parameter / response-path
/// pair the executor's generic pager uses.
///
/// When all three are absent the executor still *runs* — it falls back to
/// guessing `pageToken` / `nextPageToken` — which is why the flags could not
/// be left registered: on a spec using any other convention the guess never
/// matches, so a single page comes back and the command exits 0.
fn method_has_pagination(
    method: &crate::openapi::discovery::RestMethod,
    doc_has_pagination_defaults: bool,
) -> bool {
    method.pagination.is_some() || doc_has_pagination_defaults
}

/// Build a `clap::Arg` for a single [`MultipartField`]. File fields
/// accept a path (`<PATH>` / `@<PATH>` / `-` for stdin), or a `\@<REST>`
/// escape that sends the literal text `@<REST>` as the part value;
/// text fields accept a plain string value. Array-typed fields are
/// repeatable — each occurrence becomes its own same-named part.
fn build_multipart_field_arg(field: &MultipartField) -> Arg {
    let kebab = to_kebab_flag(&field.wire_name);
    let (value_name, help_prefix) = if field.is_file {
        ("PATH|@PATH|\\@LITERAL|-", "File to upload")
    } else {
        ("VALUE", "")
    };

    // Multipart field prose used to reach `--help` untruncated, while every
    // other parameter went through `truncate_description`. A single upload
    // operation could therefore render several hundred characters per flag.
    let description = crate::text::collapse_whitespace(
        field.description.as_deref().unwrap_or(""),
    );
    let compose = |text: &str| -> String {
        match (text.is_empty(), help_prefix) {
            (false, "") => text.to_string(),
            (false, prefix) => format!("{prefix}. {text}"),
            (true, prefix) if !prefix.is_empty() => prefix.to_string(),
            _ => String::new(),
        }
    };
    let help_text = compose(&crate::text::truncate_description(
        &crate::text::first_sentence(&description),
        crate::text::CLI_SHORT_DESCRIPTION_LIMIT,
        true,
    ));
    let long_help_text = compose(&crate::text::truncate_description(
        &description,
        crate::text::CLI_LONG_DESCRIPTION_LIMIT,
        true,
    ));

    let mut arg = Arg::new(field.wire_name.clone())
        .long(kebab)
        .value_name(value_name)
        .help(help_text.clone());
    if long_help_text != help_text {
        arg = arg.long_help(long_help_text);
    }

    if field.repeated {
        arg = arg.action(clap::ArgAction::Append);
    }

    if field.required {
        arg = arg.required(true);
    }

    arg
}

#[cfg(test)]
mod profile_flag_reservation_tests {
    use super::{flag_name_is_reserved, param_clap_arg_id};
    use serial_test::serial;

    /// The reservation must be **conditional**. Reserving `profile`
    /// unconditionally would rename an existing CLI's spec parameter from
    /// `--profile` to `--profile-param` the moment this code shipped — a
    /// breaking change for a consumer who never asked for profiles.
    #[test]
    #[serial]
    fn profile_is_only_reserved_when_profiles_are_enabled() {
        crate::profiles::selection::release_profile_flag_for_tests();
        assert!(!flag_name_is_reserved("profile"));
        assert_eq!(param_clap_arg_id("profile"), "profile");

        crate::profiles::reserve_profile_flag();
        assert!(flag_name_is_reserved("profile"));
        // Mangled to match how `format` / `json` / `output` are handled.
        assert_eq!(param_clap_arg_id("profile"), "profile-param");

        crate::profiles::selection::release_profile_flag_for_tests();
    }

    /// Unconditional reservations are unaffected either way.
    #[test]
    #[serial]
    fn the_unconditional_builtins_are_reserved_regardless() {
        crate::profiles::selection::release_profile_flag_for_tests();
        for flag in ["format", "json", "output", "base-url"] {
            assert!(flag_name_is_reserved(flag), "{flag}");
        }
        assert!(!flag_name_is_reserved("account-sid"));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cli_args::HELP_HEADING_GLOBAL;
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

    fn leaf_with_params(params: HashMap<String, MethodParameter>) -> Command {
        let mut methods = HashMap::new();
        methods.insert(
            "get".to_string(),
            RestMethod {
                http_method: "POST".to_string(),
                path: "/users/{uuid}".to_string(),
                parameters: params,
                request: Some(Default::default()),
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
        let cmd = crate::cli_args::apply_global_help_heading(build_cli(&doc));
        cmd.find_subcommand("users")
            .and_then(|c| c.find_subcommand("get"))
            .expect("users get missing")
            .clone()
    }

    fn heading_of(cmd: &Command, id: &str) -> Option<String> {
        cmd.get_arguments()
            .find(|a| a.get_id() == id)
            .unwrap_or_else(|| panic!("{id} flag missing"))
            .get_help_heading()
            .map(str::to_string)
    }

    #[test]
    fn test_help_groups_params_by_requiredness() {
        let mut params = HashMap::new();
        params.insert(
            "uuid".to_string(),
            MethodParameter {
                param_type: Some("string".to_string()),
                location: Some("path".to_string()),
                required: true,
                ..Default::default()
            },
        );
        params.insert(
            "status".to_string(),
            MethodParameter {
                param_type: Some("string".to_string()),
                location: Some("query".to_string()),
                ..Default::default()
            },
        );
        // Required by the spec, but `x-fern-default` fills it in when
        // omitted — the caller may leave it out, so it is optional.
        params.insert(
            "kind".to_string(),
            MethodParameter {
                param_type: Some("string".to_string()),
                location: Some("query".to_string()),
                required: true,
                default_value: Some(serde_json::json!("plant")),
                ..Default::default()
            },
        );

        let leaf = leaf_with_params(params);

        assert_eq!(heading_of(&leaf, "uuid").as_deref(), Some(HELP_HEADING_REQUIRED));
        assert_eq!(heading_of(&leaf, "status").as_deref(), Some(HELP_HEADING_OPTIONAL));
        assert_eq!(heading_of(&leaf, "kind").as_deref(), Some(HELP_HEADING_OPTIONAL));
        assert_eq!(heading_of(&leaf, "params").as_deref(), Some(HELP_HEADING_REQUEST));
        assert_eq!(heading_of(&leaf, "json").as_deref(), Some(HELP_HEADING_REQUEST));
        assert_eq!(heading_of(&leaf, "format").as_deref(), Some(HELP_HEADING_GLOBAL));
        assert_eq!(heading_of(&leaf, "dry-run").as_deref(), Some(HELP_HEADING_GLOBAL));
        assert_eq!(heading_of(&leaf, "help").as_deref(), Some(HELP_HEADING_GLOBAL));

        // Required params stay clap-optional: a required body property may
        // also arrive via `--json`/`--params`, which the executor validates.
        assert!(leaf.clone().try_get_matches_from(["get"]).is_ok());

        // Rendered help leads with the required section and keeps the
        // global flags out of the per-operation groups.
        let help = leaf.clone().render_help().to_string();
        let pos = |needle: &str| help.find(needle).unwrap_or_else(|| panic!("{needle:?} missing"));
        assert!(
            help.contains("Usage: test-cli users get [OPTIONS] --uuid <STRING>"),
            "{help}"
        );
        assert!(pos(HELP_HEADING_REQUIRED) < pos(HELP_HEADING_OPTIONAL));
        assert!(pos(HELP_HEADING_OPTIONAL) < pos(HELP_HEADING_REQUEST));
        // Globals land last only because clap appends propagated `.global(true)`
        // args after a subcommand's own args. Nothing in our code enforces it,
        // so pin it here: a clap upgrade that reorders propagation should fail
        // this assert rather than silently push `Global options` to the top.
        assert!(pos(HELP_HEADING_REQUEST) < pos(HELP_HEADING_GLOBAL));
        let required_section = &help[pos(HELP_HEADING_REQUIRED)..pos(HELP_HEADING_OPTIONAL)];
        assert!(required_section.contains("--uuid"));
        assert!(!required_section.contains("--status"));
        assert!(!required_section.contains("--format"));
    }

    #[test]
    fn test_help_required_object_shorthand_matches_schema_contract() {
        let body = |required: bool, required_by_spec: bool, param_type: &str| MethodParameter {
            param_type: Some(param_type.to_string()),
            location: Some("body".to_string()),
            required,
            required_by_spec,
            ..Default::default()
        };
        let mut params = HashMap::new();
        // Required object with a required leaf: the leaf is the required
        // form, the parent shorthand is the alternative.
        params.insert("settings".to_string(), body(false, true, "object"));
        params.insert("settings.auth_type".to_string(), body(true, true, "string"));
        params.insert("settings.region".to_string(), body(false, false, "string"));
        // Required object with no required leaves: the shorthand itself is
        // the only thing that can satisfy the spec, so it is required.
        params.insert("owner".to_string(), body(false, true, "object"));
        params.insert("owner.nickname".to_string(), body(false, false, "string"));

        let leaf = leaf_with_params(params);

        assert_eq!(heading_of(&leaf, "settings").as_deref(), Some(HELP_HEADING_OPTIONAL));
        assert_eq!(heading_of(&leaf, "settings.auth_type").as_deref(), Some(HELP_HEADING_REQUIRED));
        assert_eq!(heading_of(&leaf, "settings.region").as_deref(), Some(HELP_HEADING_OPTIONAL));
        assert_eq!(heading_of(&leaf, "owner").as_deref(), Some(HELP_HEADING_REQUIRED));
        assert_eq!(heading_of(&leaf, "owner.nickname").as_deref(), Some(HELP_HEADING_OPTIONAL));
    }

    /// A leaf marked required inside an *optional* object is only required
    /// once the caller opts into the parent, so it must not be advertised as
    /// required. `flatten_body_params_prefix` reads each nested schema's own
    /// `required` list without gating on the parent, so the leaf arrives here
    /// `required: true` and the ancestor walk is what suppresses it — without
    /// it the usage line read `[OPTIONS] --settings.region <STRING>` for an
    /// operation that runs fine with no `--settings` at all.
    #[test]
    fn test_help_leaf_under_optional_parent_is_not_required() {
        let body = |required: bool, required_by_spec: bool, param_type: &str| MethodParameter {
            param_type: Some(param_type.to_string()),
            location: Some("body".to_string()),
            required,
            required_by_spec,
            ..Default::default()
        };
        let mut params = HashMap::new();
        // `settings` is absent from the parent schema's `required` list;
        // `region` is required *within* Settings.
        params.insert("settings".to_string(), body(false, false, "object"));
        params.insert("settings.region".to_string(), body(true, true, "string"));
        // One optional link anywhere in the chain is enough: `owner` is
        // required, `owner.address` is not, so `owner.address.city` is
        // conditional even though it is required within Address.
        params.insert("owner".to_string(), body(false, true, "object"));
        params.insert("owner.address".to_string(), body(false, false, "object"));
        params.insert("owner.address.city".to_string(), body(true, true, "string"));
        // Control: a fully required chain still reports the leaf as required,
        // at one level of nesting...
        params.insert("plan".to_string(), body(false, true, "object"));
        params.insert("plan.tier".to_string(), body(true, true, "string"));
        // ...and at two, so an off-by-one in the ancestor walk (checking only
        // the immediate parent, or stopping one link early) fails here rather
        // than silently demoting a genuinely required deep leaf.
        params.insert("billing".to_string(), body(false, true, "object"));
        params.insert("billing.card".to_string(), body(false, true, "object"));
        params.insert("billing.card.number".to_string(), body(true, true, "string"));

        let leaf = leaf_with_params(params);

        assert_eq!(heading_of(&leaf, "settings").as_deref(), Some(HELP_HEADING_OPTIONAL));
        assert_eq!(
            heading_of(&leaf, "settings.region").as_deref(),
            Some(HELP_HEADING_OPTIONAL)
        );
        assert_eq!(heading_of(&leaf, "owner.address").as_deref(), Some(HELP_HEADING_OPTIONAL));
        assert_eq!(
            heading_of(&leaf, "owner.address.city").as_deref(),
            Some(HELP_HEADING_OPTIONAL)
        );
        assert_eq!(heading_of(&leaf, "plan.tier").as_deref(), Some(HELP_HEADING_REQUIRED));
        // ...and its shorthand steps aside for the leaf, as before.
        assert_eq!(heading_of(&leaf, "plan").as_deref(), Some(HELP_HEADING_OPTIONAL));

        // `owner` is spec-required and its only required descendant is itself
        // conditional (inside optional `owner.address`), so nothing supersedes
        // the shorthand and it stays the required form. Demoting it here would
        // leave the operation advertising no required flag at all.
        assert_eq!(heading_of(&leaf, "owner").as_deref(), Some(HELP_HEADING_REQUIRED));

        // Nothing conditional leaks into the usage line (the flags still
        // exist — they are listed under `Optional parameters`).
        let help = leaf.clone().render_help().to_string();
        let usage = help
            .lines()
            .find(|line| line.starts_with("Usage: "))
            .unwrap_or_else(|| panic!("no usage line in:\n{help}"));
        assert!(!usage.contains("--settings.region"), "{usage}");
        assert!(!usage.contains("--owner.address.city"), "{usage}");
        assert_eq!(
            heading_of(&leaf, "billing.card.number").as_deref(),
            Some(HELP_HEADING_REQUIRED)
        );
        assert_eq!(heading_of(&leaf, "billing").as_deref(), Some(HELP_HEADING_OPTIONAL));
        assert_eq!(heading_of(&leaf, "billing.card").as_deref(), Some(HELP_HEADING_OPTIONAL));

        assert!(usage.contains("--plan.tier <STRING>"), "{usage}");
        assert!(usage.contains("--owner <JSON_OBJECT>"), "{usage}");
        assert!(usage.contains("--billing.card.number <STRING>"), "{usage}");
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

    /// `-h` shows a one-line form of a flag's prose and `--help` the fuller
    /// text. Before this the same 200-char block was printed in both, so a
    /// request with 40 documented fields made `-h` unusable as a quick scan.
    #[test]
    fn test_flag_help_is_short_in_h_and_full_in_long_help() {
        let mut params = HashMap::new();
        params.insert(
            "threshold".to_string(),
            MethodParameter {
                param_type: Some("string".to_string()),
                description: Some(
                    "Diarization threshold to apply. A higher value means a lower chance of one speaker being split in two, and a higher chance of two speakers being merged into one."
                        .to_string(),
                ),
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
            RestResource { methods, resources: HashMap::new() },
        );
        let doc = RestDescription {
            name: "test-cli".to_string(),
            resources,
            ..Default::default()
        };

        let cmd = build_cli(&doc);
        let arg = cmd
            .find_subcommand("things")
            .and_then(|c| c.find_subcommand("list"))
            .and_then(|c| c.get_arguments().find(|a| a.get_id() == "threshold").cloned())
            .expect("threshold arg missing");
        let short = arg.get_help().expect("short help missing").to_string();
        let long = arg.get_long_help().expect("long help missing").to_string();
        assert_eq!(short, "Diarization threshold to apply.");
        assert!(
            long.len() > short.len() && long.starts_with("Diarization threshold to apply. A higher"),
            "long help should carry the fuller prose; got: {long}",
        );
        assert!(
            long.ends_with("merged into one."),
            "long help should keep the whole description; got: {long}",
        );
    }

    /// A flag whose prose already fits gets no second copy, so `-h` and
    /// `--help` do not print the same block twice.
    #[test]
    fn test_short_flag_help_has_no_redundant_long_help() {
        let mut params = HashMap::new();
        params.insert(
            "id".to_string(),
            MethodParameter {
                param_type: Some("string".to_string()),
                description: Some("Filter by ID.".to_string()),
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
            RestResource { methods, resources: HashMap::new() },
        );
        let doc = RestDescription {
            name: "test-cli".to_string(),
            resources,
            ..Default::default()
        };
        let cmd = build_cli(&doc);
        let arg = cmd
            .find_subcommand("things")
            .and_then(|c| c.find_subcommand("list"))
            .and_then(|c| c.get_arguments().find(|a| a.get_id() == "id").cloned())
            .expect("id arg missing");
        assert_eq!(arg.get_help().map(ToString::to_string).as_deref(), Some("Filter by ID."));
        assert!(arg.get_long_help().is_none());
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

    #[test]
    fn test_tag_description_drives_about_text() {
        let mut doc = make_doc_with_things_resource();
        doc.tag_descriptions.insert(
            "things".to_string(),
            "Manage the things available to your account.".to_string(),
        );
        let cmd = build_cli(&doc);
        let things = cmd
            .find_subcommand("things")
            .expect("things subcommand missing");
        assert_eq!(
            things.get_about().map(|s| s.to_string()).unwrap_or_default(),
            "Manage the things available to your account.",
        );
        assert_eq!(
            things
                .get_long_about()
                .map(|s| s.to_string())
                .unwrap_or_default(),
            "",
        );
    }

    #[test]
    fn test_tag_description_about_is_single_line_and_strips_markdown_links() {
        let mut doc = make_doc_with_things_resource();
        doc.tag_descriptions.insert(
            "things".to_string(),
            "Manage things across\nmultiple lines. See [the API guide](https://example.com/guide)."
                .to_string(),
        );
        let cmd = build_cli(&doc);
        let things = cmd
            .find_subcommand("things")
            .expect("things subcommand missing");
        assert_eq!(
            things.get_about().map(|s| s.to_string()).unwrap_or_default(),
            "Manage things across multiple lines.",
        );
        assert_eq!(
            things
                .get_long_about()
                .map(|s| s.to_string())
                .unwrap_or_default(),
            "Manage things across\nmultiple lines. See [the API guide](https://example.com/guide).",
        );
    }

    #[test]
    fn test_short_about_uses_first_sentence_and_preserves_long_about() {
        let mut doc = make_doc_with_things_resource();
        let description = "This is the first sentence with enough words to exceed the short CLI limit. The full description remains available from the group help.";
        doc.tag_descriptions
            .insert("things".to_string(), description.to_string());
        doc.group_tag_names
            .insert("things".to_string(), vec!["things".to_string()]);
        doc.group_tag_operation_counts.insert(
            "things".to_string(),
            HashMap::from([("things".to_string(), 1)]),
        );
        doc.group_operation_counts.insert("things".to_string(), 1);
        doc.tag_description_order = vec!["things".to_string()];
        doc.resources
            .get_mut("things")
            .expect("things resource missing")
            .methods
            .get_mut("list")
            .expect("list method missing")
            .description = Some(
                "This method's first sentence also has enough words to exceed the short CLI limit. The remaining prose is not shown in the table."
                    .to_string(),
            );

        let cmd = build_cli(&doc);
        let things = cmd
            .find_subcommand("things")
            .expect("things subcommand missing");
        assert_eq!(
            things.get_about().map(|s| s.to_string()).unwrap_or_default(),
            "This is the first sentence with enough words to exceed the short CLI limit.",
        );
        assert_eq!(
            things
                .get_long_about()
                .map(|s| s.to_string())
                .unwrap_or_default(),
            description,
        );
        assert_eq!(
            things
                .find_subcommand("list")
                .and_then(|command| command.get_about())
                .map(ToString::to_string)
                .unwrap_or_default(),
            "This method's first sentence also has enough words to exceed the short CLI…",
        );
    }

    #[test]
    fn test_method_long_about_keeps_prose_the_table_line_drops() {
        let mut doc = make_doc_with_things_resource();
        let description = "This method's first sentence also has enough words to exceed the short CLI limit. The remaining prose is only shown by the method's own help.";
        doc.resources
            .get_mut("things")
            .expect("things resource missing")
            .methods
            .get_mut("list")
            .expect("list method missing")
            .description = Some(description.to_string());

        let cmd = build_cli(&doc);
        let list = cmd
            .find_subcommand("things")
            .and_then(|things| things.find_subcommand("list"))
            .expect("list subcommand missing");
        assert_eq!(
            list.get_about().map(ToString::to_string).unwrap_or_default(),
            "This method's first sentence also has enough words to exceed the short CLI…",
        );
        assert_eq!(
            list.get_long_about()
                .map(ToString::to_string)
                .unwrap_or_default(),
            description,
        );
    }

    /// A description that already fits the table line adds nothing as
    /// `long_about`, so it is left unset rather than rendered twice.
    #[test]
    fn test_method_long_about_omitted_when_it_matches_the_table_line() {
        let mut doc = make_doc_with_things_resource();
        doc.resources
            .get_mut("things")
            .expect("things resource missing")
            .methods
            .get_mut("list")
            .expect("list method missing")
            .description = Some("Lists the things.".to_string());

        let cmd = build_cli(&doc);
        let list = cmd
            .find_subcommand("things")
            .and_then(|things| things.find_subcommand("list"))
            .expect("list subcommand missing");
        assert_eq!(
            list.get_about().map(ToString::to_string).unwrap_or_default(),
            "Lists the things.",
        );
        assert!(list.get_long_about().is_none());
    }

    /// An operation whose spec carries prose apart from its terse summary
    /// shows the summary in the parent's table and the prose under its own
    /// `--help`. Before this, the parser kept only `summary` and the prose
    /// was unreachable anywhere in the CLI.
    #[test]
    fn test_method_long_about_prefers_operation_prose_over_summary() {
        let mut doc = make_doc_with_things_resource();
        {
            let method = doc
                .resources
                .get_mut("things")
                .expect("things resource missing")
                .methods
                .get_mut("list")
                .expect("list method missing");
            method.description = Some("List things".to_string());
            method.long_description = Some(
                "Returns every thing visible to the caller, newest first. Results are paginated."
                    .to_string(),
            );
        }

        let cmd = build_cli(&doc);
        let list = cmd
            .find_subcommand("things")
            .and_then(|things| things.find_subcommand("list"))
            .expect("list subcommand missing");
        assert_eq!(
            list.get_about().map(ToString::to_string).unwrap_or_default(),
            "List things",
        );
        assert_eq!(
            list.get_long_about()
                .map(ToString::to_string)
                .unwrap_or_default(),
            "Returns every thing visible to the caller, newest first. Results are paginated.",
        );
    }

    /// Verbose specs must not flood the terminal: `long_about` stays capped
    /// at [`crate::text::CLI_LONG_DESCRIPTION_LIMIT`].
    #[test]
    fn test_method_long_about_is_capped() {
        let mut doc = make_doc_with_things_resource();
        let description = "Sentence one is long enough to matter here. ".repeat(20);
        doc.resources
            .get_mut("things")
            .expect("things resource missing")
            .methods
            .get_mut("list")
            .expect("list method missing")
            .description = Some(description);

        let cmd = build_cli(&doc);
        let long_about = cmd
            .find_subcommand("things")
            .and_then(|things| things.find_subcommand("list"))
            .and_then(|list| list.get_long_about())
            .map(ToString::to_string)
            .expect("long_about missing");
        assert!(
            long_about.chars().count() <= crate::text::CLI_LONG_DESCRIPTION_LIMIT,
            "long_about was {} chars",
            long_about.chars().count(),
        );
    }

    /// A tag named after the group owns the group's description. When it
    /// carries no prose, a sibling tag's prose must not stand in for it —
    /// that names a subset of the group. Modeled on ElevenLabs' `voices`
    /// group, whose ops carry `voices` (undocumented) and `pvc-voices`.
    #[test]
    fn test_group_name_tag_without_description_blocks_sibling_prose() {
        let mut doc = make_doc_with_things_resource();
        doc.tag_descriptions.insert(
            "pvc-things".to_string(),
            "Create and manage professional clones.".to_string(),
        );
        doc.group_tag_names.insert(
            "things".to_string(),
            vec!["things".to_string(), "pvc-things".to_string()],
        );
        doc.group_tag_operation_counts.insert(
            "things".to_string(),
            HashMap::from([("things".to_string(), 12), ("pvcthings".to_string(), 14)]),
        );
        doc.group_operation_counts.insert("things".to_string(), 27);
        doc.tag_group_names
            .insert("pvcthings".to_string(), vec!["things".to_string()]);
        doc.tag_group_names
            .insert("things".to_string(), vec!["things".to_string()]);
        doc.tag_description_order = vec!["pvc-things".to_string()];

        let cmd = build_cli(&doc);
        assert_eq!(
            cmd.find_subcommand("things")
                .and_then(|command| command.get_about())
                .map(ToString::to_string)
                .as_deref(),
            Some("Operations on 'things'"),
        );
    }

    /// A described tag the group declares less often than another tag
    /// describes part of the group, so it does not get to name the whole
    /// group even when it clears the coverage majority.
    #[test]
    fn test_minority_tag_does_not_describe_the_group() {
        let mut doc = make_doc_with_things_resource();
        doc.tag_descriptions
            .insert("subset".to_string(), "Prose about a subset.".to_string());
        doc.group_tag_names.insert(
            "things".to_string(),
            vec!["primary".to_string(), "subset".to_string()],
        );
        doc.group_tag_operation_counts.insert(
            "things".to_string(),
            HashMap::from([("primary".to_string(), 10), ("subset".to_string(), 6)]),
        );
        doc.group_operation_counts.insert("things".to_string(), 10);
        doc.tag_group_names
            .insert("subset".to_string(), vec!["things".to_string()]);
        doc.tag_group_names
            .insert("primary".to_string(), vec!["things".to_string()]);
        doc.tag_description_order = vec!["subset".to_string()];

        let cmd = build_cli(&doc);
        assert_eq!(
            cmd.find_subcommand("things")
                .and_then(|command| command.get_about())
                .map(ToString::to_string)
                .as_deref(),
            Some("Operations on 'things'"),
        );
    }

    #[test]
    fn test_colon_tag_is_not_borrowed_for_group_help() {
        let mut doc = make_doc_with_things_resource();
        doc.tag_descriptions
            .insert("access-all".to_string(), "Access everything.".to_string());
        doc.group_tag_names.insert(
            "things".to_string(),
            vec!["access:all".to_string()],
        );
        doc.group_tag_operation_counts.insert(
            "things".to_string(),
            HashMap::from([("accessall".to_string(), 1)]),
        );
        doc.group_operation_counts.insert("things".to_string(), 1);
        doc.tag_group_names
            .insert("accessall".to_string(), vec!["things".to_string()]);
        doc.tag_description_order = vec!["access-all".to_string()];

        let cmd = build_cli(&doc);
        assert_eq!(
            cmd.find_subcommand("things")
                .and_then(|command| command.get_about())
                .map(ToString::to_string)
                .as_deref(),
            Some("Operations on 'things'"),
        );
    }

    #[test]
    fn test_exclusive_tag_with_majority_coverage_is_selected() {
        let mut doc = make_doc_with_things_resource();
        doc.tag_descriptions.insert(
            "minority".to_string(),
            "Minority description.".to_string(),
        );
        doc.tag_descriptions.insert(
            "majority".to_string(),
            "Majority description.".to_string(),
        );
        doc.group_tag_names.insert(
            "things".to_string(),
            vec!["minority".to_string(), "majority".to_string()],
        );
        doc.group_tag_operation_counts.insert(
            "things".to_string(),
            HashMap::from([
                ("minority".to_string(), 1),
                ("majority".to_string(), 3),
            ]),
        );
        doc.group_operation_counts.insert("things".to_string(), 4);
        doc.tag_group_names.insert(
            "minority".to_string(),
            vec!["things".to_string()],
        );
        doc.tag_group_names.insert(
            "majority".to_string(),
            vec!["things".to_string()],
        );
        doc.tag_description_order =
            vec!["minority".to_string(), "majority".to_string()];

        let cmd = build_cli(&doc);
        assert_eq!(
            cmd.find_subcommand("things")
                .and_then(|command| command.get_about())
                .map(ToString::to_string)
                .as_deref(),
            Some("Majority description."),
        );
    }

    #[test]
    fn test_nested_resources_do_not_use_root_tag_descriptions() {
        let mut methods = HashMap::new();
        methods.insert(
            "list".to_string(),
            RestMethod {
                http_method: "GET".to_string(),
                path: "/voices".to_string(),
                ..Default::default()
            },
        );
        let mut nested = HashMap::new();
        nested.insert(
            "voices".to_string(),
            RestResource {
                methods,
                resources: HashMap::new(),
            },
        );
        let mut resources = HashMap::new();
        resources.insert(
            "text-to-speech".to_string(),
            RestResource {
                methods: HashMap::new(),
                resources: nested,
            },
        );
        let mut doc = RestDescription {
            name: "test-cli".to_string(),
            resources,
            ..Default::default()
        };
        doc.tag_descriptions.insert(
            "text-to-speech".to_string(),
            "Convert text to speech.".to_string(),
        );
        doc.tag_descriptions.insert(
            "voices".to_string(),
            "Manage voices.".to_string(),
        );

        let cmd = build_cli(&doc);
        let top = cmd
            .find_subcommand("text-to-speech")
            .expect("top-level subcommand missing");
        assert_eq!(
            top.get_about().map(|s| s.to_string()).unwrap_or_default(),
            "Convert text to speech.",
        );
        let nested = top
            .find_subcommand("voices")
            .expect("nested subcommand missing");
        assert_eq!(
            nested.get_about().map(|s| s.to_string()).unwrap_or_default(),
            "Operations on 'voices'",
        );
    }

    #[test]
    fn test_group_summary_still_wins_over_tag_description() {
        let mut doc = make_doc_with_things_resource();
        doc.groups.insert(
            "things".to_string(),
            SdkGroupInfo {
                summary: Some("Things summary".to_string()),
                description: None,
            },
        );
        doc.tag_descriptions.insert(
            "things".to_string(),
            "Description from the OpenAPI tag.".to_string(),
        );
        let cmd = build_cli(&doc);
        let things = cmd
            .find_subcommand("things")
            .expect("things subcommand missing");
        assert_eq!(
            things.get_about().map(|s| s.to_string()).unwrap_or_default(),
            "Things summary",
        );
        assert_eq!(
            things
                .get_long_about()
                .map(|s| s.to_string())
                .unwrap_or_default(),
            "Description from the OpenAPI tag.",
        );
    }

    #[test]
    fn test_name_restating_summary_falls_through_to_tag_description() {
        for summary in ["Things", "T-h_i.n g s", "THINGS"] {
            let mut doc = make_doc_with_things_resource();
            doc.groups.insert(
                "things".to_string(),
                SdkGroupInfo {
                    summary: Some(summary.to_string()),
                    description: None,
                },
            );
            doc.tag_descriptions.insert(
                "things".to_string(),
                "Manage the things available to your account.".to_string(),
            );

            let cmd = build_cli(&doc);
            let things = cmd
                .find_subcommand("things")
                .expect("things subcommand missing");
            assert_eq!(
                things.get_about().map(|s| s.to_string()).unwrap_or_default(),
                "Manage the things available to your account.",
                "summary {summary:?} should fall through to the tag description",
            );
        }
    }

    #[test]
    fn test_name_restating_summary_is_kept_without_tag_description() {
        let mut doc = make_doc_with_things_resource();
        doc.groups.insert(
            "things".to_string(),
            SdkGroupInfo {
                summary: Some("Things".to_string()),
                description: None,
            },
        );
        let cmd = build_cli(&doc);
        let things = cmd
            .find_subcommand("things")
            .expect("things subcommand missing");
        assert_eq!(
            things.get_about().map(|s| s.to_string()).unwrap_or_default(),
            "Things",
        );
    }

    #[test]
    fn test_informative_and_plural_near_match_summaries_are_kept() {
        for summary in ["Things summary", "Thing"] {
            let mut doc = make_doc_with_things_resource();
            doc.groups.insert(
                "things".to_string(),
                SdkGroupInfo {
                    summary: Some(summary.to_string()),
                    description: None,
                },
            );
            doc.tag_descriptions.insert(
                "things".to_string(),
                "Manage the things available to your account.".to_string(),
            );

            let cmd = build_cli(&doc);
            let things = cmd
                .find_subcommand("things")
                .expect("things subcommand missing");
            assert_eq!(
                things.get_about().map(|s| s.to_string()).unwrap_or_default(),
                summary,
                "summary {summary:?} should remain authoritative",
            );
        }
    }

    #[test]
    fn test_long_tag_description_is_truncated_for_about() {
        let mut doc = make_doc_with_things_resource();
        let description = "This is a deliberately long group description that contains enough prose to exceed the CLI help description limit. It has multiple sentences so the about line should stop at a sensible sentence boundary while long_about retains the full original text. The remainder makes the fixture unambiguously longer than the terminal-friendly limit.";
        doc.tag_descriptions
            .insert("things".to_string(), description.to_string());
        let cmd = build_cli(&doc);
        let things = cmd
            .find_subcommand("things")
            .expect("things subcommand missing");
        assert_eq!(
            things.get_about().map(|s| s.to_string()).unwrap_or_default(),
            crate::text::truncate_description(
                &crate::text::first_sentence(description),
                crate::text::CLI_SHORT_DESCRIPTION_LIMIT,
                true
            ),
        );
        assert_eq!(
            things
                .get_long_about()
                .map(|s| s.to_string())
                .unwrap_or_default(),
            description,
        );
    }

    /// `description` alone (no `summary`) used to leave the command table
    /// showing `Operations on '<name>'`, with the prose reachable only from
    /// `--help`. That asymmetry stopped making sense once tag prose could
    /// reach the table: a group with no Fern configuration at all would get
    /// a real table line from its tag while a group whose owner had written
    /// a description explicitly would not. `description` is the more
    /// authoritative of the two, so it now drives the table line as well.
    /// A single-sentence description that already fits needs no `long_about`.
    #[test]
    fn test_group_description_drives_about_and_is_not_repeated_in_long_about() {
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
            "Long-form prose about things.",
        );
        assert!(things.get_long_about().is_none());
    }

    /// Only the first sentence of a configured description reaches the
    /// table; the full prose stays available under `--help`.
    #[test]
    fn test_multi_sentence_group_description_splits_across_about_and_long_about() {
        let description = "Manage the things in your account. Each thing carries its own settings, and deleting one cannot be undone.";
        let mut doc = make_doc_with_things_resource();
        doc.groups.insert(
            "things".to_string(),
            SdkGroupInfo {
                summary: None,
                description: Some(description.to_string()),
            },
        );
        let cmd = build_cli(&doc);
        let things = cmd
            .find_subcommand("things")
            .expect("things subcommand missing");
        assert_eq!(
            things.get_about().map(|s| s.to_string()).unwrap_or_default(),
            "Manage the things in your account.",
        );
        assert_eq!(
            things
                .get_long_about()
                .map(|s| s.to_string())
                .unwrap_or_default(),
            description,
        );
    }

    /// A configured description outranks prose inferred from the spec's
    /// tags, matching the precedence the agent-skill emitter already uses.
    #[test]
    fn test_group_description_outranks_tag_description() {
        let mut doc = make_doc_with_things_resource();
        doc.groups.insert(
            "things".to_string(),
            SdkGroupInfo {
                summary: None,
                description: Some("Configured prose wins.".to_string()),
            },
        );
        doc.tag_descriptions
            .insert("things".to_string(), "Tag prose loses.".to_string());
        let cmd = build_cli(&doc);
        assert_eq!(
            cmd.find_subcommand("things")
                .and_then(|command| command.get_about())
                .map(ToString::to_string)
                .as_deref(),
            Some("Configured prose wins."),
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

    /// Multipart field prose reached `--help` untruncated while every other
    /// parameter was capped, and spec indentation survived into the help
    /// column. Both are now handled like any other flag.
    #[test]
    fn test_multipart_field_help_is_capped_and_whitespace_collapsed() {
        let field = crate::openapi::discovery::MultipartField {
            wire_name: "keyterms".to_string(),
            is_file: false,
            description: Some(
                "A list of keyterms to bias the transcription towards.           The keyterms are words or phrases you want the model to recognise more accurately.           The number of keyterms cannot exceed 1000.           Each keyterm must be under 50 characters."
                    .to_string(),
            ),
            required: false,
            content_type: None,
            repeated: false,
        };
        let arg = build_multipart_field_arg(&field);
        let short = arg.get_help().expect("short help missing").to_string();
        let long = arg.get_long_help().expect("long help missing").to_string();
        assert_eq!(short, "A list of keyterms to bias the transcription towards.");
        assert!(
            !long.contains("  "),
            "spec indentation should be collapsed; got: {long}",
        );
        assert!(
            long.ends_with("Each keyterm must be under 50 characters."),
            "long help should keep the pricing/constraint clauses; got: {long}",
        );
    }

    #[test]
    fn test_repeated_flag_long_help_discloses_both_input_forms() {
        // The value name can only show one form. It used to read
        // `<JSON_ARRAY>`, which at least hinted at the array form; once it
        // correctly shows the element type, nothing on the surface says the
        // flag is repeatable or accepts a whole array. Both work.
        let doc = crate::openapi::discovery::RestDescription {
            resources: HashMap::from([(
                "threads".to_string(),
                crate::openapi::discovery::RestResource {
                    methods: HashMap::from([(
                        "list".to_string(),
                        crate::openapi::discovery::RestMethod {
                            http_method: "GET".to_string(),
                            path: "/threads".to_string(),
                            parameters: HashMap::from([
                                (
                                    "labels".to_string(),
                                    MethodParameter {
                                        param_type: Some("array".to_string()),
                                        item_type: Some("string".to_string()),
                                        location: Some("query".to_string()),
                                        repeated: true,
                                        description: Some("Filter by label.".to_string()),
                                        ..Default::default()
                                    },
                                ),
                                (
                                    "limit".to_string(),
                                    MethodParameter {
                                        param_type: Some("integer".to_string()),
                                        location: Some("query".to_string()),
                                        description: Some("Page size.".to_string()),
                                        ..Default::default()
                                    },
                                ),
                            ]),
                            ..Default::default()
                        },
                    )]),
                    ..Default::default()
                },
            )]),
            ..Default::default()
        };
        let cmd = build_cli(&doc);
        let sub = cmd
            .get_subcommands()
            .find(|c| c.get_name() == "threads")
            .and_then(|c| c.get_subcommands().find(|m| m.get_name() == "list"))
            .expect("threads list");

        let long_help_for = |flag: &str| -> String {
            sub.get_arguments()
                .find(|a| a.get_long() == Some(flag))
                .map(|a| {
                    a.get_long_help()
                        .or_else(|| a.get_help())
                        .map(|h| h.to_string())
                        .unwrap_or_default()
                })
                .unwrap_or_default()
        };

        let labels = long_help_for("labels");
        assert!(labels.contains("Filter by label."), "keeps the description: {labels}");
        assert!(labels.contains("Repeatable"), "must disclose repeatability: {labels}");
        assert!(labels.contains("JSON array"), "must disclose the array form: {labels}");

        // A non-repeated flag gains nothing.
        let limit = long_help_for("limit");
        assert!(!limit.contains("Repeatable"), "not repeatable: {limit}");
    }

    #[test]
    fn test_repeated_flag_value_name_uses_the_element_type() {
        // An array-of-objects flag advertised `<STRING>` in `--help` while
        // `--schema` said `items: {type: object}` and the collector decoded
        // objects — three surfaces, two answers.
        use crate::openapi::discovery::MethodParameter;
        let objects = MethodParameter {
            param_type: Some("string".to_string()),
            item_type: Some("object".to_string()),
            repeated: true,
            location: Some("body".to_string()),
            ..Default::default()
        };
        let strings = MethodParameter {
            param_type: Some("string".to_string()),
            repeated: true,
            location: Some("body".to_string()),
            ..Default::default()
        };
        // A query array: `param_type` is the *container* type, so falling back
        // to it rendered `<JSON_ARRAY>` — an array of arrays — on every
        // string-element query parameter.
        let query_strings = MethodParameter {
            param_type: Some("array".to_string()),
            item_type: Some("string".to_string()),
            repeated: true,
            location: Some("query".to_string()),
            ..Default::default()
        };
        assert_eq!(value_name_for(&objects), "JSON_OBJECT");
        // Body array: `item_type: None` means string — unchanged from before.
        assert_eq!(value_name_for(&strings), "STRING");
        assert_eq!(value_name_for(&query_strings), "STRING");
    }

    #[test]
    fn test_pagination_flags_hidden_without_metadata() {
        // `--page-all` was advertised on every operation. On a spec with no
        // pagination metadata the executor fell back to guessing `pageToken` /
        // `nextPageToken`, so the guess never matched, one request went out,
        // and the command exited 0 with page 1 — silent partial data.
        let method = crate::openapi::discovery::RestMethod::default();
        assert!(
            !method_has_pagination(&method, false),
            "no per-op config and no spec-root defaults means no pager",
        );
        // Spec-root token config is enough — the generic pager can use it.
        assert!(method_has_pagination(&method, true));
    }

    #[test]
    fn test_pagination_flags_shown_with_per_op_config() {
        // A resolved `x-fern-pagination` block on the operation is the other
        // way the pager becomes usable, independent of spec-root defaults.
        let method = crate::openapi::discovery::RestMethod {
            pagination: Some(crate::openapi::discovery::PaginationConfig::Cursor {
                cursor: "cursor".to_string(),
                next_cursor: "next_cursor".to_string(),
                results: "items".to_string(),
            }),
            ..Default::default()
        };
        assert!(method_has_pagination(&method, false));
    }

    #[test]
    fn test_multipart_array_field_flag_is_repeatable() {
        // The reported error was `the argument '--files <PATH|...>' cannot be
        // used multiple times`, which made multi-sample uploads unreachable.
        let field = crate::openapi::discovery::MultipartField {
            wire_name: "files".to_string(),
            is_file: true,
            description: None,
            required: false,
            content_type: None,
            repeated: true,
        };
        let arg = build_multipart_field_arg(&field);
        assert!(
            matches!(arg.get_action(), clap::ArgAction::Append),
            "array multipart field must append, got {:?}",
            arg.get_action(),
        );
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
                        repeated: false,
                    },
                    MultipartField {
                        wire_name: "output".to_string(),
                        is_file: false,
                        description: Some("Collides with builtin --output".to_string()),
                        required: false,
                        content_type: None,
                        repeated: false,
                    },
                    MultipartField {
                        wire_name: "file".to_string(),
                        is_file: true,
                        description: Some("No collision".to_string()),
                        required: true,
                        content_type: Some("application/octet-stream".to_string()),
                        repeated: false,
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
