//! Deterministic SKILL.md generator for OpenAPI-driven CLIs.
//!
//! Walks the parsed [`RestDescription`] and emits one markdown file per
//! top-level command group plus a shared file containing auth setup and
//! global flags. All output is fully deterministic — pure Rust string
//! templates over spec data, no LLM, no hand-written overlay files.
//!
//! Public surface: [`generate_skills`] — a pure function returning
//! `(PathBuf, String)` pairs. The caller is responsible for filesystem
//! writes.

use std::fmt::Write as FmtWrite;
use std::path::PathBuf;

use clap::{Arg, Command};

use crate::auth::{AuthCredentialSource, SchemeBinding};
use crate::openapi::commands::group_tag_description_for_group;
use crate::openapi::discovery::{RestDescription, RestResource, SecurityScheme};
use crate::text;

/// Maximum characters for the frontmatter `description` field.
const FRONTMATTER_DESC_LIMIT: usize = 120;

/// Returns the clap `Command` for `generate-skills` so it appears in
/// `--help`, shell completions, and man pages.
pub fn generate_skills_command() -> Command {
    Command::new("generate-skills")
        .about("Generate SKILL.md files for AI agent integration")
        .arg(
            Arg::new("output-dir")
                .long("output-dir")
                .value_name("PATH")
                .help("Output directory [default: skills]"),
        )
}

/// Generates all SKILL.md files for the given binary.
///
/// Returns a list of `(relative_path, content)` pairs. The caller writes
/// them under whatever output directory was requested.
pub fn generate_skills(
    doc: &RestDescription,
    bin_name: &str,
    auth_bindings: &[(String, SchemeBinding)],
    auth_strategy: crate::auth::AuthStrategy,
) -> Vec<(PathBuf, String)> {
    let mut files: Vec<(PathBuf, String)> = Vec::new();

    // Shared skill
    let shared_path = PathBuf::from(format!("{bin_name}-shared")).join("SKILL.md");
    let shared_content = render_shared_skill(doc, bin_name, auth_bindings, auth_strategy);
    files.push((shared_path, shared_content));

    // Per-group skills — sorted for deterministic output
    let mut group_names: Vec<&String> = doc.resources.keys().collect();
    group_names.sort();
    for group_name in group_names {
        let resource = &doc.resources[group_name];
        let group_path = PathBuf::from(format!("{bin_name}-{group_name}")).join("SKILL.md");
        let group_content = render_group_skill(doc, bin_name, group_name, resource);
        files.push((group_path, group_content));
    }

    files
}

// ---------------------------------------------------------------------------
// Shared skill
// ---------------------------------------------------------------------------

