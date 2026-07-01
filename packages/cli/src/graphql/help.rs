//! Spec output — renders the CLI's command surface as a machine-readable
//! JSON document. Backs the `--schema` global flag, which is the agent-facing
//! counterpart to `--help`: wherever a user could type `--help` for prose,
//! they can type `--schema` for the same scope rendered as JSON.

use serde_json::{json, Map, Value};

use crate::graphql::discovery::{GraphQLOperation, GraphQLResource, GraphQLSchema};

/// Build the spec document for the given subcommand path.
///
/// Returns `Some(value)` when the path resolves in this doc and `None` when it
/// doesn't (so a multi-binding caller can try the next binding). Empty path
/// always returns `Some(_)` — every binding contributes its full operation
/// list to the aggregate root view.
pub fn build_schema(doc: &GraphQLSchema, path: &[String]) -> Option<Value> {
    match path.len() {
        0 => Some(list_all_operations(doc)),
        1 => list_resource_operations(doc, &path[0]),
        _ => {
            let resource_path: Vec<&str> =
                path[..path.len() - 1].iter().map(|s| s.as_str()).collect();
            let method_name = path[path.len() - 1].as_str();
            operation_schema(doc, &resource_path, method_name).or_else(|| {
                let full_path: Vec<&str> = path.iter().map(|s| s.as_str()).collect();
                list_nested_resource_operations(doc, &full_path)
            })
        }
    }
}

fn list_all_operations(doc: &GraphQLSchema) -> Value {
    let mut ops: Vec<Value> = Vec::new();
    let mut names: Vec<_> = doc.resources.keys().collect();
    names.sort();
    for name in names {
        collect_resource_ops(&doc.resources[name], &[name], &mut ops);
    }
    json!(ops)
}

fn list_resource_operations(doc: &GraphQLSchema, resource: &str) -> Option<Value> {
    let res = doc.resources.get(resource)?;
    let mut ops: Vec<Value> = Vec::new();
    collect_resource_ops(res, &[resource], &mut ops);
    Some(json!(ops))
}

fn list_nested_resource_operations(doc: &GraphQLSchema, path: &[&str]) -> Option<Value> {
    let first = path.first()?;
    let mut res = doc.resources.get(*first)?;
    for segment in &path[1..] {
        res = res.resources.get(*segment)?;
    }
    let mut ops: Vec<Value> = Vec::new();
    collect_resource_ops(res, path, &mut ops);
    Some(json!(ops))
}

fn operation_schema(doc: &GraphQLSchema, resource_path: &[&str], method_name: &str) -> Option<Value> {
    let first = resource_path.first()?;
    let mut res = doc.resources.get(*first)?;
    for segment in &resource_path[1..] {
        res = res.resources.get(*segment)?;
    }
    let method = res.methods.get(method_name)?;
    Some(build_operation_schema(resource_path, method_name, method))
}

fn build_operation_schema(resource_path: &[&str], method_name: &str, method: &GraphQLOperation) -> Value {
    let mut properties: Map<String, Value> = Map::new();
    let mut required: Vec<String> = Vec::new();

    let mut param_names: Vec<_> = method.parameters.keys().collect();
    param_names.sort();
    for name in param_names {
        let param = &method.parameters[name];
        let mut prop = json!({
            "type": param.param_type.as_deref().unwrap_or("string"),
            "description": param.description.as_deref().unwrap_or(""),
        });
        if let Some(enums) = &param.enum_values {
            prop["enum"] = json!(enums);
        }
        if param.required {
            required.push(name.clone());
        }
        properties.insert(name.clone(), prop);
    }
    required.sort();

    // Per ADR-0006: `--schema` is the agent-facing contract. Drop
    // GraphQL execution detail (`operationType`, `field`) — agents drive
    // the CLI, not the underlying GraphQL schema. Rename `parameters` →
    // `input` for symmetry with `output` / `defaultSelection`.
    //
    // `output` is OpenAPI-only — the GraphQL IR has no lowered return-
    // type schema yet. Instead we emit `defaultSelection`, the GraphQL
    // fragment string the CLI will send by default; it tells the agent
    // which fields it will receive without overpromising a JSON Schema.
    let mut out = json!({
        "operation": format!("{}.{}", resource_path.join("."), method_name),
        "description": method.description.as_deref().unwrap_or(""),
        "input": {
            "type": "object",
            "properties": properties,
            "required": required,
        },
    });
    if let Some(default_selection) = method
        .graphql
        .as_ref()
        .map(|g| g.default_selection.as_str())
        .filter(|s| !s.is_empty())
    {
        out["defaultSelection"] = json!(default_selection);
    }
    out
}

