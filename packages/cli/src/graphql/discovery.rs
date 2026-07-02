//! Internal GraphQL Representation
//!
//! Data structures the parser produces from a GraphQL introspection JSON
//! and the command builder + executor consume.

use std::collections::HashMap;

use serde::Deserialize;

/// Top-level GraphQL schema description.
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GraphQLSchema {
    pub name: String,
    pub version: String,
    pub title: Option<String>,
    pub description: Option<String>,
    /// Endpoint URL the executor POSTs queries to.
    pub root_url: String,
    #[serde(default)]
    pub resources: HashMap<String, GraphQLResource>,
}

/// A resource which can contain operations and nested sub-resources.
#[derive(Debug, Clone, Deserialize, Default)]
pub struct GraphQLResource {
    #[serde(default)]
    pub methods: HashMap<String, GraphQLOperation>,
    #[serde(default)]
    pub resources: HashMap<String, GraphQLResource>,
}

/// A single GraphQL operation (query or mutation).
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GraphQLOperation {
    pub id: Option<String>,
    pub description: Option<String>,
    #[serde(default)]
    pub parameters: HashMap<String, MethodParameter>,
    /// GraphQL operation metadata: query/mutation kind, field name, args, return shape.
    pub graphql: Option<GraphQLMethodInfo>,
    /// Per-method base URL (populated from the spec's server URL during parsing).
    /// When non-empty, takes priority over doc.root_url in URL construction.
    #[serde(default)]
    pub root_url: String,
}

/// Metadata for a GraphQL operation.
#[derive(Debug, Clone, Deserialize, Default)]
pub struct GraphQLMethodInfo {
    /// "query" or "mutation".
    pub operation_type: String,
    /// The original field name in the schema (e.g., "issueCreate").
    pub field_name: String,
    /// Default selection set as a GraphQL fragment string (e.g., "{ id title createdAt }").
    pub default_selection: String,
    /// Ordered list of top-level arguments, used to build `$var: Type` declarations.
    #[serde(default)]
    pub args: Vec<GraphQLArgDef>,
}

/// One argument of a GraphQL operation.
#[derive(Debug, Clone, Deserialize, Default)]
pub struct GraphQLArgDef {
    /// camelCase argument name as it appears in the schema (e.g., "id", "input").
    pub name: String,
    /// kebab-case CLI flag key used to look this argument up in the params map.
    pub flag_key: String,
    /// Full GraphQL type string including nullability (e.g., "String!", "IssueCreateInput").
    pub gql_type: String,
    /// True when this arg takes an input object whose fields were flattened into CLI flags.
    pub is_input: bool,
    /// True when the argument's GraphQL type is a list (e.g., `[IssueSortInput!]`).
    /// Used at variable-build time to wrap the reconstructed input object in a JSON array.
    #[serde(default)]
    pub is_list: bool,
}

/// A CLI parameter derived from a GraphQL argument or flattened input field.
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MethodParameter {
    /// JSON-Schema-flavored type used for value coercion (string/integer/number/boolean).
    #[serde(rename = "type")]
    pub param_type: Option<String>,
    pub description: Option<String>,
    #[serde(default)]
    pub required: bool,
    pub default: Option<String>,
    #[serde(rename = "enum")]
    pub enum_values: Option<Vec<String>>,
    /// For flattened input fields: the camelCase name of the top-level argument.
    /// E.g., a field flattened from `input: IssueCreateInput` has
    /// `graphql_input_arg = Some("input")`.
    #[serde(default)]
    pub graphql_input_arg: Option<String>,
    /// Dotted camelCase path within the input argument for nested input fields.
    /// E.g., a field at `input.dateRange.start` has
    /// `graphql_field_path = Some("dateRange.start")`. When absent, the path is
    /// derived from the flag key (top-level flattened field).
    #[serde(default)]
    pub graphql_field_path: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deserialize_graphql_schema() {
        let json = r#"{
            "name": "test",
            "version": "v1",
            "rootUrl": "https://api.example.com/graphql",
            "resources": {
                "issue": {
                    "methods": {
                        "get": {}
                    }
                }
            }
        }"#;

        let doc: GraphQLSchema = serde_json::from_str(json).unwrap();
        assert_eq!(doc.name, "test");
        assert_eq!(doc.root_url, "https://api.example.com/graphql");

        let issue = doc.resources.get("issue").expect("issue resource missing");
        assert!(issue.methods.contains_key("get"));
    }

    #[test]
    fn test_deserialize_defaults() {
        let json = r#"{
            "name": "test",
            "version": "v1",
            "rootUrl": "https://api.example.com/graphql"
        }"#;

        let doc: GraphQLSchema = serde_json::from_str(json).unwrap();
        assert!(doc.resources.is_empty());
    }

}
