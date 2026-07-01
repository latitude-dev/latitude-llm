//! GraphQL Request Execution
//!
//! Builds and dispatches POST requests carrying GraphQL operations.
//! Handles auth, response unwrapping (`data` envelope and `errors`),
//! and cursor-based pagination via `pageInfo.endCursor`.

use std::collections::HashMap;

use anyhow::Context;
use serde_json::{json, Map, Value};

use crate::auth::{handle_error_response, DynAuthProvider, EndpointAuthMetadata};
use crate::error::CliError;
use crate::graphql::discovery::{
    GraphQLArgDef, GraphQLMethodInfo, GraphQLOperation, GraphQLSchema, MethodParameter,
};

/// Configuration for cursor-based auto-pagination.
#[derive(Debug, Clone)]
pub struct PaginationConfig {
    /// Whether to auto-paginate through all pages.
    pub page_all: bool,
    /// Maximum number of pages to fetch (default: 10).
    pub page_limit: u32,
    /// Delay between page fetches in milliseconds (default: 100).
    pub page_delay_ms: u64,
    /// Disable the pager even on interactive terminals (`--no-pager`).
    pub no_pager: bool,
    /// CLI binary name, used for the `<NAME>_PAGER` env var lookup.
    pub cli_name: String,
}

impl Default for PaginationConfig {
    fn default() -> Self {
        Self {
            page_all: false,
            page_limit: 10,
            page_delay_ms: 100,
            no_pager: false,
            cli_name: String::new(),
        }
    }
}

/// Parsed inputs ready for request execution.
#[derive(Debug)]
struct ExecutionInput {
    params: Map<String, Value>,
    body: Value,
    full_url: String,
}

fn parse_and_validate_inputs(
    doc: &GraphQLSchema,
    method: &GraphQLOperation,
    params_json: Option<&str>,
    body_json: Option<&str>,
    base_url_override: Option<&str>,
) -> Result<ExecutionInput, CliError> {
    let params: Map<String, Value> = if let Some(p) = params_json {
        serde_json::from_str(p)
            .map_err(|e| CliError::Validation(format!("Invalid --params JSON: {e}")))?
    } else {
        Map::new()
    };

    let gql = method.graphql.as_ref().ok_or_else(|| {
        CliError::Discovery("GraphQL method info missing from spec".to_string())
    })?;

    for (param_name, param_def) in &method.parameters {
        if param_def.required
            && !params.contains_key(param_name)
            && param_def.graphql_input_arg.is_none()
        {
            return Err(CliError::Validation(format!(
                "Required parameter '{param_name}' is missing"
            )));
        }
    }

    let body = build_graphql_body(gql, &params, body_json, &method.parameters, None)?;
    let full_url = base_url_override
        .map(|u| u.trim_end_matches('/').to_string())
        .unwrap_or_else(|| doc.root_url.clone());

    Ok(ExecutionInput { params, body, full_url })
}

/// Build a POST request with auth and a JSON GraphQL body.
fn build_http_request(
    client: &reqwest::Client,
    input: &ExecutionInput,
    auth_provider: &DynAuthProvider,
) -> Result<reqwest::RequestBuilder, CliError> {
    let request = client.post(&input.full_url);
    // GraphQL has no per-operation security metadata in the introspection
    // schema, so the metadata is always "unspecified" — the provider's own
    // default policy decides what to attach.
    let request = auth_provider.apply(request, &EndpointAuthMetadata::unspecified())?;
    let request = request
        .header("Content-Type", "application/json")
        .json(&input.body);
    Ok(request)
}

/// Parse a GraphQL response body: surface `errors` and unwrap the `data` envelope.
///
/// GraphQL allows partial results: a response may have both `data` and `errors`
/// (common in federation). When both are present, errors are printed to stderr
/// and the partial data is returned. Only when there is no `data` at all do we
/// treat the errors as fatal.
fn parse_graphql_response(body_text: &str) -> Result<String, CliError> {
    let json_val: Value = serde_json::from_str(body_text).map_err(|e| CliError::Api {
        code: 400,
        message: format!("Invalid GraphQL response: {e}"),
        reason: "graphql_parse_error".to_string(),
    })?;

    let has_data = json_val
        .get("data")
        .map(|d| !d.is_null())
        .unwrap_or(false);

    if let Some(errors) = json_val.get("errors").and_then(|e| e.as_array()) {
        if !errors.is_empty() {
            let message = errors
                .iter()
                .filter_map(|e| e.get("message").and_then(|m| m.as_str()))
                .collect::<Vec<_>>()
                .join("; ");
            if has_data {
                eprintln!("GraphQL partial errors: {message}");
            } else {
                return Err(CliError::Api {
                    code: 400,
                    message,
                    reason: "graphql_error".to_string(),
                });
            }
        }
    }

    let unwrapped = if let Some(data) = json_val.get("data").filter(|d| !d.is_null()) {
        if let Value::Object(map) = data {
            if map.len() == 1 {
                map.values().next().unwrap().clone()
            } else {
                data.clone()
            }
        } else {
            data.clone()
        }
    } else {
        json_val
    };

    serde_json::to_string(&unwrapped).map_err(|e| CliError::Api {
        code: 500,
        message: format!("Failed to serialize GraphQL response: {e}"),
        reason: "graphql_serialize_error".to_string(),
    })
}

/// Print or capture a JSON response and bump the page counter.
async fn handle_json_response(
    body_text: &str,
    pipeline: &crate::formatter::OutputPipeline,
    pages_fetched: &mut u32,
    page_all: bool,
    capture_output: bool,
    captured: &mut Vec<Value>,
    pager: &mut Option<crate::pager::PagerHandle>,
) -> Result<(), CliError> {
    if let Ok(json_val) = serde_json::from_str::<Value>(body_text) {
        *pages_fetched += 1;

        if capture_output {
            captured.push(json_val);
        } else if page_all {
            let is_first_page = *pages_fetched == 1;
            if let Some(ref mut pager_handle) = pager {
                pipeline
                    .emit(pager_handle, &json_val, true, is_first_page)
                    .context("Failed to write output")?;
            } else {
                let mut out = std::io::stdout().lock();
                pipeline
                    .emit(&mut out, &json_val, true, is_first_page)
                    .context("Failed to write output")?;
            }
        } else {
            let mut out = std::io::stdout().lock();
            pipeline
                .emit(&mut out, &json_val, false, true)
                .context("Failed to write output")?;
        }
    } else if !capture_output && !pipeline.quiet && !body_text.is_empty() {
        println!("{body_text}");
    }
    Ok(())
}


