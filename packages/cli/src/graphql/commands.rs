//! CLI Command Builder
//!
//! Builds a dynamic `clap::Command` tree from the internal API representation.

use clap::builder::PossibleValuesParser;
use clap::{Arg, Command};

use crate::cli_args::{HELP_HEADING_OPTIONAL, HELP_HEADING_REQUEST, HELP_HEADING_REQUIRED};
use crate::graphql::discovery::{
    GraphQLSchema as RestDescription, GraphQLResource as RestResource, MethodParameter,
};
use crate::text::to_kebab_flag;
use std::collections::HashMap;

/// Names of built-in flags that must not be duplicated by parameter-derived flags.
const BUILTIN_FLAG_NAMES: &[&str] = &[
    "params",
    "json",
    "format",
    "dry-run",
    "base-url",
    "page-all",
    "page-limit",
    "page-delay",
    "no-pager",
    "no-retry",
    "quiet",
    "query",
    "help",
    "debug",
];

/// Builds the full CLI command tree from an API description.
pub fn build_cli(doc: &RestDescription) -> Command {
    let about_text = doc
        .title
        .clone()
        .unwrap_or_else(|| format!("{} CLI", doc.name));
    let mut root = Command::new(doc.name.clone())
        .about(about_text)
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
                .help("Output format: json, table, yaml, csv, raw, jsonl. Default: table when stdout is a TTY, json when piped. Override default with <NAME>_OUTPUT env var. raw emits unmodified server response bytes. jsonl emits one compact JSON value per line (NDJSON).")
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
            clap::Arg::new("no-retry")
                .long("no-retry")
                .help(
                    "Disable automatic retries on transient failures (5xx, 408, 429, \
                     network errors). Useful for debugging.",
                )
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
        if let Some(cmd) = build_resource_command(name, resource) {
            root = root.subcommand(cmd);
        }
    }

    root
}