fn render_shared_skill(
    doc: &RestDescription,
    bin_name: &str,
    auth_bindings: &[(String, SchemeBinding)],
    auth_strategy: crate::auth::AuthStrategy,
) -> String {
    let mut out = String::new();

    // Frontmatter
    let desc = format!(
        "{bin_name} CLI: Shared patterns for authentication, global flags, and output formatting."
    );
    write_frontmatter(&mut out, &format!("{bin_name}-shared"), &desc);

    // Title
    let _ = writeln!(out, "# {bin_name} — Shared Reference\n");

    // Auth section
    let _ = writeln!(out, "## Authentication\n");
    if auth_bindings.is_empty() && doc.security_schemes.is_empty() {
        let _ = writeln!(out, "No authentication configured.\n");
    } else {
        render_auth_section(&mut out, doc, bin_name, auth_bindings, auth_strategy);
    }

    // Global + commonly-used flags.
    //
    // This table groups every flag an agent is likely to need into one
    // place — both the *harness* globals (available on every op:
    // `--schema`, `--dry-run`, `--format`, `--base-url`, `--quiet`) and
    // *per-op* affordances added only when the spec supports them
    // (`--page-all`, `--output`, `--params`, `--json`, etc.). The JSON
    // `--schema` flag distinguishes the two via `globalFlags` vs
    // per-op capability hints (`paginable`, `binaryResponse`); this
    // SKILL.md table is for the human reader who just wants the
    // affordance list. See ADR-0006 for the JSON contract.
    // Which per-op affordances this API actually has. Advertising a flag the
    // spec can never produce is worse than omitting it: the reported CLI
    // documented `-o, --output` on an API with no binary responses (0 of 130
    // operations accepted it) and pointed agents at `paginable` /
    // `binaryResponse` hints that `--schema` never emits for such a spec, so
    // step one of the prerequisite file was unfollowable.
    let has_binary_response = doc_has_binary_response(doc);
    let has_pagination = doc_has_pagination(doc);

    let _ = writeln!(out, "## Global Flags\n");
    let mut affordances: Vec<&str> = Vec::new();
    if has_pagination {
        affordances.push("`--page-all`");
    }
    if has_binary_response {
        affordances.push("`--output`");
    }
    if affordances.is_empty() {
        let _ = writeln!(
            out,
            "These flags are available on every command in this CLI.\n"
        );
    } else {
        let hints = match (has_pagination, has_binary_response) {
            (true, true) => "`paginable` / `binaryResponse` hints",
            (true, false) => "`paginable` hint",
            (false, true) => "`binaryResponse` hint",
            (false, false) => unreachable!("affordances is non-empty"),
        };
        let _ = writeln!(
            out,
            "These flags appear across the CLI. The harness-level ones (`--dry-run`, \
             `--format`, `--base-url`, `--quiet`) are available on every command; \
             {} surface{} only on operations whose spec supports the affordance — \
             check the per-op `--schema` output's {hints} to know which ops carry \
             them.\n",
            affordances.join(" and "),
            if affordances.len() == 1 { "s" } else { "" },
        );
    }
    let _ = writeln!(out, "| Flag | Description | Default |");
    let _ = writeln!(out, "|------|-------------|---------|");
    let _ = writeln!(
        out,
        "| `--dry-run` | Validate locally without sending the request | |"
    );
    let _ = writeln!(
        out,
        "| `--format <FMT>` | Output format: `json`, `table`, `yaml`, `csv`, `raw`, `jsonl`, `http` | `table` on a TTY, `json` when piped |"
    );
    let _ = writeln!(
        out,
        "| `--base-url <URL>` | Override the API base URL | |"
    );
    let _ = writeln!(
        out,
        "| `--params <JSON>` | URL/query/path parameters as JSON | |"
    );
    let _ = writeln!(
        out,
        "| `--json <JSON>` | Request body for POST/PATCH/PUT | |"
    );
    // `--output` is registered only on operations with a binary response, and
    // the pagination flags only where the spec says how to page. Emitting
    // either row unconditionally documented a flag the parser rejects. The
    // `ffplay -` / `aplay -` examples were also audio-API boilerplate; the
    // description is now media-agnostic.
    if has_binary_response {
        let _ = writeln!(
            out,
            "| `-o, --output <PATH>` | Write a binary response to a file; `-` streams the bytes to stdout for piping. Only on operations that return binary. | |"
        );
    }
    if has_pagination {
        let _ = writeln!(
            out,
            "| `--page-all` | Auto-paginate (NDJSON). Only on paginable operations. | off |"
        );
        let _ = writeln!(
            out,
            "| `--page-limit <N>` | Max pages to fetch | `10` |"
        );
        let _ = writeln!(
            out,
            "| `--page-delay <MS>` | Delay between page fetches | `100` |"
        );
        let _ = writeln!(
            out,
            "| `--no-pager` | Disable pager even on interactive terminals | |"
        );
    }
    let _ = writeln!(
        out,
        "| `--no-retry` | Disable retries | |"
    );
    let _ = writeln!(
        out,
        "| `--no-extract` | Print the full response body | |"
    );
    let _ = writeln!(out);

    // Output formatting tips
    let _ = writeln!(out, "## Output Formatting\n");
    let _ = writeln!(out, "```bash");
    let _ = writeln!(out, "# JSON (default)");
    let _ = writeln!(out, "{bin_name} <resource> <method> --format json\n");
    let _ = writeln!(out, "# Table view");
    let _ = writeln!(out, "{bin_name} <resource> <method> --format table\n");
    let _ = writeln!(out, "# Pipe-friendly: jq, grep, etc.");
    let _ = writeln!(
        out,
        "{bin_name} <resource> <method> | jq '.fieldName'"
    );
    let _ = writeln!(out, "```\n");

    // Dry-run section
    let _ = writeln!(out, "## Dry Run\n");
    let _ = writeln!(
        out,
        "Use `--dry-run` to preview the HTTP request without sending it:\n"
    );
    let _ = writeln!(out, "```bash");
    let _ = writeln!(out, "{bin_name} <resource> <method> --dry-run");
    let _ = writeln!(out, "```\n");

    out
}