/// Resolve the retry policy for a run from the `--no-retry` opt-out.
///
/// `--no-retry` is a user-facing debug switch that disables retries entirely;
/// otherwise the SDK's [default policy](crate::http::RetryPolicy::default) is
/// applied. Threading a `RetryPolicy` (rather than hardcoding the default in
/// the executor) keeps the GraphQL path at parity with the OpenAPI executor,
/// where the policy is configurable per run.
pub fn resolve_retry_policy(no_retry: bool) -> crate::http::RetryPolicy {
    if no_retry {
        crate::http::RetryPolicy::disabled()
    } else {
        crate::http::RetryPolicy::default()
    }
}

/// Executes a GraphQL operation.
///
/// Posts the rendered query to the schema's endpoint, unwraps the `data` envelope,
/// and continues paginating via `pageInfo.endCursor` until the page limit is hit.
///
/// `retry_policy` is threaded in by the caller (see [`resolve_retry_policy`])
/// so the policy is configurable per run rather than hardcoded here. `no_retry`
/// is still honored as a hard short-circuit inside [`crate::http::decide_retry`].
#[allow(clippy::too_many_arguments)]
pub async fn execute_method(
    doc: &GraphQLSchema,
    method: &GraphQLOperation,
    params_json: Option<&str>,
    body_json: Option<&str>,
    auth_provider: &DynAuthProvider,
    dry_run: bool,
    pagination: &PaginationConfig,
    pipeline: &crate::formatter::OutputPipeline,
    capture_output: bool,
    base_url_override: Option<&str>,
    http_config: &crate::http::HttpConfig,
    retry_policy: &crate::http::RetryPolicy,
    no_retry: bool,
    debug: bool,
) -> Result<Option<Value>, CliError> {
    let mut input =
        parse_and_validate_inputs(doc, method, params_json, body_json, base_url_override)?;

    if dry_run {
        let dry_run_info = json!({
            "dry_run": true,
            "url": input.full_url,
            "method": "POST",
            "body": input.body,
        });
        if capture_output {
            return Ok(Some(dry_run_info));
        }
        let mut out = std::io::stdout().lock();
        pipeline
            .emit(&mut out, &dry_run_info, false, true)
            .context("Failed to write output")?;
        return Ok(None);
    }

    let mut pages_fetched: u32 = 0;
    let mut captured_values = Vec::new();

    // Spawn an external pager when --page-all is active on a TTY.
    let pager_label = method.id.as_deref().unwrap_or("graphql");
    let mut pager_handle = if pagination.page_all && !pagination.no_pager && !capture_output {
        let pager_config = crate::pager::PagerConfig::from_env(&pagination.cli_name);
        crate::pager::spawn_pager(&pager_config, pager_label)
    } else {
        None
    };

    // GraphQL auth is always Authorization: Bearer — covered by the static
    // denylist in debug.rs. GraphQL introspection schemas carry no security
    // scheme metadata, so there are no spec-declared api-key-in-header names
    // to add.
    let extra_sensitive_headers: &[&str] = &[];

    let client = http_config.build_client()?;

    loop {
        let method_id = method.id.as_deref().unwrap_or("unknown");
        let start = std::time::Instant::now();

        // Fresh key per page so the server doesn't deduplicate distinct
        // pages, but stable across retries of the same page.
        let idempotency_key = Some(crate::http::generate_idempotency_key());

        // Retry loop — same pattern as the OpenAPI executor.
        let mut retry_attempt: u32 = 0;
        let response = loop {
            let mut request = build_http_request(&client, &input, auth_provider)?;
            if let Some(ref key) = idempotency_key {
                request = request.header("Idempotency-Key", key.as_str());
            }

            let built = request.build().map_err(|e| {
                CliError::Other(anyhow::Error::from(e).context("Failed to build HTTP request"))
            })?;
            if debug {
                let query_str = input.body.get("query").and_then(|q| q.as_str()).unwrap_or("");
                let empty_vars = Value::Object(Map::new());
                let variables = input.body.get("variables").unwrap_or(&empty_vars);
                crate::debug::dump_graphql_request(
                    built.url().as_str(),
                    built.headers(),
                    query_str,
                    variables,
                    extra_sensitive_headers,
                );
            }
            match client.execute(built).await {
                Ok(resp) => {
                    let status = resp.status();
                    let retry_after_header = resp
                        .headers()
                        .get("retry-after")
                        .and_then(|v| v.to_str().ok())
                        .map(|s| s.to_string());
                    let outcome = crate::http::RetryOutcome {
                        status: Some(status.as_u16()),
                        retry_after: retry_after_header.as_deref(),
                    };
                    if let Some(delay) = crate::http::decide_retry(
                        retry_attempt,
                        &outcome,
                        retry_policy,
                        "POST",
                        idempotency_key.is_some(),
                        no_retry,
                    ) {
                        tracing::warn!(
                            api_method = method_id,
                            http_method = "POST",
                            status = status.as_u16(),
                            attempt = retry_attempt + 1,
                            delay_ms = delay.as_millis() as u64,
                            "retrying after retryable HTTP status",
                        );
                        let _ = resp.bytes().await;
                        tokio::time::sleep(delay).await;
                        retry_attempt += 1;
                        continue;
                    }
                    break resp;
                }
                Err(e) => {
                    let outcome = crate::http::RetryOutcome {
                        status: None,
                        retry_after: None,
                    };
                    if let Some(delay) = crate::http::decide_retry(
                        retry_attempt,
                        &outcome,
                        retry_policy,
                        "POST",
                        idempotency_key.is_some(),
                        no_retry,
                    ) {
                        tracing::warn!(
                            api_method = method_id,
                            http_method = "POST",
                            attempt = retry_attempt + 1,
                            delay_ms = delay.as_millis() as u64,
                            error = %e,
                            "retrying after network/transport failure",
                        );
                        tokio::time::sleep(delay).await;
                        retry_attempt += 1;
                        continue;
                    }
                    crate::http::maybe_emit_tls_hint(http_config, &e);
                    return Err(anyhow::Error::from(e).context("HTTP request failed").into());
                }
            }
        };
        let latency_ms = start.elapsed().as_millis() as u64;

        let status = response.status();
        let response_headers = response.headers().clone();

        if !status.is_success() {
            let error_body = response.text().await.unwrap_or_default();
            tracing::warn!(
                api_method = method_id,
                http_method = "POST",
                status = status.as_u16(),
                latency_ms = latency_ms,
                "API error"
            );
            if debug {
                crate::debug::dump_error_response(
                    status.as_u16(),
                    latency_ms,
                    &response_headers,
                    &error_body,
                    extra_sensitive_headers,
                );
            }
            return handle_error_response(
                status,
                &error_body,
                auth_provider.as_ref(),
                &EndpointAuthMetadata::unspecified(),
            );
        }

        tracing::debug!(
            api_method = method_id,
            http_method = "POST",
            status = status.as_u16(),
            latency_ms = latency_ms,
            page = pages_fetched,
            "API request"
        );

        let body_text = response
            .text()
            .await
            .context("Failed to read response body")?;
        if debug {
            crate::debug::dump_response(
                status.as_u16(),
                latency_ms,
                &response_headers,
                &body_text,
                extra_sensitive_headers,
            );
        }
        let response_body = parse_graphql_response(&body_text)?;

        handle_json_response(
            &response_body,
            pipeline,
            &mut pages_fetched,
            pagination.page_all,
            capture_output,
            &mut captured_values,
            &mut pager_handle,
        )
        .await?;

        // GraphQL cursor-based pagination: rebuild the body with the next
        // cursor and POST again until we run out of pages or hit the limit.
        if pagination.page_all {
            if let Some(cursor) = extract_graphql_cursor(&response_body) {
                if pages_fetched < pagination.page_limit {
                    if let Some(ref gql_info) = method.graphql {
                        let params_clone = input.params.clone();
                        input.body = build_graphql_body(
                            gql_info,
                            &params_clone,
                            body_json,
                            &method.parameters,
                            Some(&cursor),
                        )?;
                    }
                    if pagination.page_delay_ms > 0 {
                        tokio::time::sleep(std::time::Duration::from_millis(
                            pagination.page_delay_ms,
                        ))
                        .await;
                    }
                    continue;
                }
            }
        }

        break;
    }

    // Close the pager pipe and wait for it to exit before returning.
    drop(pager_handle);

    if capture_output && !captured_values.is_empty() {
        if captured_values.len() == 1 {
            return Ok(Some(captured_values.pop().unwrap()));
        } else {
            return Ok(Some(Value::Array(captured_values)));
        }
    }

    Ok(None)
}