/// Recursively builds a Command for a resource.
/// Returns None if the resource has no methods or sub-resources.
fn build_resource_command(name: &str, resource: &RestResource) -> Option<Command> {
    let mut cmd = Command::new(name.to_string())
        .about(format!("Operations on '{name}'"))
        .subcommand_required(true)
        .arg_required_else_help(true);

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

        let mut method_cmd = Command::new(method_name.to_string()).about(about);

        // Parameters first, required before optional, so heading order in
        // `--help` follows insertion order (see openapi::commands).
        let mut required_args: Vec<Arg> = Vec::new();
        let mut optional_args: Vec<Arg> = Vec::new();

        let mut param_names: Vec<_> = method.parameters.keys().collect();
        param_names.sort();
        for param_name in param_names {
            let kebab_name = to_kebab_flag(param_name);
            if BUILTIN_FLAG_NAMES.contains(&kebab_name.as_str()) {
                continue;
            }

            let param = &method.parameters[param_name];

            let value_name = match param.param_type.as_deref() {
                Some("string") => "STRING",
                Some("integer") => "NUMBER",
                Some("number") => "NUMBER",
                Some("boolean") => "BOOLEAN",
                _ => "VALUE",
            };

            let mut help_text = crate::text::truncate_description(
                param.description.as_deref().unwrap_or(""),
                crate::text::CLI_DESCRIPTION_LIMIT,
                true,
            );

            // A flattened required leaf is one of several ways to satisfy the
            // input: the whole-arg object shorthand (or `--json`) works too.
            // Say so, since clap never enforces the leaf and the executor
            // leaves validation to the server.
            //
            // Deliberately tests `param.default` (the spec's `defaultValue`)
            // rather than the clap default that
            // `openapi::commands::unconditionally_required` consults. The two
            // `default` notions are not the same thing: `x-fern-default` is a
            // client-side value the CLI materializes as a clap default, while
            // a GraphQL input field's `defaultValue` is the *server's*
            // fallback and is deliberately not promoted (see below). Both
            // rules mean "the caller may omit it"; a shared helper would hide
            // that they get there by different routes. `param.required`
            // already accounts for ancestors — the parser computes
            // `field_required = parent_required && is_non_null(...)` — so no
            // ancestor walk is needed here.
            let is_required = param.required && param.default.is_none();
            if is_required {
                if let Some(shorthand) = input_shorthand_flag(param, &method.parameters) {
                    if shorthand != *param_name {
                        if !help_text.is_empty() {
                            help_text.push(' ');
                        }
                        help_text.push_str(&format!("[or via --{shorthand} JSON]"));
                    }
                }
            }

            let mut arg = Arg::new(param_name.clone())
                .long(kebab_name)
                .value_name(value_name)
                .help(help_text);

            // Don't promote introspection defaults to clap defaults for flattened
            // GraphQL input fields. Per the GraphQL spec, `defaultValue` on an input
            // field describes the *server's* fallback when the client omits the field
            // — it is not a value the client should always send. Materializing it as a
            // clap default makes the flag look user-supplied, which forces the parent
            // input object to materialize as a variable even when the user passed
            // nothing for it, producing arguments the server may reject.
            let is_graphql_input_field = param.graphql_input_arg.is_some();
            if let Some(ref default) = param.default {
                if !is_graphql_input_field {
                    arg = arg.default_value(default.clone());
                }
            }

            if let Some(ref enum_values) = param.enum_values {
                arg = arg.value_parser(PossibleValuesParser::new(enum_values.clone()));
            }

            if is_required {
                required_args.push(arg);
            } else {
                optional_args.push(arg);
            }
        }

        for arg in required_args {
            method_cmd = method_cmd.arg(arg.help_heading(HELP_HEADING_REQUIRED));
        }
        for arg in optional_args {
            method_cmd = method_cmd.arg(arg.help_heading(HELP_HEADING_OPTIONAL));
        }

        method_cmd = method_cmd
            .arg(
                Arg::new("params")
                    .long("params")
                    .help("Additional parameters as JSON (overrides individual flags)")
                    .value_name("JSON")
                    .help_heading(HELP_HEADING_REQUEST),
            )
            .arg(
                Arg::new("json")
                    .long("json")
                    .help("JSON string for the request body (use `-` to read from stdin)")
                    .value_name("JSON|-")
                    .help_heading(HELP_HEADING_REQUEST),
            )
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

        cmd = cmd.subcommand(method_cmd);
    }

    // Add sub-resource subcommands (recursive)
    let mut sub_names: Vec<_> = resource.resources.keys().collect();
    sub_names.sort();
    for sub_name in sub_names {
        let sub_resource = &resource.resources[sub_name];
        if let Some(sub_cmd) = build_resource_command(sub_name, sub_resource) {
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

/// The kebab flag of the whole-input-arg object shorthand that can stand in
/// for a flattened leaf (`graphql_field_path == ""` on the same
/// `graphql_input_arg`), if the parser emitted one.
fn input_shorthand_flag(
    param: &MethodParameter,
    all_params: &HashMap<String, MethodParameter>,
) -> Option<String> {
    let arg_name = param.graphql_input_arg.as_deref()?;
    if param.graphql_field_path.as_deref() == Some("") {
        return None;
    }
    all_params
        .iter()
        .find(|(_, p)| {
            p.graphql_input_arg.as_deref() == Some(arg_name)
                && p.graphql_field_path.as_deref() == Some("")
        })
        .map(|(name, _)| to_kebab_flag(name))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::graphql::discovery::{GraphQLOperation as RestMethod, GraphQLResource as RestResource};

    fn make_doc() -> RestDescription {
        let mut methods = HashMap::new();
        methods.insert("list".to_string(), RestMethod::default());
        methods.insert("delete".to_string(), RestMethod::default());

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
                required: true,
                ..Default::default()
            },
        );
        params.insert(
            "status".to_string(),
            MethodParameter {
                param_type: Some("string".to_string()),
                description: Some("Filter by status".to_string()),
                enum_values: Some(vec!["active".to_string(), "inactive".to_string()]),
                ..Default::default()
            },
        );

        let mut methods = HashMap::new();
        methods.insert(
            "get-user".to_string(),
            RestMethod {
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

        let heading = |id: &str| {
            get_user_cmd
                .get_arguments()
                .find(|a| a.get_id() == id)
                .and_then(|a| a.get_help_heading())
        };
        assert_eq!(heading("uuid"), Some(HELP_HEADING_REQUIRED));
        assert_eq!(heading("status"), Some(HELP_HEADING_OPTIONAL));
        assert_eq!(heading("params"), Some(HELP_HEADING_REQUEST));
        assert_eq!(heading("page-all"), Some(HELP_HEADING_REQUEST));
    }

    /// A required input object flattened to per-field flags: required
    /// leaves are listed as required and point at the `--input` shorthand
    /// as the alternative; the shorthand itself, nullable leaves and
    /// leaves with a server default are optional.
    #[test]
    fn test_required_input_object_help_grouping() {
        let field = |required: bool, default: Option<&str>, path: &str| MethodParameter {
            param_type: Some("string".to_string()),
            required,
            default: default.map(str::to_string),
            graphql_input_arg: Some("input".to_string()),
            graphql_field_path: Some(path.to_string()),
            ..Default::default()
        };
        let mut params = HashMap::new();
        params.insert(
            "input".to_string(),
            MethodParameter {
                param_type: Some("object".to_string()),
                graphql_input_arg: Some("input".to_string()),
                graphql_field_path: Some(String::new()),
                required: false,
                ..Default::default()
            },
        );
        params.insert("name".to_string(), field(true, None, "name"));
        params.insert("nickname".to_string(), field(false, None, "nickname"));
        params.insert("tier".to_string(), field(true, Some("free"), "tier"));

        let mut methods = HashMap::new();
        methods.insert(
            "create".to_string(),
            RestMethod {
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
        let leaf = cmd
            .find_subcommand("users")
            .and_then(|c| c.find_subcommand("create"))
            .expect("users create missing");
        let arg = |id: &str| {
            leaf.get_arguments()
                .find(|a| a.get_id().as_str() == id)
                .unwrap_or_else(|| panic!("{id} flag missing"))
        };
        assert_eq!(arg("name").get_help_heading(), Some(HELP_HEADING_REQUIRED));
        assert_eq!(
            arg("name").get_help().map(|h| h.to_string()),
            Some("[or via --input JSON]".to_string())
        );
        assert_eq!(arg("input").get_help_heading(), Some(HELP_HEADING_OPTIONAL));
        assert_eq!(arg("nickname").get_help_heading(), Some(HELP_HEADING_OPTIONAL));
        assert_eq!(arg("tier").get_help_heading(), Some(HELP_HEADING_OPTIONAL));
        assert!(!arg("name").is_required_set());

        let help = leaf.clone().render_help().to_string();
        let req = help.find(HELP_HEADING_REQUIRED).unwrap();
        let opt = help.find(HELP_HEADING_OPTIONAL).unwrap();
        let required_section = &help[req..opt];
        assert!(required_section.contains("--name <"), "{help}");
        assert!(!required_section.contains("--input <"), "{help}");
    }

    #[test]
    fn test_builtin_flag_names_not_duplicated() {
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

        // This should not panic from duplicate arg names
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

        // "format" should NOT appear as a duplicated param flag,
        // but "real_param" should be present.
        assert!(
            args.contains(&"real_param".to_string()),
            "real_param flag missing"
        );

        // Count occurrences of "format" — should be at most 1 (from the global flag)
        let format_count = args.iter().filter(|a| *a == "format").count();
        assert!(
            format_count <= 1,
            "format flag duplicated: found {format_count}"
        );
    }
}