/// True when any operation in the spec returns a binary response, so
/// `--output` exists somewhere in the CLI.
fn doc_has_binary_response(doc: &RestDescription) -> bool {
    any_method(doc, &|m| m.has_binary_response)
}

/// True when any operation is paginable, so the pagination flags exist
/// somewhere in the CLI. Mirrors `commands::method_has_pagination`.
fn doc_has_pagination(doc: &RestDescription) -> bool {
    if doc.pagination_token_query_param.is_some() || doc.pagination_token_response_path.is_some() {
        return true;
    }
    any_method(doc, &|m| m.pagination.is_some())
}

/// Walk every method in the resource tree until `predicate` holds.
fn any_method(
    doc: &RestDescription,
    predicate: &dyn Fn(&crate::openapi::discovery::RestMethod) -> bool,
) -> bool {
    fn walk(
        resources: &std::collections::HashMap<String, crate::openapi::discovery::RestResource>,
        predicate: &dyn Fn(&crate::openapi::discovery::RestMethod) -> bool,
    ) -> bool {
        resources.values().any(|resource| {
            resource.methods.values().any(predicate) || walk(&resource.resources, predicate)
        })
    }
    walk(&doc.resources, predicate)
}

fn render_auth_section(
    out: &mut String,
    doc: &RestDescription,
    bin_name: &str,
    auth_bindings: &[(String, SchemeBinding)],
    auth_strategy: crate::auth::AuthStrategy,
) {
    if !auth_bindings.is_empty() {
        for (scheme_name, binding) in auth_bindings {
            let scheme_type = doc
                .security_schemes
                .get(scheme_name)
                .map(describe_scheme_type)
                .unwrap_or_else(|| "bearer".to_string());

            let source_desc = describe_binding_source(binding);
            let _ = writeln!(
                out,
                "- **{scheme_name}** ({scheme_type}): {source_desc}"
            );
        }
        let _ = writeln!(out);

        // Emit setup instructions based on binding sources.
        let env_vars = collect_env_vars(auth_bindings);
        if !env_vars.is_empty() {
            // Multiple schemes are alternatives unless the strategy is `All`:
            // `Any` tries each in turn, and `Auto` resolves to `Any` or
            // `Routing`, both of which apply one scheme per request. Telling an
            // agent to export every variable was actively harmful — it is the
            // shadowing scenario the CLI's own auth errors warn about, and on a
            // two-scheme API it guaranteed the agent set up the ambiguity.
            let all_required = matches!(auth_strategy, crate::auth::AuthStrategy::All);
            if env_vars.len() > 1 && !all_required {
                let _ = writeln!(
                    out,
                    "These are alternative schemes for the same request — set **one** of:\n"
                );
            } else {
                let _ = writeln!(out, "Set the required environment variable(s):\n");
            }
            let _ = writeln!(out, "```bash");
            for var in &env_vars {
                let _ = writeln!(out, "export {var}=\"<your-token>\"");
            }
            let _ = writeln!(out, "```\n");

            // `--help` reads no credentials and contacts nothing, so it
            // verified nothing — an agent following this step got a pass
            // signal from an unauthenticated CLI. `auth status` is the
            // credential-resolution report and is grafted onto every Fern CLI
            // (ADR-0007 § always-graft), so it is always a valid instruction.
            let _ = writeln!(out, "Verify authentication resolves:\n");
            let _ = writeln!(out, "```bash");
            let _ = writeln!(out, "{bin_name} auth status");
            let _ = writeln!(out, "```\n");
        }
    } else {
        // Fall back to security schemes from spec
        let mut schemes: Vec<(&String, &SecurityScheme)> = doc.security_schemes.iter().collect();
        schemes.sort_by_key(|(name, _)| *name);
        for (name, scheme) in &schemes {
            let _ = writeln!(out, "- **{name}** ({})", describe_scheme_type(scheme));
        }
        let _ = writeln!(out);
    }
}

fn describe_scheme_type(scheme: &SecurityScheme) -> String {
    match scheme {
        SecurityScheme::HttpBearer => "bearer token".to_string(),
        SecurityScheme::HttpBasic => "HTTP basic auth".to_string(),
        SecurityScheme::ApiKeyHeader { name } => format!("API key in `{name}` header"),
        SecurityScheme::ApiKeyQuery { name } => format!("API key in `{name}` query param"),
        SecurityScheme::OAuth2 => "OAuth2 bearer token".to_string(),
        SecurityScheme::Other(ty) => ty.clone(),
    }
}