/// Build a GraphQL request body using the variables mechanism.
///
/// User-supplied values are placed in the `variables` JSON object and referenced
/// via `$name: Type` declarations in the query — they never appear in the query
/// string itself, preventing GraphQL injection.
///
/// `cursor` injects an `after` variable for cursor-based pagination when
/// `page-all` is in effect; it is only applied when the method declares an
/// `after` argument.
fn build_graphql_body(
    gql: &GraphQLMethodInfo,
    params: &Map<String, Value>,
    body_json: Option<&str>,
    method_params: &HashMap<String, MethodParameter>,
    cursor: Option<&str>,
) -> Result<Value, CliError> {
    let mut variables: Map<String, Value> = Map::new();

    // JFL-1.2: enforce mutually exclusive input modes — `--json`, dot-notation
    // leaf flags, and the object-shorthand flag for an input arg cannot be
    // combined. Track raw provided keys (pre-`set_nested_value`) so we can
    // detect both kinds of collision before assembling the body.
    if body_json.is_some() {
        if let Some(conflicting_flag) = params
            .keys()
            .find(|k| flag_targets_input(k, method_params, &gql.args))
        {
            return Err(CliError::Validation(format!(
                "Cannot combine --json with per-field input flags (--{conflicting_flag}). Use one or the other."
            )));
        }
    }
    for object_key in params.keys() {
        let mp = match method_params.get(object_key) {
            Some(mp) => mp,
            None => continue,
        };
        if mp.param_type.as_deref() != Some("object") {
            continue;
        }
        // Nested-field object shorthand (e.g. `--date-range` + `--date-range.start`):
        // detect by dotted prefix collision.
        let prefix = format!("{object_key}.");
        if let Some(leaf_key) = params.keys().find(|k| k.starts_with(&prefix)) {
            return Err(CliError::Validation(format!(
                "Cannot combine --{object_key} with --{leaf_key}. Use the JSON shorthand or individual flags, not both."
            )));
        }
        // JFL-1.4: input-arg-level shorthand (e.g. `--filter '{...}'`) has an
        // empty `graphql_field_path`. Its per-field flags do NOT share the
        // arg-name prefix (they live at the top of the flag namespace), so
        // the prefix check above misses them. Catch the conflict by matching
        // on the same `graphql_input_arg`.
        if mp.graphql_field_path.as_deref().unwrap_or("").is_empty() {
            if let Some(input_arg) = mp.graphql_input_arg.as_deref() {
                if let Some(conflicting) = params.keys().find(|k| {
                    k.as_str() != object_key
                        && method_params
                            .get(*k)
                            .and_then(|m| m.graphql_input_arg.as_deref())
                            == Some(input_arg)
                }) {
                    return Err(CliError::Validation(format!(
                        "Cannot combine --{object_key} with --{conflicting}. Use the JSON shorthand or individual flags, not both."
                    )));
                }
            }
        }
    }

    // Parse --json once; it targets the first input arg only.
    let body_obj: Option<Map<String, Value>> = if let Some(json_str) = body_json {
        let json_val: Value = serde_json::from_str(json_str)
            .map_err(|e| CliError::Validation(format!("Invalid --json body: {e}")))?;
        match json_val {
            Value::Object(obj) => Some(obj),
            _ => None,
        }
    } else {
        None
    };
    let mut json_applied = false;

    for arg_def in &gql.args {
        if arg_def.is_input {
            // Reconstruct the input object from flattened CLI flags. Each flag
            // tagged with this arg_name carries a graphql_field_path (dotted
            // camelCase path within the input) for nested field placement.
            let mut input_obj: Map<String, Value> = Map::new();
            for (flag_key, value) in params {
                if let Some(mp) = method_params.get(flag_key) {
                    if mp.graphql_input_arg.as_deref() == Some(arg_def.name.as_str()) {
                        let coerced = coerce_graphql_value(value, Some(mp))?;
                        // Object-shorthand flag for the *whole* input arg
                        // (graphql_field_path is empty): coerce_graphql_value
                        // guarantees `coerced` is an object when param_type
                        // is "object", so we can merge its fields into
                        // input_obj at the top level. Non-object payloads are
                        // rejected upstream as a validation error.
                        let path = mp.graphql_field_path.as_deref().unwrap_or("");
                        if path.is_empty() {
                            if let Value::Object(map) = coerced {
                                for (k, v) in map {
                                    input_obj.insert(k, v);
                                }
                            }
                        } else {
                            set_nested_value(&mut input_obj, path, coerced);
                        }
                    }
                }
            }
            // --json targets the first input arg only (deep-merges at the top level).
            if !json_applied {
                if let Some(ref obj) = body_obj {
                    for (k, v) in obj {
                        input_obj.insert(k.clone(), v.clone());
                    }
                    json_applied = true;
                }
            }
            if !input_obj.is_empty() {
                // For list-typed input arguments (e.g. `arg: [SomeInput!]`), the
                // variable must be serialized as a JSON array. The GraphQL spec
                // defines input coercion that lifts a single value into a singleton
                // list, but coercion of typed *variables* is not uniformly enforced
                // across server implementations — emitting an explicit array is the
                // portable, spec-conformant shape. We currently flatten one element's
                // worth of fields, so wrap the reconstructed object accordingly.
                let value = if arg_def.is_list {
                    Value::Array(vec![Value::Object(input_obj)])
                } else {
                    Value::Object(input_obj)
                };
                variables.insert(arg_def.name.clone(), value);
            }
        } else {
            // Direct scalar/enum arg: look it up by its CLI flag key.
            if let Some(value) = params.get(&arg_def.flag_key) {
                let coerced = coerce_graphql_value(value, method_params.get(&arg_def.flag_key))?;
                variables.insert(arg_def.name.clone(), coerced);
            }
        }
    }

    // Inject pagination cursor when the method declares an `after` argument.
    if let Some(cursor_val) = cursor {
        if gql.args.iter().any(|a| a.name == "after") {
            variables.insert("after".to_string(), Value::String(cursor_val.to_string()));
        }
    }

    let op_type = &gql.operation_type;
    let field_name = &gql.field_name;
    let selection = &gql.default_selection;

    let query = if variables.is_empty() {
        format!("{op_type} {{ {field_name} {selection} }}")
    } else {
        let present_args: Vec<&GraphQLArgDef> = gql
            .args
            .iter()
            .filter(|a| variables.contains_key(&a.name))
            .collect();
        let decls = present_args
            .iter()
            .map(|a| format!("${}: {}", a.name, a.gql_type))
            .collect::<Vec<_>>()
            .join(", ");
        let refs = present_args
            .iter()
            .map(|a| format!("{}: ${}", a.name, a.name))
            .collect::<Vec<_>>()
            .join(", ");
        format!("{op_type}({decls}) {{ {field_name}({refs}) {selection} }}")
    };

    Ok(json!({
        "query": query,
        "variables": variables,
    }))
}

