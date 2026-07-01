//! GraphQL Introspection JSON Parser
//!
//! Converts a GraphQL introspection JSON schema into the internal `GraphQLSchema`
//! used by the CLI command builder and executor.
//!
//! Input format: `{"data": {"__schema": {...}}}` (standard introspection response)
//! or `{"__schema": {...}}` (bare schema).
//!
//! Use `src/bin/strip_schema.rs` to remove descriptions and built-in meta-types
//! before checking in a schema file.

use serde_json::Value;
use std::collections::HashMap;

use crate::graphql::discovery::{
    GraphQLArgDef, GraphQLMethodInfo, MethodParameter, GraphQLSchema, GraphQLOperation, GraphQLResource,
};
use crate::error::CliError;

/// GraphQL built-in scalar type names.
const BUILTIN_SCALARS: &[&str] = &["String", "Int", "Float", "Boolean", "ID"];

/// Known suffixes for mutations, used to split into resource + method name.
const MUTATION_SUFFIXES: &[&str] = &[
    "Unarchive",
    "Archive",
    "Create",
    "Update",
    "Delete",
    "Remove",
    "Connect",
    "Disconnect",
    "Import",
    "Rotate",
    "Accept",
    "Decline",
    "Leave",
    "Join",
    "Resume",
    "Pause",
    "Suspend",
    "Unsuspend",
    "Mark",
];

/// Load a GraphQL introspection JSON schema and convert it into a `GraphQLSchema`.
///
/// Accepts either the full introspection response (`{"data": {"__schema": ...}}`)
/// or the bare schema object (`{"__schema": ...}`).
pub fn load_graphql_schema(
    introspection_json: &str,
    cli_name: &str,
    endpoint: &str,
) -> Result<GraphQLSchema, CliError> {
    let data: Value = serde_json::from_str(introspection_json)
        .map_err(|e| CliError::Discovery(format!("Failed to parse introspection JSON: {e}")))?;

    // Support both wrapped and bare introspection responses.
    let schema = if data.get("data").is_some() {
        &data["data"]["__schema"]
    } else {
        &data["__schema"]
    };

    let types = schema["types"]
        .as_array()
        .ok_or_else(|| CliError::Discovery("Missing 'types' array in schema".to_string()))?;

    let mut object_types: HashMap<&str, &Value> = HashMap::new();
    let mut input_types: HashMap<&str, &Value> = HashMap::new();
    let mut enum_types: HashMap<&str, &Value> = HashMap::new();
    let mut scalar_names: Vec<String> = BUILTIN_SCALARS.iter().map(|s| s.to_string()).collect();

    for ty in types {
        let kind = ty["kind"].as_str().unwrap_or("");
        let name = match ty["name"].as_str() {
            Some(n) if !n.starts_with("__") => n,
            _ => continue,
        };
        match kind {
            "OBJECT" => {
                object_types.insert(name, ty);
            }
            "INPUT_OBJECT" => {
                input_types.insert(name, ty);
            }
            "ENUM" => {
                enum_types.insert(name, ty);
            }
            "SCALAR" => {
                scalar_names.push(name.to_string());
            }
            _ => {}
        }
    }

    let query_type_name = schema["queryType"]["name"].as_str().unwrap_or("Query");
    let mutation_type_name = schema["mutationType"]["name"].as_str();

    let mut resources: HashMap<String, GraphQLResource> = HashMap::new();
    let empty_args: Vec<Value> = Vec::new();

    // Process Query fields
    if let Some(query_type) = object_types.get(query_type_name) {
        let fields = query_type["fields"].as_array().map(Vec::as_slice).unwrap_or(&[]);
        for field in fields {
            let field_name = match field["name"].as_str() {
                Some(n) if !n.starts_with('_') => n,
                _ => continue,
            };
            let return_type_name = unwrap_type_name(&field["type"]);
            let (resource_name, method_name) = split_query_name(field_name, &return_type_name);
            let args = field["args"].as_array().unwrap_or(&empty_args);
            let (parameters, arg_defs) =
                build_parameters_from_args(args, &input_types, &enum_types, &scalar_names);
            let default_selection =
                build_default_selection(&return_type_name, &object_types, &scalar_names);

            let method = GraphQLOperation {
                id: Some(format!("{resource_name}.{method_name}")),
                description: desc(field),
                parameters,
                graphql: Some(GraphQLMethodInfo {
                    operation_type: "query".to_string(),
                    field_name: field_name.to_string(),
                    default_selection,
                    args: arg_defs,
                }),
                ..Default::default()
            };
            resources.entry(resource_name).or_default().methods.insert(method_name, method);
        }
    }

    // Process Mutation fields
    if let Some(mt_name) = mutation_type_name {
        if let Some(mutation_type) = object_types.get(mt_name) {
            let fields = mutation_type["fields"].as_array().map(Vec::as_slice).unwrap_or(&[]);
            for field in fields {
                let field_name = match field["name"].as_str() {
                    Some(n) if !n.starts_with('_') => n,
                    _ => continue,
                };
                let return_type_name = unwrap_type_name(&field["type"]);
                let (resource_name, method_name) = split_mutation_name(field_name);
                let args = field["args"].as_array().unwrap_or(&empty_args);
                let (parameters, arg_defs) =
                    build_parameters_from_args(args, &input_types, &enum_types, &scalar_names);
                let default_selection =
                    build_default_selection(&return_type_name, &object_types, &scalar_names);

                let method = GraphQLOperation {
                    id: Some(format!("{resource_name}.{method_name}")),
                    description: desc(field),
                    parameters,
                    graphql: Some(GraphQLMethodInfo {
                        operation_type: "mutation".to_string(),
                        field_name: field_name.to_string(),
                        default_selection,
                        args: arg_defs,
                    }),
                    ..Default::default()
                };
                resources.entry(resource_name).or_default().methods.insert(method_name, method);
            }
        }
    }

    Ok(GraphQLSchema {
        name: cli_name.to_string(),
        version: "1".to_string(),
        root_url: endpoint.to_string(),
        resources,
        ..Default::default()
    })
}

