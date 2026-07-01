//! Spec output — renders the CLI's command surface as a machine-readable
//! JSON document. Backs the `--schema` global flag, which is the agent-facing
//! counterpart to `--help`: wherever a user could type `--help` for prose,
//! they can type `--schema` for the same scope rendered as JSON.
//!
//! See [ADR-0006](../../../docs/adr/0006-schema-flag-agent-contract.md) for
//! the design contract this renderer implements.

use std::collections::{BTreeMap, HashMap, HashSet};

use serde_json::{json, Map, Value};

use crate::openapi::discovery::{
    JsonSchema, JsonSchemaProperty, PaginationConfig, RestDescription, RestMethod, RestResource,
    StreamingConfig,
};

/// Build the spec document for the given subcommand path.
///
/// Returns `Some(value)` when the path resolves in this doc and `None` when it
/// doesn't (so a multi-binding caller can try the next binding). Empty path
/// always returns `Some(_)` — every binding contributes its full operation
/// list to the aggregate root view.
pub(crate) fn build_schema(doc: &RestDescription, path: &[String]) -> Option<Value> {
    match path.len() {
        0 => Some(list_all_operations(doc)),
        1 => list_resource_operations(doc, &path[0]),
        _ => {
            // Try treating last element as a method name first.
            // If that fails, the full path may resolve to a nested sub-resource — list its ops.
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

fn list_all_operations(doc: &RestDescription) -> Value {
    let mut ops: Vec<Value> = Vec::new();
    let mut names: Vec<_> = doc.resources.keys().collect();
    names.sort();
    for name in names {
        collect_resource_ops(&doc.resources[name], &[name], &mut ops);
    }
    // Wrap with `sdkVariables` when declared; otherwise stay a bare
    // array so single-binding consumers that have always seen an array
    // at the root don't break on this binding alone. The empty-path
    // aggregator in `app.rs` re-wraps the combined result with
    // `globalFlags` per ADR-0006 — globalFlags live there because they
    // describe the CLI harness, not the binding.
    if doc.sdk_variables.is_empty() {
        json!(ops)
    } else {
        json!({
            "sdkVariables": render_sdk_variables(&doc.sdk_variables),
            "operations": ops,
        })
    }
}

fn render_pagination(p: &PaginationConfig) -> Value {
    match p {
        PaginationConfig::Cursor { cursor, next_cursor, results } => json!({
            "kind": "cursor",
            "cursorParam": cursor,
            "nextCursorPath": next_cursor,
            "resultsPath": results,
        }),
        PaginationConfig::Offset { offset, results, step, has_next_page } => {
            let mut out = json!({
                "kind": "offset",
                "offsetParam": offset,
                "resultsPath": results,
            });
            if let Some(step) = step {
                out["stepParam"] = json!(step);
            }
            if let Some(p) = has_next_page {
                out["hasNextPagePath"] = json!(p);
            }
            out
        }
        PaginationConfig::Uri { next_uri, results } => json!({
            "kind": "uri",
            "nextUriPath": next_uri,
            "resultsPath": results,
        }),
        PaginationConfig::Path { next_path, results } => json!({
            "kind": "path",
            "nextPathPath": next_path,
            "resultsPath": results,
        }),
        PaginationConfig::Custom { results } => json!({
            "kind": "custom",
            "resultsPath": results,
        }),
    }
}

fn render_streaming(s: &StreamingConfig) -> Value {
    match s {
        StreamingConfig::Sse { terminator } => {
            let mut out = json!({ "format": "sse" });
            if let Some(t) = terminator {
                out["terminator"] = json!(t);
            }
            out
        }
        StreamingConfig::Json { terminator } => {
            let mut out = json!({ "format": "json" });
            if let Some(t) = terminator {
                out["terminator"] = json!(t);
            }
            out
        }
        StreamingConfig::Text => json!({ "format": "text" }),
    }
}

fn render_sdk_variables(
    vars: &[crate::openapi::discovery::SdkVariable],
) -> Vec<Value> {
    vars.iter()
        .map(|v| {
            json!({
                "name": v.name,
                "type": v.ty,
                "description": v.description.as_deref().unwrap_or(""),
                "globalFlag": format!("--{}", crate::text::to_kebab_flag(&v.name)),
                "envVar": crate::text::to_screaming_snake(&v.name),
            })
        })
        .collect()
}

fn list_resource_operations(doc: &RestDescription, resource: &str) -> Option<Value> {
    let res = doc.resources.get(resource)?;
    let mut ops: Vec<Value> = Vec::new();
    collect_resource_ops(res, &[resource], &mut ops);
    Some(json!(ops))
}

fn list_nested_resource_operations(doc: &RestDescription, path: &[&str]) -> Option<Value> {
    let first = path.first()?;
    let mut res = doc.resources.get(*first)?;
    for segment in &path[1..] {
        res = res.resources.get(*segment)?;
    }
    let mut ops: Vec<Value> = Vec::new();
    collect_resource_ops(res, path, &mut ops);
    Some(json!(ops))
}

fn operation_schema(doc: &RestDescription, resource_path: &[&str], method_name: &str) -> Option<Value> {
    let first = resource_path.first()?;
    let mut res = doc.resources.get(*first)?;
    for segment in &resource_path[1..] {
        res = res.resources.get(*segment)?;
    }
    let method = res.methods.get(method_name)?;
    Some(build_operation_schema(resource_path, method_name, method, &doc.schemas))
}

fn build_operation_schema(
    resource_path: &[&str],
    method_name: &str,
    method: &RestMethod,
    schemas: &HashMap<String, JsonSchema>,
) -> Value {
    let mut properties: Map<String, Value> = Map::new();
    let mut required: Vec<String> = Vec::new();

    let mut param_names: Vec<_> = method.parameters.keys().collect();
    param_names.sort();
    for name in param_names {
        let param = &method.parameters[name];
        let element_type = param.param_type.as_deref().unwrap_or("string");
        let mut prop = if param.scalar_or_array {
            json!({
                "oneOf": [
                    { "type": element_type },
                    { "type": "array", "items": { "type": element_type } },
                ],
                "description": param.description.as_deref().unwrap_or(""),
                "location": param.location.as_deref().unwrap_or("query"),
            })
        } else if param.repeated {
            json!({
                "type": "array",
                "items": { "type": element_type },
                "description": param.description.as_deref().unwrap_or(""),
                "location": param.location.as_deref().unwrap_or("query"),
            })
        } else {
            json!({
                "type": element_type,
                "description": param.description.as_deref().unwrap_or(""),
                "location": param.location.as_deref().unwrap_or("query"),
            })
        };
        if let Some(v) = &param.default_value {
            prop["default"] = v.clone();
        }
        if let Some(v) = &param.documentation_default_value {
            prop["serverDefault"] = v.clone();
        }
        if let Some(fmt) = &param.format {
            prop["format"] = json!(fmt);
        }
        if param.nullable {
            prop["nullable"] = json!(true);
        }
        if param.deprecated {
            prop["deprecated"] = json!(true);
        }
        // `minimum`/`maximum` are `Option<f64>` so they emit as JSON
        // numbers, matching how body-field bounds render via
        // `render_property`. Guard on `is_finite()` so a pathological
        // spec with NaN/±Inf doesn't emit `null` (`Number::from_f64`
        // returns None for non-finite values).
        if let Some(min) = param.minimum.filter(|m| m.is_finite()) {
            prop["minimum"] = json!(min);
        }
        if let Some(max) = param.maximum.filter(|m| m.is_finite()) {
            prop["maximum"] = json!(max);
        }
        if let Some(enums) = &param.enum_values {
            prop["enum"] = json!(enums);
            // When `x-fern-enum` overrides are present, expose the
            // per-value display name and description so JSON-help
            // consumers can render them without reparsing the spec.
            if let Some(fern_enum) = &param.fern_enum {
                let mut by_wire: Map<String, Value> = Map::new();
                for wire in enums {
                    if let Some(entry) = fern_enum.get(wire) {
                        let mut obj = Map::new();
                        if let Some(name) = &entry.display_name {
                            obj.insert("name".to_string(), Value::String(name.clone()));
                        }
                        if let Some(desc) = &entry.description {
                            obj.insert("description".to_string(), Value::String(desc.clone()));
                        }
                        if !obj.is_empty() {
                            by_wire.insert(wire.clone(), Value::Object(obj));
                        }
                    }
                }
                if !by_wire.is_empty() {
                    prop["x-fern-enum"] = Value::Object(by_wire);
                }
            }
        }
        if let Some(availability) = param.availability {
            prop["availability"] = json!(availability.as_str());
        }
        // Variable-bound path parameters are NOT per-op required flags; their
        // value comes from the root-level global flag (kebab-cased) with an
        // env-var fallback (SCREAMING_SNAKE_CASE), or from `--params` JSON.
        // Mark them explicitly so machine consumers (LLM agents, code
        // generators) know not to surface a per-op `--<param>` flag and can
        // discover the right global/env fallbacks instead.
        if let Some(var_name) = param.variable_reference.as_deref() {
            prop["binding"] = json!("sdk-variable");
            prop["variable"] = json!(var_name);
            prop["globalFlag"] = json!(format!("--{}", crate::text::to_kebab_flag(var_name)));
            prop["envVar"] = json!(crate::text::to_screaming_snake(var_name));
        } else if param.required {
            required.push(name.clone());
        }
        properties.insert(name.clone(), prop);
    }
    required.sort();

    // Per ADR-0006: `--schema` is the agent-facing contract. Drop HTTP
    // plumbing (`httpMethod`, `path`) — agents drive the CLI, not raw
    // HTTP. Rename `parameters` → `input` to sidestep OpenAPI's narrow
    // meaning (which excludes body fields) and pair symmetrically with
    // `output`.
    let mut output = json!({
        "operation": format!("{}.{}", resource_path.join("."), method_name),
        "description": method.description.as_deref().unwrap_or(""),
        "input": {
            "type": "object",
            "properties": properties,
            "required": required,
        },
    });
    if let Some(availability) = method.availability {
        output["availability"] = json!(availability.as_str());
    }
    // Per ADR-0006: surface the canonical 2xx response as `output`, with
    // every `$ref` followed and inlined so the agent has a
    // self-contained JSON Schema in one round-trip. Cycles break by
    // emitting a `$ref` at the second encounter of the same name in a
    // chain.
    if let Some(response_ref) = method.response.as_ref().and_then(|r| r.schema_ref.as_deref()) {
        if let Some(rendered) = render_ref(schemas, response_ref, &mut HashSet::new()) {
            output["output"] = rendered;
        }
    }

    // Per ADR-0006: capability hints surface CLI affordances the spec
    // doesn't describe — pagination (`--page-all`), binary downloads
    // (`--output PATH`), streaming. Booleans default false and are
    // omitted; structured hints carry only the fields an agent needs to
    // drive the affordance correctly.
    if let Some(p) = &method.pagination {
        output["paginable"] = render_pagination(p);
    }
    if method.has_binary_response {
        output["binaryResponse"] = json!(true);
    }
    if let Some(s) = &method.streaming {
        output["streaming"] = render_streaming(s);
    }

    // Per ADR-0006: `input.properties` mirrors the CLI's *flag surface*,
    // not the wire shape. Request body fields appear as siblings of
    // query/path/header params, each tagged `location: "body"`. Body
    // fields with object types carry their nested schema inline so the
    // agent has everything needed to construct either an individual
    // `--<flag>` (when scalar) or a `--json '<JSON>'` payload (when
    // nested). all_of composition is merged in the same last-branch-wins
    // shape as ADR-0004's parser-side flattener (independent
    // implementation, see *Architecture: Code Generation Model* in
    // AGENTS.md).
    if let Some(body_ref) = method.request.as_ref().and_then(|r| r.schema_ref.as_deref()) {
        let mut body_props: BTreeMap<String, JsonSchemaProperty> = BTreeMap::new();
        let mut body_required: HashSet<String> = HashSet::new();
        let mut visited: HashSet<String> = HashSet::new();
        collect_body_properties(schemas, body_ref, &mut body_props, &mut body_required, &mut visited, 0);

        if !body_props.is_empty() {
            let input = output["input"].as_object_mut().expect("input must be object");
            let props_map = input
                .get_mut("properties")
                .and_then(|v| v.as_object_mut())
                .expect("input.properties must be object");
            let mut render_visited: HashSet<String> = HashSet::new();
            // Track which body fields survived the collision check.
            // body_required entries are only propagated for these — a
            // body field that lost the collision must NOT elevate its
            // colliding param into `input.required`, since (a) optional
            // query/path/header params would be silently upgraded to
            // required, and (b) variable-bound (sdk-variable) params
            // would re-enter `required` despite the deliberate
            // exclusion at the per-param emission site above.
            let mut surfaced_body_names: HashSet<String> = HashSet::new();
            for (name, prop) in &body_props {
                if props_map.contains_key(name) {
                    continue;
                }
                let mut rendered = render_property(schemas, prop, &mut render_visited);
                if let Value::Object(map) = &mut rendered {
                    map.insert("location".into(), json!("body"));
                }
                props_map.insert(name.clone(), rendered);
                surfaced_body_names.insert(name.clone());
            }
            // Merge body-required names into input.required (which is
            // already a sorted array of strings). Only names that
            // actually surfaced as body fields contribute.
            let req_array = input
                .get_mut("required")
                .and_then(|v| v.as_array_mut())
                .expect("input.required must be array");
            let mut merged: HashSet<String> = req_array
                .iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect();
            for r in body_required {
                if surfaced_body_names.contains(&r) {
                    merged.insert(r);
                }
            }
            let mut sorted: Vec<String> = merged.into_iter().collect();
            sorted.sort();
            *req_array = sorted.into_iter().map(Value::String).collect();
        }
    }
    output
}

/// Bound on `allOf` recursion. Matches the parser/executor safety cap
/// (`parser.rs` / `executor.rs`); the value is duplicated rather than
/// shared because help.rs is a code-generation path that must stay
/// self-contained.
const MAX_ALL_OF_DEPTH: u8 = 8;

/// Walk a request-body schema (located via `ref_name` in `schemas`) and
/// collect its top-level property bag plus its required set, applying
/// `allOf` merge with last-branch-wins semantics (see ADR-0004). The
/// `visited` set guards against cyclic `$ref` chains; `depth` bounds
/// `allOf` recursion to match the parser's safety cap.
fn collect_body_properties(
    schemas: &HashMap<String, JsonSchema>,
    ref_name: &str,
    out_props: &mut BTreeMap<String, JsonSchemaProperty>,
    out_required: &mut HashSet<String>,
    visited: &mut HashSet<String>,
    depth: u8,
) {
    if depth >= MAX_ALL_OF_DEPTH {
        return;
    }
    if visited.contains(ref_name) {
        return;
    }
    let Some(schema) = schemas.get(ref_name) else {
        return;
    };
    visited.insert(ref_name.to_string());
    merge_schema_properties(schemas, schema, out_props, out_required, visited, depth + 1);
    visited.remove(ref_name);
}

/// Walk one `allOf` branch (a `JsonSchemaProperty`) recursively. Mirrors
/// `executor.rs::walk_all_of_for_validate` so the body validator and
/// `--schema` agree on inline compositions of any depth, including
/// `allOf: [{ allOf: [{ allOf: [{$ref: Base}] }] }]`. `$ref` branches
/// delegate to `collect_body_properties`; inline branches recurse on
/// their own `all_of` before contributing their own properties + required.
fn walk_inline_branch(
    schemas: &HashMap<String, JsonSchema>,
    branch: &JsonSchemaProperty,
    out_props: &mut BTreeMap<String, JsonSchemaProperty>,
    out_required: &mut HashSet<String>,
    visited: &mut HashSet<String>,
    depth: u8,
) {
    if depth >= MAX_ALL_OF_DEPTH {
        return;
    }
    if let Some(ref_path) = branch.schema_ref.as_deref() {
        collect_body_properties(schemas, ref_path, out_props, out_required, visited, depth + 1);
        return;
    }
    for nested in &branch.all_of {
        walk_inline_branch(schemas, nested, out_props, out_required, visited, depth + 1);
    }
    for (name, prop) in &branch.properties {
        out_props.insert(name.clone(), prop.clone());
    }
    for r in &branch.required {
        out_required.insert(r.clone());
    }
}

fn merge_schema_properties(
    schemas: &HashMap<String, JsonSchema>,
    schema: &JsonSchema,
    out_props: &mut BTreeMap<String, JsonSchemaProperty>,
    out_required: &mut HashSet<String>,
    visited: &mut HashSet<String>,
    depth: u8,
) {
    if depth >= MAX_ALL_OF_DEPTH {
        return;
    }
    // Branches first (in declaration order); schema's own properties
    // last so they act as final overlay — matches ADR-0004 last-branch-
    // wins.
    for branch in &schema.all_of {
        walk_inline_branch(schemas, branch, out_props, out_required, visited, depth + 1);
    }
    for (name, prop) in &schema.properties {
        out_props.insert(name.clone(), prop.clone());
    }
    for r in &schema.required {
        out_required.insert(r.clone());
    }
}

/// Inline the schema named `ref_name` from `schemas`, following nested
/// `$ref`s recursively. `visited` is a stack of names currently being
/// expanded — re-encountering a name in `visited` emits a `{"$ref": name}`
/// node to break the cycle. Returns `None` only when the top-level ref
/// itself is unresolved (so the caller can omit the field).
fn render_ref(
    schemas: &HashMap<String, JsonSchema>,
    ref_name: &str,
    visited: &mut HashSet<String>,
) -> Option<Value> {
    if visited.contains(ref_name) {
        return Some(json!({ "$ref": ref_name }));
    }
    let schema = schemas.get(ref_name)?;
    visited.insert(ref_name.to_string());
    let rendered = render_json_schema(schemas, schema, visited);
    visited.remove(ref_name);
    Some(rendered)
}

fn render_json_schema(
    schemas: &HashMap<String, JsonSchema>,
    schema: &JsonSchema,
    visited: &mut HashSet<String>,
) -> Value {
    if let Some(ref_name) = schema.schema_ref.as_deref() {
        if let Some(rendered) = render_ref(schemas, ref_name, visited) {
            return rendered;
        }
    }
    let mut out = Map::new();
    if let Some(ty) = &schema.schema_type {
        out.insert("type".into(), json!(ty));
    }
    if schema.nullable {
        out.insert("nullable".into(), json!(true));
    }
    if let Some(desc) = &schema.description {
        out.insert("description".into(), json!(desc));
    }
    if !schema.properties.is_empty() {
        let mut props: BTreeMap<String, Value> = BTreeMap::new();
        for (name, prop) in &schema.properties {
            props.insert(name.clone(), render_property(schemas, prop, visited));
        }
        out.insert("properties".into(), json!(props));
    }
    if !schema.required.is_empty() {
        let mut req = schema.required.clone();
        req.sort();
        out.insert("required".into(), json!(req));
    }
    if let Some(items) = &schema.items {
        out.insert("items".into(), render_property(schemas, items, visited));
    }
    if !schema.one_of.is_empty() {
        out.insert(
            "oneOf".into(),
            json!(schema.one_of.iter().map(|p| render_property(schemas, p, visited)).collect::<Vec<_>>()),
        );
    }
    if !schema.any_of.is_empty() {
        out.insert(
            "anyOf".into(),
            json!(schema.any_of.iter().map(|p| render_property(schemas, p, visited)).collect::<Vec<_>>()),
        );
    }
    if !schema.all_of.is_empty() {
        out.insert(
            "allOf".into(),
            json!(schema.all_of.iter().map(|p| render_property(schemas, p, visited)).collect::<Vec<_>>()),
        );
    }
    if let Some(ap) = &schema.additional_properties {
        out.insert("additionalProperties".into(), render_property(schemas, ap, visited));
    }
    Value::Object(out)
}

fn render_property(
    schemas: &HashMap<String, JsonSchema>,
    prop: &JsonSchemaProperty,
    visited: &mut HashSet<String>,
) -> Value {
    if let Some(ref_name) = prop.schema_ref.as_deref() {
        if let Some(rendered) = render_ref(schemas, ref_name, visited) {
            return rendered;
        }
    }
    let mut out = Map::new();
    if let Some(ty) = &prop.prop_type {
        out.insert("type".into(), json!(ty));
    }
    if prop.nullable {
        out.insert("nullable".into(), json!(true));
    }
    if let Some(desc) = &prop.description {
        out.insert("description".into(), json!(desc));
    }
    if let Some(fmt) = &prop.format {
        out.insert("format".into(), json!(fmt));
    }
    // OpenAPI `default:` is the server-side documentation hint, so it
    // emits under `serverDefault`. Body fields have no x-fern-default.
    if let Some(default) = &prop.default {
        out.insert("serverDefault".into(), default.clone());
    }
    if let Some(enums) = &prop.enum_values {
        out.insert("enum".into(), json!(enums));
    }
    if let Some(items) = &prop.items {
        out.insert("items".into(), render_property(schemas, items, visited));
    }
    // Nested object properties carry their own `required` list (lowered
    // by the parser into JsonSchemaProperty.required). Emit it so an
    // agent constructing `--json` payloads for nested objects knows
    // which sub-fields the spec mandates. Skip when empty / for
    // non-object properties.
    if !prop.required.is_empty() {
        let mut req = prop.required.clone();
        req.sort();
        out.insert("required".into(), json!(req));
    }
    if !prop.properties.is_empty() {
        let mut props: BTreeMap<String, Value> = BTreeMap::new();
        for (name, inner) in &prop.properties {
            props.insert(name.clone(), render_property(schemas, inner, visited));
        }
        out.insert("properties".into(), json!(props));
    }
    // Bound fields are `Option<f64>` and `serde_json::Number::from_f64`
    // returns None for NaN/±Inf — without the `is_finite()` gate, a
    // pathological spec with `minimum: .nan` would silently emit
    // `"minimum": null`, indistinguishable from a deliberate null. Skip
    // non-finite values entirely; they have no JSON representation.
    if let Some(m) = prop.minimum.filter(|m| m.is_finite()) {
        out.insert("minimum".into(), json!(m));
    }
    if let Some(m) = prop.maximum.filter(|m| m.is_finite()) {
        out.insert("maximum".into(), json!(m));
    }
    if let Some(m) = prop.exclusive_minimum.filter(|m| m.is_finite()) {
        out.insert("exclusiveMinimum".into(), json!(m));
    }
    if let Some(m) = prop.exclusive_maximum.filter(|m| m.is_finite()) {
        out.insert("exclusiveMaximum".into(), json!(m));
    }
    if prop.read_only {
        out.insert("readOnly".into(), json!(true));
    }
    // OpenAPI `example` / `examples` arrive as raw YAML; surface them as
    // JSON so the agent has concrete templates without re-parsing.
    if let Some(ex) = &prop.example {
        if let Ok(v) = serde_json::to_value(ex) {
            out.insert("example".into(), v);
        }
    }
    if let Some(exs) = &prop.examples {
        if let Ok(v) = serde_json::to_value(exs) {
            out.insert("examples".into(), v);
        }
    }
    if !prop.one_of.is_empty() {
        out.insert(
            "oneOf".into(),
            json!(prop.one_of.iter().map(|p| render_property(schemas, p, visited)).collect::<Vec<_>>()),
        );
    }
    if !prop.any_of.is_empty() {
        out.insert(
            "anyOf".into(),
            json!(prop.any_of.iter().map(|p| render_property(schemas, p, visited)).collect::<Vec<_>>()),
        );
    }
    if !prop.all_of.is_empty() {
        out.insert(
            "allOf".into(),
            json!(prop.all_of.iter().map(|p| render_property(schemas, p, visited)).collect::<Vec<_>>()),
        );
    }
    if let Some(ap) = &prop.additional_properties {
        out.insert("additionalProperties".into(), render_property(schemas, ap, visited));
    }
    Value::Object(out)
}

fn collect_resource_ops(res: &RestResource, path: &[&str], ops: &mut Vec<Value>) {
    let mut method_names: Vec<_> = res.methods.keys().collect();
    method_names.sort();
    for method_name in method_names {
        let m = &res.methods[method_name];
        // Per ADR-0006: drop `httpMethod` and `path` from listings —
        // they're HTTP-execution detail an agent driving the CLI never
        // uses. Agents pick by `operation` + `description`.
        let mut entry = json!({
            "operation": format!("{}.{}", path.join("."), method_name),
            "description": m.description.as_deref().unwrap_or(""),
        });
        if let Some(availability) = m.availability {
            entry["availability"] = json!(availability.as_str());
        }
        ops.push(entry);
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
    use crate::openapi::discovery::{MethodParameter, RestMethod, RestResource};
    use std::collections::HashMap;

    fn make_doc() -> RestDescription {
        let mut params = HashMap::new();
        params.insert(
            "user_id".to_string(),
            MethodParameter {
                param_type: Some("string".to_string()),
                description: Some("The user ID".to_string()),
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
                path: "/users/{user_id}".to_string(),
                description: Some("Get a user".to_string()),
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
        RestDescription {
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
        // Per ADR-0006: `httpMethod` and `path` are dropped from the
        // per-op envelope, `parameters` is renamed to `input`.
        assert!(schema.get("httpMethod").is_none(), "httpMethod should be dropped");
        assert!(schema.get("path").is_none(), "path should be dropped");
        assert!(schema.get("parameters").is_none(), "`parameters` should be renamed to `input`");
        let required = schema["input"]["required"].as_array().unwrap();
        assert!(required.iter().any(|v| v == "user_id"));
    }

    #[test]
    fn test_root_listing_drops_http_method_and_path() {
        // Per ADR-0006: listings expose `operation` + `description` only.
        // HTTP-plumbing fields are agent-irrelevant noise.
        let doc = make_doc();
        let output = list_all_operations(&doc);
        let arr = output.as_array().unwrap();
        assert!(!arr.is_empty());
        for op in arr {
            assert!(op.get("httpMethod").is_none(), "httpMethod must be dropped from listings");
            assert!(op.get("path").is_none(), "path must be dropped from listings");
            assert!(op["operation"].is_string());
            assert!(op["description"].is_string());
        }
    }

    #[test]
    fn test_variable_bound_param_annotated_and_not_required_in_per_op_schema() {
        // The --schema output is the machine-readable contract for LLM agents. A
        // variable-bound path parameter must NOT appear in the per-op
        // `required` array (there is no per-op flag for it), and the
        // property MUST carry enough metadata for an agent to resolve it
        // via the root-level global flag, env var, or --params JSON.
        let mut params = HashMap::new();
        params.insert(
            "gardenId".to_string(),
            MethodParameter {
                param_type: Some("string".to_string()),
                description: Some("Tenant id".to_string()),
                location: Some("path".to_string()),
                required: true,
                variable_reference: Some("gardenId".to_string()),
                ..Default::default()
            },
        );
        // A plain (non-variable-bound) required path param on the same op
        // MUST still show up in `required` as before.
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
        let method = RestMethod {
            http_method: "GET".to_string(),
            path: "/gardens/{gardenId}/zones/{zoneId}".to_string(),
            description: Some("List zones".to_string()),
            parameters: params,
            ..Default::default()
        };
        let schema = build_operation_schema(&["zones"], "get", &method, &HashMap::new());
        let required = schema["input"]["required"].as_array().unwrap();
        assert!(
            !required.iter().any(|v| v == "gardenId"),
            "variable-bound param must not appear in per-op `required`, got: {required:?}",
        );
        assert!(
            required.iter().any(|v| v == "zoneId"),
            "plain required path param must still be in `required`, got: {required:?}",
        );

        let garden = &schema["input"]["properties"]["gardenId"];
        assert_eq!(garden["binding"], "sdk-variable");
        assert_eq!(garden["variable"], "gardenId");
        assert_eq!(garden["globalFlag"], "--garden-id");
        assert_eq!(garden["envVar"], "GARDEN_ID");
    }

    #[test]
    fn test_root_listing_surfaces_sdk_variables_when_declared() {
        // With at least one `x-fern-sdk-variables` entry the root JSON
        // help wraps the operations array in an object that exposes the
        // variable definitions (name, type, description, derived flag,
        // env var) so machine consumers can discover the root-level
        // globals without scanning every operation.
        let mut doc = make_doc();
        doc.sdk_variables = vec![crate::openapi::discovery::SdkVariable {
            name: "gardenId".to_string(),
            ty: "string".to_string(),
            description: Some("Tenant id".to_string()),
        }];
        let output = list_all_operations(&doc);
        let obj = output.as_object().expect("expected wrapped object when sdk_variables present");
        let vars = obj["sdkVariables"].as_array().unwrap();
        assert_eq!(vars.len(), 1);
        assert_eq!(vars[0]["name"], "gardenId");
        assert_eq!(vars[0]["globalFlag"], "--garden-id");
        assert_eq!(vars[0]["envVar"], "GARDEN_ID");
        assert_eq!(vars[0]["description"], "Tenant id");
        assert!(
            obj["operations"].as_array().unwrap().iter().any(|op| op["operation"] == "users.get"),
            "operations array must still list every op when wrapped",
        );
    }

    #[test]
    fn test_binding_root_stays_bare_array_when_no_sdk_variables() {
        // The binding-level `list_all_operations` stays a bare array
        // when no sdkVariables are declared — the empty-path
        // aggregator in `app.rs` is responsible for the final
        // `{globalFlags, ...operations}` wrap that an agent sees at
        // the CLI surface. Keeping the binding output narrow
        // simplifies multi-binding aggregation.
        let doc = make_doc();
        let output = list_all_operations(&doc);
        assert!(
            output.is_array(),
            "binding `list_all_operations` should stay bare array when no sdkVariables",
        );
    }

    #[test]
    fn test_render_schema_nested_sub_resource_listing() {
        // path.len() == 2 where last element is a sub-resource, not a method
        let mut nested_methods = std::collections::HashMap::new();
        nested_methods.insert(
            "get-membership".to_string(),
            crate::openapi::discovery::RestMethod {
                http_method: "GET".to_string(),
                path: "/organizations/{id}/memberships/{mid}".to_string(),
                ..Default::default()
            },
        );
        let mut sub_resources = std::collections::HashMap::new();
        sub_resources.insert(
            "memberships".to_string(),
            RestResource {
                methods: nested_methods,
                resources: std::collections::HashMap::new(),
            },
        );
        let mut resources = std::collections::HashMap::new();
        resources.insert(
            "organizations".to_string(),
            RestResource {
                methods: std::collections::HashMap::new(),
                resources: sub_resources,
            },
        );
        let doc = RestDescription {
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
        let mut nested_methods = std::collections::HashMap::new();
        nested_methods.insert(
            "get-membership".to_string(),
            crate::openapi::discovery::RestMethod {
                http_method: "GET".to_string(),
                path: "/organizations/{org_id}/memberships/{membership_id}".to_string(),
                description: Some("Get a membership".to_string()),
                ..Default::default()
            },
        );
        let mut sub_resources = std::collections::HashMap::new();
        sub_resources.insert(
            "memberships".to_string(),
            RestResource {
                methods: nested_methods,
                resources: std::collections::HashMap::new(),
            },
        );
        let mut resources = std::collections::HashMap::new();
        resources.insert(
            "organizations".to_string(),
            RestResource {
                methods: std::collections::HashMap::new(),
                resources: sub_resources,
            },
        );
        let doc = RestDescription {
            name: "test".to_string(),
            resources,
            ..Default::default()
        };

        let schema = operation_schema(&doc, &["organizations", "memberships"], "get-membership").unwrap();
        assert_eq!(schema["operation"], "organizations.memberships.get-membership");
    }

    #[test]
    fn test_output_inlines_response_schema() {
        // Per ADR-0006: `output` is the fully-inlined JSON Schema of the
        // canonical 2xx response. The renderer dereferences the response
        // SchemaRef against doc.schemas and embeds the result inline.
        use crate::openapi::discovery::{JsonSchema, JsonSchemaProperty, SchemaRef};
        let mut user_props = HashMap::new();
        user_props.insert(
            "id".to_string(),
            JsonSchemaProperty {
                prop_type: Some("string".to_string()),
                description: Some("User id".to_string()),
                ..Default::default()
            },
        );
        let user_schema = JsonSchema {
            schema_type: Some("object".to_string()),
            properties: user_props,
            required: vec!["id".to_string()],
            ..Default::default()
        };
        let mut schemas = HashMap::new();
        schemas.insert("User".to_string(), user_schema);

        let method = RestMethod {
            http_method: "GET".to_string(),
            path: "/user".to_string(),
            response: Some(SchemaRef {
                schema_ref: Some("User".to_string()),
                ..Default::default()
            }),
            ..Default::default()
        };
        let schema = build_operation_schema(&["users"], "get", &method, &schemas);
        let output = &schema["output"];
        assert_eq!(output["type"], "object");
        assert_eq!(output["properties"]["id"]["type"], "string");
        assert_eq!(output["required"][0], "id");
    }

    #[test]
    fn test_output_cycle_detection_emits_ref_pointer_on_self_reference() {
        // Per ADR-0006: cycles in the response schema (e.g. User.manager:
        // User) must not produce infinite expansion. When the renderer
        // re-encounters a ref currently in its expansion stack, it emits
        // {"$ref": name} to break the loop.
        use crate::openapi::discovery::{JsonSchema, JsonSchemaProperty, SchemaRef};
        let mut user_props = HashMap::new();
        user_props.insert(
            "id".to_string(),
            JsonSchemaProperty {
                prop_type: Some("string".to_string()),
                ..Default::default()
            },
        );
        user_props.insert(
            "manager".to_string(),
            JsonSchemaProperty {
                schema_ref: Some("User".to_string()),
                ..Default::default()
            },
        );
        let user_schema = JsonSchema {
            schema_type: Some("object".to_string()),
            properties: user_props,
            ..Default::default()
        };
        let mut schemas = HashMap::new();
        schemas.insert("User".to_string(), user_schema);

        let method = RestMethod {
            http_method: "GET".to_string(),
            path: "/user".to_string(),
            response: Some(SchemaRef {
                schema_ref: Some("User".to_string()),
                ..Default::default()
            }),
            ..Default::default()
        };
        let schema = build_operation_schema(&["users"], "get", &method, &schemas);
        let output = &schema["output"];
        // Top level is fully inlined.
        assert_eq!(output["type"], "object");
        assert_eq!(output["properties"]["id"]["type"], "string");
        // The recursive `manager` slot must break with a $ref pointer,
        // not infinite-loop.
        assert_eq!(
            output["properties"]["manager"]["$ref"], "User",
            "self-referential schema should emit $ref to break the cycle: {output}",
        );
    }

    #[test]
    fn test_output_unresolved_ref_omits_field() {
        // When the response ref points to a name not in doc.schemas, the
        // renderer omits `output` rather than emitting a useless $ref the
        // agent can't resolve.
        use crate::openapi::discovery::SchemaRef;
        let method = RestMethod {
            http_method: "GET".to_string(),
            path: "/user".to_string(),
            response: Some(SchemaRef {
                schema_ref: Some("MissingType".to_string()),
                ..Default::default()
            }),
            ..Default::default()
        };
        let schema = build_operation_schema(&["users"], "get", &method, &HashMap::new());
        assert!(schema.get("output").is_none(), "unresolved response ref should omit `output`: {schema}");
    }

    #[test]
    fn test_body_fields_surface_in_input_with_location_body() {
        // Per ADR-0006: body fields appear in `input.properties` as
        // siblings of query/path/header params, tagged
        // `location: "body"`. Required body fields union into
        // input.required.
        use crate::openapi::discovery::{JsonSchema, JsonSchemaProperty, SchemaRef};
        let mut body_props = HashMap::new();
        body_props.insert(
            "name".to_string(),
            JsonSchemaProperty {
                prop_type: Some("string".to_string()),
                description: Some("Display name".to_string()),
                ..Default::default()
            },
        );
        body_props.insert(
            "email".to_string(),
            JsonSchemaProperty {
                prop_type: Some("string".to_string()),
                format: Some("email".to_string()),
                ..Default::default()
            },
        );
        let mut schemas = HashMap::new();
        schemas.insert(
            "CreateUser".to_string(),
            JsonSchema {
                schema_type: Some("object".to_string()),
                properties: body_props,
                required: vec!["name".to_string()],
                ..Default::default()
            },
        );
        let method = RestMethod {
            http_method: "POST".to_string(),
            path: "/users".to_string(),
            request: Some(SchemaRef {
                schema_ref: Some("CreateUser".to_string()),
                ..Default::default()
            }),
            ..Default::default()
        };
        let schema = build_operation_schema(&["users"], "create", &method, &schemas);
        let props = &schema["input"]["properties"];
        assert_eq!(props["name"]["location"], "body", "name should be body: {schema}");
        assert_eq!(props["email"]["location"], "body", "email should be body: {schema}");
        assert_eq!(props["email"]["format"], "email");
        let required = schema["input"]["required"].as_array().unwrap();
        assert!(
            required.iter().any(|v| v == "name"),
            "required body field must propagate into input.required: {required:?}",
        );
    }

    #[test]
    fn test_body_field_collision_keeps_query_param_wins() {
        // When a body field and a query/path/header param share a name,
        // the spec-declared parameter wins (existing CLI behavior). The
        // body field is dropped to avoid a contradictory location tag.
        use crate::openapi::discovery::{JsonSchema, JsonSchemaProperty, MethodParameter, SchemaRef};
        let mut body_props = HashMap::new();
        body_props.insert(
            "id".to_string(),
            JsonSchemaProperty {
                prop_type: Some("string".to_string()),
                ..Default::default()
            },
        );
        let mut schemas = HashMap::new();
        schemas.insert(
            "Update".to_string(),
            JsonSchema {
                schema_type: Some("object".to_string()),
                properties: body_props,
                ..Default::default()
            },
        );
        let mut params = HashMap::new();
        params.insert(
            "id".to_string(),
            MethodParameter {
                param_type: Some("string".to_string()),
                location: Some("path".to_string()),
                required: true,
                ..Default::default()
            },
        );
        let method = RestMethod {
            http_method: "PUT".to_string(),
            path: "/users/{id}".to_string(),
            parameters: params,
            request: Some(SchemaRef {
                schema_ref: Some("Update".to_string()),
                ..Default::default()
            }),
            ..Default::default()
        };
        let schema = build_operation_schema(&["users"], "update", &method, &schemas);
        assert_eq!(
            schema["input"]["properties"]["id"]["location"], "path",
            "path param must win over colliding body field: {schema}",
        );
    }

    #[test]
    fn test_body_all_of_merge_surfaces_fields_from_all_branches() {
        // Per ADR-0004 + ADR-0006: body schemas using `allOf` get
        // flattened so every branch's fields surface as `input`
        // properties — same lowering the command builder applies.
        use crate::openapi::discovery::{JsonSchema, JsonSchemaProperty, SchemaRef};
        let mut base_props = HashMap::new();
        base_props.insert(
            "id".to_string(),
            JsonSchemaProperty {
                prop_type: Some("string".to_string()),
                ..Default::default()
            },
        );
        let base = JsonSchema {
            schema_type: Some("object".to_string()),
            properties: base_props,
            required: vec!["id".to_string()],
            ..Default::default()
        };
        let mut overlay_props = HashMap::new();
        overlay_props.insert(
            "extra".to_string(),
            JsonSchemaProperty {
                prop_type: Some("string".to_string()),
                ..Default::default()
            },
        );
        let composed = JsonSchema {
            all_of: vec![
                // ref branch → Base
                JsonSchemaProperty {
                    schema_ref: Some("Base".to_string()),
                    ..Default::default()
                },
                // inline branch with `extra`
                JsonSchemaProperty {
                    properties: overlay_props,
                    ..Default::default()
                },
            ],
            ..Default::default()
        };
        let mut schemas = HashMap::new();
        schemas.insert("Base".to_string(), base);
        schemas.insert("Composed".to_string(), composed);

        let method = RestMethod {
            http_method: "POST".to_string(),
            path: "/things".to_string(),
            request: Some(SchemaRef {
                schema_ref: Some("Composed".to_string()),
                ..Default::default()
            }),
            ..Default::default()
        };
        let schema = build_operation_schema(&["things"], "create", &method, &schemas);
        let props = &schema["input"]["properties"];
        assert_eq!(props["id"]["location"], "body", "Base.id should surface: {schema}");
        assert_eq!(props["extra"]["location"], "body", "overlay.extra should surface: {schema}");
        let required = schema["input"]["required"].as_array().unwrap();
        assert!(
            required.iter().any(|v| v == "id"),
            "Base.required must union into input.required: {required:?}",
        );
    }

    #[test]
    fn test_body_field_default_surfaces_under_server_default_with_wire_type_preserved() {
        // Body schemas only carry OpenAPI's `default:` keyword (no
        // x-fern-default for body fields), so it must emit under
        // `serverDefault`, not `default`. Wire type must round-trip
        // through the IR — a numeric default stays a JSON number.
        use crate::openapi::discovery::{JsonSchema, JsonSchemaProperty, SchemaRef};
        let mut body_props = HashMap::new();
        body_props.insert(
            "limit".to_string(),
            JsonSchemaProperty {
                prop_type: Some("integer".to_string()),
                default: Some(serde_json::json!(50)),
                ..Default::default()
            },
        );
        let mut schemas = HashMap::new();
        schemas.insert(
            "ListReq".to_string(),
            JsonSchema {
                schema_type: Some("object".to_string()),
                properties: body_props,
                ..Default::default()
            },
        );
        let method = RestMethod {
            http_method: "POST".to_string(),
            path: "/things/search".to_string(),
            request: Some(SchemaRef {
                schema_ref: Some("ListReq".to_string()),
                ..Default::default()
            }),
            ..Default::default()
        };
        let schema = build_operation_schema(&["things"], "search", &method, &schemas);
        let limit = &schema["input"]["properties"]["limit"];
        assert!(
            limit.get("default").is_none(),
            "body field has no x-fern-default — `default` key must be absent: {schema}",
        );
        assert_eq!(
            limit["serverDefault"], 50,
            "OpenAPI `default:` keyword must surface under `serverDefault` as a native JSON number: {schema}",
        );
    }

    #[test]
    fn test_nested_object_body_field_required_surfaces_per_object() {
        // ADR-0006 R1 #2: a nested object body field that declares its
        // own `required: [...]` must surface that array in --schema.
        // Without this, agents constructing nested `--json` payloads
        // would silently miss sub-required fields.
        use crate::openapi::discovery::{JsonSchema, JsonSchemaProperty, SchemaRef};
        let mut address_props = HashMap::new();
        address_props.insert(
            "street".to_string(),
            JsonSchemaProperty {
                prop_type: Some("string".to_string()),
                ..Default::default()
            },
        );
        address_props.insert(
            "zip".to_string(),
            JsonSchemaProperty {
                prop_type: Some("string".to_string()),
                ..Default::default()
            },
        );
        let address = JsonSchemaProperty {
            prop_type: Some("object".to_string()),
            properties: address_props,
            required: vec!["street".to_string()],
            ..Default::default()
        };
        let mut body_props = HashMap::new();
        body_props.insert("address".to_string(), address);
        let mut schemas = HashMap::new();
        schemas.insert(
            "CreateUser".to_string(),
            JsonSchema {
                schema_type: Some("object".to_string()),
                properties: body_props,
                ..Default::default()
            },
        );
        let method = RestMethod {
            http_method: "POST".to_string(),
            path: "/users".to_string(),
            request: Some(SchemaRef {
                schema_ref: Some("CreateUser".to_string()),
                ..Default::default()
            }),
            ..Default::default()
        };
        let schema = build_operation_schema(&["users"], "create", &method, &schemas);
        let address = &schema["input"]["properties"]["address"];
        let nested_required = address["required"].as_array().expect(
            "nested object body field must carry its own `required` array",
        );
        assert!(
            nested_required.iter().any(|v| v == "street"),
            "nested required array must include `street`: {schema}",
        );
    }

    #[test]
    fn test_body_required_does_not_elevate_optional_colliding_query_param() {
        // ADR-0006 R1 #3: a required body field whose name collides
        // with an OPTIONAL query/path/header param must NOT elevate the
        // surviving (param) entry to required. The body field lost the
        // collision; its required-ness lost with it.
        use crate::openapi::discovery::{JsonSchema, JsonSchemaProperty, MethodParameter, SchemaRef};
        let mut body_props = HashMap::new();
        body_props.insert(
            "id".to_string(),
            JsonSchemaProperty {
                prop_type: Some("string".to_string()),
                ..Default::default()
            },
        );
        let mut schemas = HashMap::new();
        schemas.insert(
            "Update".to_string(),
            JsonSchema {
                schema_type: Some("object".to_string()),
                properties: body_props,
                required: vec!["id".to_string()],
                ..Default::default()
            },
        );
        let mut params = HashMap::new();
        params.insert(
            "id".to_string(),
            MethodParameter {
                param_type: Some("string".to_string()),
                location: Some("query".to_string()),
                required: false,
                ..Default::default()
            },
        );
        let method = RestMethod {
            http_method: "PUT".to_string(),
            path: "/users".to_string(),
            parameters: params,
            request: Some(SchemaRef {
                schema_ref: Some("Update".to_string()),
                ..Default::default()
            }),
            ..Default::default()
        };
        let schema = build_operation_schema(&["users"], "update", &method, &schemas);
        let required = schema["input"]["required"].as_array().unwrap();
        assert!(
            !required.iter().any(|v| v == "id"),
            "optional query param must not be elevated to required by a colliding body field: {schema}",
        );
        // Sanity: the surviving param still has location: query.
        assert_eq!(schema["input"]["properties"]["id"]["location"], "query");
    }

    #[test]
    fn test_body_required_does_not_re_mark_variable_bound_param_required() {
        // ADR-0006 R1 #3: variable-bound path params are deliberately
        // excluded from `required` (see the variable_reference branch
        // earlier in build_operation_schema). A colliding required body
        // field must not silently re-elevate them.
        use crate::openapi::discovery::{JsonSchema, JsonSchemaProperty, MethodParameter, SchemaRef};
        let mut params = HashMap::new();
        params.insert(
            "gardenId".to_string(),
            MethodParameter {
                param_type: Some("string".to_string()),
                location: Some("path".to_string()),
                required: true,
                variable_reference: Some("gardenId".to_string()),
                ..Default::default()
            },
        );
        let mut body_props = HashMap::new();
        body_props.insert(
            "gardenId".to_string(),
            JsonSchemaProperty {
                prop_type: Some("string".to_string()),
                ..Default::default()
            },
        );
        let mut schemas = HashMap::new();
        schemas.insert(
            "GardenPayload".to_string(),
            JsonSchema {
                schema_type: Some("object".to_string()),
                properties: body_props,
                required: vec!["gardenId".to_string()],
                ..Default::default()
            },
        );
        let method = RestMethod {
            http_method: "POST".to_string(),
            path: "/gardens/{gardenId}/things".to_string(),
            parameters: params,
            request: Some(SchemaRef {
                schema_ref: Some("GardenPayload".to_string()),
                ..Default::default()
            }),
            ..Default::default()
        };
        let schema = build_operation_schema(&["gardens"], "create", &method, &schemas);
        let required = schema["input"]["required"].as_array().unwrap();
        assert!(
            !required.iter().any(|v| v == "gardenId"),
            "variable-bound param must not be re-elevated to required by a colliding body field: {schema}",
        );
        // Sanity: variable-bound annotations preserved.
        let garden = &schema["input"]["properties"]["gardenId"];
        assert_eq!(garden["binding"], "sdk-variable");
        assert_eq!(garden["globalFlag"], "--garden-id");
    }

    #[test]
    fn test_body_all_of_arbitrarily_deep_inline_chain_surfaces_all_branches() {
        // Inline allOf composition of arbitrary depth must fully recurse
        // so the agent contract matches the body validator. Triple-nested
        // shape: outer wraps an inline that wraps an inline that carries
        // a $ref(Base). All three layers contribute properties; the deepest
        // $ref must still resolve.
        use crate::openapi::discovery::{JsonSchema, JsonSchemaProperty, SchemaRef};
        let mut base_props = HashMap::new();
        base_props.insert(
            "from_base".to_string(),
            JsonSchemaProperty {
                prop_type: Some("string".to_string()),
                ..Default::default()
            },
        );
        let base = JsonSchema {
            schema_type: Some("object".to_string()),
            properties: base_props,
            ..Default::default()
        };
        // Level 3 (innermost inline): one $ref to Base + own property `z`.
        let mut l3_props = HashMap::new();
        l3_props.insert(
            "z".to_string(),
            JsonSchemaProperty {
                prop_type: Some("string".to_string()),
                ..Default::default()
            },
        );
        let l3 = JsonSchemaProperty {
            all_of: vec![JsonSchemaProperty {
                schema_ref: Some("Base".to_string()),
                ..Default::default()
            }],
            properties: l3_props,
            ..Default::default()
        };
        // Level 2: wraps level 3 + own property `y`.
        let mut l2_props = HashMap::new();
        l2_props.insert(
            "y".to_string(),
            JsonSchemaProperty {
                prop_type: Some("string".to_string()),
                ..Default::default()
            },
        );
        let l2 = JsonSchemaProperty {
            all_of: vec![l3],
            properties: l2_props,
            ..Default::default()
        };
        // Level 1: the schema's only allOf entry, wraps level 2.
        let composed = JsonSchema {
            all_of: vec![l2],
            ..Default::default()
        };
        let mut schemas = HashMap::new();
        schemas.insert("Base".to_string(), base);
        schemas.insert("Composed".to_string(), composed);

        let method = RestMethod {
            http_method: "POST".to_string(),
            path: "/deep".to_string(),
            request: Some(SchemaRef {
                schema_ref: Some("Composed".to_string()),
                ..Default::default()
            }),
            ..Default::default()
        };
        let schema = build_operation_schema(&["deep"], "create", &method, &schemas);
        let props = &schema["input"]["properties"];
        for expected in ["from_base", "y", "z"] {
            assert_eq!(
                props[expected]["location"], "body",
                "expected {expected} from triple-nested inline allOf: {schema}",
            );
        }
    }

    #[test]
    fn test_body_all_of_inline_branch_required_propagates_into_input_required() {
        // Devin review (#1): inline allOf branches carry their own
        // `required: [...]` (JsonSchemaProperty.required, added in
        // Round 1 #2). `merge_schema_properties` must read it so those
        // names flow into `input.required`. Without this, an inline
        // overlay branch like `{type:object, required:[extra],
        // properties:{extra:...}}` surfaces `extra` as a property but
        // doesn't mark it required.
        use crate::openapi::discovery::{JsonSchema, JsonSchemaProperty, SchemaRef};
        let mut base_props = HashMap::new();
        base_props.insert(
            "id".to_string(),
            JsonSchemaProperty {
                prop_type: Some("string".to_string()),
                ..Default::default()
            },
        );
        let base = JsonSchema {
            schema_type: Some("object".to_string()),
            properties: base_props,
            ..Default::default()
        };
        let mut overlay_props = HashMap::new();
        overlay_props.insert(
            "extra".to_string(),
            JsonSchemaProperty {
                prop_type: Some("string".to_string()),
                ..Default::default()
            },
        );
        let composed = JsonSchema {
            all_of: vec![
                JsonSchemaProperty {
                    schema_ref: Some("Base".to_string()),
                    ..Default::default()
                },
                // Inline overlay branch with required: [extra] on the
                // branch itself.
                JsonSchemaProperty {
                    properties: overlay_props,
                    required: vec!["extra".to_string()],
                    ..Default::default()
                },
            ],
            ..Default::default()
        };
        let mut schemas = HashMap::new();
        schemas.insert("Base".to_string(), base);
        schemas.insert("Composed".to_string(), composed);

        let method = RestMethod {
            http_method: "POST".to_string(),
            path: "/things".to_string(),
            request: Some(SchemaRef {
                schema_ref: Some("Composed".to_string()),
                ..Default::default()
            }),
            ..Default::default()
        };
        let schema = build_operation_schema(&["things"], "create", &method, &schemas);
        let required = schema["input"]["required"].as_array().unwrap();
        assert!(
            required.iter().any(|v| v == "extra"),
            "inline allOf branch's `required: [extra]` must propagate into input.required: {schema}",
        );
    }

    #[test]
    fn test_body_all_of_inline_branch_recurses_into_nested_composition() {
        // ADR-0006 R1 #6: an inline allOf branch (no schema_ref of its
        // own) that itself uses allOf must have its nested composition
        // walked — otherwise --schema diverges from the executor's body
        // validator (which DOES recurse). Mirrors
        // executor.rs::walk_all_of_for_validate.
        use crate::openapi::discovery::{JsonSchema, JsonSchemaProperty, SchemaRef};
        let mut base_props = HashMap::new();
        base_props.insert(
            "id".to_string(),
            JsonSchemaProperty {
                prop_type: Some("string".to_string()),
                ..Default::default()
            },
        );
        let base = JsonSchema {
            schema_type: Some("object".to_string()),
            properties: base_props,
            ..Default::default()
        };
        let mut overlay_props = HashMap::new();
        overlay_props.insert(
            "y".to_string(),
            JsonSchemaProperty {
                prop_type: Some("string".to_string()),
                ..Default::default()
            },
        );
        // Inline branch that ITSELF carries a nested allOf with a $ref.
        let inline_branch = JsonSchemaProperty {
            all_of: vec![JsonSchemaProperty {
                schema_ref: Some("Base".to_string()),
                ..Default::default()
            }],
            properties: overlay_props,
            ..Default::default()
        };
        let composed = JsonSchema {
            all_of: vec![inline_branch],
            ..Default::default()
        };
        let mut schemas = HashMap::new();
        schemas.insert("Base".to_string(), base);
        schemas.insert("Composed".to_string(), composed);

        let method = RestMethod {
            http_method: "POST".to_string(),
            path: "/things".to_string(),
            request: Some(SchemaRef {
                schema_ref: Some("Composed".to_string()),
                ..Default::default()
            }),
            ..Default::default()
        };
        let schema = build_operation_schema(&["things"], "create", &method, &schemas);
        let props = &schema["input"]["properties"];
        assert_eq!(
            props["id"]["location"], "body",
            "Base.id (via nested allOf in inline branch) must surface: {schema}",
        );
        assert_eq!(
            props["y"]["location"], "body",
            "inline branch's own property must still surface: {schema}",
        );
    }

    #[test]
    fn test_nonfinite_min_max_omitted_not_emitted_as_null() {
        // ADR-0006 R3 #14: NaN / ±Infinity in min/max bounds have no
        // JSON representation. Without the `is_finite()` gate they
        // would emit as `null`, indistinguishable from a deliberate
        // JSON null. Confirm they're omitted entirely.
        use crate::openapi::discovery::{JsonSchema, JsonSchemaProperty, SchemaRef};
        let mut body_props = HashMap::new();
        body_props.insert(
            "score".to_string(),
            JsonSchemaProperty {
                prop_type: Some("number".to_string()),
                minimum: Some(f64::NAN),
                maximum: Some(f64::INFINITY),
                exclusive_minimum: Some(f64::NEG_INFINITY),
                exclusive_maximum: Some(0.5), // a real one should still surface
                ..Default::default()
            },
        );
        let mut schemas = HashMap::new();
        schemas.insert(
            "Body".to_string(),
            JsonSchema {
                schema_type: Some("object".to_string()),
                properties: body_props,
                ..Default::default()
            },
        );
        let method = RestMethod {
            http_method: "POST".to_string(),
            path: "/scores".to_string(),
            request: Some(SchemaRef {
                schema_ref: Some("Body".to_string()),
                ..Default::default()
            }),
            ..Default::default()
        };
        let schema = build_operation_schema(&["scores"], "create", &method, &schemas);
        let score = &schema["input"]["properties"]["score"];
        assert!(score.get("minimum").is_none(), "NaN minimum must be omitted: {schema}");
        assert!(score.get("maximum").is_none(), "+Inf maximum must be omitted: {schema}");
        assert!(score.get("exclusiveMinimum").is_none(), "-Inf exclusiveMinimum must be omitted: {schema}");
        assert_eq!(
            score["exclusiveMaximum"], 0.5,
            "finite bound must still surface alongside the non-finite ones being skipped: {schema}",
        );
    }

    #[test]
    fn test_capability_hint_binary_response() {
        // Per ADR-0006: `binaryResponse: true` surfaces on ops with a
        // binary 2xx so the agent knows `--output PATH` applies.
        // Omitted when false to keep the JSON tight.
        let method = RestMethod {
            http_method: "GET".to_string(),
            path: "/file".to_string(),
            has_binary_response: true,
            ..Default::default()
        };
        let schema = build_operation_schema(&["files"], "download", &method, &HashMap::new());
        assert_eq!(schema["binaryResponse"], true, "schema: {schema}");

        let method2 = RestMethod {
            http_method: "GET".to_string(),
            path: "/file".to_string(),
            ..Default::default()
        };
        let schema2 = build_operation_schema(&["files"], "list", &method2, &HashMap::new());
        assert!(schema2.get("binaryResponse").is_none(), "false default should be omitted: {schema2}");
    }

    #[test]
    fn test_capability_hint_paginable_cursor() {
        // Cursor-style pagination surfaces structured hints — the
        // agent reads `cursorParam`, `nextCursorPath`, `resultsPath`
        // and knows how `--page-all` will iterate.
        let method = RestMethod {
            http_method: "GET".to_string(),
            path: "/things".to_string(),
            pagination: Some(crate::openapi::discovery::PaginationConfig::Cursor {
                cursor: "page_token".to_string(),
                next_cursor: "next_page_token".to_string(),
                results: "items".to_string(),
            }),
            ..Default::default()
        };
        let schema = build_operation_schema(&["things"], "list", &method, &HashMap::new());
        let p = &schema["paginable"];
        assert_eq!(p["kind"], "cursor");
        assert_eq!(p["cursorParam"], "page_token");
        assert_eq!(p["nextCursorPath"], "next_page_token");
        assert_eq!(p["resultsPath"], "items");
    }

    #[test]
    fn test_capability_hint_streaming_sse_with_terminator() {
        let method = RestMethod {
            http_method: "POST".to_string(),
            path: "/chat".to_string(),
            streaming: Some(crate::openapi::discovery::StreamingConfig::Sse {
                terminator: Some("[DONE]".to_string()),
            }),
            ..Default::default()
        };
        let schema = build_operation_schema(&["chat"], "stream", &method, &HashMap::new());
        let s = &schema["streaming"];
        assert_eq!(s["format"], "sse");
        assert_eq!(s["terminator"], "[DONE]");
    }

    #[test]
    fn test_per_property_metadata_surfaces_default_format_nullable_deprecated_constraints() {
        // Per ADR-0006 phase 4: every per-property field an agent needs
        // to drive the CLI correctly is surfaced. `default` is the
        // client-side substitution (x-fern-default); `serverDefault` is
        // the documentation-only hint (OpenAPI's `default:`).
        use crate::openapi::discovery::MethodParameter;
        let mut params = HashMap::new();
        params.insert(
            "limit".to_string(),
            MethodParameter {
                param_type: Some("integer".to_string()),
                description: Some("Page size".to_string()),
                location: Some("query".to_string()),
                format: Some("int32".to_string()),
                default_value: Some(serde_json::json!(50)),
                documentation_default_value: Some(serde_json::json!(20)),
                nullable: true,
                deprecated: true,
                minimum: Some(1.0),
                maximum: Some(100.0),
                ..Default::default()
            },
        );
        let method = RestMethod {
            http_method: "GET".to_string(),
            path: "/things".to_string(),
            parameters: params,
            ..Default::default()
        };
        let schema = build_operation_schema(&["things"], "list", &method, &HashMap::new());
        let limit = &schema["input"]["properties"]["limit"];
        assert_eq!(limit["default"], 50, "client default surfaces under `default`: {schema}");
        assert_eq!(limit["serverDefault"], 20, "doc default surfaces under `serverDefault`: {schema}");
        assert_eq!(limit["format"], "int32");
        assert_eq!(limit["nullable"], true);
        assert_eq!(limit["deprecated"], true);
        // Param bounds emit as JSON numbers (symmetric with body-field
        // bounds rendered via `render_property`). The old contract
        // emitted strings here; ADR-0006 Devin #3 aligned both sides.
        // f64 source preserves through serde_json as Number(1.0).
        assert_eq!(limit["minimum"], 1.0);
        assert_eq!(limit["maximum"], 100.0);
    }

    #[test]
    fn test_param_and_body_field_bounds_share_same_json_number_type() {
        // Devin review (#3): a query/path/header param with the same
        // numeric bounds as a body field must surface the same JSON
        // type in --schema. Pre-fix, params emitted strings and bodies
        // emitted numbers — agents parsing constraints uniformly got
        // burned by the inconsistency.
        use crate::openapi::discovery::{JsonSchema, JsonSchemaProperty, MethodParameter, SchemaRef};
        let mut params = HashMap::new();
        params.insert(
            "score_param".to_string(),
            MethodParameter {
                param_type: Some("number".to_string()),
                location: Some("query".to_string()),
                minimum: Some(0.0),
                maximum: Some(1.0),
                ..Default::default()
            },
        );
        let mut body_props = HashMap::new();
        body_props.insert(
            "score_body".to_string(),
            JsonSchemaProperty {
                prop_type: Some("number".to_string()),
                minimum: Some(0.0),
                maximum: Some(1.0),
                ..Default::default()
            },
        );
        let mut schemas = HashMap::new();
        schemas.insert(
            "Body".to_string(),
            JsonSchema {
                schema_type: Some("object".to_string()),
                properties: body_props,
                ..Default::default()
            },
        );
        let method = RestMethod {
            http_method: "POST".to_string(),
            path: "/scores".to_string(),
            parameters: params,
            request: Some(SchemaRef {
                schema_ref: Some("Body".to_string()),
                ..Default::default()
            }),
            ..Default::default()
        };
        let schema = build_operation_schema(&["scores"], "create", &method, &schemas);
        let props = &schema["input"]["properties"];
        // Both must surface as JSON numbers.
        assert!(props["score_param"]["minimum"].is_number(), "param min must be JSON number: {schema}");
        assert!(props["score_body"]["minimum"].is_number(), "body min must be JSON number: {schema}");
        assert_eq!(props["score_param"]["minimum"], props["score_body"]["minimum"]);
        assert_eq!(props["score_param"]["maximum"], props["score_body"]["maximum"]);
    }

    #[test]
    fn test_output_absent_when_method_has_no_response() {
        // Operations with no declared response schema (e.g. 204) emit no
        // `output` field — the agent gets the per-op envelope without it.
        let method = RestMethod {
            http_method: "DELETE".to_string(),
            path: "/user".to_string(),
            response: None,
            ..Default::default()
        };
        let schema = build_operation_schema(&["users"], "delete", &method, &HashMap::new());
        assert!(schema.get("output").is_none(), "no response → no `output` field: {schema}");
    }

    #[test]
    fn test_render_schema_dispatches_nested_path() {
        let mut nested_methods = std::collections::HashMap::new();
        nested_methods.insert(
            "get-membership".to_string(),
            crate::openapi::discovery::RestMethod {
                http_method: "GET".to_string(),
                path: "/orgs/{id}/memberships/{mid}".to_string(),
                ..Default::default()
            },
        );
        let mut sub_resources = std::collections::HashMap::new();
        sub_resources.insert(
            "memberships".to_string(),
            RestResource {
                methods: nested_methods,
                resources: std::collections::HashMap::new(),
            },
        );
        let mut resources = std::collections::HashMap::new();
        resources.insert(
            "organizations".to_string(),
            RestResource {
                methods: std::collections::HashMap::new(),
                resources: sub_resources,
            },
        );
        let doc = RestDescription {
            name: "test".to_string(),
            resources,
            ..Default::default()
        };

        let path: Vec<String> = vec!["organizations".into(), "memberships".into(), "get-membership".into()];
        // Should resolve as the leaf operation, not be misrouted via "memberships" as method name.
        let result = build_schema(&doc, &path);
        assert!(result.is_some(), "nested path should resolve correctly");
    }

    #[test]
    fn test_repeated_param_rendered_as_array_in_schema() {
        let mut params = HashMap::new();
        params.insert(
            "tags".to_string(),
            MethodParameter {
                param_type: Some("string".to_string()),
                description: Some("Tags".to_string()),
                location: Some("body".to_string()),
                repeated: true,
                ..Default::default()
            },
        );
        params.insert(
            "subject".to_string(),
            MethodParameter {
                param_type: Some("string".to_string()),
                description: Some("Subject line".to_string()),
                location: Some("body".to_string()),
                ..Default::default()
            },
        );
        let method = RestMethod {
            http_method: "POST".to_string(),
            path: "/messages/send".to_string(),
            parameters: params,
            ..Default::default()
        };
        let schema = build_operation_schema(&["messages"], "send", &method, &HashMap::new());
        let props = &schema["input"]["properties"];

        // Pure array param: type is array with items.
        assert_eq!(props["tags"]["type"], "array");
        assert_eq!(props["tags"]["items"]["type"], "string");

        // Scalar param: plain type.
        assert_eq!(props["subject"]["type"], "string");
        assert!(props["subject"]["items"].is_null());
    }

    #[test]
    fn test_scalar_or_array_union_rendered_as_oneof_in_schema() {
        let mut params = HashMap::new();
        params.insert(
            "to".to_string(),
            MethodParameter {
                param_type: Some("string".to_string()),
                description: Some("Recipient addresses".to_string()),
                location: Some("body".to_string()),
                repeated: true,
                scalar_or_array: true,
                ..Default::default()
            },
        );
        let method = RestMethod {
            http_method: "POST".to_string(),
            path: "/messages/send".to_string(),
            parameters: params,
            ..Default::default()
        };
        let schema = build_operation_schema(&["messages"], "send", &method, &HashMap::new());
        let props = &schema["input"]["properties"];

        // Union param: oneOf [string, array<string>].
        assert!(props["to"]["type"].is_null(), "should not have top-level type");
        let one_of = props["to"]["oneOf"].as_array().unwrap();
        assert_eq!(one_of.len(), 2);
        assert_eq!(one_of[0]["type"], "string");
        assert_eq!(one_of[1]["type"], "array");
        assert_eq!(one_of[1]["items"]["type"], "string");
        assert_eq!(props["to"]["description"], "Recipient addresses");
    }
}