/// True when the given CLI flag key corresponds to an input arg (either a
/// flattened input field or a top-level input arg passed as object shorthand).
/// Direct scalar/enum args are not "body" inputs — they map to dedicated GraphQL
/// arguments and aren't subject to the `--json` exclusivity rule.
fn flag_targets_input(
    flag_key: &str,
    method_params: &HashMap<String, MethodParameter>,
    args: &[GraphQLArgDef],
) -> bool {
    if let Some(mp) = method_params.get(flag_key) {
        if mp.graphql_input_arg.is_some() {
            return true;
        }
    }
    // Also catch object-shorthand for the input arg itself when the parser
    // didn't tag it (defensive — current parser always tags it).
    args.iter().any(|a| a.is_input && a.flag_key == flag_key)
}

/// Set a value at a dotted camelCase path within a JSON object, creating
/// intermediate objects as needed. E.g., path `"dateRange.start"` sets
/// `obj["dateRange"]["start"] = value`.
fn set_nested_value(obj: &mut Map<String, Value>, path: &str, value: Value) {
    match path.split_once('.') {
        None => {
            obj.insert(path.to_string(), value);
        }
        Some((head, tail)) => {
            let nested = obj
                .entry(head.to_string())
                .or_insert_with(|| Value::Object(Map::new()));
            if let Value::Object(nested_map) = nested {
                set_nested_value(nested_map, tail, value);
            }
        }
    }
}

/// Extract `endCursor` from an unwrapped GraphQL response when `hasNextPage` is true.
fn extract_graphql_cursor(response_body: &str) -> Option<String> {
    let val: Value = serde_json::from_str(response_body).ok()?;
    let page_info = val.get("pageInfo")?;
    let has_next = page_info.get("hasNextPage")?.as_bool()?;
    if !has_next {
        return None;
    }
    page_info
        .get("endCursor")?
        .as_str()
        .map(|s| s.to_string())
}