/// Extract an optional description string from a JSON node.
fn desc(val: &Value) -> Option<String> {
    val.get("description")
        .and_then(|d| d.as_str())
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

fn default_val(val: &Value) -> Option<String> {
    val.get("defaultValue")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

fn enum_values(enum_def: &Value) -> Vec<String> {
    enum_def["enumValues"]
        .as_array()
        .map(|ev| {
            ev.iter()
                .filter_map(|v| v["name"].as_str())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

/// Follow NON_NULL/LIST wrappers to find the named type.
fn unwrap_type_name(ty: &Value) -> String {
    match ty["kind"].as_str().unwrap_or("") {
        "NON_NULL" | "LIST" => unwrap_type_name(&ty["ofType"]),
        _ => ty["name"].as_str().unwrap_or("String").to_string(),
    }
}

/// True when the outermost wrapper is NON_NULL.
fn is_non_null(ty: &Value) -> bool {
    ty["kind"].as_str() == Some("NON_NULL")
}

/// True when the type wraps (at any outer level) a LIST. We descend through
/// NON_NULL wrappers — `[T!]`, `[T!]!`, `[T]` all count as list types.
fn is_list_type(ty: &Value) -> bool {
    match ty["kind"].as_str().unwrap_or("") {
        "LIST" => true,
        "NON_NULL" => is_list_type(&ty["ofType"]),
        _ => false,
    }
}

/// Reconstruct the type string including nullability, e.g. `"String!"`, `"[ID!]!"`.
fn gql_type_string(ty: &Value) -> String {
    match ty["kind"].as_str().unwrap_or("") {
        "NON_NULL" => format!("{}!", gql_type_string(&ty["ofType"])),
        "LIST" => format!("[{}]", gql_type_string(&ty["ofType"])),
        _ => ty["name"].as_str().unwrap_or("String").to_string(),
    }
}

/// Check if a type name is a known scalar.
fn is_scalar(name: &str, scalar_names: &[String]) -> bool {
    scalar_names.iter().any(|s| s == name)
}

/// Split a query field name into (resource_name, method_name).
fn split_query_name(field_name: &str, return_type: &str) -> (String, String) {
    let kebab = camel_to_kebab(field_name);

    // "For" pattern: attachmentsForURL → (attachment, list-for-url)
    if let Some(pos) = field_name.find("For") {
        if pos > 0 {
            let prefix = &field_name[..pos];
            let suffix = &field_name[pos..];
            let resource = camel_to_kebab(&singular_camel(prefix));
            let method = format!("list-{}", camel_to_kebab(suffix).to_lowercase());
            return (resource, method);
        }
    }

    // Connection return type is authoritative — always a list
    if return_type.ends_with("Connection") {
        return (singular_kebab(&kebab), "list".to_string());
    }

    // Plural field name heuristic
    if field_name.ends_with('s')
        && !field_name.ends_with("ss")
        && !field_name.ends_with("us")
        && !field_name.ends_with("Status")
        && field_name.len() > 2
    {
        return (singular_kebab(&kebab), "list".to_string());
    }

    (kebab, "get".to_string())
}

/// Split a mutation field name into (resource_name, method_name).
fn split_mutation_name(field_name: &str) -> (String, String) {
    for suffix in MUTATION_SUFFIXES {
        if field_name.ends_with(suffix) && field_name.len() > suffix.len() {
            let prefix = &field_name[..field_name.len() - suffix.len()];
            return (camel_to_kebab(prefix), suffix.to_lowercase());
        }
    }
    if let Some((resource, action)) = split_at_second_word(field_name) {
        return (camel_to_kebab(&resource), camel_to_kebab(&action));
    }
    (camel_to_kebab(field_name), "execute".to_string())
}

fn split_at_second_word(name: &str) -> Option<(String, String)> {
    let chars: Vec<char> = name.chars().collect();
    for i in 1..chars.len() {
        if chars[i].is_uppercase() {
            let prefix = &name[..i];
            let suffix = &name[i..];
            if prefix.len() > 2 {
                return Some((prefix.to_string(), suffix.to_string()));
            }
        }
    }
    None
}

fn camel_to_kebab(s: &str) -> String {
    let mut result = String::with_capacity(s.len() + 4);
    let chars: Vec<char> = s.chars().collect();
    for (i, &ch) in chars.iter().enumerate() {
        if ch.is_uppercase() {
            if i > 0
                && (chars[i - 1].is_lowercase()
                    || (i + 1 < chars.len() && chars[i + 1].is_lowercase()))
            {
                result.push('-');
            }
            result.push(ch.to_lowercase().next().unwrap());
        } else {
            result.push(ch);
        }
    }
    result
}

fn singular_kebab(kebab: &str) -> String {
    let (prefix, last) = match kebab.rfind('-') {
        Some(pos) => (&kebab[..pos + 1], &kebab[pos + 1..]),
        None => ("", kebab),
    };
    format!("{prefix}{}", singular_word(last))
}

fn singular_word(word: &str) -> String {
    if let Some(stem) = word.strip_suffix("ies") {
        if stem.len() >= 2 {
            return format!("{stem}y");
        }
    }
    if word.ends_with("xes")
        || word.ends_with("ches")
        || word.ends_with("shes")
        || word.ends_with("sses")
        || word.ends_with("zzes")
    {
        if let Some(stem) = word.strip_suffix("es") {
            if stem.len() >= 2 {
                return stem.to_string();
            }
        }
    }
    if let Some(stem) = word.strip_suffix('s') {
        // Block Latin/Greek singulars that end in -us and must not be stripped.
        const LATIN_SINGULARS: &[&str] = &[
            "status", "bonus", "campus", "census", "focus",
            "nexus", "radius", "virus", "alias",
        ];
        if stem.len() >= 3 && !stem.ends_with('s') && !LATIN_SINGULARS.contains(&word) {
            return stem.to_string();
        }
    }
    word.to_string()
}

fn singular_camel(name: &str) -> String {
    singular_kebab(&camel_to_kebab(name))
}

fn param_to_flag_name(name: &str) -> String {
    camel_to_kebab(name)
}

/// Map GraphQL scalar type names to CLI param type strings.
fn graphql_type_to_param_type(type_name: &str) -> String {
    match type_name {
        "Int" => "integer".to_string(),
        "Float" => "number".to_string(),
        "Boolean" => "boolean".to_string(),
        _ => "string".to_string(),
    }
}

/// Build CLI parameters and `GraphQLArgDef` list from introspection field arguments.
fn build_parameters_from_args(
    args: &[Value],
    input_types: &HashMap<&str, &Value>,
    enum_types: &HashMap<&str, &Value>,
    scalar_names: &[String],
) -> (HashMap<String, MethodParameter>, Vec<GraphQLArgDef>) {
    let mut params = HashMap::new();
    let mut arg_defs = Vec::new();

    let is_known_complex =
        |name: &str| input_types.contains_key(name) || enum_types.contains_key(name);

    for arg in args {
        let arg_name = match arg["name"].as_str() {
            Some(n) => n,
            None => continue,
        };
        let type_name = unwrap_type_name(&arg["type"]);
        let is_required = is_non_null(&arg["type"]);
        let flag_key = param_to_flag_name(arg_name);

        if is_scalar(&type_name, scalar_names) || !is_known_complex(&type_name) {
            params.insert(
                flag_key.clone(),
                MethodParameter {
                    param_type: Some(graphql_type_to_param_type(&type_name)),
                    description: desc(arg),
                    required: is_required,
                    default: default_val(arg),
                    ..Default::default()
                },
            );
            arg_defs.push(GraphQLArgDef {
                name: arg_name.to_string(),
                flag_key,
                gql_type: gql_type_string(&arg["type"]),
                is_input: false,
                is_list: is_list_type(&arg["type"]),
            });
        } else if let Some(enum_def) = enum_types.get(type_name.as_str()) {
            let values = enum_values(enum_def);
            params.insert(
                flag_key.clone(),
                MethodParameter {
                    param_type: Some("string".to_string()),
                    description: desc(arg),
                    required: is_required,
                    default: default_val(arg),
                    enum_values: Some(values),
                    ..Default::default()
                },
            );
            arg_defs.push(GraphQLArgDef {
                name: arg_name.to_string(),
                flag_key,
                gql_type: gql_type_string(&arg["type"]),
                is_input: false,
                is_list: is_list_type(&arg["type"]),
            });
        } else if input_types.contains_key(type_name.as_str()) {
            flatten_input_type(
                &type_name,
                arg_name,
                "",
                "",
                is_required,
                input_types,
                enum_types,
                scalar_names,
                &mut params,
                0,
            );
            // JFL-1.4: also emit an object-shorthand flag for the whole input
            // arg, mirroring the OpenAPI body parent emission. Users can pass
            // `--filter '{"query":"x"}'` as an alternative to `--query x`.
            // `required: false` at the CLI level — a required input may be
            // satisfied via per-field flags instead. `graphql_field_path` is
            // empty: the executor merges the parsed object into the input
            // map at the top level. `or_insert` so a same-named leaf flag
            // (pathological) wins.
            params
                .entry(flag_key.clone())
                .or_insert(MethodParameter {
                    param_type: Some("object".to_string()),
                    graphql_input_arg: Some(arg_name.to_string()),
                    graphql_field_path: Some(String::new()),
                    description: desc(arg),
                    required: false,
                    ..Default::default()
                });
            arg_defs.push(GraphQLArgDef {
                name: arg_name.to_string(),
                flag_key,
                gql_type: gql_type_string(&arg["type"]),
                is_input: true,
                is_list: is_list_type(&arg["type"]),
            });
        }
    }

    (params, arg_defs)
}

const MAX_INPUT_DEPTH: u8 = 3;

#[allow(clippy::too_many_arguments)]
fn flatten_input_type(
    type_name: &str,
    arg_name: &str,
    field_path: &str,
    flag_prefix: &str,
    parent_required: bool,
    input_types: &HashMap<&str, &Value>,
    enum_types: &HashMap<&str, &Value>,
    scalar_names: &[String],
    params: &mut HashMap<String, MethodParameter>,
    depth: u8,
) {
    if depth >= MAX_INPUT_DEPTH {
        return;
    }
    let input_def = match input_types.get(type_name) {
        Some(d) => d,
        None => return,
    };
    let input_fields = match input_def["inputFields"].as_array() {
        Some(f) => f,
        None => return,
    };

    for input_field in input_fields {
        let field_name = match input_field["name"].as_str() {
            Some(n) => n,
            None => continue,
        };
        let field_type_name = unwrap_type_name(&input_field["type"]);
        let field_required = parent_required && is_non_null(&input_field["type"]);

        let field_flag = param_to_flag_name(field_name);
        let full_flag = if flag_prefix.is_empty() {
            field_flag
        } else {
            format!("{flag_prefix}.{}", param_to_flag_name(field_name))
        };
        let full_path = if field_path.is_empty() {
            field_name.to_string()
        } else {
            format!("{field_path}.{field_name}")
        };

        if is_scalar(&field_type_name, scalar_names) {
            params.insert(
                full_flag,
                MethodParameter {
                    param_type: Some(graphql_type_to_param_type(&field_type_name)),
                    description: desc(input_field),
                    required: field_required,
                    default: default_val(input_field),
                    graphql_input_arg: Some(arg_name.to_string()),
                    graphql_field_path: Some(full_path),
                    ..Default::default()
                },
            );
        } else if let Some(enum_def) = enum_types.get(field_type_name.as_str()) {
            let values = enum_values(enum_def);
            params.insert(
                full_flag,
                MethodParameter {
                    param_type: Some("string".to_string()),
                    description: desc(input_field),
                    required: field_required,
                    default: default_val(input_field),
                    enum_values: Some(values),
                    graphql_input_arg: Some(arg_name.to_string()),
                    graphql_field_path: Some(full_path),
                },
            );
        } else if input_types.contains_key(field_type_name.as_str()) {
            flatten_input_type(
                &field_type_name,
                arg_name,
                &full_path,
                &full_flag,
                field_required,
                input_types,
                enum_types,
                scalar_names,
                params,
                depth + 1,
            );
            params.entry(full_flag.clone()).or_insert(MethodParameter {
                param_type: Some("object".to_string()),
                graphql_input_arg: Some(arg_name.to_string()),
                graphql_field_path: Some(full_path.clone()),
                description: desc(input_field),
                required: false,
                ..Default::default()
            });
        } else {
            // Undeclared custom scalar — treat as string
            params.insert(
                full_flag,
                MethodParameter {
                    param_type: Some("string".to_string()),
                    description: desc(input_field),
                    required: field_required,
                    graphql_input_arg: Some(arg_name.to_string()),
                    graphql_field_path: Some(full_path),
                    ..Default::default()
                },
            );
        }
    }
}

/// Build a default selection set for a GraphQL return type.
fn build_default_selection(
    type_name: &str,
    object_types: &HashMap<&str, &Value>,
    scalar_names: &[String],
) -> String {
    if type_name.ends_with("Connection") {
        let node_type = type_name.strip_suffix("Connection").unwrap();
        let node_selection = build_scalar_fields(node_type, object_types, scalar_names);
        let nodes_part = if node_selection.is_empty() {
            "nodes { id }".to_string()
        } else {
            format!("nodes {{ {node_selection} }}")
        };
        return format!("{{ {nodes_part} pageInfo {{ hasNextPage endCursor }} }}");
    }

    if type_name.ends_with("Payload") {
        if let Some(obj) = object_types.get(type_name) {
            let mut parts = Vec::new();
            let fields = obj["fields"].as_array().map(Vec::as_slice).unwrap_or(&[]);
            for field in fields {
                let args = field["args"].as_array().map(|a| a.len()).unwrap_or(0);
                if args > 0 {
                    continue;
                }
                let field_name = field["name"].as_str().unwrap_or("");
                let ft = unwrap_type_name(&field["type"]);
                if is_scalar(&ft, scalar_names) {
                    parts.push(field_name.to_string());
                } else if object_types.contains_key(ft.as_str()) {
                    let inner = build_scalar_fields(&ft, object_types, scalar_names);
                    if !inner.is_empty() {
                        parts.push(format!("{field_name} {{ {inner} }}"));
                    }
                }
            }
            if parts.is_empty() {
                return "{ success }".to_string();
            }
            return format!("{{ {} }}", parts.join(" "));
        }
    }

    let fields = build_scalar_fields(type_name, object_types, scalar_names);
    if fields.is_empty() {
        return "{ id }".to_string();
    }
    format!("{{ {fields} }}")
}

/// Build a space-separated scalar field selection for a type.
fn build_scalar_fields(
    type_name: &str,
    object_types: &HashMap<&str, &Value>,
    scalar_names: &[String],
) -> String {
    let obj = match object_types.get(type_name) {
        Some(o) => o,
        None => return String::new(),
    };
    let fields = match obj["fields"].as_array() {
        Some(f) => f,
        None => return String::new(),
    };

    let mut parts: Vec<String> = Vec::new();
    for f in fields {
        let args_len = f["args"].as_array().map(|a| a.len()).unwrap_or(0);
        if args_len > 0 {
            continue;
        }
        let field_name = f["name"].as_str().unwrap_or("");
        let ft = unwrap_type_name(&f["type"]);
        if is_scalar(&ft, scalar_names) {
            parts.push(field_name.to_string());
        } else if !ft.ends_with("Connection") {
            if let Some(inner_obj) = object_types.get(ft.as_str()) {
                let inner_fields = inner_obj["fields"].as_array().map(Vec::as_slice).unwrap_or(&[]);
                let inner_scalars: Vec<&str> = inner_fields
                    .iter()
                    .filter(|if_| {
                        if_["args"].as_array().map(|a| a.len()).unwrap_or(0) == 0
                            && is_scalar(&unwrap_type_name(&if_["type"]), scalar_names)
                    })
                    .filter_map(|if_| if_["name"].as_str())
                    .collect();
                if !inner_scalars.is_empty() {
                    parts.push(format!("{field_name} {{ {} }}", inner_scalars.join(" ")));
                }
            }
        }
    }

    parts.join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // ---------------------------------------------------------------------------
    // Naming utility tests (no schema needed)
    // ---------------------------------------------------------------------------

    #[test]
    fn test_camel_to_kebab() {
        assert_eq!(camel_to_kebab("issueCreate"), "issue-create");
        assert_eq!(camel_to_kebab("issue"), "issue");
        assert_eq!(camel_to_kebab("customView"), "custom-view");
        assert_eq!(camel_to_kebab("attachmentsForURL"), "attachments-for-url");
        assert_eq!(camel_to_kebab("teamMembershipCreate"), "team-membership-create");
    }

    #[test]
    fn test_singular_kebab() {
        assert_eq!(singular_kebab("issues"), "issue");
        assert_eq!(singular_kebab("activities"), "activity");
        assert_eq!(singular_kebab("gift-card-activities"), "gift-card-activity");
        assert_eq!(singular_kebab("boxes"), "box");
        assert_eq!(singular_kebab("watches"), "watch");
        assert_eq!(singular_kebab("programs"), "program");
        assert_eq!(singular_kebab("loyalty-programs"), "loyalty-program");
        assert_eq!(singular_kebab("sms"), "sms");
        assert_eq!(singular_kebab("status"), "status");
        assert_eq!(singular_kebab("menus"), "menu");
        assert_eq!(singular_kebab("gurus"), "guru");
    }

    #[test]
    fn test_split_query_name() {
        assert_eq!(
            split_query_name("issues", "IssueConnection"),
            ("issue".to_string(), "list".to_string())
        );
        assert_eq!(
            split_query_name("giftCardActivities", "GiftCardActivityConnection"),
            ("gift-card-activity".to_string(), "list".to_string())
        );
        assert_eq!(
            split_query_name("issue", "Issue"),
            ("issue".to_string(), "get".to_string())
        );
        assert_eq!(
            split_query_name("attachmentsForURL", "AttachmentConnection"),
            ("attachment".to_string(), "list-for-url".to_string())
        );
    }

    #[test]
    fn test_split_mutation_name() {
        assert_eq!(
            split_mutation_name("issueCreate"),
            ("issue".to_string(), "create".to_string())
        );
        assert_eq!(
            split_mutation_name("issueDelete"),
            ("issue".to_string(), "delete".to_string())
        );
        assert_eq!(
            split_mutation_name("attachmentLinkSlack"),
            ("attachment".to_string(), "link-slack".to_string())
        );
    }

    // ---------------------------------------------------------------------------
    // Schema loading helpers
    // ---------------------------------------------------------------------------

    /// Shorthand type-ref builders for inline test schemas.
    fn nn(inner: Value) -> Value {
        json!({"kind": "NON_NULL", "name": null, "ofType": inner})
    }
    fn scalar(name: &str) -> Value {
        json!({"kind": "SCALAR", "name": name, "ofType": null})
    }
    fn obj(name: &str) -> Value {
        json!({"kind": "OBJECT", "name": name, "ofType": null})
    }
    fn input_obj(name: &str) -> Value {
        json!({"kind": "INPUT_OBJECT", "name": name, "ofType": null})
    }
    fn list_of(inner: Value) -> Value {
        json!({"kind": "LIST", "name": null, "ofType": inner})
    }

    fn make_schema(types: Value) -> String {
        json!({
            "data": {
                "__schema": {
                    "queryType": {"name": "Query"},
                    "mutationType": {"name": "Mutation"},
                    "types": types
                }
            }
        })
        .to_string()
    }

    // ---------------------------------------------------------------------------
    // Schema loading tests
    // ---------------------------------------------------------------------------

    #[test]
    fn test_load_minimal_schema() {
        let schema = make_schema(json!([
            {
                "kind": "OBJECT", "name": "Query",
                "fields": [
                    {
                        "name": "issue",
                        "args": [{"name": "id", "type": nn(scalar("String"))}],
                        "type": nn(obj("Issue")), "isDeprecated": false
                    },
                    {
                        "name": "issues",
                        "args": [
                            {"name": "first", "type": scalar("Int")},
                            {"name": "after", "type": scalar("String")}
                        ],
                        "type": nn(obj("IssueConnection")), "isDeprecated": false
                    }
                ]
            },
            {
                "kind": "OBJECT", "name": "Mutation",
                "fields": [
                    {
                        "name": "issueCreate",
                        "args": [{"name": "input", "type": nn(input_obj("IssueCreateInput"))}],
                        "type": nn(obj("IssuePayload")), "isDeprecated": false
                    }
                ]
            },
            {
                "kind": "OBJECT", "name": "Issue",
                "fields": [
                    {"name": "id", "args": [], "type": nn(scalar("ID")), "isDeprecated": false},
                    {"name": "title", "args": [], "type": nn(scalar("String")), "isDeprecated": false},
                    {"name": "description", "args": [], "type": scalar("String"), "isDeprecated": false}
                ]
            },
            {
                "kind": "OBJECT", "name": "IssueConnection",
                "fields": [
                    {"name": "nodes", "args": [], "type": nn(list_of(nn(obj("Issue")))), "isDeprecated": false},
                    {"name": "pageInfo", "args": [], "type": nn(obj("PageInfo")), "isDeprecated": false}
                ]
            },
            {
                "kind": "OBJECT", "name": "PageInfo",
                "fields": [
                    {"name": "hasNextPage", "args": [], "type": nn(scalar("Boolean")), "isDeprecated": false},
                    {"name": "endCursor", "args": [], "type": scalar("String"), "isDeprecated": false}
                ]
            },
            {
                "kind": "OBJECT", "name": "IssuePayload",
                "fields": [
                    {"name": "success", "args": [], "type": nn(scalar("Boolean")), "isDeprecated": false},
                    {"name": "issue", "args": [], "type": obj("Issue"), "isDeprecated": false}
                ]
            },
            {
                "kind": "INPUT_OBJECT", "name": "IssueCreateInput",
                "inputFields": [
                    {"name": "title", "type": nn(scalar("String"))},
                    {"name": "description", "type": scalar("String")},
                    {"name": "teamId", "type": nn(scalar("String"))}
                ]
            }
        ]));

        let doc = load_graphql_schema(&schema, "test", "https://api.example.com/graphql").unwrap();
        assert_eq!(doc.name, "test");

        let issue = doc.resources.get("issue").expect("issue resource missing");
        assert!(issue.methods.contains_key("get"), "missing get");
        assert!(issue.methods.contains_key("list"), "missing list");
        assert!(issue.methods.contains_key("create"), "missing create");

        let get = issue.methods.get("get").unwrap();
        assert!(get.parameters.contains_key("id"));
        assert!(get.parameters.get("id").unwrap().required);

        let list = issue.methods.get("list").unwrap();
        let list_sel = &list.graphql.as_ref().unwrap().default_selection;
        assert!(list_sel.contains("pageInfo"), "list selection missing pageInfo: {list_sel}");
        assert!(list_sel.contains("hasNextPage"), "list selection missing hasNextPage: {list_sel}");
        assert!(list_sel.contains("endCursor"), "list selection missing endCursor: {list_sel}");
        assert!(list.parameters.contains_key("after"), "missing --after flag");

        let create = issue.methods.get("create").unwrap();
        assert!(create.parameters.contains_key("title"));
        assert!(create.parameters.contains_key("description"));
        assert!(create.parameters.contains_key("team-id"));

        let gql = get.graphql.as_ref().unwrap();
        assert_eq!(gql.operation_type, "query");
        assert_eq!(gql.field_name, "issue");

        let gql_create = create.graphql.as_ref().unwrap();
        assert_eq!(gql_create.operation_type, "mutation");
        assert_eq!(gql_create.field_name, "issueCreate");
    }

    #[test]
    fn test_nested_input_flattening() {
        let schema = make_schema(json!([
            {
                "kind": "OBJECT", "name": "Query",
                "fields": [{
                    "name": "search",
                    "args": [{"name": "filter", "type": nn(input_obj("SearchFilter"))}],
                    "type": nn(obj("SearchConnection")), "isDeprecated": false
                }]
            },
            {
                "kind": "OBJECT", "name": "Mutation",
                "fields": []
            },
            {
                "kind": "OBJECT", "name": "SearchConnection",
                "fields": [
                    {"name": "nodes", "args": [], "type": nn(list_of(nn(obj("SearchResult")))), "isDeprecated": false},
                    {"name": "pageInfo", "args": [], "type": nn(obj("PageInfo")), "isDeprecated": false}
                ]
            },
            {"kind": "OBJECT", "name": "SearchResult", "fields": [
                {"name": "id", "args": [], "type": nn(scalar("ID")), "isDeprecated": false}
            ]},
            {"kind": "OBJECT", "name": "PageInfo", "fields": [
                {"name": "hasNextPage", "args": [], "type": nn(scalar("Boolean")), "isDeprecated": false},
                {"name": "endCursor", "args": [], "type": scalar("String"), "isDeprecated": false}
            ]},
            {
                "kind": "INPUT_OBJECT", "name": "SearchFilter",
                "inputFields": [
                    {"name": "query", "type": scalar("String")},
                    {"name": "dateRange", "type": input_obj("DateRangeInput"), "description": "Bounded date range for filtering."},
                    {"name": "minAmount", "type": scalar("Int")}
                ]
            },
            {
                "kind": "INPUT_OBJECT", "name": "DateRangeInput",
                "inputFields": [
                    {"name": "start", "type": nn(scalar("String"))},
                    {"name": "end", "type": nn(scalar("String"))}
                ]
            }
        ]));

        let doc = load_graphql_schema(&schema, "test", "https://api.example.com/graphql").unwrap();
        let all_params: Vec<String> = doc
            .resources.values()
            .flat_map(|r| r.methods.values())
            .flat_map(|m| m.parameters.keys().cloned())
            .collect();

        assert!(all_params.iter().any(|k| k == "query"), "missing top-level query param: {all_params:?}");
        assert!(all_params.iter().any(|k| k.contains("start")), "missing dateRange.start: {all_params:?}");
        assert!(all_params.iter().any(|k| k.contains("end")), "missing dateRange.end: {all_params:?}");

        // Parent object-level flag must ALSO be emitted for the nested input type.
        // The flag key is "date-range" (no arg prefix, since flatten_input_type is called
        // with an empty flag_prefix for top-level input args).
        let search = doc.resources.get("search").expect("search resource missing");
        let list = search.methods.get("list").expect("search.list method missing");
        let date_range_flag = list.parameters.get("date-range")
            .expect("parent 'date-range' object flag must be present");
        assert_eq!(date_range_flag.param_type.as_deref(), Some("object"),
            "parent input-type flag must have param_type 'object'");
        assert!(!date_range_flag.required,
            "parent object flag must be required: false at CLI level");
        assert_eq!(date_range_flag.graphql_input_arg.as_deref(), Some("filter"),
            "parent object flag must have graphql_input_arg set");
        assert_eq!(date_range_flag.graphql_field_path.as_deref(), Some("dateRange"),
            "parent object flag must have graphql_field_path set to the dotted path");
        // Description must flow through to the nested object-shorthand flag
        // so --help shows the input field's description, not blank.
        assert_eq!(date_range_flag.description.as_deref(), Some("Bounded date range for filtering."),
            "nested object-shorthand flag must carry the input field's description");

        // JFL-1.4: input-arg-level object-shorthand flag must also be emitted
        // for the whole input arg `filter`. Lets users pass
        // `--filter '{"query":"x","dateRange":{...}}'` as a single payload.
        let filter_flag = list.parameters.get("filter")
            .expect("input-arg-level 'filter' object flag must be present");
        assert_eq!(filter_flag.param_type.as_deref(), Some("object"),
            "input-arg flag must have param_type 'object'");
        assert!(!filter_flag.required,
            "input-arg flag must be required: false at CLI level");
        assert_eq!(filter_flag.graphql_input_arg.as_deref(), Some("filter"),
            "input-arg flag must have graphql_input_arg set to the arg name");
        assert_eq!(filter_flag.graphql_field_path.as_deref(), Some(""),
            "input-arg flag must have empty graphql_field_path");
    }

    #[test]
    fn test_input_arg_object_shorthand_basic() {
        // JFL-1.4: for `mutation foo(input: BarInput!)`, params must contain
        // both `--input` (object) and per-field leaf flags from BarInput.
        let schema = make_schema(json!([
            {
                "kind": "OBJECT", "name": "Query", "fields": []
            },
            {
                "kind": "OBJECT", "name": "Mutation",
                "fields": [{
                    "name": "foo",
                    "args": [{"name": "input", "type": nn(input_obj("BarInput"))}],
                    "type": nn(obj("BarPayload")), "isDeprecated": false
                }]
            },
            {"kind": "OBJECT", "name": "BarPayload", "fields": [
                {"name": "id", "args": [], "type": nn(scalar("ID")), "isDeprecated": false}
            ]},
            {
                "kind": "INPUT_OBJECT", "name": "BarInput",
                "inputFields": [
                    {"name": "field", "type": nn(scalar("String"))}
                ]
            }
        ]));

        let doc = load_graphql_schema(&schema, "test", "https://api.example.com/graphql").unwrap();
        let foo_method = doc.resources.get("foo")
            .expect("foo resource missing")
            .methods.get("execute")
            .expect("foo.execute method missing");

        let input_flag = foo_method.parameters.get("input")
            .expect("--input arg-level object flag must be present");
        assert_eq!(input_flag.param_type.as_deref(), Some("object"));
        assert_eq!(input_flag.graphql_input_arg.as_deref(), Some("input"));
        assert_eq!(input_flag.graphql_field_path.as_deref(), Some(""));
        assert!(!input_flag.required);

        let field_flag = foo_method.parameters.get("field")
            .expect("--field per-field leaf flag must be present");
        assert_eq!(field_flag.param_type.as_deref(), Some("string"));
        assert_eq!(field_flag.graphql_input_arg.as_deref(), Some("input"));
        assert_eq!(field_flag.graphql_field_path.as_deref(), Some("field"));
    }

    #[test]
    fn test_undeclared_scalar_as_arg() {
        let schema = make_schema(json!([
            {
                "kind": "OBJECT", "name": "Query",
                "fields": [{
                    "name": "orders",
                    "args": [
                        {"name": "after", "type": json!({"kind": "SCALAR", "name": "Cursor", "ofType": null})},
                        {"name": "first", "type": scalar("Int")}
                    ],
                    "type": nn(obj("OrderConnection")), "isDeprecated": false
                }]
            },
            {"kind": "OBJECT", "name": "Mutation", "fields": []},
            {"kind": "OBJECT", "name": "OrderConnection", "fields": [
                {"name": "nodes", "args": [], "type": nn(list_of(nn(obj("Order")))), "isDeprecated": false},
                {"name": "pageInfo", "args": [], "type": nn(obj("PageInfo")), "isDeprecated": false}
            ]},
            {"kind": "OBJECT", "name": "Order", "fields": [
                {"name": "id", "args": [], "type": nn(scalar("ID")), "isDeprecated": false}
            ]},
            {"kind": "OBJECT", "name": "PageInfo", "fields": [
                {"name": "hasNextPage", "args": [], "type": nn(scalar("Boolean")), "isDeprecated": false},
                {"name": "endCursor", "args": [], "type": scalar("String"), "isDeprecated": false}
            ]}
        ]));

        let doc = load_graphql_schema(&schema, "test", "https://api.example.com/graphql").unwrap();
        let all_params: Vec<String> = doc
            .resources.values()
            .flat_map(|r| r.methods.values())
            .flat_map(|m| m.parameters.keys().cloned())
            .collect();
        assert!(
            all_params.iter().any(|k| k == "after"),
            "undeclared Cursor scalar should produce --after flag: {all_params:?}"
        );
    }

}
