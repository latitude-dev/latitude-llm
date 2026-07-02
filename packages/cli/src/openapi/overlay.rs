//! OpenAPI Overlay support (v1.0.0)
//!
//! Applies [OpenAPI Overlays](https://spec.openapis.org/overlay/latest.html) to
//! an OpenAPI document represented as a generic JSON value. Each overlay contains
//! a list of *actions* whose `target` is a JSONPath (RFC 9535) expression. Actions
//! either **update** (deep-merge) or **remove** matched nodes.

use serde::Deserialize;
use serde_json::Value;
use serde_json_path::JsonPath;

use crate::error::CliError;

// ---------------------------------------------------------------------------
// Overlay document types
// ---------------------------------------------------------------------------

/// A single overlay action targeting nodes via a JSONPath expression.
#[derive(Debug, Clone, Deserialize)]
pub struct OverlayAction {
    /// JSONPath (RFC 9535) expression selecting target nodes.
    pub target: String,
    /// Human-readable description of the action.
    #[serde(default)]
    pub description: Option<String>,
    /// Value to deep-merge into each matched node. Required when `remove` is
    /// false/absent.
    #[serde(default)]
    pub update: Option<Value>,
    /// When `true`, matched nodes are removed instead of updated.
    #[serde(default)]
    pub remove: bool,
}

/// Metadata block inside an overlay document.
#[derive(Debug, Clone, Deserialize)]
pub struct OverlayInfo {
    pub title: String,
    pub version: String,
}