fn collect_resource_ops(res: &GraphQLResource, path: &[&str], ops: &mut Vec<Value>) {
    let mut method_names: Vec<_> = res.methods.keys().collect();
    method_names.sort();
    for method_name in method_names {
        let m = &res.methods[method_name];
        // Per ADR-0006: drop `operationType` and `field` — GraphQL
        // execution detail an agent driving the CLI never uses.
        ops.push(json!({
            "operation": format!("{}.{}", path.join("."), method_name),
            "description": m.description.as_deref().unwrap_or(""),
        }));
    }
    let mut sub_names: Vec<_> = res.resources.keys().collect();
    sub_names.sort();
    for sub_name in sub_names {
        let mut sub_path = path.to_vec();
        sub_path.push(sub_name);
        collect_resource_ops(&res.resources[sub_name], &sub_path, ops);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::graphql::discovery::{MethodParameter, GraphQLOperation, GraphQLResource};
    use std::collections::HashMap;

    fn make_doc() -> GraphQLSchema {
        use crate::graphql::discovery::GraphQLMethodInfo;

        let mut params = HashMap::new();
        params.insert(
            "user_id".to_string(),
            MethodParameter {
                param_type: Some("string".to_string()),
                description: Some("The user ID".to_string()),
                required: true,
                ..Default::default()
            },
        );
        let mut methods = HashMap::new();
        methods.insert(
            "get".to_string(),
            GraphQLOperation {
                description: Some("Get a user".to_string()),
                parameters: params,
                graphql: Some(GraphQLMethodInfo {
                    operation_type: "query".to_string(),
                    field_name: "user".to_string(),
                    default_selection: "{ id name }".to_string(),
                    args: Vec::new(),
                }),
                ..Default::default()
            },
        );
        let mut resources = HashMap::new();
        resources.insert(
            "users".to_string(),
            GraphQLResource {
                methods,
                resources: HashMap::new(),
            },
        );
        GraphQLSchema {
            name: "test".to_string(),
            resources,
            ..Default::default()
        }
    }

    #[test]
    fn test_render_root_lists_all() {
        let doc = make_doc();
        let output = list_all_operations(&doc);
        let arr = output.as_array().unwrap();
        assert!(!arr.is_empty());
        assert_eq!(arr[0]["operation"], "users.get");
    }

    #[test]
    fn test_render_resource() {
        let doc = make_doc();
        let output = list_resource_operations(&doc, "users").unwrap();
        let arr = output.as_array().unwrap();
        assert_eq!(arr.len(), 1);
        assert_eq!(arr[0]["operation"], "users.get");
    }

    #[test]
    fn test_render_operation_schema() {
        let doc = make_doc();
        let schema = operation_schema(&doc, &["users"], "get").unwrap();
        // Per ADR-0006: drop GraphQL execution detail; rename
        // `parameters` → `input`.
        assert!(schema.get("operationType").is_none(), "operationType should be dropped");
        assert!(schema.get("field").is_none(), "field should be dropped");
        assert!(schema.get("parameters").is_none(), "`parameters` should be renamed to `input`");
        let required = schema["input"]["required"].as_array().unwrap();
        assert!(required.iter().any(|v| v == "user_id"));
    }

    #[test]
    fn test_default_selection_emitted_on_per_op_schema() {
        // Per ADR-0006: GraphQL ops carry `defaultSelection` as a
        // sibling of `input` — the GraphQL fragment string telling the
        // agent which fields it will get back by default.
        let doc = make_doc();
        let schema = operation_schema(&doc, &["users"], "get").unwrap();
        assert_eq!(schema["defaultSelection"], "{ id name }");
    }

    #[test]
    fn test_default_selection_omitted_when_empty() {
        use crate::graphql::discovery::{
            GraphQLMethodInfo, GraphQLOperation, GraphQLResource, MethodParameter,
        };
        let mut methods = HashMap::new();
        methods.insert(
            "ping".to_string(),
            GraphQLOperation {
                description: Some("Ping".to_string()),
                parameters: HashMap::<String, MethodParameter>::new(),
                graphql: Some(GraphQLMethodInfo {
                    operation_type: "query".to_string(),
                    field_name: "ping".to_string(),
                    default_selection: String::new(),
                    args: Vec::new(),
                }),
                ..Default::default()
            },
        );
        let mut resources = HashMap::new();
        resources.insert(
            "ops".to_string(),
            GraphQLResource {
                methods,
                resources: HashMap::new(),
            },
        );
        let doc = GraphQLSchema {
            name: "test".to_string(),
            resources,
            ..Default::default()
        };
        let schema = operation_schema(&doc, &["ops"], "ping").unwrap();
        assert!(
            schema.get("defaultSelection").is_none(),
            "empty default_selection should be omitted: {schema}",
        );
    }

    #[test]
    fn test_render_schema_nested_sub_resource_listing() {
        let mut nested_methods = std::collections::HashMap::new();
        nested_methods.insert(
            "get-membership".to_string(),
            crate::graphql::discovery::GraphQLOperation::default(),
        );
        let mut sub_resources = std::collections::HashMap::new();
        sub_resources.insert(
            "memberships".to_string(),
            GraphQLResource {
                methods: nested_methods,
                resources: std::collections::HashMap::new(),
            },
        );
        let mut resources = std::collections::HashMap::new();
        resources.insert(
            "organizations".to_string(),
            GraphQLResource {
                methods: std::collections::HashMap::new(),
                resources: sub_resources,
            },
        );
        let doc = GraphQLSchema {
            name: "test".to_string(),
            resources,
            ..Default::default()
        };

        let path: Vec<String> = vec!["organizations".into(), "memberships".into()];
        let result = build_schema(&doc, &path);
        assert!(result.is_some(), "sub-resource path should list operations, not be None");
    }

    #[test]
    fn test_render_nested_operation_schema() {
        use crate::graphql::discovery::GraphQLMethodInfo;

        let mut nested_methods = std::collections::HashMap::new();
        nested_methods.insert(
            "get-membership".to_string(),
            crate::graphql::discovery::GraphQLOperation {
                description: Some("Get a membership".to_string()),
                graphql: Some(GraphQLMethodInfo {
                    operation_type: "query".to_string(),
                    field_name: "membership".to_string(),
                    default_selection: "{ id }".to_string(),
                    args: Vec::new(),
                }),
                ..Default::default()
            },
        );
        let mut sub_resources = std::collections::HashMap::new();
        sub_resources.insert(
            "memberships".to_string(),
            GraphQLResource {
                methods: nested_methods,
                resources: std::collections::HashMap::new(),
            },
        );
        let mut resources = std::collections::HashMap::new();
        resources.insert(
            "organizations".to_string(),
            GraphQLResource {
                methods: std::collections::HashMap::new(),
                resources: sub_resources,
            },
        );
        let doc = GraphQLSchema {
            name: "test".to_string(),
            resources,
            ..Default::default()
        };

        let schema = operation_schema(&doc, &["organizations", "memberships"], "get-membership").unwrap();
        assert_eq!(schema["operation"], "organizations.memberships.get-membership");
    }

    #[test]
    fn test_render_schema_dispatches_nested_path() {
        let mut nested_methods = std::collections::HashMap::new();
        nested_methods.insert(
            "get-membership".to_string(),
            crate::graphql::discovery::GraphQLOperation::default(),
        );
        let mut sub_resources = std::collections::HashMap::new();
        sub_resources.insert(
            "memberships".to_string(),
            GraphQLResource {
                methods: nested_methods,
                resources: std::collections::HashMap::new(),
            },
        );
        let mut resources = std::collections::HashMap::new();
        resources.insert(
            "organizations".to_string(),
            GraphQLResource {
                methods: std::collections::HashMap::new(),
                resources: sub_resources,
            },
        );
        let doc = GraphQLSchema {
            name: "test".to_string(),
            resources,
            ..Default::default()
        };

        let path: Vec<String> = vec!["organizations".into(), "memberships".into(), "get-membership".into()];
        let result = build_schema(&doc, &path);
        assert!(result.is_some(), "nested path should resolve correctly");
    }
}