fn describe_binding_source(binding: &SchemeBinding) -> String {
    match binding {
        SchemeBinding::Token(src) => describe_credential_source(src),
        SchemeBinding::Basic { username, password } => {
            format!(
                "HTTP basic — username: {}, password: {}",
                describe_credential_source(username),
                describe_credential_source(password),
            )
        }
        SchemeBinding::Custom(_) => "custom auth provider".to_string(),
    }
}

fn describe_credential_source(src: &AuthCredentialSource) -> String {
    match src {
        AuthCredentialSource::Env(name) => format!("`{name}` env var"),
        AuthCredentialSource::Cli(arg) => format!("`--{arg}` flag"),
        AuthCredentialSource::File(path) => format!("`{}` file", path.display()),
        AuthCredentialSource::Literal(_) => "built-in literal".to_string(),
        AuthCredentialSource::Closure(_, Some(hint)) => hint.clone(),
        AuthCredentialSource::Closure(_, None) => "custom resolver".to_string(),
        AuthCredentialSource::Chain(sources) => sources
            .iter()
            .map(describe_credential_source)
            .collect::<Vec<_>>()
            .join(" or "),
        AuthCredentialSource::Keyring { service, account } => {
            format!("keyring `{service}:{account}` (populated by `auth login`)")
        }
        AuthCredentialSource::KeyringField {
            service,
            account,
            field,
        } => format!("`{field}` in keyring `{service}:{account}` (populated by `auth login`)"),
        AuthCredentialSource::Missing => "(unbound)".to_string(),
    }
}

fn collect_env_vars(bindings: &[(String, SchemeBinding)]) -> Vec<String> {
    let mut vars = Vec::new();
    for (_, binding) in bindings {
        collect_env_vars_from_binding(binding, &mut vars);
    }
    vars
}

fn collect_env_vars_from_binding(binding: &SchemeBinding, out: &mut Vec<String>) {
    match binding {
        SchemeBinding::Token(src) => collect_env_vars_from_source(src, out),
        SchemeBinding::Basic { username, password } => {
            collect_env_vars_from_source(username, out);
            collect_env_vars_from_source(password, out);
        }
        SchemeBinding::Custom(_) => {}
    }
}

fn collect_env_vars_from_source(src: &AuthCredentialSource, out: &mut Vec<String>) {
    match src {
        AuthCredentialSource::Env(name) if !out.contains(name) => {
            out.push(name.clone());
        }
        AuthCredentialSource::Chain(sources) => {
            for s in sources {
                collect_env_vars_from_source(s, out);
            }
        }
        _ => {}
    }
}

// ---------------------------------------------------------------------------
// Per-group skill
// ---------------------------------------------------------------------------

fn render_group_skill(
    doc: &RestDescription,
    bin_name: &str,
    group_name: &str,
    resource: &RestResource,
) -> String {
    let mut out = String::new();

    // Frontmatter
    let skill_name = format!("{bin_name}-{group_name}");
    let group_desc = group_description(doc, group_name);
    let frontmatter_desc = text::truncate_description(&group_desc, FRONTMATTER_DESC_LIMIT, true);
    write_frontmatter(&mut out, &skill_name, &frontmatter_desc);

    // Title
    let _ = writeln!(out, "# {group_name}\n");

    // Prerequisite
    let _ = writeln!(
        out,
        "> **PREREQUISITE:** Read `../{bin_name}-shared/SKILL.md` for auth, \
         global flags, and output formatting. If missing, run \
         `{bin_name} generate-skills` to create it.\n"
    );

    // Syntax
    let _ = writeln!(out, "```bash");
    let _ = writeln!(out, "{bin_name} {group_name} <method> [flags]");
    let _ = writeln!(out, "```\n");

    // API Resources tree
    let _ = writeln!(out, "## API Resources\n");
    render_resource_tree(&mut out, resource, 0);

    // Discovering Commands
    let _ = writeln!(out, "## Discovering Commands\n");
    let _ = writeln!(
        out,
        "**Agents: always prefer `--schema` over `--help`** — `--schema` returns \
         JSON; `--help` returns human prose.\n"
    );
    let _ = writeln!(out, "```bash");
    let _ = writeln!(out, "# Machine-readable surface (use this)");
    let _ = writeln!(out, "{bin_name} {group_name} --schema");
    let _ = writeln!(out, "{bin_name} {group_name} <method> --schema\n");
    let _ = writeln!(out, "# Human-readable help (for humans)");
    let _ = writeln!(out, "{bin_name} {group_name} --help");
    let _ = writeln!(out, "```\n");

    out
}