/// A complete overlay document.
#[derive(Debug, Clone, Deserialize)]
pub struct OverlayDocument {
    /// Overlay specification version (e.g. `"1.0.0"`).
    pub overlay: String,
    /// Metadata about this overlay.
    pub info: OverlayInfo,
    /// Optional base document this overlay extends.
    #[serde(default)]
    pub extends: Option<String>,
    /// Ordered list of actions to apply.
    pub actions: Vec<OverlayAction>,
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/// Parse an overlay document from a YAML or JSON string.
pub fn parse_overlay(input: &str) -> Result<OverlayDocument, CliError> {
    // Try JSON first, then YAML
    serde_json::from_str::<OverlayDocument>(input)
        .or_else(|_| {
            let yaml_value: serde_yaml::Value = serde_yaml::from_str(input)
                .map_err(|e| CliError::Discovery(format!("Failed to parse overlay file: {e}")))?;
            let json_value = yaml_to_json(yaml_value);
            serde_json::from_value::<OverlayDocument>(json_value)
                .map_err(|e| CliError::Discovery(format!("Failed to parse overlay file: {e}")))
        })
        .map_err(|e| match e {
            CliError::Discovery(_) => e,
            _ => CliError::Discovery(format!("Failed to parse overlay file: {e}")),
        })
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/// Validate the structure of a parsed overlay document.
pub fn validate_overlay(overlay: &OverlayDocument) -> Result<(), CliError> {
    if overlay.overlay.is_empty() {
        return Err(CliError::Validation(
            "Overlay file missing required 'overlay' version field".to_string(),
        ));
    }

    if overlay.info.title.is_empty() || overlay.info.version.is_empty() {
        return Err(CliError::Validation(
            "Overlay file missing required 'info.title' or 'info.version' field".to_string(),
        ));
    }

    if overlay.actions.is_empty() {
        return Err(CliError::Validation(
            "Overlay file must have at least one action".to_string(),
        ));
    }

    for (i, action) in overlay.actions.iter().enumerate() {
        if action.target.is_empty() {
            return Err(CliError::Validation(format!(
                "Overlay action at index {i} missing required 'target' field"
            )));
        }
        if action.update.is_none() && !action.remove {
            return Err(CliError::Validation(format!(
                "Overlay action at index {i} must have either 'update' or 'remove'"
            )));
        }
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Application
// ---------------------------------------------------------------------------

/// Apply an overlay document to an OpenAPI spec represented as a JSON value.
///
/// Actions are applied sequentially; each one operates on the result of the
/// previous action. This function does **not** mutate the input — it returns a
/// new value.
pub fn apply_overlay(doc: &Value, overlay: &OverlayDocument) -> Result<Value, CliError> {
    let mut output = doc.clone();

    for (i, action) in overlay.actions.iter().enumerate() {
        let path = JsonPath::parse(&action.target).map_err(|e| {
            CliError::Validation(format!(
                "Invalid JSONPath in overlay action {i} (target: '{}'): {e}",
                action.target
            ))
        })?;

        if action.remove {
            apply_remove(&mut output, &path);
        } else if let Some(ref update) = action.update {
            apply_update(&mut output, &path, update)?;
        }
    }

    Ok(output)
}

/// Apply a remove action: delete all nodes matched by `path`.
fn apply_remove(doc: &mut Value, path: &JsonPath) {
    let located = path.query_located(doc);
    // Collect normalized paths; process in reverse so array indices stay valid
    let mut paths: Vec<Vec<PathSegment>> = located
        .iter()
        .map(|node| normalized_path_to_segments(node.location()))
        .collect();
    paths.sort_by(|a, b| b.cmp(a));

    for segments in &paths {
        remove_at_path(doc, segments);
    }
}

/// Apply an update (deep-merge) action to all nodes matched by `path`.
fn apply_update(doc: &mut Value, path: &JsonPath, update: &Value) -> Result<(), CliError> {
    let located = path.query_located(doc);
    let paths: Vec<Vec<PathSegment>> = located
        .iter()
        .map(|node| normalized_path_to_segments(node.location()))
        .collect();

    if paths.is_empty() {
        return Ok(());
    }

    for segments in &paths {
        if segments.is_empty() {
            // Root target — merge directly into doc
            if let Value::Object(_) = update {
                deep_merge(doc, update);
            }
        } else {
            merge_at_path(doc, segments, update);
        }
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Path navigation helpers
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
enum PathSegment {
    Key(String),
    Index(usize),
}

/// Convert a `serde_json_path` `NormalizedPath` location into our own segment list.
fn normalized_path_to_segments(
    location: &serde_json_path::NormalizedPath<'_>,
) -> Vec<PathSegment> {
    location
        .iter()
        .filter_map(|elem| {
            if let Some(name) = elem.as_name() {
                Some(PathSegment::Key(name.to_string()))
            } else {
                elem.as_index().map(PathSegment::Index)
            }
        })
        .collect()
}


/// Navigate to a path's parent and remove the target node.
fn remove_at_path(doc: &mut Value, segments: &[PathSegment]) {
    if segments.is_empty() {
        return;
    }

    let (parent_segments, last) = segments.split_at(segments.len() - 1);
    let last = &last[0];

    let parent = navigate_to_mut(doc, parent_segments);
    let Some(parent) = parent else { return };

    match last {
        PathSegment::Key(key) => {
            if let Value::Object(map) = parent {
                map.remove(key);
            }
        }
        PathSegment::Index(idx) => {
            if let Value::Array(arr) = parent {
                if *idx < arr.len() {
                    arr.remove(*idx);
                }
            }
        }
    }
}

/// Navigate to a path and deep-merge the update value.
fn merge_at_path(doc: &mut Value, segments: &[PathSegment], update: &Value) {
    let target = navigate_to_mut(doc, segments);
    let Some(target) = target else { return };

    // Match Fern CLI behavior (applyOpenAPIOverlay.ts L74-77): when the target
    // is an array and the update is NOT itself an array, append the value.
    if let Value::Array(arr) = target {
        if !update.is_array() {
            arr.push(update.clone());
            return;
        }
    }

    deep_merge(target, update);
}

/// Walk the JSON tree following the given segments, returning a mutable ref to
/// the target node, or `None` if the path does not exist.
fn navigate_to_mut<'a>(doc: &'a mut Value, segments: &[PathSegment]) -> Option<&'a mut Value> {
    let mut current = doc;
    for segment in segments {
        current = match segment {
            PathSegment::Key(key) => current.get_mut(key.as_str())?,
            PathSegment::Index(idx) => current.get_mut(*idx)?,
        };
    }
    Some(current)
}

// ---------------------------------------------------------------------------
// Deep merge
// ---------------------------------------------------------------------------

/// Recursively merge `update` into `base`, matching lodash `merge` semantics.
///
/// - Objects are merged key-by-key (recursive).
/// - Arrays are merged index-by-index: each element in `update` is deep-merged
///   into the corresponding index of `base`. If `update` is shorter, trailing
///   `base` elements are preserved. If `update` is longer, new elements are
///   appended.
/// - All other types are overwritten.
pub fn deep_merge(base: &mut Value, update: &Value) {
    match (base, update) {
        (Value::Object(base_map), Value::Object(update_map)) => {
            for (key, update_val) in update_map {
                let entry = base_map
                    .entry(key.clone())
                    .or_insert(Value::Null);
                deep_merge(entry, update_val);
            }
        }
        (Value::Array(base_arr), Value::Array(update_arr)) => {
            for (i, update_val) in update_arr.iter().enumerate() {
                if i < base_arr.len() {
                    deep_merge(&mut base_arr[i], update_val);
                } else {
                    base_arr.push(update_val.clone());
                }
            }
        }
        (base, update) => {
            *base = update.clone();
        }
    }
}

// ---------------------------------------------------------------------------
// YAML → JSON conversion
// ---------------------------------------------------------------------------

/// Convert a `serde_yaml::Value` into a `serde_json::Value`.
fn yaml_to_json(yaml: serde_yaml::Value) -> Value {
    match yaml {
        serde_yaml::Value::Null => Value::Null,
        serde_yaml::Value::Bool(b) => Value::Bool(b),
        serde_yaml::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Value::Number(i.into())
            } else if let Some(u) = n.as_u64() {
                Value::Number(u.into())
            } else if let Some(f) = n.as_f64() {
                serde_json::Number::from_f64(f)
                    .map(Value::Number)
                    .unwrap_or(Value::Null)
            } else {
                Value::Null
            }
        }
        serde_yaml::Value::String(s) => Value::String(s),
        serde_yaml::Value::Sequence(seq) => {
            Value::Array(seq.into_iter().map(yaml_to_json).collect())
        }
        serde_yaml::Value::Mapping(map) => {
            let obj = map
                .into_iter()
                .filter_map(|(k, v)| {
                    let key = match k {
                        serde_yaml::Value::String(s) => s,
                        serde_yaml::Value::Number(n) => n.to_string(),
                        serde_yaml::Value::Bool(b) => b.to_string(),
                        _ => return None,
                    };
                    Some((key, yaml_to_json(v)))
                })
                .collect();
            Value::Object(obj)
        }
        serde_yaml::Value::Tagged(tagged) => yaml_to_json(tagged.value),
    }
}

/// Parse an OpenAPI spec string (YAML or JSON) into a `serde_json::Value`,
/// apply a list of overlay strings, and return the modified JSON value
/// serialised back to a YAML string suitable for `load_openapi_spec`.
pub fn apply_overlays_to_spec(
    spec_yaml: &str,
    overlay_strings: &[String],
) -> Result<String, CliError> {
    if overlay_strings.is_empty() {
        return Ok(spec_yaml.to_string());
    }

    // Parse spec into a generic JSON value
    let yaml_value: serde_yaml::Value = serde_yaml::from_str(spec_yaml)
        .map_err(|e| CliError::Discovery(format!("Failed to parse OpenAPI spec: {e}")))?;
    let mut doc = yaml_to_json(yaml_value);

    for (idx, overlay_str) in overlay_strings.iter().enumerate() {
        let overlay = parse_overlay(overlay_str).map_err(|e| {
            CliError::Discovery(format!("Failed to parse overlay {idx}: {e}"))
        })?;
        validate_overlay(&overlay).map_err(|e| {
            CliError::Validation(format!("Invalid overlay {idx}: {e}"))
        })?;

        tracing::debug!(
            "Applying overlay \"{}\" v{}",
            overlay.info.title,
            overlay.info.version
        );

        doc = apply_overlay(&doc, &overlay)?;
    }

    // Serialize back to YAML
    serde_yaml::to_string(&doc)
        .map_err(|e| CliError::Discovery(format!("Failed to serialize overlaid spec: {e}")))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // -- deep_merge --

    #[test]
    fn test_deep_merge_objects() {
        let mut base = json!({"a": 1, "b": {"c": 2}});
        let update = json!({"b": {"d": 3}, "e": 4});
        deep_merge(&mut base, &update);
        assert_eq!(base, json!({"a": 1, "b": {"c": 2, "d": 3}, "e": 4}));
    }

    #[test]
    fn test_deep_merge_overwrites_primitives() {
        let mut base = json!({"a": 1});
        let update = json!({"a": 2});
        deep_merge(&mut base, &update);
        assert_eq!(base, json!({"a": 2}));
    }

    #[test]
    fn test_deep_merge_nested() {
        let mut base = json!({"a": {"b": {"c": 1, "d": 2}}});
        let update = json!({"a": {"b": {"c": 10, "e": 3}}});
        deep_merge(&mut base, &update);
        assert_eq!(base, json!({"a": {"b": {"c": 10, "d": 2, "e": 3}}}));
    }

    // -- parse_overlay --

    #[test]
    fn test_parse_overlay_yaml() {
        let yaml = r#"
overlay: "1.0.0"
info:
  title: Test Overlay
  version: "1.0"
actions:
  - target: "$.info"
    update:
      description: "Updated description"
"#;
        let doc = parse_overlay(yaml).unwrap();
        assert_eq!(doc.overlay, "1.0.0");
        assert_eq!(doc.info.title, "Test Overlay");
        assert_eq!(doc.actions.len(), 1);
    }

    #[test]
    fn test_parse_overlay_json() {
        let json_str = r#"{
            "overlay": "1.0.0",
            "info": {"title": "Test", "version": "1.0"},
            "actions": [
                {"target": "$.info", "update": {"description": "hi"}}
            ]
        }"#;
        let doc = parse_overlay(json_str).unwrap();
        assert_eq!(doc.overlay, "1.0.0");
        assert_eq!(doc.actions.len(), 1);
    }

    // -- validate_overlay --

    #[test]
    fn test_validate_overlay_missing_version() {
        let doc = OverlayDocument {
            overlay: String::new(),
            info: OverlayInfo { title: "T".into(), version: "1".into() },
            extends: None,
            actions: vec![OverlayAction {
                target: "$.info".into(),
                description: None,
                update: Some(json!({})),
                remove: false,
            }],
        };
        assert!(validate_overlay(&doc).is_err());
    }

    #[test]
    fn test_validate_overlay_no_actions() {
        let doc = OverlayDocument {
            overlay: "1.0.0".into(),
            info: OverlayInfo { title: "T".into(), version: "1".into() },
            extends: None,
            actions: vec![],
        };
        assert!(validate_overlay(&doc).is_err());
    }

    #[test]
    fn test_validate_overlay_action_no_target() {
        let doc = OverlayDocument {
            overlay: "1.0.0".into(),
            info: OverlayInfo { title: "T".into(), version: "1".into() },
            extends: None,
            actions: vec![OverlayAction {
                target: String::new(),
                description: None,
                update: Some(json!({})),
                remove: false,
            }],
        };
        assert!(validate_overlay(&doc).is_err());
    }

    #[test]
    fn test_validate_overlay_action_no_update_no_remove() {
        let doc = OverlayDocument {
            overlay: "1.0.0".into(),
            info: OverlayInfo { title: "T".into(), version: "1".into() },
            extends: None,
            actions: vec![OverlayAction {
                target: "$.info".into(),
                description: None,
                update: None,
                remove: false,
            }],
        };
        assert!(validate_overlay(&doc).is_err());
    }

    // -- apply_overlay: update --

    #[test]
    fn test_overlay_update_simple_path() {
        let doc = json!({
            "info": {"title": "Old", "version": "1.0"},
            "paths": {}
        });
        let overlay = OverlayDocument {
            overlay: "1.0.0".into(),
            info: OverlayInfo { title: "T".into(), version: "1".into() },
            extends: None,
            actions: vec![OverlayAction {
                target: "$.info".into(),
                description: None,
                update: Some(json!({"title": "New", "description": "Added"})),
                remove: false,
            }],
        };
        let result = apply_overlay(&doc, &overlay).unwrap();
        assert_eq!(result["info"]["title"], "New");
        assert_eq!(result["info"]["version"], "1.0");
        assert_eq!(result["info"]["description"], "Added");
    }

    #[test]
    fn test_overlay_update_nested_path() {
        let doc = json!({
            "components": {
                "schemas": {
                    "User": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"}
                        }
                    }
                }
            }
        });
        let overlay = OverlayDocument {
            overlay: "1.0.0".into(),
            info: OverlayInfo { title: "T".into(), version: "1".into() },
            extends: None,
            actions: vec![OverlayAction {
                target: "$.components.schemas.User".into(),
                description: None,
                update: Some(json!({
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "email": {"type": "string"}
                    }
                })),
                remove: false,
            }],
        };
        let result = apply_overlay(&doc, &overlay).unwrap();
        assert!(result["components"]["schemas"]["User"]["properties"]["email"].is_object());
    }

    // -- apply_overlay: remove --

    #[test]
    fn test_overlay_remove_property() {
        let doc = json!({
            "components": {
                "schemas": {
                    "User": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "email": {"type": "string"}
                        }
                    }
                }
            }
        });
        let overlay = OverlayDocument {
            overlay: "1.0.0".into(),
            info: OverlayInfo { title: "T".into(), version: "1".into() },
            extends: None,
            actions: vec![OverlayAction {
                target: "$.components.schemas.User.properties.email".into(),
                description: None,
                update: None,
                remove: true,
            }],
        };
        let result = apply_overlay(&doc, &overlay).unwrap();
        assert!(result["components"]["schemas"]["User"]["properties"]["email"].is_null());
        assert_eq!(
            result["components"]["schemas"]["User"]["properties"]["name"]["type"],
            "string"
        );
    }

    // -- apply_overlay: wildcard --

    #[test]
    fn test_overlay_wildcard_update() {
        let doc = json!({
            "paths": {
                "/users": {
                    "get": {"summary": "Get users"}
                },
                "/posts": {
                    "get": {"summary": "Get posts"}
                }
            }
        });
        let overlay = OverlayDocument {
            overlay: "1.0.0".into(),
            info: OverlayInfo { title: "T".into(), version: "1".into() },
            extends: None,
            actions: vec![OverlayAction {
                target: "$.paths.*.get".into(),
                description: None,
                update: Some(json!({"security": [{"Bearer": []}]})),
                remove: false,
            }],
        };
        let result = apply_overlay(&doc, &overlay).unwrap();
        assert!(result["paths"]["/users"]["get"]["security"].is_array());
        assert!(result["paths"]["/posts"]["get"]["security"].is_array());
    }

    // -- apply_overlay: zero matches --

    #[test]
    fn test_overlay_zero_match_no_error() {
        let doc = json!({"info": {"title": "Test"}});
        let overlay = OverlayDocument {
            overlay: "1.0.0".into(),
            info: OverlayInfo { title: "T".into(), version: "1".into() },
            extends: None,
            actions: vec![OverlayAction {
                target: "$.nonexistent.path".into(),
                description: None,
                update: Some(json!({"x": 1})),
                remove: false,
            }],
        };
        let result = apply_overlay(&doc, &overlay).unwrap();
        assert_eq!(result, doc);
    }

    // -- apply_overlay: sequential actions --

    #[test]
    fn test_overlay_sequential_actions() {
        let doc = json!({
            "components": {
                "schemas": {
                    "User": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "string"}
                        }
                    }
                }
            }
        });
        let overlay = OverlayDocument {
            overlay: "1.0.0".into(),
            info: OverlayInfo { title: "T".into(), version: "1".into() },
            extends: None,
            actions: vec![
                OverlayAction {
                    target: "$.components.schemas.User".into(),
                    description: None,
                    update: Some(json!({
                        "properties": {
                            "id": {"type": "string"},
                            "profile": {"type": "object", "properties": {"name": {"type": "string"}}}
                        }
                    })),
                    remove: false,
                },
                OverlayAction {
                    target: "$.components.schemas.User.properties.profile".into(),
                    description: None,
                    update: Some(json!({
                        "properties": {
                            "name": {"type": "string"},
                            "email": {"type": "string", "format": "email"}
                        }
                    })),
                    remove: false,
                },
            ],
        };
        let result = apply_overlay(&doc, &overlay).unwrap();
        assert_eq!(
            result["components"]["schemas"]["User"]["properties"]["profile"]["properties"]["email"]["type"],
            "string"
        );
        assert_eq!(
            result["components"]["schemas"]["User"]["properties"]["profile"]["properties"]["name"]["type"],
            "string"
        );
    }

    // -- apply_overlay: root target --

    #[test]
    fn test_overlay_root_target() {
        let doc = json!({"info": {"title": "Old"}});
        let overlay = OverlayDocument {
            overlay: "1.0.0".into(),
            info: OverlayInfo { title: "T".into(), version: "1".into() },
            extends: None,
            actions: vec![OverlayAction {
                target: "$".into(),
                description: None,
                update: Some(json!({"info": {"title": "New", "version": "2.0"}})),
                remove: false,
            }],
        };
        let result = apply_overlay(&doc, &overlay).unwrap();
        assert_eq!(result["info"]["title"], "New");
        assert_eq!(result["info"]["version"], "2.0");
    }

    // -- apply_overlays_to_spec --

    #[test]
    fn test_apply_overlays_to_spec_roundtrip() {
        let spec = r#"
openapi: "3.0.0"
info:
  title: Test API
  version: "1.0"
servers:
  - url: https://api.example.com
paths:
  /plants:
    get:
      operationId: list-plants
      summary: List plants
      x-fern-sdk-group-name:
        - plants
      x-fern-sdk-method-name: list
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

        let result = apply_overlays_to_spec(spec, &[overlay.to_string()]).unwrap();
        // The result should be valid YAML that can be parsed
        let parsed: serde_yaml::Value = serde_yaml::from_str(&result).unwrap();
        let info = &parsed["info"];
        assert_eq!(info["description"], serde_yaml::Value::String("A plant management API".into()));
        // Original fields preserved
        assert_eq!(info["title"], serde_yaml::Value::String("Test API".into()));
    }

    #[test]
    fn test_apply_overlays_to_spec_no_overlays() {
        let spec = "openapi: 3.0.0\ninfo:\n  title: Test\n  version: '1.0'\n";
        let result = apply_overlays_to_spec(spec, &[]).unwrap();
        assert_eq!(result, spec);
    }

    // -- array removal --

    #[test]
    fn test_overlay_remove_array_element() {
        let doc = json!({
            "paths": {
                "/plants": {
                    "get": {
                        "parameters": [
                            {"name": "id", "in": "query"},
                            {"name": "limit", "in": "query"},
                            {"name": "offset", "in": "query"}
                        ]
                    }
                }
            }
        });
        let overlay = OverlayDocument {
            overlay: "1.0.0".into(),
            info: OverlayInfo { title: "T".into(), version: "1".into() },
            extends: None,
            actions: vec![OverlayAction {
                target: "$.paths['/plants'].get.parameters[1]".into(),
                description: None,
                update: None,
                remove: true,
            }],
        };
        let result = apply_overlay(&doc, &overlay).unwrap();
        let params = result["paths"]["/plants"]["get"]["parameters"].as_array().unwrap();
        assert_eq!(params.len(), 2);
        assert_eq!(params[0]["name"], "id");
        assert_eq!(params[1]["name"], "offset");
    }

    // -- multiple overlays --

    #[test]
    fn test_apply_multiple_overlays() {
        let spec = r#"
openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
paths: {}
"#;
        let overlay1 = r#"
overlay: "1.0.0"
info:
  title: Overlay 1
  version: "1.0"
actions:
  - target: "$.info"
    update:
      description: "First overlay"
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
        name: "Plant Store Support"
"#;
        let result = apply_overlays_to_spec(spec, &[overlay1.to_string(), overlay2.to_string()]).unwrap();
        let parsed: serde_yaml::Value = serde_yaml::from_str(&result).unwrap();
        assert_eq!(
            parsed["info"]["description"],
            serde_yaml::Value::String("First overlay".into())
        );
        assert_eq!(
            parsed["info"]["contact"]["name"],
            serde_yaml::Value::String("Plant Store Support".into())
        );
    }

    // -- deep merge preserves existing keys --

    #[test]
    fn test_deep_merge_preserves_existing() {
        let doc = json!({
            "components": {
                "schemas": {
                    "Plant": {
                        "type": "object",
                        "properties": {
                            "species": {"type": "string"},
                            "height": {"type": "number"}
                        }
                    }
                }
            }
        });
        let overlay = OverlayDocument {
            overlay: "1.0.0".into(),
            info: OverlayInfo { title: "T".into(), version: "1".into() },
            extends: None,
            actions: vec![OverlayAction {
                target: "$.components.schemas.Plant.properties".into(),
                description: None,
                update: Some(json!({
                    "species": {"type": "string", "description": "The plant species"},
                    "color": {"type": "string"}
                })),
                remove: false,
            }],
        };
        let result = apply_overlay(&doc, &overlay).unwrap();
        assert_eq!(result["components"]["schemas"]["Plant"]["properties"]["height"]["type"], "number");
        assert_eq!(
            result["components"]["schemas"]["Plant"]["properties"]["species"]["description"],
            "The plant species"
        );
        assert_eq!(result["components"]["schemas"]["Plant"]["properties"]["color"]["type"], "string");
    }

    // -----------------------------------------------------------------------
    // Tests ported from Fern CLI TypeScript (applyOpenAPIOverlay.test.ts)
    // These ensure behavioral parity with the Fern CLI overlay implementation.
    // -----------------------------------------------------------------------

    fn make_overlay(actions: Vec<OverlayAction>) -> OverlayDocument {
        OverlayDocument {
            overlay: "1.0.0".into(),
            info: OverlayInfo { title: "Test".into(), version: "1.0".into() },
            extends: None,
            actions,
        }
    }

    fn update_action(target: &str, update: Value) -> OverlayAction {
        OverlayAction {
            target: target.into(),
            description: None,
            update: Some(update),
            remove: false,
        }
    }

    fn remove_action(target: &str) -> OverlayAction {
        OverlayAction {
            target: target.into(),
            description: None,
            update: None,
            remove: true,
        }
    }

    /// Port of TS: "should merge updates into a schema at a JSONPath target"
    #[test]
    fn test_fern_merge_updates_into_schema() {
        let doc = json!({
            "components": { "schemas": { "UserUpdate": {
                "type": "object",
                "properties": {
                    "name": { "type": "string" },
                    "email": { "type": "string", "nullable": true }
                }
            }}}
        });
        let overlay = make_overlay(vec![update_action(
            "$.components.schemas.UserUpdate",
            json!({
                "type": "object",
                "properties": {
                    "name": { "type": "string" },
                    "lastName": { "type": "string" },
                    "email": { "type": "string", "nullable": true }
                }
            }),
        )]);
        let result = apply_overlay(&doc, &overlay).unwrap();
        assert_eq!(
            result,
            json!({
                "components": { "schemas": { "UserUpdate": {
                    "type": "object",
                    "properties": {
                        "name": { "type": "string" },
                        "lastName": { "type": "string" },
                        "email": { "type": "string", "nullable": true }
                    }
                }}}
            })
        );
    }

    /// Port of TS: "should merge arrays of objects in OpenAPI paths"
    /// Uses filter expression to target a specific array element.
    #[test]
    fn test_fern_merge_array_element_by_filter() {
        let doc = json!({
            "paths": { "/plants": { "get": { "parameters": [
                { "name": "id", "in": "query", "required": true },
                { "name": "limit", "in": "query", "required": false }
            ]}}}
        });
        let overlay = make_overlay(vec![update_action(
            "$.paths['/plants'].get.parameters[?(@.name=='id')]",
            json!({ "name": "id", "in": "query", "required": true, "description": "Plant ID" }),
        )]);
        let result = apply_overlay(&doc, &overlay).unwrap();
        assert_eq!(
            result["paths"]["/plants"]["get"]["parameters"],
            json!([
                { "name": "id", "in": "query", "required": true, "description": "Plant ID" },
                { "name": "limit", "in": "query", "required": false }
            ])
        );
    }

    /// Port of TS: "should replace arrays of primitives"
    /// When both target and update are arrays, lodash-style index-by-index merge.
    #[test]
    fn test_fern_replace_primitive_arrays() {
        let doc = json!({
            "components": { "schemas": { "Plant": {
                "type": "object",
                "properties": { "tags": {
                    "type": "array",
                    "items": { "type": "string" },
                    "enum": ["annual", "perennial"]
                }}
            }}}
        });
        let overlay = make_overlay(vec![update_action(
            "$.components.schemas.Plant.properties.tags.enum",
            json!(["tropical", "succulent"]),
        )]);
        let result = apply_overlay(&doc, &overlay).unwrap();
        assert_eq!(
            result["components"]["schemas"]["Plant"]["properties"]["tags"]["enum"],
            json!(["tropical", "succulent"])
        );
    }

    /// Port of TS: "should ignore updates if remove is true"
    #[test]
    fn test_fern_remove_ignores_update() {
        let doc = json!({
            "components": { "schemas": { "Plant": {
                "type": "object",
                "properties": {
                    "species": { "type": "string" },
                    "toxicity": { "type": "string" }
                }
            }}}
        });
        let overlay = make_overlay(vec![OverlayAction {
            target: "$.components.schemas.Plant.properties.toxicity".into(),
            description: None,
            update: Some(json!({ "type": "string", "format": "enum" })),
            remove: true,
        }]);
        let result = apply_overlay(&doc, &overlay).unwrap();
        assert_eq!(
            result,
            json!({
                "components": { "schemas": { "Plant": {
                    "type": "object",
                    "properties": {
                        "species": { "type": "string" }
                    }
                }}}
            })
        );
    }

    /// Port of TS: "should handle multiple consecutive array removals"
    #[test]
    fn test_fern_multiple_consecutive_array_removals() {
        let doc = json!({
            "paths": { "/plants": { "get": { "parameters": [
                { "name": "id", "in": "query", "required": true },
                { "name": "limit", "in": "query", "required": false },
                { "name": "offset", "in": "query", "required": false },
                { "name": "sort", "in": "query", "required": false }
            ]}}}
        });
        let overlay = make_overlay(vec![
            remove_action("$.paths['/plants'].get.parameters[?(@.name == 'limit')]"),
            remove_action("$.paths['/plants'].get.parameters[?(@.name == 'offset')]"),
        ]);
        let result = apply_overlay(&doc, &overlay).unwrap();
        assert_eq!(
            result["paths"]["/plants"]["get"]["parameters"],
            json!([
                { "name": "id", "in": "query", "required": true },
                { "name": "sort", "in": "query", "required": false }
            ])
        );
    }

    /// Port of TS: "should handle merges to multiple items in an array"
    #[test]
    fn test_fern_merge_multiple_array_items_by_filter() {
        let doc = json!({
            "paths": { "/plants": { "get": { "parameters": [
                { "name": "id", "in": "query", "required": true },
                { "name": "limit", "in": "query", "required": false },
                { "name": "authorization", "in": "header", "required": true },
                { "name": "offset", "in": "query", "required": false },
                { "name": "sort", "in": "query", "required": false }
            ]}}}
        });
        let overlay = make_overlay(vec![update_action(
            "$.paths['/plants'].get.parameters[?(@.in == 'query')]",
            json!({ "description": "Query parameter" }),
        )]);
        let result = apply_overlay(&doc, &overlay).unwrap();
        let params = result["paths"]["/plants"]["get"]["parameters"].as_array().unwrap();
        assert_eq!(params[0]["description"], "Query parameter");
        assert_eq!(params[1]["description"], "Query parameter");
        assert!(params[2].get("description").is_none()); // header param untouched
        assert_eq!(params[3]["description"], "Query parameter");
        assert_eq!(params[4]["description"], "Query parameter");
    }

    /// Port of TS: "should handle multiple overlay actions"
    #[test]
    fn test_fern_multiple_overlay_actions() {
        let doc = json!({
            "components": { "schemas": {
                "PlantUpdate": {
                    "type": "object",
                    "properties": { "species": { "type": "string" } }
                },
                "Plant": {
                    "type": "object",
                    "properties": { "id": { "type": "string" } }
                }
            }}
        });
        let overlay = make_overlay(vec![
            update_action(
                "$.components.schemas.PlantUpdate",
                json!({
                    "type": "object",
                    "properties": {
                        "species": { "type": "string" },
                        "color": { "type": "string" }
                    }
                }),
            ),
            update_action(
                "$.components.schemas.Plant",
                json!({
                    "type": "object",
                    "properties": {
                        "id": { "type": "string" },
                        "species": { "type": "string" }
                    }
                }),
            ),
        ]);
        let result = apply_overlay(&doc, &overlay).unwrap();
        assert!(result["components"]["schemas"]["PlantUpdate"]["properties"]["color"].is_object());
        assert!(result["components"]["schemas"]["Plant"]["properties"]["species"].is_object());
    }

    /// Port of TS: "should handle actions on items inserted by earlier actions"
    #[test]
    fn test_fern_actions_on_items_from_earlier_actions() {
        let doc = json!({
            "components": { "schemas": { "Plant": {
                "type": "object",
                "properties": { "id": { "type": "string" } }
            }}}
        });
        let overlay = make_overlay(vec![
            update_action(
                "$.components.schemas.Plant",
                json!({
                    "type": "object",
                    "properties": {
                        "id": { "type": "string" },
                        "habitat": {
                            "type": "object",
                            "properties": { "climate": { "type": "string" } }
                        }
                    }
                }),
            ),
            update_action(
                "$.components.schemas.Plant.properties.habitat",
                json!({
                    "type": "object",
                    "properties": {
                        "climate": { "type": "string" },
                        "soil": { "type": "string", "format": "enum" }
                    }
                }),
            ),
        ]);
        let result = apply_overlay(&doc, &overlay).unwrap();
        let habitat = &result["components"]["schemas"]["Plant"]["properties"]["habitat"]["properties"];
        assert!(habitat["climate"].is_object());
        assert_eq!(habitat["soil"]["format"], "enum");
    }

    /// Port of TS: "should handle wildcard path matching across multiple paths"
    #[test]
    fn test_fern_wildcard_across_multiple_paths() {
        let doc = json!({
            "paths": {
                "/plants": {
                    "get": { "summary": "Get plants", "operationId": "getPlants" },
                    "post": { "summary": "Create plant", "operationId": "createPlant" }
                },
                "/gardens": {
                    "get": { "summary": "Get gardens", "operationId": "getGardens" }
                },
                "/nurseries": {
                    "get": { "summary": "Get nurseries", "operationId": "getNurseries" },
                    "delete": { "summary": "Delete nursery", "operationId": "deleteNursery" }
                }
            }
        });
        let overlay = make_overlay(vec![update_action(
            "$.paths.*.get",
            json!({ "security": [{ "Bearer": [] }] }),
        )]);
        let result = apply_overlay(&doc, &overlay).unwrap();
        // All GET operations should have security
        assert!(result["paths"]["/plants"]["get"]["security"].is_array());
        assert!(result["paths"]["/gardens"]["get"]["security"].is_array());
        assert!(result["paths"]["/nurseries"]["get"]["security"].is_array());
        // Non-GET operations should not
        assert!(result["paths"]["/plants"]["post"].get("security").is_none());
        assert!(result["paths"]["/nurseries"]["delete"].get("security").is_none());
    }

    /// Port of TS: "should handle zero-match JSONPath expressions"
    #[test]
    fn test_fern_zero_match_continues_processing() {
        let doc = json!({
            "components": { "schemas": { "Plant": {
                "type": "object",
                "properties": {
                    "id": { "type": "string" },
                    "species": { "type": "string" }
                }
            }}},
            "paths": { "/plants": { "get": { "summary": "Get plants" } } }
        });
        let overlay = make_overlay(vec![
            update_action(
                "$.components.schemas.NonExistentSchema",
                json!({ "type": "object" }),
            ),
            update_action(
                "$.paths['/nonexistent'].post",
                json!({ "summary": "Non-existent" }),
            ),
            update_action(
                "$.components.schemas.Plant",
                json!({
                    "type": "object",
                    "properties": {
                        "id": { "type": "string" },
                        "species": { "type": "string" },
                        "color": { "type": "string", "format": "hex" }
                    }
                }),
            ),
        ]);
        let result = apply_overlay(&doc, &overlay).unwrap();
        // Only the last valid action should have taken effect
        assert!(result["components"]["schemas"]["Plant"]["properties"]["color"].is_object());
        // Original data untouched where no match
        assert_eq!(result["paths"]["/plants"]["get"]["summary"], "Get plants");
    }

    /// Port of TS: "should handle deep merge behavior"
    #[test]
    fn test_fern_deep_merge_preserves_nested_structure() {
        let doc = json!({
            "components": { "schemas": { "Plant": {
                "type": "object",
                "properties": {
                    "habitat": {
                        "type": "object",
                        "properties": {
                            "climate": {
                                "type": "object",
                                "properties": {
                                    "temperature": { "type": "string" },
                                    "humidity": { "type": "integer" }
                                }
                            },
                            "soil": {
                                "type": "object",
                                "properties": { "ph": { "type": "string" } }
                            }
                        }
                    },
                    "care": {
                        "type": "object",
                        "properties": {
                            "watering": { "type": "string", "default": "weekly" }
                        }
                    }
                }
            }}}
        });
        let overlay = make_overlay(vec![update_action(
            "$.components.schemas.Plant.properties.habitat",
            json!({
                "type": "object",
                "properties": {
                    "climate": {
                        "type": "object",
                        "properties": {
                            "temperature": { "type": "string" },
                            "rainfall": { "type": "string" }
                        }
                    },
                    "soil": {
                        "type": "object",
                        "properties": {
                            "ph": { "type": "string" },
                            "drainage": { "type": "string", "format": "enum" }
                        }
                    },
                    "sunlight": {
                        "type": "object",
                        "properties": {
                            "hours": { "type": "integer", "default": 6 }
                        }
                    }
                }
            }),
        )]);
        let result = apply_overlay(&doc, &overlay).unwrap();
        let habitat = &result["components"]["schemas"]["Plant"]["properties"]["habitat"]["properties"];
        // Existing humidity preserved
        assert_eq!(habitat["climate"]["properties"]["humidity"]["type"], "integer");
        // New rainfall added
        assert_eq!(habitat["soil"]["properties"]["drainage"]["format"], "enum");
        // New sunlight section added
        assert_eq!(habitat["sunlight"]["properties"]["hours"]["default"], 6);
        // care section untouched
        assert_eq!(
            result["components"]["schemas"]["Plant"]["properties"]["care"]["properties"]["watering"]["default"],
            "weekly"
        );
    }

    /// Port of TS: "should handle root-level targeting"
    #[test]
    fn test_fern_root_level_targeting() {
        let doc = json!({
            "openapi": "3.0.0",
            "info": { "title": "Plant API", "version": "1.0.0" },
            "paths": { "/plants": { "get": { "summary": "Get plants" } } },
            "tags": [{ "name": "legacy", "description": "Legacy endpoints" }],
            "components": { "securitySchemes": {
                "apiKey": { "type": "apiKey", "in": "header", "name": "X-API-Key" }
            }}
        });
        let overlay = make_overlay(vec![
            update_action(
                "$",
                json!({
                    "openapi": "3.0.0",
                    "info": {
                        "title": "Plant API",
                        "version": "1.0.0",
                        "description": "API for managing plants and gardens",
                        "contact": { "name": "Garden Team", "email": "garden@example.com" }
                    },
                    "servers": [
                        { "url": "https://api.example.com/v1", "description": "Production" },
                        { "url": "https://staging.example.com/v1", "description": "Staging" }
                    ],
                    "externalDocs": {
                        "description": "Plant care guide",
                        "url": "https://docs.example.com"
                    }
                }),
            ),
            remove_action("$.tags"),
            remove_action("$.components"),
        ]);
        let result = apply_overlay(&doc, &overlay).unwrap();
        // Added fields
        assert_eq!(result["info"]["description"], "API for managing plants and gardens");
        assert!(result["servers"].is_array());
        assert_eq!(result["servers"].as_array().unwrap().len(), 2);
        assert!(result["externalDocs"].is_object());
        // Removed fields
        assert!(result.get("tags").is_none());
        assert!(result.get("components").is_none());
        // Preserved fields
        assert_eq!(result["paths"]["/plants"]["get"]["summary"], "Get plants");
    }

    /// Port of TS: "should handle array edge cases including empty arrays and
    /// replacing complete arrays"
    #[test]
    fn test_fern_array_edge_cases_append_and_replace() {
        let doc = json!({
            "components": { "schemas": { "Plant": {
                "type": "object",
                "properties": {
                    "tags": {
                        "type": "array",
                        "items": { "type": "string" },
                        "enum": []
                    },
                    "zones": {
                        "type": "array",
                        "items": { "type": "string" },
                        "enum": ["zone5"]
                    },
                    "companions": {
                        "type": "array",
                        "items": { "type": "object" },
                        "enum": []
                    }
                }
            }}}
        });
        let overlay = make_overlay(vec![
            // Replace whole tags object (including enum) via deep merge
            update_action(
                "$.components.schemas.Plant.properties.tags",
                json!({
                    "type": "array",
                    "items": { "type": "string" },
                    "enum": ["tropical", "succulent"]
                }),
            ),
            // Replace whole zones object (including enum) via deep merge
            update_action(
                "$.components.schemas.Plant.properties.zones",
                json!({
                    "type": "array",
                    "items": { "type": "string" },
                    "enum": ["zone5", "zone6", "zone7"]
                }),
            ),
            // Append object to empty companions array
            update_action(
                "$.components.schemas.Plant.properties.companions.enum",
                json!({ "name": "basil", "benefit": "pest control" }),
            ),
            // Append another object
            update_action(
                "$.components.schemas.Plant.properties.companions.enum",
                json!({ "name": "marigold", "benefit": "pollination" }),
            ),
        ]);
        let result = apply_overlay(&doc, &overlay).unwrap();
        let props = &result["components"]["schemas"]["Plant"]["properties"];
        assert_eq!(props["tags"]["enum"], json!(["tropical", "succulent"]));
        assert_eq!(props["zones"]["enum"], json!(["zone5", "zone6", "zone7"]));
        let companions = props["companions"]["enum"].as_array().unwrap();
        assert_eq!(companions.len(), 2);
        assert_eq!(companions[0]["name"], "basil");
        assert_eq!(companions[1]["name"], "marigold");
    }

    /// Port of TS: "should not mutate the input data object"
    #[test]
    fn test_fern_does_not_mutate_input() {
        let doc = json!({
            "components": { "schemas": { "Plant": {
                "type": "object",
                "properties": { "species": { "type": "string" } }
            }}}
        });
        let original = doc.clone();
        let overlay = make_overlay(vec![update_action(
            "$.components.schemas.Plant",
            json!({
                "type": "object",
                "properties": {
                    "species": { "type": "string" },
                    "color": { "type": "string" }
                }
            }),
        )]);
        let _result = apply_overlay(&doc, &overlay).unwrap();
        assert_eq!(doc, original);
    }

    /// Port of TS: "should handle complex JSONPath expressions including
    /// recursive descent and filters" — array index targeting
    #[test]
    fn test_fern_array_index_targeting() {
        let doc = json!({
            "paths": { "/plants": { "get": { "parameters": [
                { "name": "limit", "in": "query", "schema": { "type": "integer" } },
                { "name": "offset", "in": "query", "schema": { "type": "integer" } }
            ]}}}
        });
        let overlay = make_overlay(vec![update_action(
            "$.paths['/plants'].get.parameters[0]",
            json!({
                "name": "limit", "in": "query",
                "schema": { "type": "integer", "minimum": 1, "maximum": 100 },
                "description": "Maximum number of items to return"
            }),
        )]);
        let result = apply_overlay(&doc, &overlay).unwrap();
        let params = &result["paths"]["/plants"]["get"]["parameters"];
        assert_eq!(params[0]["description"], "Maximum number of items to return");
        assert_eq!(params[0]["schema"]["minimum"], 1);
        // Second param untouched
        assert!(params[1].get("description").is_none());
    }

    // -- Additional deep_merge tests for lodash parity --

    /// Verify lodash-style index-by-index array merge
    #[test]
    fn test_deep_merge_arrays_index_by_index() {
        let mut base = json!([1, 2, 3]);
        let update = json!([10, 20]);
        deep_merge(&mut base, &update);
        assert_eq!(base, json!([10, 20, 3]));
    }

    /// Verify array merge with objects inside arrays
    #[test]
    fn test_deep_merge_arrays_of_objects() {
        let mut base = json!([
            { "name": "a", "value": 1 },
            { "name": "b", "value": 2 }
        ]);
        let update = json!([
            { "name": "a", "value": 10, "extra": true }
        ]);
        deep_merge(&mut base, &update);
        assert_eq!(base[0]["value"], 10);
        assert_eq!(base[0]["extra"], true);
        assert_eq!(base[1]["value"], 2); // second element preserved
    }

    /// Verify array append appends objects to array target
    #[test]
    fn test_merge_at_path_array_append() {
        let mut doc = json!({ "items": [] });
        let segments = vec![PathSegment::Key("items".into())];
        merge_at_path(&mut doc, &segments, &json!({ "id": 1 }));
        merge_at_path(&mut doc, &segments, &json!({ "id": 2 }));
        assert_eq!(doc["items"], json!([{ "id": 1 }, { "id": 2 }]));
    }

    /// Verify that update with longer array extends the base
    #[test]
    fn test_deep_merge_update_extends_shorter_array() {
        let mut base = json!([1]);
        let update = json!([10, 20, 30]);
        deep_merge(&mut base, &update);
        assert_eq!(base, json!([10, 20, 30]));
    }

    // -----------------------------------------------------------------------
    // Item 1 verification: array append scope — widened guard pushes any
    // non-array value (objects, strings, numbers, booleans, null) matching
    // the Fern CLI TS behavior.
    // -----------------------------------------------------------------------

    #[test]
    fn test_array_append_object() {
        let mut doc = json!({ "items": [{"id": 1}] });
        let segments = vec![PathSegment::Key("items".into())];
        merge_at_path(&mut doc, &segments, &json!({"id": 2}));
        assert_eq!(doc["items"], json!([{"id": 1}, {"id": 2}]));
    }

    #[test]
    fn test_array_append_string() {
        let mut doc = json!({ "tags": ["a", "b"] });
        let segments = vec![PathSegment::Key("tags".into())];
        merge_at_path(&mut doc, &segments, &json!("c"));
        assert_eq!(doc["tags"], json!(["a", "b", "c"]));
    }

    #[test]
    fn test_array_append_number() {
        let mut doc = json!({ "nums": [1, 2] });
        let segments = vec![PathSegment::Key("nums".into())];
        merge_at_path(&mut doc, &segments, &json!(3));
        assert_eq!(doc["nums"], json!([1, 2, 3]));
    }

    #[test]
    fn test_array_append_boolean() {
        let mut doc = json!({ "flags": [true] });
        let segments = vec![PathSegment::Key("flags".into())];
        merge_at_path(&mut doc, &segments, &json!(false));
        assert_eq!(doc["flags"], json!([true, false]));
    }

    #[test]
    fn test_array_append_null() {
        let mut doc = json!({ "items": [1] });
        let segments = vec![PathSegment::Key("items".into())];
        merge_at_path(&mut doc, &segments, &Value::Null);
        assert_eq!(doc["items"], json!([1, null]));
    }

    #[test]
    fn test_array_replace_with_array() {
        let mut doc = json!({ "items": [1, 2] });
        let segments = vec![PathSegment::Key("items".into())];
        merge_at_path(&mut doc, &segments, &json!([10, 20, 30]));
        // Arrays merge index-by-index via deep_merge
        assert_eq!(doc["items"], json!([10, 20, 30]));
    }

    // -----------------------------------------------------------------------
    // Item 2 verification: lodash merge vs deep_merge edge cases
    // -----------------------------------------------------------------------

    #[test]
    fn test_deep_merge_arrays_of_arrays() {
        let mut base = json!([[1, 2], [3, 4]]);
        let update = json!([[10], [30, 40, 50]]);
        deep_merge(&mut base, &update);
        // Index-by-index: base[0] merges with [10], base[1] with [30,40,50]
        assert_eq!(base, json!([[10, 2], [30, 40, 50]]));
    }

    #[test]
    fn test_deep_merge_mixed_type_arrays() {
        let mut base = json!([1, "hello", {"a": 1}, [1, 2]]);
        let update = json!([99, "world", {"b": 2}, [3]]);
        deep_merge(&mut base, &update);
        // Primitives replaced, objects merged, arrays merged index-by-index
        assert_eq!(base, json!([99, "world", {"a": 1, "b": 2}, [3, 2]]));
    }

    #[test]
    fn test_deep_merge_sparse_like_arrays() {
        // lodash.merge with sparse arrays fills gaps — our impl uses
        // index-by-index so shorter base just gets extended
        let mut base = json!([1]);
        let update = json!([null, null, 3]);
        deep_merge(&mut base, &update);
        assert_eq!(base, json!([null, null, 3]));
    }

    #[test]
    fn test_deep_merge_empty_arrays() {
        let mut base = json!([1, 2, 3]);
        let update = json!([]);
        deep_merge(&mut base, &update);
        // Empty update leaves base unchanged
        assert_eq!(base, json!([1, 2, 3]));
    }

    #[test]
    fn test_deep_merge_nested_objects_in_arrays() {
        let mut base = json!([{"a": {"x": 1}}, {"b": 2}]);
        let update = json!([{"a": {"y": 2}}, {"c": 3}]);
        deep_merge(&mut base, &update);
        assert_eq!(base, json!([{"a": {"x": 1, "y": 2}}, {"b": 2, "c": 3}]));
    }

    #[test]
    fn test_deep_merge_array_type_mismatch_replaces() {
        // When base is object and update is array (or vice versa), replace
        let mut base = json!({"a": 1});
        let update = json!([1, 2]);
        deep_merge(&mut base, &update);
        assert_eq!(base, json!([1, 2]));

        let mut base = json!([1, 2]);
        let update = json!({"a": 1});
        deep_merge(&mut base, &update);
        assert_eq!(base, json!({"a": 1}));
    }

    // -----------------------------------------------------------------------
    // Item 3 verification: YAML ↔ JSON roundtrip fidelity
    // -----------------------------------------------------------------------

    #[test]
    fn test_yaml_roundtrip_strips_comments() {
        let yaml_with_comments = r#"
openapi: "3.0.0"
info:
  title: Test # inline comment
  version: "1.0"
# full line comment
paths: {}
"#;
        // Need a no-op overlay to trigger the YAML->JSON->YAML roundtrip
        // (empty overlay list short-circuits and returns original string)
        let noop_overlay = r#"
overlay: "1.0.0"
info:
  title: noop
  version: "1.0.0"
actions:
  - target: "$.__nonexistent__"
    update:
      x: 1
"#;
        let result = apply_overlays_to_spec(
            yaml_with_comments,
            &[noop_overlay.to_string()],
        )
        .unwrap();
        // Comments are stripped after roundtrip
        assert!(!result.contains("# inline comment"), "inline comment should be stripped: {result}");
        assert!(!result.contains("# full line comment"), "line comment should be stripped: {result}");
        assert!(result.contains("title: Test"));
    }

    #[test]
    fn test_yaml_roundtrip_resolves_anchors() {
        // serde_yaml resolves anchors/aliases during deserialization.
        // Use a simple alias (not merge key) to verify resolution.
        let yaml_with_anchors = r#"
base_url: &url "https://api.example.com"
servers:
  - url: *url
    description: production
"#;
        let yaml_value: serde_yaml::Value =
            serde_yaml::from_str(yaml_with_anchors).unwrap();
        let json_val = yaml_to_json(yaml_value);
        // Alias is resolved to the concrete value
        assert_eq!(
            json_val["servers"][0]["url"],
            "https://api.example.com"
        );
        assert_eq!(
            json_val["servers"][0]["description"],
            "production"
        );
        // The anchor definition is also present as a regular key
        assert_eq!(
            json_val["base_url"],
            "https://api.example.com"
        );
    }

    #[test]
    fn test_yaml_roundtrip_strips_custom_tags() {
        let yaml_with_tag = r#"
value: !custom_tag
  inner: data
"#;
        let yaml_value: serde_yaml::Value =
            serde_yaml::from_str(yaml_with_tag).unwrap();
        let json_val = yaml_to_json(yaml_value);
        // Custom tags are stripped, value preserved
        assert_eq!(json_val["value"]["inner"], "data");
    }

    #[test]
    fn test_yaml_roundtrip_with_overlay_preserves_structure() {
        let spec = r#"
openapi: "3.0.0"
info:
  title: Test API # comment will be stripped
  version: "1.0"
paths:
  /users:
    get:
      summary: List users
"#;
        let overlay = r#"
overlay: "1.0.0"
info:
  title: add-description
  version: "1.0.0"
actions:
  - target: "$.info"
    update:
      description: "Added by overlay"
"#;
        let result =
            apply_overlays_to_spec(spec, &[overlay.to_string()]).unwrap();
        assert!(result.contains("description: Added by overlay"));
        assert!(result.contains("title: Test API"));
        assert!(!result.contains('#'));
    }

    // -----------------------------------------------------------------------
    // Item 4 verification: special characters in JSON keys via overlay paths
    // -----------------------------------------------------------------------

    #[test]
    fn test_overlay_key_with_special_chars() {
        let doc = json!({
            "x-extension": {"value": 1},
            "paths": {
                "/users/{id}": {
                    "get": {"summary": "get user"}
                }
            }
        });
        let overlay = make_overlay(vec![
            update_action(
                "$.paths['/users/{id}'].get",
                json!({"description": "Get a user by ID"}),
            ),
            update_action(
                "$['x-extension']",
                json!({"extra": true}),
            ),
        ]);
        let result = apply_overlay(&doc, &overlay).unwrap();
        assert_eq!(
            result["paths"]["/users/{id}"]["get"]["description"],
            "Get a user by ID"
        );
        assert_eq!(result["x-extension"]["extra"], true);
        assert_eq!(result["x-extension"]["value"], 1);
    }

    #[test]
    fn test_normalized_path_to_segments_direct() {
        // Verify the iterator-based approach works for keys with special chars
        let doc = json!({
            "it's": {"nested": true},
            "key[0]": "bracket-key"
        });
        let path = serde_json_path::JsonPath::parse("$[\"it's\"]").unwrap();
        let located = path.query_located(&doc);
        for node in located.iter() {
            let segments = normalized_path_to_segments(node.location());
            assert_eq!(segments, vec![PathSegment::Key("it's".into())]);
        }
    }


}