/// Coerce a JSON value to the correct type based on the parameter definition.
/// CLI flags always come in as strings; this converts "3" → 3 for integers, etc.
///
/// JFL-1.2: `param_type=="object"` (the input-shorthand flag) parses the
/// string as JSON. An invalid payload is a hard validation error rather than
/// a silent fallback to the raw string — a misuse should be loud, not become
/// a confusing GraphQL "expected object, got string" later in the pipeline.
fn coerce_graphql_value(
    value: &Value,
    param_def: Option<&MethodParameter>,
) -> Result<Value, CliError> {
    // Object-shorthand inputs may arrive as a raw String (CLI flag path) or
    // pre-decoded (the `--params` JSON path inserts arbitrary Value shapes
    // directly into the params map). Validate shape uniformly across both
    // paths — otherwise a `--params '{"input": [1,2,3]}'` would slip past
    // here and then silently drop in build_graphql_body's Value::Object
    // guard, with the user's input vanishing without an error.
    if param_def.and_then(|d| d.param_type.as_deref()) == Some("object") {
        let parsed = if let Value::String(s) = value {
            serde_json::from_str::<Value>(s).unwrap_or_else(|_| value.clone())
        } else {
            value.clone()
        };
        if !parsed.is_object() {
            return Err(CliError::Validation(format!(
                "Object-shorthand flag must be a JSON object, got {}",
                match &parsed {
                    Value::Null => "null",
                    Value::Bool(_) => "boolean",
                    Value::Number(_) => "number",
                    Value::String(_) => "string",
                    Value::Array(_) => "array",
                    Value::Object(_) => unreachable!(),
                }
            )));
        }
        return Ok(parsed);
    }

    if let Value::String(s) = value {
        if let Some(def) = param_def {
            match def.param_type.as_deref() {
                Some("integer") => {
                    if let Ok(n) = s.parse::<i64>() {
                        return Ok(Value::Number(n.into()));
                    }
                }
                Some("number") => {
                    if let Ok(n) = s.parse::<f64>() {
                        if let Some(num) = serde_json::Number::from_f64(n) {
                            return Ok(Value::Number(num));
                        }
                    }
                }
                Some("boolean") => match s.as_str() {
                    "true" => return Ok(Value::Bool(true)),
                    "false" => return Ok(Value::Bool(false)),
                    _ => {}
                },
                _ => {}
            }
        }
    }
    Ok(value.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_pagination_config_default() {
        let config = PaginationConfig::default();
        assert!(!config.page_all);
        assert_eq!(config.page_limit, 10);
        assert_eq!(config.page_delay_ms, 100);
    }

    // -----------------------------------------------------------------------
    // handle_json_response
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn test_handle_json_response_capture_output() {
        let pipeline = crate::formatter::OutputPipeline::default();
        let mut pages_fetched = 0u32;
        let mut captured = Vec::new();

        let mut pager_none: Option<crate::pager::PagerHandle> = None;
        handle_json_response(
            r#"{"items":["a"]}"#,
            &pipeline,
            &mut pages_fetched,
            false,
            true,
            &mut captured,
            &mut pager_none,
        )
        .await
        .unwrap();

        assert_eq!(captured.len(), 1);
        assert_eq!(pages_fetched, 1);
    }

    #[tokio::test]
    async fn test_handle_json_response_non_json_body() {
        let pipeline = crate::formatter::OutputPipeline::default();
        let mut pages_fetched = 0u32;
        let mut captured = Vec::new();

        let mut pager_none: Option<crate::pager::PagerHandle> = None;
        handle_json_response(
            "not json at all",
            &pipeline,
            &mut pages_fetched,
            false,
            false,
            &mut captured,
            &mut pager_none,
        )
        .await
        .unwrap();

        assert_eq!(pages_fetched, 0);
    }

    // -----------------------------------------------------------------------
    // build_http_request
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn test_build_http_request_posts_json_body() {
        let client = reqwest::Client::new();
        let input = ExecutionInput {
            full_url: "https://example.com/graphql".to_string(),
            body: json!({"query": "{ ping }", "variables": {}}),
            params: Map::new(),
        };

        let request = build_http_request(&client, &input, &crate::auth::no_auth_provider()).unwrap();
        let built = request.build().unwrap();

        assert_eq!(built.method(), "POST");
        assert_eq!(
            built
                .headers()
                .get("Content-Type")
                .and_then(|v| v.to_str().ok()),
            Some("application/json"),
        );
    }

    // -----------------------------------------------------------------------
    // execute_method
    // -----------------------------------------------------------------------

    fn minimal_ping_doc_and_method() -> (GraphQLSchema, GraphQLOperation) {
        let doc = GraphQLSchema {
            name: "test".to_string(),
            version: "v1".to_string(),
            root_url: "https://example.com/graphql".to_string(),
            ..Default::default()
        };
        let method = GraphQLOperation {
            id: Some("ping".to_string()),
            graphql: Some(crate::graphql::discovery::GraphQLMethodInfo {
                operation_type: "query".to_string(),
                field_name: "ping".to_string(),
                default_selection: String::new(),
                args: Vec::new(),
            }),
            ..Default::default()
        };
        (doc, method)
    }

    #[tokio::test]
    async fn test_execute_method_dry_run_with_http_config() {
        // dry_run skips network I/O entirely, but still exercises the new
        // http_config parameter path — proving that the caller's
        // HttpConfig is plumbed all the way to execute_method.
        let (doc, method) = minimal_ping_doc_and_method();
        let pagination = PaginationConfig::default();
        let pipeline = crate::formatter::OutputPipeline::default();
        let http_config = crate::http::HttpConfig::new("test").unwrap();
        let retry_policy = crate::http::RetryPolicy::default();

        let result = execute_method(
            &doc,
            &method,
            None,
            None,
            &crate::auth::no_auth_provider(),
            true, // dry_run
            &pagination,
            &pipeline,
            true, // capture_output
            None,
            &http_config,
            &retry_policy,
            false,
            false, // debug
        )
        .await
        .expect("dry-run should succeed");

        let value = result.expect("dry-run with capture_output should return Some");
        assert_eq!(value["dry_run"], json!(true));
        assert_eq!(value["url"], json!("https://example.com/graphql"));
        assert_eq!(value["method"], json!("POST"));
    }

    // -----------------------------------------------------------------------
    // resolve_retry_policy + retry threading
    // -----------------------------------------------------------------------

    #[test]
    fn test_resolve_retry_policy_default_vs_disabled() {
        // Without --no-retry the SDK default policy is applied.
        let enabled = resolve_retry_policy(false);
        assert_eq!(enabled, crate::http::RetryPolicy::default());
        assert!(enabled.enabled);
        // --no-retry maps to the fully-disabled policy.
        let disabled = resolve_retry_policy(true);
        assert_eq!(disabled, crate::http::RetryPolicy::disabled());
        assert!(!disabled.enabled);
    }

    /// Run `execute_method` against a mock server, returning the result.
    /// Auth is `no_auth` and the operation is the minimal `ping` query, so
    /// every request is a bare `POST /graphql`.
    async fn run_against_mock(
        base_url: &str,
        retry_policy: &crate::http::RetryPolicy,
        no_retry: bool,
    ) -> Result<Option<Value>, CliError> {
        let (doc, method) = minimal_ping_doc_and_method();
        let pagination = PaginationConfig::default();
        let pipeline = crate::formatter::OutputPipeline::default();
        let http_config = crate::http::HttpConfig::new("test").unwrap();
        execute_method(
            &doc,
            &method,
            None,
            None,
            &crate::auth::no_auth_provider(),
            false, // dry_run
            &pagination,
            &pipeline,
            true, // capture_output
            Some(base_url),
            &http_config,
            retry_policy,
            no_retry,
            false, // debug
        )
        .await
    }

    #[tokio::test]
    async fn test_no_retry_yields_single_attempt() {
        use wiremock::matchers::method as http_method;
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        // 503 is retryable, but --no-retry must short-circuit to a single
        // attempt. `expect(1)` fails the test if the executor sends a retry.
        Mock::given(http_method("POST"))
            .respond_with(ResponseTemplate::new(503))
            .expect(1)
            .mount(&server)
            .await;

        let base_url = format!("{}/graphql", server.uri().trim_end_matches('/'));
        // With --no-retry the policy is disabled and `no_retry` is true; both
        // signals agree on "do not retry".
        let policy = resolve_retry_policy(true);
        let result = run_against_mock(&base_url, &policy, true).await;

        assert!(result.is_err(), "503 with --no-retry should surface as an error");
        // `expect(1)` is verified on drop — exactly one request was sent.
    }

    #[tokio::test]
    async fn test_retryable_status_retries_under_default_policy() {
        use wiremock::matchers::method as http_method;
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        // First attempt: 503 (retryable). Second attempt: 200 success.
        Mock::given(http_method("POST"))
            .respond_with(ResponseTemplate::new(503))
            .up_to_n_times(1)
            .expect(1)
            .mount(&server)
            .await;
        Mock::given(http_method("POST"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "data": { "ping": "pong" }
            })))
            .expect(1)
            .mount(&server)
            .await;

        // A short base delay keeps the test fast while still exercising the
        // real backoff/sleep path of the default-shaped policy.
        let policy = crate::http::RetryPolicy {
            base_delay_ms: 1,
            ..crate::http::RetryPolicy::default()
        };
        let result = run_against_mock(&base_url_of(&server), &policy, false).await;

        let value = result.expect("should succeed after one retry");
        let value = value.expect("capture_output should return Some");
        assert_eq!(value, json!("pong"), "single-field data envelope is unwrapped");
        // Both `expect(1)` mocks are verified on drop: exactly two requests
        // total — one 503, one 200 — proving the retryable status retried.
    }

    fn base_url_of(server: &wiremock::MockServer) -> String {
        format!("{}/graphql", server.uri().trim_end_matches('/'))
    }

    // -----------------------------------------------------------------------
    // parse_graphql_response
    // -----------------------------------------------------------------------

    #[test]
    fn test_parse_graphql_response_errors_only_is_fatal() {
        let body = json!({
            "errors": [{"message": "Not found"}]
        })
        .to_string();
        let result = parse_graphql_response(&body);
        assert!(result.is_err(), "errors-only should be fatal");
    }

    #[test]
    fn test_parse_graphql_response_errors_and_data_returns_data() {
        let body = json!({
            "data": {"node": {"id": "n1", "name": "test"}},
            "errors": [{"message": "partial failure"}]
        })
        .to_string();
        let result = parse_graphql_response(&body).expect("errors+data should succeed");
        let val: Value = serde_json::from_str(&result).unwrap();
        assert_eq!(val["id"], "n1", "partial data should be returned");
    }

    #[test]
    fn test_parse_graphql_response_null_data_with_errors_is_fatal() {
        let body = json!({
            "data": null,
            "errors": [{"message": "fatal"}]
        })
        .to_string();
        let result = parse_graphql_response(&body);
        assert!(result.is_err(), "null data + errors should be fatal");
    }

    #[test]
    fn test_parse_graphql_response_unwraps_single_field() {
        let body = json!({
            "data": {"issues": {"nodes": [{"id": "i1"}]}}
        })
        .to_string();
        let result = parse_graphql_response(&body).unwrap();
        let val: Value = serde_json::from_str(&result).unwrap();
        assert!(val.get("nodes").is_some(), "should unwrap single-field data envelope");
    }

    // -----------------------------------------------------------------------
    // extract_graphql_cursor
    // -----------------------------------------------------------------------

    #[test]
    fn test_extract_graphql_cursor_returns_cursor_when_has_next() {
        let body = json!({
            "nodes": [],
            "pageInfo": {"hasNextPage": true, "endCursor": "cursor-abc"}
        })
        .to_string();
        let cursor = extract_graphql_cursor(&body);
        assert_eq!(cursor, Some("cursor-abc".to_string()));
    }

    #[test]
    fn test_extract_graphql_cursor_returns_none_when_no_next() {
        let body = json!({
            "nodes": [],
            "pageInfo": {"hasNextPage": false, "endCursor": "cursor-abc"}
        })
        .to_string();
        assert_eq!(extract_graphql_cursor(&body), None);
    }

    #[test]
    fn test_extract_graphql_cursor_returns_none_when_no_page_info() {
        let body = json!({"nodes": []}).to_string();
        assert_eq!(extract_graphql_cursor(&body), None);
    }

    // -----------------------------------------------------------------------
    // set_nested_value
    // -----------------------------------------------------------------------

    #[test]
    fn test_set_nested_value_flat() {
        let mut obj = Map::new();
        set_nested_value(&mut obj, "name", Value::String("alice".to_string()));
        assert_eq!(obj["name"], "alice");
    }

    #[test]
    fn test_set_nested_value_two_levels() {
        let mut obj = Map::new();
        set_nested_value(
            &mut obj,
            "dateRange.start",
            Value::String("2024-01-01".to_string()),
        );
        set_nested_value(
            &mut obj,
            "dateRange.end",
            Value::String("2024-12-31".to_string()),
        );
        let date_range = obj["dateRange"].as_object().unwrap();
        assert_eq!(date_range["start"], "2024-01-01");
        assert_eq!(date_range["end"], "2024-12-31");
    }

    #[test]
    fn test_set_nested_value_three_levels() {
        let mut obj = Map::new();
        set_nested_value(&mut obj, "a.b.c", Value::String("deep".to_string()));
        assert_eq!(obj["a"]["b"]["c"], "deep");
    }

    // -----------------------------------------------------------------------
    // build_graphql_body
    // -----------------------------------------------------------------------

    #[test]
    fn test_build_graphql_body_injects_cursor_when_after_arg_present() {
        let gql = GraphQLMethodInfo {
            operation_type: "query".to_string(),
            field_name: "nodes".to_string(),
            default_selection: "{ nodes { id } pageInfo { hasNextPage endCursor } }".to_string(),
            args: vec![
                GraphQLArgDef {
                    name: "first".to_string(),
                    flag_key: "first".to_string(),
                    gql_type: "Int".to_string(),
                    is_input: false,
                    is_list: false,
                },
                GraphQLArgDef {
                    name: "after".to_string(),
                    flag_key: "after".to_string(),
                    gql_type: "String".to_string(),
                    is_input: false,
                    is_list: false,
                },
            ],
        };
        let params = Map::new();
        let method_params: HashMap<String, MethodParameter> = HashMap::new();

        let body =
            build_graphql_body(&gql, &params, None, &method_params, Some("cursor-xyz")).unwrap();
        let vars = body["variables"].as_object().unwrap();
        assert_eq!(vars.get("after").and_then(|v| v.as_str()), Some("cursor-xyz"));
        assert!(body["query"].as_str().unwrap().contains("$after: String"));
    }

    #[test]
    fn test_build_graphql_body_no_cursor_when_no_after_arg() {
        let gql = GraphQLMethodInfo {
            operation_type: "query".to_string(),
            field_name: "node".to_string(),
            default_selection: "{ id name }".to_string(),
            args: vec![GraphQLArgDef {
                name: "id".to_string(),
                flag_key: "id".to_string(),
                gql_type: "String!".to_string(),
                is_input: false,
                is_list: false,
            }],
        };
        let mut params = Map::new();
        params.insert("id".to_string(), Value::String("n1".to_string()));
        let method_params: HashMap<String, MethodParameter> = HashMap::new();

        let body =
            build_graphql_body(&gql, &params, None, &method_params, Some("cursor-xyz")).unwrap();
        let vars = body["variables"].as_object().unwrap();
        assert!(vars.get("after").is_none(), "no after arg = cursor not injected");
    }

    #[test]
    fn test_build_graphql_body_reconstructs_nested_input() {
        let gql = GraphQLMethodInfo {
            operation_type: "query".to_string(),
            field_name: "filteredNodes".to_string(),
            default_selection: "{ nodes { id } }".to_string(),
            args: vec![GraphQLArgDef {
                name: "filter".to_string(),
                flag_key: "filter".to_string(),
                gql_type: "NodeFilter".to_string(),
                is_input: true,
                is_list: false,
            }],
        };

        let mut params = Map::new();
        params.insert(
            "date-range-start".to_string(),
            Value::String("2024-01-01".to_string()),
        );
        params.insert(
            "date-range-end".to_string(),
            Value::String("2024-12-31".to_string()),
        );

        let mut method_params: HashMap<String, MethodParameter> = HashMap::new();
        method_params.insert(
            "date-range-start".to_string(),
            MethodParameter {
                param_type: Some("string".to_string()),
                graphql_input_arg: Some("filter".to_string()),
                graphql_field_path: Some("dateRange.start".to_string()),
                ..Default::default()
            },
        );
        method_params.insert(
            "date-range-end".to_string(),
            MethodParameter {
                param_type: Some("string".to_string()),
                graphql_input_arg: Some("filter".to_string()),
                graphql_field_path: Some("dateRange.end".to_string()),
                ..Default::default()
            },
        );

        let body = build_graphql_body(&gql, &params, None, &method_params, None).unwrap();
        let filter = body["variables"]["filter"].as_object().unwrap();
        let date_range = filter["dateRange"].as_object().unwrap();
        assert_eq!(date_range["start"], "2024-01-01");
        assert_eq!(date_range["end"], "2024-12-31");
    }

    // -----------------------------------------------------------------------
    // JFL-1.2: object shorthand + mutually exclusive input modes
    // -----------------------------------------------------------------------

    #[test]
    fn test_coerce_graphql_value_object_parses_json() {
        // JFL-1.2: when a flag's param_type=="object" (an input-shorthand
        // flag), the CLI string must be JSON-parsed so it lands in the
        // GraphQL variables as an object, not a quoted string.
        let mp = MethodParameter {
            param_type: Some("object".to_string()),
            ..Default::default()
        };
        let v = coerce_graphql_value(
            &Value::String(r#"{"first":"Abe","last":"Lincoln"}"#.to_string()),
            Some(&mp),
        )
        .unwrap();
        assert_eq!(v, json!({ "first": "Abe", "last": "Lincoln" }));
    }

    #[test]
    fn test_coerce_graphql_value_object_invalid_json_is_validation_error() {
        // Malformed object-shorthand JSON must surface as a loud Validation
        // error rather than a best-effort fallback to a string.
        let mp = MethodParameter {
            param_type: Some("object".to_string()),
            ..Default::default()
        };
        let err = coerce_graphql_value(
            &Value::String("not json".to_string()),
            Some(&mp),
        )
        .unwrap_err();
        match err {
            CliError::Validation(_) => {}
            other => panic!("expected Validation error, got {other:?}"),
        }
    }

    #[test]
    fn test_coerce_graphql_value_object_non_object_json_is_validation_error() {
        // Object-shorthand expects a JSON *object*. Valid JSON of any other
        // shape (number, array, string, bool, null) must be rejected with a
        // clear error so the user doesn't end up with a double-nested or
        // type-mismatched GraphQL variable.
        let mp = MethodParameter {
            param_type: Some("object".to_string()),
            ..Default::default()
        };
        for bad in [r#"42"#, r#"[1,2]"#, r#""hello""#, r#"true"#, r#"null"#] {
            let err = coerce_graphql_value(&Value::String(bad.to_string()), Some(&mp))
                .unwrap_err();
            match err {
                CliError::Validation(msg) => {
                    assert!(
                        msg.contains("must be a JSON object"),
                        "expected 'must be a JSON object' in error for {bad}: {msg}"
                    );
                }
                other => panic!("expected Validation error for {bad}, got {other:?}"),
            }
        }

        // Pre-decoded non-String values (the `--params` JSON path inserts
        // arbitrary Value shapes directly) must also be shape-validated so
        // they don't silently drop in build_graphql_body's Value::Object guard.
        for (pre_decoded, kind) in [
            (json!([1, 2, 3]), "array"),
            (json!(42), "number"),
            (json!(true), "boolean"),
            (Value::Null, "null"),
        ] {
            let err = coerce_graphql_value(&pre_decoded, Some(&mp)).unwrap_err();
            match err {
                CliError::Validation(msg) => assert!(
                    msg.contains("must be a JSON object") && msg.contains(kind),
                    "expected 'must be a JSON object, got {kind}' for pre-decoded {pre_decoded}: {msg}"
                ),
                other => panic!("expected Validation error for pre-decoded {pre_decoded}, got {other:?}"),
            }
        }
    }

    #[test]
    fn test_graphql_json_plus_input_arg_validation_error() {
        // JFL-1.2: passing `--json` alongside any input-arg flag is a
        // validation error. Mirrors the OpenAPI rule.
        let gql = GraphQLMethodInfo {
            operation_type: "query".to_string(),
            field_name: "filteredNodes".to_string(),
            default_selection: "{ nodes { id } }".to_string(),
            args: vec![GraphQLArgDef {
                name: "filter".to_string(),
                flag_key: "filter".to_string(),
                gql_type: "NodeFilter".to_string(),
                is_input: true,
                is_list: false,
            }],
        };

        let mut params = Map::new();
        params.insert(
            "name".to_string(),
            Value::String("Abraham".to_string()),
        );

        let mut method_params: HashMap<String, MethodParameter> = HashMap::new();
        method_params.insert(
            "name".to_string(),
            MethodParameter {
                param_type: Some("string".to_string()),
                graphql_input_arg: Some("filter".to_string()),
                graphql_field_path: Some("name".to_string()),
                ..Default::default()
            },
        );

        let err = build_graphql_body(
            &gql,
            &params,
            Some(r#"{"name":"from-json"}"#),
            &method_params,
            None,
        )
        .unwrap_err();
        match err {
            CliError::Validation(msg) => {
                assert!(msg.contains("--json"), "error must mention --json: {msg}");
                assert!(msg.contains("--name"), "error must name the input flag: {msg}");
            }
            other => panic!("expected Validation error, got {other:?}"),
        }
    }

    #[test]
    fn test_graphql_object_shorthand_plus_leaf_validation_error() {
        // JFL-1.2: `--filter` (object shorthand) and `--filter.name` (leaf)
        // must not be combined.
        let gql = GraphQLMethodInfo {
            operation_type: "query".to_string(),
            field_name: "filteredNodes".to_string(),
            default_selection: "{ nodes { id } }".to_string(),
            args: vec![GraphQLArgDef {
                name: "filter".to_string(),
                flag_key: "filter".to_string(),
                gql_type: "NodeFilter".to_string(),
                is_input: true,
                is_list: false,
            }],
        };

        let mut params = Map::new();
        params.insert(
            "filter".to_string(),
            Value::String(r#"{"other":"x"}"#.to_string()),
        );
        params.insert(
            "filter.name".to_string(),
            Value::String("Abraham".to_string()),
        );

        let mut method_params: HashMap<String, MethodParameter> = HashMap::new();
        method_params.insert(
            "filter".to_string(),
            MethodParameter {
                param_type: Some("object".to_string()),
                graphql_input_arg: Some("filter".to_string()),
                graphql_field_path: Some(String::new()),
                ..Default::default()
            },
        );
        method_params.insert(
            "filter.name".to_string(),
            MethodParameter {
                param_type: Some("string".to_string()),
                graphql_input_arg: Some("filter".to_string()),
                graphql_field_path: Some("name".to_string()),
                ..Default::default()
            },
        );

        let err = build_graphql_body(&gql, &params, None, &method_params, None).unwrap_err();
        match err {
            CliError::Validation(msg) => {
                assert!(msg.contains("--filter"), "error must mention --filter: {msg}");
                assert!(
                    msg.contains("--filter.name"),
                    "error must mention --filter.name: {msg}"
                );
            }
            other => panic!("expected Validation error, got {other:?}"),
        }
    }
}