fn group_description(doc: &RestDescription, group_name: &str) -> String {
    let tag_description = group_tag_description_for_group(
        group_name,
        doc.group_tag_names.get(group_name).map(Vec::as_slice),
        &doc.tag_descriptions,
        doc.group_tag_operation_counts.get(group_name),
        doc.group_operation_counts.get(group_name).copied(),
        &doc.tag_group_names,
        &doc.tag_description_order,
    )
    .filter(|description| !description.is_empty());

    if let Some(summary) = doc
        .groups
        .get(group_name)
        .and_then(|info| info.summary.as_deref())
        .filter(|summary| !summary.is_empty())
    {
        if !text::is_name_restating(summary, group_name) || tag_description.is_none() {
            return summary.to_string();
        }
    }

    if let Some(description) = doc
        .groups
        .get(group_name)
        .and_then(|info| info.description.as_deref())
        .filter(|description| !description.is_empty())
    {
        return text::first_sentence(description);
    }

    if let Some(description) = tag_description {
        return description;
    }

    // Fall back to spec title/description
    if let Some(ref title) = doc.title {
        return format!("{title}: Operations on {group_name}");
    }
    format!("Operations on {group_name}")
}

fn render_resource_tree(out: &mut String, resource: &RestResource, depth: usize) {
    // Render methods at this level — sorted
    let mut method_names: Vec<&String> = resource.methods.keys().collect();
    method_names.sort();
    for method_name in method_names {
        let method = &resource.methods[method_name];
        let desc = method
            .description
            .as_deref()
            .map(|d| text::truncate_description(d, text::CLI_DESCRIPTION_LIMIT, false))
            .unwrap_or_default();
        if desc.is_empty() {
            let _ = writeln!(out, " - `{method_name}`");
        } else {
            let _ = writeln!(out, " - `{method_name}` — {desc}");
        }
    }

    // Render sub-resources — sorted, with heading
    let mut sub_names: Vec<&String> = resource.resources.keys().collect();
    sub_names.sort();
    for sub_name in sub_names {
        let sub = &resource.resources[sub_name];
        let heading_level = "#".repeat((3 + depth).min(6));
        let _ = writeln!(out, "\n{heading_level} {sub_name}\n");
        render_resource_tree(out, sub, depth + 1);
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn write_frontmatter(out: &mut String, name: &str, description: &str) {
    let _ = writeln!(out, "---");
    let _ = writeln!(out, "name: \"{}\"", escape_yaml_string(name));
    let _ = writeln!(out, "description: \"{}\"", escape_yaml_string(description));
    let _ = writeln!(out, "---\n");
}

fn escape_yaml_string(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t")
}

/// Placeholder value for a method parameter, derived from format or type.
pub fn example_placeholder(param: &crate::openapi::discovery::MethodParameter) -> String {
    // Check format first
    if let Some(ref fmt) = param.format {
        match fmt.as_str() {
            "email" => return "user@example.com".to_string(),
            "uri" | "url" => return "https://example.com".to_string(),
            "uuid" => return "<UUID>".to_string(),
            "date" => return "2024-01-01".to_string(),
            "date-time" => return "2024-01-01T00:00:00Z".to_string(),
            "int32" | "int64" => return "42".to_string(),
            "float" | "double" => return "3.14".to_string(),
            _ => {}
        }
    }

    // Fall back to type
    match param.param_type.as_deref() {
        Some("integer") => "42".to_string(),
        Some("number") => "3.14".to_string(),
        Some("boolean") => "true".to_string(),
        Some("array") => "[]".to_string(),
        Some("object") => "{}".to_string(),
        _ => "<VALUE>".to_string(),
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use crate::openapi::discovery::{
        MethodParameter, RestDescription, RestMethod, RestResource, SdkGroupInfo,
    };

    fn minimal_doc() -> RestDescription {
        let mut resources = HashMap::new();
        let mut methods = HashMap::new();
        methods.insert(
            "list".to_string(),
            RestMethod {
                description: Some("List all items.".to_string()),
                http_method: "GET".to_string(),
                path: "/items".to_string(),
                ..Default::default()
            },
        );
        methods.insert(
            "get".to_string(),
            RestMethod {
                description: Some("Get a single item by ID.".to_string()),
                http_method: "GET".to_string(),
                path: "/items/{id}".to_string(),
                ..Default::default()
            },
        );
        resources.insert(
            "items".to_string(),
            RestResource {
                methods,
                resources: HashMap::new(),
            },
        );
        RestDescription {
            name: "test-api".to_string(),
            title: Some("Test API".to_string()),
            resources,
            ..Default::default()
        }
    }

    fn bindings_for(env_var: &str) -> Vec<(String, SchemeBinding)> {
        vec![(
            "bearerAuth".to_string(),
            SchemeBinding::Token(AuthCredentialSource::Env(env_var.to_string())),
        )]
    }

    #[test]
    fn generates_shared_and_group_files() {
        let doc = minimal_doc();
        let files = generate_skills(&doc, "testcli", &bindings_for("TEST_API_KEY"), crate::auth::AuthStrategy::default());
        let names: Vec<String> = files.iter().map(|(p, _)| p.display().to_string()).collect();
        assert!(names.contains(&"testcli-shared/SKILL.md".to_string()));
        assert!(names.contains(&"testcli-items/SKILL.md".to_string()));
        assert_eq!(files.len(), 2);
    }

    #[test]
    fn shared_skill_has_valid_frontmatter() {
        let doc = minimal_doc();
        let files = generate_skills(&doc, "testcli", &bindings_for("TEST_API_KEY"), crate::auth::AuthStrategy::default());
        let shared = &files[0].1;
        assert!(shared.starts_with("---\n"));
        assert!(shared.contains("name: \"testcli-shared\""));
        assert!(shared.contains("description: \""));
        // Verify closing frontmatter
        let second_fence = shared[4..].find("---").unwrap() + 4;
        assert!(second_fence > 4);
    }

    #[test]
    fn group_skill_has_valid_frontmatter() {
        let doc = minimal_doc();
        let files = generate_skills(&doc, "testcli", &bindings_for("TEST_API_KEY"), crate::auth::AuthStrategy::default());
        let group = &files[1].1;
        assert!(group.starts_with("---\n"));
        assert!(group.contains("name: \"testcli-items\""));
        assert!(group.contains("description: \""));
    }

    #[test]
    fn shared_skill_contains_auth_section() {
        let doc = minimal_doc();
        let files = generate_skills(&doc, "testcli", &bindings_for("TEST_API_KEY"), crate::auth::AuthStrategy::default());
        let shared = &files[0].1;
        assert!(shared.contains("## Authentication"));
        assert!(shared.contains("TEST_API_KEY"));
        assert!(shared.contains("bearerAuth"));
    }

    #[test]
    fn shared_skill_contains_global_flags() {
        let doc = minimal_doc();
        let files = generate_skills(&doc, "testcli", &[], crate::auth::AuthStrategy::default());
        let shared = &files[0].1;
        assert!(shared.contains("## Global Flags"));
        assert!(shared.contains("--dry-run"));
        assert!(shared.contains("--format"));
        // The `--format` default is TTY-dependent; advertising `json` was
        // simply wrong (subcommand `--help` has always stated it correctly).
        assert!(
            shared.contains("`table` on a TTY, `json` when piped"),
            "shared skill must state the real --format default: {shared}",
        );
    }

    /// Per-op flags must not be advertised on an API that cannot produce them.
    ///
    /// The reported prerequisite file documented `-o, --output` on an API with
    /// no binary responses — 0 of 130 operations accepted it and the parser
    /// rejected it — and pointed agents at `--schema` hints that never appear
    /// for such a spec. Step one of the file was therefore unfollowable.
    #[test]
    fn shared_skill_omits_per_op_flags_the_spec_cannot_produce() {
        let doc = minimal_doc();
        assert!(!doc_has_pagination(&doc));
        assert!(!doc_has_binary_response(&doc));

        let files = generate_skills(&doc, "testcli", &[], crate::auth::AuthStrategy::default());
        let shared = &files[0].1;
        for absent in ["--page-all", "--page-limit", "--page-delay", "--no-pager", "--output"] {
            assert!(
                !shared.contains(absent),
                "{absent} must not be advertised on a spec that never registers it: {shared}",
            );
        }
        // …and neither should the hints that only exist alongside them.
        assert!(!shared.contains("paginable"));
        assert!(!shared.contains("binaryResponse"));
        assert!(
            shared.contains("available on every command in this CLI"),
            "with no per-op affordances the paragraph should say so: {shared}",
        );
    }

    /// The other direction: a paginable / binary-returning API still gets both
    /// the rows and the `--schema` hint pointer.
    #[test]
    fn shared_skill_advertises_per_op_flags_when_the_spec_has_them() {
        let mut doc = minimal_doc();
        doc.pagination_token_query_param = Some("pageToken".to_string());
        if let Some(resource) = doc.resources.get_mut("items") {
            if let Some(method) = resource.methods.get_mut("list") {
                method.has_binary_response = true;
            }
        }

        let files = generate_skills(&doc, "testcli", &[], crate::auth::AuthStrategy::default());
        let shared = &files[0].1;
        assert!(shared.contains("--page-all"));
        assert!(shared.contains("--output"));
        assert!(shared.contains("`paginable` / `binaryResponse` hints"));
    }

    /// Multiple schemes are alternatives unless the strategy is `All`. Telling
    /// an agent to export every variable set up the exact shadowing the CLI's
    /// own auth errors warn about.
    #[test]
    fn shared_skill_says_set_one_of_for_alternative_schemes() {
        let doc = minimal_doc();
        let bindings = vec![
            ("BearerAuth".to_string(), bindings_for("API_KEY")[0].1.clone()),
            ("TokenAuth".to_string(), bindings_for("TOKEN")[0].1.clone()),
        ];

        let any = generate_skills(&doc, "testcli", &bindings, crate::auth::AuthStrategy::Any);
        assert!(
            any[0].1.contains("set **one** of"),
            "alternative schemes must not tell the agent to export both: {}",
            any[0].1,
        );

        let all = generate_skills(&doc, "testcli", &bindings, crate::auth::AuthStrategy::All);
        assert!(
            all[0].1.contains("Set the required environment variable(s)"),
            "an `All` strategy genuinely needs every variable: {}",
            all[0].1,
        );
    }

    #[test]
    fn group_skill_lists_methods() {
        let doc = minimal_doc();
        let files = generate_skills(&doc, "testcli", &[], crate::auth::AuthStrategy::default());
        let group = &files[1].1;
        assert!(group.contains("`get`"));
        assert!(group.contains("`list`"));
        assert!(group.contains("List all items."));
    }

    #[test]
    fn group_skill_has_prerequisite_link() {
        let doc = minimal_doc();
        let files = generate_skills(&doc, "testcli", &[], crate::auth::AuthStrategy::default());
        let group = &files[1].1;
        assert!(group.contains("testcli-shared/SKILL.md"));
        assert!(group.contains("testcli generate-skills"));
    }

    #[test]
    fn group_skill_has_discovering_commands() {
        let doc = minimal_doc();
        let files = generate_skills(&doc, "testcli", &[], crate::auth::AuthStrategy::default());
        let group = &files[1].1;
        assert!(group.contains("## Discovering Commands"));
        assert!(group.contains("testcli items --help"));
        assert!(group.contains("testcli items --schema"));
    }

    #[test]
    fn example_placeholder_format_driven() {
        let email_param = MethodParameter {
            format: Some("email".to_string()),
            ..Default::default()
        };
        assert_eq!(example_placeholder(&email_param), "user@example.com");

        let uuid_param = MethodParameter {
            format: Some("uuid".to_string()),
            ..Default::default()
        };
        assert_eq!(example_placeholder(&uuid_param), "<UUID>");

        let int_param = MethodParameter {
            format: Some("int64".to_string()),
            ..Default::default()
        };
        assert_eq!(example_placeholder(&int_param), "42");
    }

    #[test]
    fn example_placeholder_type_driven() {
        let int_param = MethodParameter {
            param_type: Some("integer".to_string()),
            ..Default::default()
        };
        assert_eq!(example_placeholder(&int_param), "42");

        let bool_param = MethodParameter {
            param_type: Some("boolean".to_string()),
            ..Default::default()
        };
        assert_eq!(example_placeholder(&bool_param), "true");

        let string_param = MethodParameter {
            param_type: Some("string".to_string()),
            ..Default::default()
        };
        assert_eq!(example_placeholder(&string_param), "<VALUE>");
    }

    #[test]
    fn example_placeholder_missing_fields() {
        let empty = MethodParameter::default();
        assert_eq!(example_placeholder(&empty), "<VALUE>");
    }

    #[test]
    fn multi_level_resource_nesting() {
        let mut inner_methods = HashMap::new();
        inner_methods.insert(
            "read".to_string(),
            RestMethod {
                description: Some("Read nested item.".to_string()),
                ..Default::default()
            },
        );

        let mut sub_resources = HashMap::new();
        sub_resources.insert(
            "nested".to_string(),
            RestResource {
                methods: inner_methods,
                resources: HashMap::new(),
            },
        );

        let mut top_methods = HashMap::new();
        top_methods.insert(
            "list".to_string(),
            RestMethod {
                description: Some("List things.".to_string()),
                ..Default::default()
            },
        );

        let mut resources = HashMap::new();
        resources.insert(
            "things".to_string(),
            RestResource {
                methods: top_methods,
                resources: sub_resources,
            },
        );

        let doc = RestDescription {
            name: "api".to_string(),
            resources,
            ..Default::default()
        };

        let files = generate_skills(&doc, "cli", &[], crate::auth::AuthStrategy::default());
        let group = &files[1].1;
        assert!(group.contains("`list`"));
        assert!(group.contains("### nested"));
        assert!(group.contains("`read`"));
    }

    #[test]
    fn empty_resources_produces_only_shared() {
        let doc = RestDescription {
            name: "empty".to_string(),
            ..Default::default()
        };
        let files = generate_skills(&doc, "empty", &[], crate::auth::AuthStrategy::default());
        assert_eq!(files.len(), 1);
        assert!(files[0].0.display().to_string().contains("shared"));
    }

    #[test]
    fn deterministic_output_across_calls() {
        let doc = minimal_doc();
        let bindings = bindings_for("KEY");
        let a = generate_skills(&doc, "test", &bindings, crate::auth::AuthStrategy::default());
        let b = generate_skills(&doc, "test", &bindings, crate::auth::AuthStrategy::default());
        assert_eq!(a.len(), b.len());
        for (fa, fb) in a.iter().zip(b.iter()) {
            assert_eq!(fa.0, fb.0);
            assert_eq!(fa.1, fb.1);
        }
    }

    #[test]
    fn tag_description_drives_group_skill_description() {
        let mut doc = minimal_doc();
        doc.tag_descriptions.insert(
            "items".to_string(),
            "Manage the items available to your account.".to_string(),
        );
        let files = generate_skills(&doc, "test", &[], crate::auth::AuthStrategy::default());
        assert!(files[1]
            .1
            .contains("description: \"Manage the items available to your account.\""));
    }

    #[test]
    fn name_restating_summary_falls_through_to_tag_description() {
        let mut doc = minimal_doc();
        doc.groups.insert(
            "items".to_string(),
            SdkGroupInfo {
                summary: Some("Items".to_string()),
                ..Default::default()
            },
        );
        doc.tag_descriptions.insert(
            "items".to_string(),
            "Manage the items available to your account.".to_string(),
        );

        let files = generate_skills(&doc, "test", &[], crate::auth::AuthStrategy::default());
        assert!(files[1]
            .1
            .contains("description: \"Manage the items available to your account.\""));
        assert!(!files[1].1.contains("description: \"Items\""));
    }

    #[test]
    fn group_description_wins_over_tag_description_when_summary_is_absent() {
        let mut doc = minimal_doc();
        doc.groups.insert(
            "items".to_string(),
            SdkGroupInfo {
                description: Some(
                    "Manage item inventory across every connected account. This is extended prose."
                        .to_string(),
                ),
                ..Default::default()
            },
        );
        doc.tag_descriptions.insert(
            "items".to_string(),
            "Items exposed by the API.".to_string(),
        );

        let files = generate_skills(&doc, "test", &[], crate::auth::AuthStrategy::default());
        assert!(files[1]
            .1
            .contains("description: \"Manage item inventory across every connected account.\""));
        assert!(!files[1]
            .1
            .contains("description: \"Items exposed by the API.\""));
    }

    #[test]
    fn frontmatter_description_escapes_quotes() {
        let mut resources = HashMap::new();
        let mut methods = HashMap::new();
        methods.insert(
            "get".to_string(),
            RestMethod::default(),
        );
        resources.insert(
            "test".to_string(),
            RestResource {
                methods,
                resources: HashMap::new(),
            },
        );

        let doc = RestDescription {
            name: "api".to_string(),
            title: Some("API with \"quotes\"".to_string()),
            resources,
            ..Default::default()
        };
        let files = generate_skills(&doc, "cli", &[], crate::auth::AuthStrategy::default());
        let group = &files[1].1;
        assert!(group.contains("\\\"quotes\\\""));
    }
}
