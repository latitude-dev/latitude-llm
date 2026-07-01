//! OpenAPI 3.0 Parser
//!
//! Converts an OpenAPI 3.0 YAML specification into the internal `RestDescription`
//! representation used by the CLI command builder and executor.

use std::collections::HashMap;

use serde::{Deserialize, Deserializer};

use crate::text::to_kebab_flag;
use crate::openapi::discovery::{
    Availability, BinaryRequestBody, BodyEncoding, GlobalHeader, IdempotencyHeader, JsonSchema,
    JsonSchemaProperty, MethodParameter, MultipartField, PaginationConfig, RestDescription,
    RestMethod, RestResource, RetriesConfig, SchemaRef, SdkGroupInfo, SdkVariable,
    SecurityScheme, StreamingConfig,
};
use crate::error::CliError;

/// Deserialize `x-fern-sdk-group-name` as either a string scalar or a list of
/// strings. The Fern extension allows both forms; specs like AssemblyAI's use
/// the scalar form while internal fixtures use the list form for nesting.
fn deserialize_group_name<'de, D>(deserializer: D) -> Result<Option<Vec<String>>, D::Error>
where
    D: Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum StringOrList {
        String(String),
        List(Vec<String>),
    }
    match Option::<StringOrList>::deserialize(deserializer)? {
        None => Ok(None),
        Some(StringOrList::String(s)) => Ok(Some(vec![s])),
        Some(StringOrList::List(v)) => Ok(Some(v)),
    }
}

// ---------------------------------------------------------------------------
// YAML deep-merge (Fern overrides support)
// ---------------------------------------------------------------------------

/// Recursively deep-merge `overrides` onto `base`, matching the Fern CLI's
/// `mergeWithOverrides` behavior (lodash `mergeWith` + `omitDeepBy(isNull)`).
///
/// Maps merge key-by-key (override wins on leaf collisions). Arrays of objects
/// merge element-by-element by index; if the override array is shorter the base
/// tail is kept, if longer the override tail is appended. Arrays of primitives
/// (or mixed) replace wholesale. Scalars replace. Null values in overrides
/// delete the key from the base; null removal is applied recursively.
/// Keys whose descendants preserve `null` values during the post-merge
/// null-removal pass. Matches the Fern CLI's `OPENAPI_EXAMPLES_KEYS` constant
/// used as `allowNullKeys` in `loadOpenAPI.ts`.
const ALLOW_NULL_KEYS: &[&str] = &[
    "examples",
    "example",
    "x-fern-examples",
    "x-code-samples",
    "x-codeSamples",
];

pub fn deep_merge_yaml(
    base: serde_yaml::Value,
    overrides: serde_yaml::Value,
) -> serde_yaml::Value {
    let merged = deep_merge_yaml_inner(base, overrides);
    remove_nulls(merged, false)
}

/// Returns `true` if every element in the YAML sequence is a mapping (object).
fn all_objects(seq: &[serde_yaml::Value]) -> bool {
    seq.iter().all(|v| v.is_mapping())
}

/// Core merge without null-removal (applied once at the top level).
fn deep_merge_yaml_inner(
    base: serde_yaml::Value,
    overrides: serde_yaml::Value,
) -> serde_yaml::Value {
    match (base, overrides) {
        (serde_yaml::Value::Mapping(mut base_map), serde_yaml::Value::Mapping(override_map)) => {
            for (key, override_val) in override_map {
                if let Some(base_val) = base_map.remove(&key) {
                    base_map.insert(key, deep_merge_yaml_inner(base_val, override_val));
                } else {
                    base_map.insert(key, override_val);
                }
            }
            serde_yaml::Value::Mapping(base_map)
        }
        (
            serde_yaml::Value::Sequence(base_seq),
            serde_yaml::Value::Sequence(override_seq),
        ) => {
            // Fern parity: arrays of objects are merged element-by-element
            // (by index). Arrays of primitives (or mixed) replace wholesale.
            if all_objects(&base_seq) && all_objects(&override_seq) {
                let mut result: Vec<serde_yaml::Value> = Vec::with_capacity(
                    std::cmp::max(base_seq.len(), override_seq.len()),
                );
                let mut base_iter = base_seq.into_iter();
                let mut ovr_iter = override_seq.into_iter();
                loop {
                    match (base_iter.next(), ovr_iter.next()) {
                        (Some(b), Some(o)) => result.push(deep_merge_yaml_inner(b, o)),
                        (Some(b), None) => result.push(b),
                        (None, Some(o)) => result.push(o),
                        (None, None) => break,
                    }
                }
                serde_yaml::Value::Sequence(result)
            } else {
                serde_yaml::Value::Sequence(override_seq)
            }
        }
        // All other types: override replaces the base.
        (_base, override_val) => override_val,
    }
}

/// Recursively walk a YAML value and remove any key whose value is `null`.
/// This matches the Fern CLI's `omitDeepBy(isNull)` post-merge pass.
///
/// When `allow_nulls` is `true` (i.e. we are inside a key listed in
/// `ALLOW_NULL_KEYS`, such as `"examples"`), null values are preserved
/// instead of being stripped. The flag propagates to all descendants.
fn remove_nulls(value: serde_yaml::Value, allow_nulls: bool) -> serde_yaml::Value {
    match value {
        serde_yaml::Value::Mapping(map) => {
            let mut cleaned = serde_yaml::Mapping::new();
            for (k, v) in map {
                let key_str = k.as_str().unwrap_or("");
                let child_allow = allow_nulls || ALLOW_NULL_KEYS.contains(&key_str);
                if !child_allow && v.is_null() {
                    continue;
                }
                cleaned.insert(k, remove_nulls(v, child_allow));
            }
            serde_yaml::Value::Mapping(cleaned)
        }
        serde_yaml::Value::Sequence(seq) => {
            serde_yaml::Value::Sequence(
                seq.into_iter().map(|v| remove_nulls(v, allow_nulls)).collect(),
            )
        }
        other => other,
    }
}

// ---------------------------------------------------------------------------
// Serde structs for OpenAPI 3.0
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct OpenApiSpec {
    info: OpenApiInfo,
    #[serde(default)]
    servers: Vec<OpenApiServer>,
    #[serde(default)]
    paths: HashMap<String, OpenApiPathItem>,
    /// OpenAPI 3.1 top-level `webhooks` block. Webhooks describe operations
    /// the *server* sends to the user (inbound from the CLI's perspective),
    /// so they are captured but intentionally not lowered into CLI
    /// subcommands. Any component schemas they reference remain reachable
    /// via `components.schemas` regardless.
    #[serde(default)]
    webhooks: HashMap<String, OpenApiPathItem>,
    components: Option<OpenApiComponents>,
    /// Spec-level default security. Each entry is an alternative; within an
    /// entry the keys are scheme names (their values are the requested
    /// OAuth2/OpenIDConnect scopes — empty arrays for HTTP/apiKey schemes).
    /// Inherited by every operation that doesn't declare its own `security`.
    #[serde(default)]
    security: Option<Vec<HashMap<String, Vec<String>>>>,
    /// Spec-root `x-fern-pagination` extension. Inherited by operations that
    /// set `x-fern-pagination: true` instead of their own config block.
    #[serde(default, rename = "x-fern-pagination")]
    x_fern_pagination: Option<serde_yaml::Value>,
    /// Spec-root `x-fern-base-path` extension. Declares a common prefix
    /// prepended to every operation path at request time. See
    /// [`RestDescription::base_path`] for the runtime behavior.
    #[serde(default, rename = "x-fern-base-path")]
    x_fern_base_path: Option<String>,
    /// Spec-root [`x-fern-idempotency-headers`](https://buildwithfern.com/learn/api-definitions/openapi/extensions/idempotency-headers)
    /// extension. List of headers that idempotent operations accept.
    #[serde(default, rename = "x-fern-idempotency-headers")]
    x_fern_idempotency_headers: Option<Vec<RawIdempotencyHeader>>,
    /// Spec-root `x-fern-sdk-variables` extension. Lowered into
    /// `RestDescription::sdk_variables` via `parse_sdk_variables`.
    #[serde(default, rename = "x-fern-sdk-variables")]
    x_fern_sdk_variables: Option<serde_yaml::Mapping>,
    /// Spec-root [`x-fern-retries`](https://buildwithfern.com/learn/api-definitions/openapi/extensions/retries)
    /// extension. May be a boolean shorthand (`true` enables defaults,
    /// `false` disables) or an object describing the retry policy.
    /// Inherited by every operation that omits its own block or sets it
    /// to `true`. Mirrors upstream fern's `getFernRetriesExtension`,
    /// extended with the optional `max_attempts` / `base_delay_ms` /
    /// `factor` / `jitter` knobs the runtime retry loop consumes.
    #[serde(default, rename = "x-fern-retries")]
    x_fern_retries: Option<serde_yaml::Value>,
    /// Spec-root [`x-fern-global-headers`](https://buildwithfern.com/learn/api-definitions/openapi/extensions/global-headers)
    /// extension. List of headers stamped on every outgoing request.
    #[serde(default, rename = "x-fern-global-headers")]
    x_fern_global_headers: Option<Vec<RawGlobalHeader>>,
    /// Spec-root [`x-fern-groups`](https://buildwithfern.com/learn/api-definitions/openapi/extensions/groups)
    /// extension. Mirrors the upstream Fern OpenAPI importer's
    /// `getFernGroups.ts`: a record mapping group identifiers to
    /// `{ summary?, description? }` metadata. Lowered into
    /// [`RestDescription::groups`] (keyed by the kebab-cased identifier
    /// so it matches the resource keys built from
    /// `x-fern-sdk-group-name`).
    #[serde(default, rename = "x-fern-groups")]
    x_fern_groups: Option<HashMap<String, RawFernGroup>>,
}

/// Raw deserialized form of a single entry in `x-fern-idempotency-headers`.
/// Mirrors the upstream Fern OpenAPI importer's `IdempotencyHeaderExtension`
/// shape (`fern-api/fern` `getIdempotencyHeaders.ts`).
#[derive(Debug, Deserialize, Clone)]
struct RawIdempotencyHeader {
    /// HTTP header name (e.g. `Idempotency-Key`). Required.
    header: String,
    /// Optional SDK/CLI parameter name override.
    #[serde(default)]
    name: Option<String>,
    /// Optional environment variable name supplying a default value.
    #[serde(default)]
    env: Option<String>,
}

/// Raw deserialized form of a single entry in `x-fern-global-headers`.
/// Mirrors the upstream Fern OpenAPI importer's `GlobalHeaderExtension`
/// shape (`fern-api/fern` `getGlobalHeaders.ts`): `header` is the only
/// required field; everything else tunes the SDK/CLI surface.
///
/// Both `default` and `x-fern-default` are accepted for the baked-in
/// fallback value. When both are present, `x-fern-default` wins —
/// mirroring the broader Fern convention where the prefixed extension
/// is the explicit form.
#[derive(Debug, Deserialize, Clone)]
struct RawGlobalHeader {
    /// HTTP header name (e.g. `X-API-Version`). Required.
    header: String,
    /// Optional SDK/CLI parameter name override. Drives the kebab-cased
    /// flag name when present (`apiVersion` → `--api-version`).
    #[serde(default)]
    name: Option<String>,
    /// When `true`, the header is omitted from outgoing requests when
    /// no value resolves. Defaults to `false` (required).
    #[serde(default)]
    optional: Option<bool>,
    /// Optional environment variable name supplying a fallback value.
    #[serde(default)]
    env: Option<String>,
    /// Optional baked-in default value. Surfaced in `--help` and sent
    /// on the wire when neither the flag nor the env var is supplied.
    #[serde(default)]
    default: Option<serde_yaml::Value>,
    /// Alternate baked-in default. Wins over `default` when both are
    /// present (mirrors `x-fern-default` precedence elsewhere in the
    /// Fern OpenAPI importer).
    #[serde(rename = "x-fern-default", default)]
    x_fern_default: Option<serde_yaml::Value>,
}

/// Raw deserialized form of a single entry in the document-root
/// `x-fern-groups` map. Mirrors the upstream Fern OpenAPI importer's
/// `XFernGroupsSchema` zod schema (`getFernGroups.ts` →
/// `{ summary?: string, description?: string }`).
///
/// Both fields are optional; the matching IR shape exposed by fern
/// (`SdkGroupInfo` in `finalIr.yml`) preserves them verbatim and the
/// `display-name` token shown in the JSDoc comment of fern's extension
/// enum is *not* part of the enforced schema — `summary` is the
/// real field name on the wire.
#[derive(Debug, Deserialize, Clone, Default)]
struct RawFernGroup {
    /// Short human-friendly label for the group. Surfaces as the
    /// clap subcommand's `about()` line when set.
    #[serde(default)]
    summary: Option<String>,
    /// Longer prose description for the group. Surfaces as the
    /// clap subcommand's `long_about()` when set.
    #[serde(default)]
    description: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenApiInfo {
    title: Option<String>,
    version: String,
    description: Option<String>,
}

#[derive(Debug, Deserialize)]
struct OpenApiServer {
    url: String,
    #[serde(default)]
    description: Option<String>,
    /// Fern v2 spelling — the canonical extension name for naming a server.
    /// When both v1 and v2 are present on the same entry, v1 wins to
    /// mirror the upstream `fern-api/fern` OpenAPI importer, which
    /// resolves the name via
    /// `getExtension(server, [SERVER_NAME_V1, SERVER_NAME_V2])` —
    /// `getExtension` returns the first matching key, so the v1 alias
    /// `x-name` lands first. See
    /// `packages/cli/api-importers/openapi/openapi-ir-parser/src/openapi/v3/converters/convertServer.ts`
    /// lines 72-75 and `.../src/getExtension.ts` lines 25-35.
    #[serde(default, rename = "x-fern-server-name")]
    x_fern_server_name: Option<String>,
    /// Fern v1 legacy alias. Recognized for backwards compatibility with
    /// older specs that haven't migrated to `x-fern-server-name`. When
    /// both extensions are present, this v1 spelling wins — see the
    /// doc-comment on `x_fern_server_name` for the precedence citation.
    #[serde(default, rename = "x-name")]
    x_name: Option<String>,
}

impl OpenApiServer {
    /// Resolve the server name, applying v1-over-v2 precedence to
    /// match fern's `getExtension([SERVER_NAME_V1, SERVER_NAME_V2])`
    /// first-match-wins behavior in
    /// `packages/cli/api-importers/openapi/openapi-ir-parser/src/openapi/v3/converters/convertServer.ts:72-75`.
    /// Each extension is trimmed and treated as "absent" when it is
    /// the empty string (or whitespace-only) before the fallback runs,
    /// so a blank `x-name: ""` does not shadow a valid
    /// `x-fern-server-name` (and vice versa). An empty extension would
    /// otherwise leak into clap as a blank-string possible value and a
    /// blank `--help` row, which is always a spec bug — drop it at the
    /// source so downstream code never needs to handle it.
    fn resolved_name(&self) -> Option<String> {
        fn trimmed_non_empty(s: &Option<String>) -> Option<String> {
            s.as_ref()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
        }
        trimmed_non_empty(&self.x_name).or_else(|| trimmed_non_empty(&self.x_fern_server_name))
    }

    /// Lower the OpenAPI server entry into the internal
    /// [`discovery::Server`] representation, applying the v1/v2 name
    /// fallback (v1 wins; see [`Self::resolved_name`]).
    fn to_discovery_server(&self) -> crate::openapi::discovery::Server {
        crate::openapi::discovery::Server {
            url: self.url.clone(),
            name: self.resolved_name(),
            description: self.description.clone(),
        }
    }
}

#[derive(Debug, Deserialize, Default)]
struct OpenApiPathItem {
    get: Option<OpenApiOperation>,
    post: Option<OpenApiOperation>,
    put: Option<OpenApiOperation>,
    patch: Option<OpenApiOperation>,
    delete: Option<OpenApiOperation>,
    #[serde(default)]
    parameters: Vec<OpenApiParamOrRef>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct OpenApiOperation {
    #[serde(rename = "operationId")]
    operation_id: Option<String>,
    summary: Option<String>,
    description: Option<String>,
    #[serde(default)]
    parameters: Vec<OpenApiParamOrRef>,
    #[serde(rename = "requestBody")]
    request_body: Option<OpenApiRequestBody>,
    /// `responses` map, keyed by status code (`"200"`, `"201"`, …) or
    /// `"default"`. Values may be inline response objects or `$ref`s to
    /// `components/responses/<name>`. Consumed by [`extract_response`]
    /// (after resolving refs) to select the primary success response.
    #[serde(default)]
    responses: HashMap<String, OpenApiResponseOrRef>,
    #[serde(default)]
    servers: Vec<OpenApiServer>,
    #[serde(default)]
    tags: Option<Vec<String>>,
    #[serde(rename = "x-fern-sdk-group-name", default, deserialize_with = "deserialize_group_name")]
    x_fern_sdk_group_name: Option<Vec<String>>,
    #[serde(rename = "x-fern-sdk-method-name")]
    x_fern_sdk_method_name: Option<String>,
    /// Operation-level security override. `Some(vec![])` is meaningful — it
    /// explicitly opts the operation out of the spec-level default, marking
    /// it anonymous. `None` means "inherit the spec default".
    #[serde(default)]
    security: Option<Vec<HashMap<String, Vec<String>>>>,
    /// Operation-level `x-fern-pagination`. May be:
    /// - an object describing cursor / offset / uri / path / custom pagination (overrides root)
    /// - the literal `true` (inherits the spec-root config)
    /// - missing (falls back to the document-wide pagination heuristic)
    #[serde(default, rename = "x-fern-pagination")]
    x_fern_pagination: Option<serde_yaml::Value>,
    /// Fern extension: when `Some(true)`, the operation is dropped from
    /// the generated CLI surface — it does not appear as a subcommand, in
    /// `--help`, or in completions. `None` (the default) and `Some(false)`
    /// both keep the operation. Stored as `Option<bool>` to mirror the
    /// nullish-coalescing precedence used at the parameter level.
    /// See https://buildwithfern.com/learn/api-definitions/openapi/extensions/ignore
    #[serde(rename = "x-fern-ignore", default)]
    x_fern_ignore: Option<bool>,
    /// OpenAPI standard `deprecated: true` flag on the operation. When
    /// `x-fern-availability` is absent, a `true` here is lowered to
    /// `Availability::Deprecated` so deprecated operations still surface
    /// a `[DEPRECATED]` badge in help output.
    #[serde(default)]
    deprecated: bool,
    /// Raw `x-fern-availability` extension on the operation. When present,
    /// takes precedence over the standard `deprecated` flag.
    #[serde(rename = "x-fern-availability", default)]
    x_fern_availability: Option<Availability>,
    /// [`x-fern-idempotent: true`](https://buildwithfern.com/learn/api-definitions/openapi/extensions/idempotent)
    /// marker. When `true`, the operation surfaces spec-root idempotency
    /// headers as CLI flags; non-idempotent operations never send these
    /// headers.
    #[serde(rename = "x-fern-idempotent", default)]
    x_fern_idempotent: Option<bool>,
    /// `x-fern-cli-idempotency: false` opt-out for auto Idempotency-Key.
    /// When explicitly `false`, the executor does NOT inject the
    /// auto-generated `Idempotency-Key` header on POST/PUT/PATCH.
    #[serde(rename = "x-fern-cli-idempotency", default)]
    x_fern_cli_idempotency: Option<bool>,
    /// Raw `x-fern-sdk-return-value` extension on the operation. Mirrors
    /// fern-api/fern's `FernOpenAPIExtension.RESPONSE_PROPERTY` — a
    /// dot-separated key path into the JSON response body identifying
    /// the subvalue to surface to the caller. `None` (the default)
    /// means the executor prints the full response.
    #[serde(rename = "x-fern-sdk-return-value", default)]
    x_fern_sdk_return_value: Option<String>,
    /// Raw operation-level `x-fern-streaming` extension. May be:
    /// - the literal `true` (boolean shorthand → NDJSON, no terminator)
    /// - the literal `false` (explicit opt-out)
    /// - an object describing the stream (`format`, optional `terminator`,
    ///   and the `stream-condition` / `response-stream` / `response` keys
    ///   recognized upstream for parity — only `format` and `terminator`
    ///   affect runtime behavior)
    /// - missing (no streaming)
    ///
    /// Resolved into [`StreamingConfig`] via `parse_streaming_extension`.
    #[serde(rename = "x-fern-streaming", default)]
    x_fern_streaming: Option<serde_yaml::Value>,
    /// Operation-level `x-fern-retries`. Same shape as the spec-root
    /// block (boolean shorthand or object). A boolean defers to the
    /// spec-root block; an object merges field-by-field over the
    /// spec-root baseline. Missing inherits the spec root verbatim.
    #[serde(default, rename = "x-fern-retries")]
    x_fern_retries: Option<serde_yaml::Value>,
    /// Raw `x-fern-audiences` extension on the operation. Mirrors
    /// fern-api/fern's OpenAPI importer
    /// (`FernOpenAPIExtension.AUDIENCES = "x-fern-audiences"`): an
    /// array of strings declaring which audiences the operation is
    /// part of. Missing or empty means "no audience tag" — and is
    /// filtered OUT when the binary's `main.rs` configures any preset
    /// audience via [`crate::openapi::CliApp::audiences`], matching
    /// fern's `audiences.some(a => operationAudiences.includes(a))`
    /// check in `generateIr.ts:141` (which always evaluates false when
    /// `operationAudiences` is `[]`).
    #[serde(rename = "x-fern-audiences", default)]
    x_fern_audiences: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum OpenApiParamOrRef {
    /// A `$ref` to `components/parameters/<name>`. The extension may also
    /// be set on the ref-site object itself (Fern's overlay system and
    /// OpenAPI 3.1 both allow extensions next to `$ref`); when present at
    /// the ref site it wins over the resolved component's value.
    Ref {
        #[serde(rename = "$ref")]
        ref_path: String,
        #[serde(rename = "x-fern-ignore", default)]
        x_fern_ignore: Option<bool>,
        /// Fern extension: an alias used as the CLI flag name while the
        /// wire name (the resolved component's `name`) is still used in
        /// the outgoing request. Set on the ref-site object — wins over
        /// the value on the resolved component via fern's `??`
        /// precedence (mirrors the `IGNORE` extension above).
        #[serde(rename = "x-fern-parameter-name", default)]
        x_fern_parameter_name: Option<String>,
        /// Ref-site `x-fern-default` value. Wins over the value on the
        /// resolved component parameter (and over the standard
        /// schema-level `default:`). Mirrors fern's importer precedence:
        /// `getExtension(parameter, FERN_DEFAULT) ?? getExtension(resolvedParameter, FERN_DEFAULT)`.
        #[serde(rename = "x-fern-default", default)]
        x_fern_default: Option<serde_yaml::Value>,
    },
    Inline(Box<OpenApiParameter>),
}

#[derive(Debug, Deserialize, Default)]
struct OpenApiParameter {
    name: String,
    #[serde(rename = "in")]
    location: Option<String>,
    #[serde(default)]
    required: bool,
    description: Option<String>,
    schema: Option<OpenApiParamSchema>,
    #[serde(default)]
    style: Option<String>,
    #[serde(default)]
    explode: Option<bool>,
    /// Fern extension: when `Some(true)`, the parameter is dropped from
    /// the generated CLI surface — no CLI flag, not sent in the request.
    /// Stored as `Option<bool>` so we can mirror fern's precedence: a
    /// ref-site `x-fern-ignore` wins over the value on the resolved
    /// component parameter via `ref_site.or(resolved).unwrap_or(false)`.
    /// See https://buildwithfern.com/learn/api-definitions/openapi/extensions/ignore
    #[serde(rename = "x-fern-ignore", default)]
    x_fern_ignore: Option<bool>,
    /// Fern extension: alias used as the CLI flag name while the wire
    /// name (`name`) is kept on the outgoing HTTP request. Mirrors
    /// fern's OpenAPI importer (`parameterNameOverride`) and supports
    /// the same precedence as `x-fern-ignore`: a ref-site value wins
    /// over the resolved component's via `ref_site.or(resolved)`.
    /// See https://buildwithfern.com/learn/api-definitions/openapi/extensions/parameter-name
    #[serde(rename = "x-fern-parameter-name", default)]
    x_fern_parameter_name: Option<String>,
    /// OpenAPI standard `deprecated: true` flag on the parameter. When
    /// `x-fern-availability` is absent, a `true` here is lowered to
    /// `Availability::Deprecated` so deprecated parameter flags surface
    /// a `[DEPRECATED]` badge in their `--help` description.
    #[serde(default)]
    deprecated: bool,
    /// Raw `x-fern-availability` extension on the parameter. Takes
    /// precedence over the standard `deprecated` flag.
    #[serde(rename = "x-fern-availability", default)]
    x_fern_availability: Option<Availability>,
    /// Fern extension: client-side default value for the parameter.
    /// When present, the parameter becomes optional in the generated CLI
    /// and the value is sent in the outgoing request when the user omits
    /// the flag. Supports string, number, and boolean literals.
    /// Wins over the standard `default:` on the parameter's `schema`.
    /// A value placed at the **ref-site** (alongside `$ref`) wins over
    /// the value on this resolved parameter — see `OpenApiParamOrRef::Ref`.
    /// See https://buildwithfern.com/learn/api-definitions/openapi/extensions/default
    #[serde(rename = "x-fern-default", default)]
    x_fern_default: Option<serde_yaml::Value>,
    /// Fern extension binding this path parameter to a spec-level
    /// `x-fern-sdk-variables` entry. Honored only on `in: path`
    /// parameters (mirroring Fern's openapi-ir-parser).
    #[serde(rename = "x-fern-sdk-variable", default)]
    x_fern_sdk_variable: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
struct OpenApiParamSchema {
    #[serde(rename = "type", default, deserialize_with = "deserialize_type_field")]
    schema_type: Option<String>,
    #[serde(rename = "enum", default, deserialize_with = "deserialize_enum_values")]
    enum_values: Option<Vec<String>>,
    default: Option<serde_yaml::Value>,
    format: Option<String>,
    /// JSON Schema numeric bounds on the parameter's schema. Surfaced
    /// in `--schema` output via `MethodParameter::minimum`/`maximum`.
    #[serde(default)]
    minimum: Option<f64>,
    #[serde(default)]
    maximum: Option<f64>,
    /// Raw `x-fern-enum` map keyed by wire value, deserialized straight
    /// off the YAML schema. Lowered to `discovery::FernEnumValue` in
    /// `convert_fern_enum`.
    #[serde(rename = "x-fern-enum", default)]
    x_fern_enum: Option<HashMap<String, OpenApiFernEnumValue>>,
}

/// Raw `x-fern-enum` entry as it appears in the OpenAPI YAML. Kept
/// schema-faithful (the `casing` field is parsed-but-ignored) so the
/// shape matches the upstream Fern importer.
#[derive(Debug, Deserialize, Default)]
struct OpenApiFernEnumValue {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    description: Option<String>,
    /// Parsed but not lowered — the SDK codegen uses `casing` to derive
    /// language-specific identifiers; cli-sdk uses the raw display name.
    #[serde(default)]
    #[allow(dead_code)]
    casing: Option<serde_yaml::Value>,
}

#[derive(Debug, Deserialize)]
struct OpenApiRequestBody {
    content: Option<HashMap<String, OpenApiMediaType>>,
    #[serde(rename = "x-fern-parameter-name")]
    x_fern_parameter_name: Option<String>,
}

/// A single response entry under `responses` on an operation, e.g.
/// `responses.200.content.application/json.schema`. Only the `content`
/// sub-map is consumed today — descriptions and headers aren't surfaced.
#[derive(Debug, Deserialize, Default)]
struct OpenApiResponse {
    #[serde(default)]
    content: Option<HashMap<String, OpenApiMediaType>>,
}

/// A response value that can be either an inline response object or a
/// `$ref` to `components/responses/<name>`.
#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum OpenApiResponseOrRef {
    Ref {
        #[serde(rename = "$ref")]
        ref_path: String,
    },
    Inline(OpenApiResponse),
}

#[derive(Debug, Deserialize)]
struct OpenApiMediaType {
    schema: Option<OpenApiSchemaObject>,
    /// OpenAPI `encoding` object — per-property serialization overrides.
    /// Only `contentType` is consumed (for multipart/form-data part
    /// headers); `style` / `explode` / `headers` / `allowReserved` are not
    /// yet acted upon.
    #[serde(default)]
    encoding: HashMap<String, OpenApiEncoding>,
}

/// A single entry in the OpenAPI `encoding` object.
#[derive(Debug, Deserialize, Default)]
struct OpenApiEncoding {
    #[serde(rename = "contentType")]
    content_type: Option<String>,
}

/// Captures the OpenAPI `type` field across the 3.0 string form
/// (`type: string`) and the 3.1 array form (`type: ["string", "null"]`).
/// `null_in_array` records whether `"null"` was present so nullability
/// can be reconstructed at access time.
#[derive(Debug, Default, Clone)]
struct TypeField {
    schema_type: Option<String>,
    null_in_array: bool,
}

impl<'de> Deserialize<'de> for TypeField {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        use serde::de;

        struct TypeFieldVisitor;

        impl<'de> de::Visitor<'de> for TypeFieldVisitor {
            type Value = TypeField;

            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("a string or array of strings")
            }

            fn visit_str<E: de::Error>(self, v: &str) -> Result<Self::Value, E> {
                Ok(TypeField { schema_type: Some(v.to_string()), null_in_array: false })
            }

            fn visit_string<E: de::Error>(self, v: String) -> Result<Self::Value, E> {
                Ok(TypeField { schema_type: Some(v), null_in_array: false })
            }

            fn visit_seq<A: de::SeqAccess<'de>>(self, mut seq: A) -> Result<Self::Value, A::Error> {
                let mut types: Vec<String> = Vec::new();
                while let Some(t) = seq.next_element::<String>()? {
                    types.push(t);
                }
                let null_in_array = types.iter().any(|t| t == "null");
                let schema_type = types.into_iter().find(|t| t != "null");
                Ok(TypeField { schema_type, null_in_array })
            }

            fn visit_none<E: de::Error>(self) -> Result<Self::Value, E> {
                Ok(TypeField::default())
            }

            fn visit_unit<E: de::Error>(self) -> Result<Self::Value, E> {
                Ok(TypeField::default())
            }
        }

        deserializer.deserialize_any(TypeFieldVisitor)
    }
}

/// `exclusiveMinimum` / `exclusiveMaximum` switched semantics between
/// OpenAPI 3.0 (boolean: modifies the sibling `minimum`/`maximum`) and 3.1
/// (numeric: the bound itself). This enum preserves the wire form so the
/// accessors above can resolve to a single numeric bound consistently.
#[derive(Debug, Clone, Copy)]
enum ExclusiveBound {
    Flag(bool),
    Value(f64),
}

impl<'de> Deserialize<'de> for ExclusiveBound {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        use serde::de;

        struct ExclusiveBoundVisitor;

        impl<'de> de::Visitor<'de> for ExclusiveBoundVisitor {
            type Value = ExclusiveBound;

            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("a boolean (OpenAPI 3.0) or a number (OpenAPI 3.1)")
            }

            fn visit_bool<E: de::Error>(self, v: bool) -> Result<Self::Value, E> {
                Ok(ExclusiveBound::Flag(v))
            }

            fn visit_i64<E: de::Error>(self, v: i64) -> Result<Self::Value, E> {
                Ok(ExclusiveBound::Value(v as f64))
            }

            fn visit_u64<E: de::Error>(self, v: u64) -> Result<Self::Value, E> {
                Ok(ExclusiveBound::Value(v as f64))
            }

            fn visit_f64<E: de::Error>(self, v: f64) -> Result<Self::Value, E> {
                Ok(ExclusiveBound::Value(v))
            }
        }

        deserializer.deserialize_any(ExclusiveBoundVisitor)
    }
}

#[derive(Debug, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
struct OpenApiSchemaObject {
    #[serde(rename = "$ref")]
    schema_ref: Option<String>,
    /// Captures the wire `type` field in both its 3.0 string form and 3.1
    /// array form. Use `schema_type()` / `is_nullable()` instead of reading
    /// directly — those accessors fold in the explicit `nullable` field.
    #[serde(rename = "type", default)]
    type_field: TypeField,
    /// OpenAPI 3.0 explicit `nullable: true`. Removed in 3.1 (which expresses
    /// the same idea via `"null"` in a type array). Both forms are surfaced
    /// uniformly through `is_nullable()`.
    #[serde(default)]
    nullable: bool,
    description: Option<String>,
    #[serde(default)]
    properties: HashMap<String, OpenApiSchemaObject>,
    items: Option<Box<OpenApiSchemaObject>>,
    #[serde(default)]
    required: Vec<String>,
    #[serde(rename = "enum", default, deserialize_with = "deserialize_enum_values")]
    enum_values: Option<Vec<String>>,
    /// OpenAPI 3.1 / JSON Schema 2020-12 `const`: a schema that matches a
    /// single literal value. Lowered into a one-element `enum_values` by
    /// `convert_schema_property` so existing enum-aware code paths handle
    /// it without further changes.
    #[serde(rename = "const", default)]
    const_value: Option<serde_yaml::Value>,
    /// JSON Schema inclusive numeric lower bound. In OpenAPI 3.0 the
    /// boolean `exclusiveMinimum: true` re-interprets this as an exclusive
    /// bound; in 3.1 the two fields are independent. Use the
    /// `inclusive_min` / `exclusive_min` accessors to resolve correctly.
    #[serde(default)]
    minimum: Option<f64>,
    /// JSON Schema inclusive numeric upper bound. See `minimum` above for
    /// 3.0 vs 3.1 interaction notes.
    #[serde(default)]
    maximum: Option<f64>,
    /// `exclusiveMinimum` in either OpenAPI 3.0 boolean form or 3.1
    /// numeric form. Resolved via `exclusive_min()`.
    #[serde(default)]
    exclusive_minimum: Option<ExclusiveBound>,
    /// `exclusiveMaximum` in either OpenAPI 3.0 boolean form or 3.1
    /// numeric form. Resolved via `exclusive_max()`.
    #[serde(default)]
    exclusive_maximum: Option<ExclusiveBound>,
    /// OpenAPI 3.0 / 3.1 single `example` value. Captured for documentation
    /// surfacing; not used by request execution.
    #[serde(default)]
    example: Option<serde_yaml::Value>,
    /// `examples` block, captured as raw YAML so that all three real-world
    /// shapes load successfully:
    ///   - OpenAPI 3.1 array of values: `examples: [a, b]`
    ///   - OpenAPI 3.0 MediaType-style map: `examples: { name: { value: ... } }`
    ///     (technically out-of-spec at the schema level, but several
    ///     real-world specs — e.g. BigCommerce — embed this form)
    ///   - Single value
    ///
    /// Downstream code is free to interpret the value based on its shape.
    #[serde(default)]
    examples: Option<serde_yaml::Value>,
    /// JSON Schema composition: value must match exactly one branch.
    /// Heavily used in 3.1 specs (where nullability via type arrays plus
    /// composition replaces the 3.0 `nullable` flag for complex unions),
    /// and also present in 3.0.
    #[serde(default)]
    one_of: Vec<OpenApiSchemaObject>,
    /// JSON Schema composition: value must match at least one branch.
    #[serde(default)]
    any_of: Vec<OpenApiSchemaObject>,
    /// JSON Schema composition: value must match every branch (typically
    /// used for inheritance / mixin patterns).
    #[serde(default)]
    all_of: Vec<OpenApiSchemaObject>,
    format: Option<String>,
    #[serde(default)]
    read_only: bool,
    /// OpenAPI's standard `default:` keyword on a schema (documentation hint
    /// for what the server uses when the field is omitted). Captured as raw
    /// YAML so we preserve the wire type — numbers stay numbers, booleans
    /// stay booleans — and lowered to `serde_json::Value` at IR conversion
    /// so `--schema` can surface it without re-quoting. Empty / absent ⇒ None.
    #[serde(default)]
    default: Option<serde_yaml::Value>,
    #[serde(
        default,
        deserialize_with = "deserialize_additional_properties"
    )]
    additional_properties: Option<Box<OpenApiSchemaObject>>,
}

impl OpenApiSchemaObject {
    /// The OpenAPI `type` value with any `"null"` array entry stripped.
    /// Returns `None` when no type was given or when the type array
    /// contained only `"null"`.
    fn schema_type(&self) -> Option<&str> {
        self.type_field.schema_type.as_deref()
    }

    /// True when the schema is nullable per OpenAPI 3.0 (`nullable: true`)
    /// or OpenAPI 3.1 (`"null"` in the type array).
    fn is_nullable(&self) -> bool {
        self.nullable || self.type_field.null_in_array
    }

    /// Inclusive minimum, after applying the OpenAPI 3.0 rule that
    /// `exclusiveMinimum: true` re-interprets `minimum` as exclusive.
    fn inclusive_min(&self) -> Option<f64> {
        match self.exclusive_minimum {
            Some(ExclusiveBound::Flag(true)) => None,
            _ => self.minimum,
        }
    }

    /// Inclusive maximum, with the same 3.0 re-interpretation rule applied.
    fn inclusive_max(&self) -> Option<f64> {
        match self.exclusive_maximum {
            Some(ExclusiveBound::Flag(true)) => None,
            _ => self.maximum,
        }
    }

    /// Exclusive lower bound resolved across both OpenAPI 3.0
    /// (boolean flag paired with `minimum`) and 3.1 (numeric form) wire
    /// shapes.
    fn exclusive_min(&self) -> Option<f64> {
        match self.exclusive_minimum {
            Some(ExclusiveBound::Value(n)) => Some(n),
            Some(ExclusiveBound::Flag(true)) => self.minimum,
            _ => None,
        }
    }

    /// Exclusive upper bound resolved across both wire shapes; see
    /// `exclusive_min` for details.
    fn exclusive_max(&self) -> Option<f64> {
        match self.exclusive_maximum {
            Some(ExclusiveBound::Value(n)) => Some(n),
            Some(ExclusiveBound::Flag(true)) => self.maximum,
            _ => None,
        }
    }
}

/// Deserialize an OpenAPI `enum` field whose items may be strings, integers, or
/// booleans. Everything is coerced to `String`.
fn deserialize_enum_values<'de, D>(deserializer: D) -> Result<Option<Vec<String>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    use serde::de;

    struct EnumVisitor;

    impl<'de> de::Visitor<'de> for EnumVisitor {
        type Value = Option<Vec<String>>;

        fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
            formatter.write_str("a sequence of scalar values")
        }

        fn visit_seq<A: de::SeqAccess<'de>>(self, mut seq: A) -> Result<Self::Value, A::Error> {
            let mut values = Vec::new();
            while let Some(v) = seq.next_element::<serde_yaml::Value>()? {
                values.push(yaml_scalar_to_string(&v));
            }
            Ok(Some(values))
        }

        fn visit_none<E: de::Error>(self) -> Result<Self::Value, E> {
            Ok(None)
        }

        fn visit_unit<E: de::Error>(self) -> Result<Self::Value, E> {
            Ok(None)
        }
    }

    deserializer.deserialize_any(EnumVisitor)
}

/// Deserialize an OpenAPI `type` field that can be a plain string or an array
/// (e.g. `["string", "null"]` in OpenAPI 3.1). When it's an array, the first
/// non-`"null"` entry is used.
fn deserialize_type_field<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    use serde::de;

    struct TypeVisitor;

    impl<'de> de::Visitor<'de> for TypeVisitor {
        type Value = Option<String>;

        fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
            formatter.write_str("a string or array of strings")
        }

        fn visit_str<E: de::Error>(self, v: &str) -> Result<Self::Value, E> {
            Ok(Some(v.to_string()))
        }

        fn visit_string<E: de::Error>(self, v: String) -> Result<Self::Value, E> {
            Ok(Some(v))
        }

        fn visit_seq<A: de::SeqAccess<'de>>(self, mut seq: A) -> Result<Self::Value, A::Error> {
            let mut types: Vec<String> = Vec::new();
            while let Some(t) = seq.next_element::<String>()? {
                types.push(t);
            }
            Ok(types.into_iter().find(|t| t != "null"))
        }

        fn visit_none<E: de::Error>(self) -> Result<Self::Value, E> {
            Ok(None)
        }

        fn visit_unit<E: de::Error>(self) -> Result<Self::Value, E> {
            Ok(None)
        }
    }

    deserializer.deserialize_any(TypeVisitor)
}

/// Deserialize `additionalProperties` which can be a boolean or a schema object.
/// When it's `false`, we treat it as None. When `true`, we treat it as an empty schema.
fn deserialize_additional_properties<'de, D>(
    deserializer: D,
) -> Result<Option<Box<OpenApiSchemaObject>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    use serde::de;

    struct AdditionalPropertiesVisitor;

    impl<'de> de::Visitor<'de> for AdditionalPropertiesVisitor {
        type Value = Option<Box<OpenApiSchemaObject>>;

        fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
            formatter.write_str("a boolean or a schema object")
        }

        fn visit_bool<E: de::Error>(self, v: bool) -> Result<Self::Value, E> {
            if v {
                Ok(Some(Box::new(OpenApiSchemaObject::default())))
            } else {
                Ok(None)
            }
        }

        fn visit_map<M: de::MapAccess<'de>>(self, map: M) -> Result<Self::Value, M::Error> {
            let obj = OpenApiSchemaObject::deserialize(de::value::MapAccessDeserializer::new(map))?;
            Ok(Some(Box::new(obj)))
        }

        fn visit_none<E: de::Error>(self) -> Result<Self::Value, E> {
            Ok(None)
        }

        fn visit_unit<E: de::Error>(self) -> Result<Self::Value, E> {
            Ok(None)
        }
    }

    deserializer.deserialize_any(AdditionalPropertiesVisitor)
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct OpenApiComponents {
    #[serde(default)]
    schemas: HashMap<String, OpenApiSchemaObject>,
    #[serde(default)]
    parameters: HashMap<String, OpenApiParameter>,
    #[serde(default)]
    responses: HashMap<String, OpenApiResponse>,
    #[serde(default)]
    security_schemes: HashMap<String, OpenApiSecurityScheme>,
}

/// Raw OpenAPI Security Scheme Object — the shape we deserialize. Lowered
/// to [`crate::openapi::discovery::SecurityScheme`] before being surfaced.
#[derive(Debug, Deserialize, Default)]
struct OpenApiSecurityScheme {
    #[serde(rename = "type")]
    type_field: Option<String>,
    /// `bearer` or `basic` for `type: http`.
    scheme: Option<String>,
    /// `header`, `query`, or `cookie` for `type: apiKey`.
    #[serde(rename = "in")]
    location: Option<String>,
    /// Header/query/cookie name for `type: apiKey`.
    name: Option<String>,
}

fn lower_security_scheme(raw: &OpenApiSecurityScheme) -> SecurityScheme {
    let type_str = raw.type_field.as_deref().unwrap_or("").to_ascii_lowercase();
    match type_str.as_str() {
        "http" => match raw.scheme.as_deref().map(str::to_ascii_lowercase).as_deref() {
            Some("bearer") => SecurityScheme::HttpBearer,
            Some("basic") => SecurityScheme::HttpBasic,
            other => SecurityScheme::Other(format!("http/{}", other.unwrap_or(""))),
        },
        "apikey" => {
            let name = raw.name.clone().unwrap_or_default();
            match raw.location.as_deref().map(str::to_ascii_lowercase).as_deref() {
                Some("header") => SecurityScheme::ApiKeyHeader { name },
                Some("query") => SecurityScheme::ApiKeyQuery { name },
                other => SecurityScheme::Other(format!("apiKey/{}", other.unwrap_or(""))),
            }
        }
        "oauth2" => SecurityScheme::OAuth2,
        other => SecurityScheme::Other(other.to_string()),
    }
}

// ---------------------------------------------------------------------------
// Helper: camelCase → kebab-case
/// Detect pagination config from the OpenAPI spec's components/parameters.
/// Looks for common patterns like "page_token" or "PageToken" params,
/// and checks response schemas for pagination objects.
fn detect_pagination_config(spec: &OpenApiSpec) -> (Option<String>, Option<String>) {
    let components = match &spec.components {
        Some(c) => c,
        None => return (None, None),
    };

    // Check if there's a page_token parameter in components
    for param in components.parameters.values() {
        if param.name == "page_token" {
            // Calendly-style: page_token query param, pagination.next_page_token response
            return (
                Some("page_token".to_string()),
                Some("pagination.next_page_token".to_string()),
            );
        }
    }

    (None, None)
}

// ---------------------------------------------------------------------------
// x-fern-pagination: resolve per-operation pagination config from the
// OpenAPI extension. Mirrors the upstream Fern OpenAPI importer:
//   https://github.com/fern-api/fern/blob/main/packages/cli/api-importers/openapi-to-ir/src/extensions/x-fern-pagination.ts
// ---------------------------------------------------------------------------

const REQUEST_PREFIX: &str = "$request.";
const RESPONSE_PREFIX: &str = "$response.";

/// Strip a leading `$request.` or `$response.` prefix from a JSONPath-style
/// reference. The runtime treats the remaining string as either a request
/// parameter name (for `$request.foo` → `foo`) or a dotted JSON path into
/// the response body (for `$response.pagination.next_cursor` →
/// `pagination.next_cursor`).
fn strip_pagination_prefix(value: &str) -> String {
    value
        .strip_prefix(REQUEST_PREFIX)
        .or_else(|| value.strip_prefix(RESPONSE_PREFIX))
        .unwrap_or(value)
        .to_string()
}

/// Normalize a spec-level `x-fern-base-path` value:
/// - `None` and empty/whitespace-only strings collapse to `None`.
/// - Otherwise the string is trimmed of surrounding ASCII whitespace and
///   returned as-is (leading/trailing slashes preserved — `build_url`
///   normalizes them at request time).
fn normalize_base_path(raw: Option<&str>) -> Option<String> {
    let trimmed = raw?.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

/// Resolve the `x-fern-pagination` extension for a single operation,
/// applying root-level inheritance.
///
/// Mirrors upstream `fern-api/fern`'s `getFernPaginationExtension`:
/// - per-op block absent → `Ok(None)` (executor falls back to heuristic)
/// - per-op block is a boolean → look up the spec-root block
///   - root is a boolean too → `Err(...)` (matches upstream's
///     `CliError::ValidationError`)
///   - root is absent → `Ok(None)` (NOT an error — matches upstream)
///   - root is an object → parse the root block
/// - per-op block is an object → parse it directly
fn resolve_pagination_extension(
    op_ext: Option<&serde_yaml::Value>,
    root_ext: Option<&serde_yaml::Value>,
    op_id: &str,
) -> Result<Option<PaginationConfig>, CliError> {
    let value = match op_ext {
        Some(v) => v,
        None => return Ok(None),
    };

    if let serde_yaml::Value::Bool(_) = value {
        return match root_ext {
            None | Some(serde_yaml::Value::Null) => Ok(None),
            Some(serde_yaml::Value::Bool(_)) => Err(CliError::Discovery(format!(
                "Operation '{op_id}' sets `x-fern-pagination: <boolean>` but the spec-root \
                `x-fern-pagination` is also a boolean; the root must be an object describing \
                pagination (cursor / offset / next_uri / next_path / custom)."
            ))),
            Some(root) => parse_pagination_config(root, op_id, true),
        };
    }

    parse_pagination_config(value, op_id, false)
}

/// Parse a `x-fern-pagination` config object. Discrimination order mirrors
/// `fern-api/fern`'s `getPaginationExtension.ts`:
///
/// 1. `cursor`         → Cursor form
/// 2. `next_uri`       → Uri form
/// 3. `next_path`      → Path form
/// 4. `offset`         → Offset form
/// 5. `type: "custom"` → Custom form
///
/// Otherwise an "invalid pagination extension" error is returned, matching
/// upstream's `CliError`.
///
/// `inherited` is purely used for error wording so the user can tell
/// whether the failure is in the per-op block or the inherited root block.
fn parse_pagination_config(
    value: &serde_yaml::Value,
    op_id: &str,
    inherited: bool,
) -> Result<Option<PaginationConfig>, CliError> {
    let map = match value {
        serde_yaml::Value::Mapping(m) => m,
        _ => {
            return Err(CliError::Discovery(format!(
                "Invalid {} `x-fern-pagination` for operation '{op_id}': expected an object, \
                got {}.",
                if inherited { "inherited" } else { "operation-level" },
                describe_yaml_kind(value)
            )));
        }
    };

    if map.contains_key("cursor") {
        let cursor = require_str_field(map, "cursor", op_id)?;
        let next_cursor = require_str_field(map, "next_cursor", op_id)?;
        let results = require_str_field(map, "results", op_id)?;
        return Ok(Some(PaginationConfig::Cursor {
            cursor: strip_pagination_prefix(&cursor),
            next_cursor: strip_pagination_prefix(&next_cursor),
            results: strip_pagination_prefix(&results),
        }));
    }

    if map.contains_key("next_uri") {
        let next_uri = require_str_field(map, "next_uri", op_id)?;
        let results = require_str_field(map, "results", op_id)?;
        return Ok(Some(PaginationConfig::Uri {
            next_uri: strip_pagination_prefix(&next_uri),
            results: strip_pagination_prefix(&results),
        }));
    }

    if map.contains_key("next_path") {
        let next_path = require_str_field(map, "next_path", op_id)?;
        let results = require_str_field(map, "results", op_id)?;
        return Ok(Some(PaginationConfig::Path {
            next_path: strip_pagination_prefix(&next_path),
            results: strip_pagination_prefix(&results),
        }));
    }

    if map.contains_key("offset") {
        let offset = require_str_field(map, "offset", op_id)?;
        let results = require_str_field(map, "results", op_id)?;
        let step = optional_str_field(map, "step", op_id)?;
        let has_next_page = optional_str_field(map, "has-next-page", op_id)?;
        return Ok(Some(PaginationConfig::Offset {
            offset: strip_pagination_prefix(&offset),
            results: strip_pagination_prefix(&results),
            step: step.map(|s| strip_pagination_prefix(&s)),
            has_next_page: has_next_page.map(|s| strip_pagination_prefix(&s)),
        }));
    }

    if matches!(
        map.get(serde_yaml::Value::String("type".to_string())),
        Some(serde_yaml::Value::String(t)) if t == "custom"
    ) {
        let results = require_str_field(map, "results", op_id)?;
        return Ok(Some(PaginationConfig::Custom {
            results: strip_pagination_prefix(&results),
        }));
    }

    Err(CliError::Discovery(format!(
        "Invalid `x-fern-pagination` for operation '{op_id}': must declare one of `cursor`, \
        `next_uri`, `next_path`, `offset`, or `type: custom`. See \
        https://buildwithfern.com/learn/api-definitions/openapi/extensions/pagination"
    )))
}

fn require_str_field(
    map: &serde_yaml::Mapping,
    field: &str,
    op_id: &str,
) -> Result<String, CliError> {
    match map.get(serde_yaml::Value::String(field.to_string())) {
        Some(serde_yaml::Value::String(s)) => Ok(s.clone()),
        Some(other) => Err(CliError::Discovery(format!(
            "Invalid `x-fern-pagination` for operation '{op_id}': field `{field}` must be \
            a string, got {}.",
            describe_yaml_kind(other)
        ))),
        None => Err(CliError::Discovery(format!(
            "Invalid `x-fern-pagination` for operation '{op_id}': missing required field \
            `{field}`."
        ))),
    }
}

fn optional_str_field(
    map: &serde_yaml::Mapping,
    field: &str,
    op_id: &str,
) -> Result<Option<String>, CliError> {
    match map.get(serde_yaml::Value::String(field.to_string())) {
        None | Some(serde_yaml::Value::Null) => Ok(None),
        Some(serde_yaml::Value::String(s)) => Ok(Some(s.clone())),
        Some(other) => Err(CliError::Discovery(format!(
            "Invalid `x-fern-pagination` for operation '{op_id}': field `{field}` must be \
            a string when present, got {}.",
            describe_yaml_kind(other)
        ))),
    }
}

// ---------------------------------------------------------------------------
// x-fern-streaming: resolve per-operation streaming config from the OpenAPI
// extension. Mirrors the upstream Fern OpenAPI importer:
//   https://github.com/fern-api/fern/blob/main/packages/cli/api-importers/openapi/openapi-ir-parser/src/openapi/v3/extensions/getFernStreamingExtension.ts
// ---------------------------------------------------------------------------

/// Resolve `x-fern-streaming` for a single operation. Returns:
/// - `Ok(None)`     — extension absent, or set to literal `false` (explicit opt-out).
/// - `Ok(Some(_))`  — streaming enabled; runtime variant captures format + terminator.
/// - `Err(...)`     — invalid shape (non-bool/non-object, unknown `format`, etc.).
///
/// Boolean shorthand (`x-fern-streaming: true`) maps to NDJSON
/// (`StreamingConfig::Json`) with no terminator. This matches the
/// upstream importer's boolean handler exactly — see the
/// `getFernStreamingExtension.ts` comment that the boolean shorthand
/// emits `format: "json"` (so that callers who haven't picked a wire
/// format don't accidentally inherit OpenAI-style SSE semantics).
fn parse_streaming_extension(
    value: Option<&serde_yaml::Value>,
    op_id: &str,
) -> Result<Option<StreamingConfig>, CliError> {
    let value = match value {
        Some(v) => v,
        None => return Ok(None),
    };

    if let serde_yaml::Value::Bool(b) = value {
        return if *b {
            Ok(Some(StreamingConfig::Json { terminator: None }))
        } else {
            Ok(None)
        };
    }

    let map = match value {
        serde_yaml::Value::Mapping(m) => m,
        other => {
            return Err(CliError::Discovery(format!(
                "Invalid `x-fern-streaming` for operation '{op_id}': expected a boolean or \
                an object, got {}.",
                describe_yaml_kind(other)
            )));
        }
    };

    // `format` is optional in upstream's object schema. The upstream
    // importer and the typed SDKs (TS / C#) default a format-less
    // object to `json` (NDJSON), matching the boolean shorthand. The
    // CLI mirrors that default so callers who omit `format` get the
    // same wire shape as the typed SDKs would have produced.
    let format = optional_str_field_named(map, "format", op_id, "x-fern-streaming")?;
    let format = match format.as_deref() {
        Some("sse") => StreamingFormat::Sse,
        Some("json") | None => StreamingFormat::Json,
        Some("text") => StreamingFormat::Text,
        Some(other) => {
            return Err(CliError::Discovery(format!(
                "Invalid `x-fern-streaming` for operation '{op_id}': field `format` must be \
                `sse`, `json`, or `text`, got `{other}`."
            )));
        }
    };

    let terminator =
        optional_str_field_named(map, "terminator", op_id, "x-fern-streaming")?;

    if matches!(format, StreamingFormat::Text) && terminator.is_some() {
        // Mirrors the IR (`TextStreamChunk` carries no `terminator`
        // field) and the typed SDK generators — surfacing it at parse
        // time keeps misconfigurations from silently no-op'ing at
        // runtime.
        return Err(CliError::Discovery(format!(
            "Invalid `x-fern-streaming` for operation '{op_id}': field `terminator` is not \
            supported for `format: text` streams."
        )));
    }

    Ok(Some(match format {
        StreamingFormat::Sse => StreamingConfig::Sse { terminator },
        StreamingFormat::Json => StreamingConfig::Json { terminator },
        StreamingFormat::Text => StreamingConfig::Text,
    }))
}

enum StreamingFormat {
    Sse,
    Json,
    Text,
}

fn optional_str_field_named(
    map: &serde_yaml::Mapping,
    field: &str,
    op_id: &str,
    extension: &str,
) -> Result<Option<String>, CliError> {
    match map.get(serde_yaml::Value::String(field.to_string())) {
        None | Some(serde_yaml::Value::Null) => Ok(None),
        Some(serde_yaml::Value::String(s)) => Ok(Some(s.clone())),
        Some(other) => Err(CliError::Discovery(format!(
            "Invalid `{extension}` for operation '{op_id}': field `{field}` must be a string \
            when present, got {}.",
            describe_yaml_kind(other)
        ))),
    }
}

// ---------------------------------------------------------------------------
// x-fern-retries: resolve per-operation retry policy from the OpenAPI
// extension. Mirrors the upstream Fern OpenAPI importer's tagged shape
// (`getFernRetriesExtension.ts` — `{ disabled: bool }`) and extends it with
// the optional knobs the cli-sdk runtime retry loop consumes (max attempts,
// backoff base, factor, jitter). The extra knobs are forward-compatible with
// the upstream importer.
// ---------------------------------------------------------------------------

/// Resolve the `x-fern-retries` extension for a single operation, applying
/// root-level inheritance and per-operation overrides.
///
/// Precedence — matches the pagination resolver's shape and the upstream
/// fern importer's nullish coalescing:
/// - per-op block absent → inherit the spec-root block (or `None` when also absent)
/// - per-op `true` → spec-root config, or all-defaults when root is also absent
/// - per-op `false` (or `{ disabled: true }`) → disabled regardless of root
/// - per-op object → root values, overridden field-by-field by the op block;
///   when root is also `true`/absent the op object stacks on top of defaults
fn resolve_retries_extension(
    op_ext: Option<&serde_yaml::Value>,
    root_ext: Option<&serde_yaml::Value>,
    op_id: &str,
) -> Result<Option<RetriesConfig>, CliError> {
    // Build the baseline from the root block, if any. Root-`false` /
    // `{ disabled: true }` propagates by default to operations that don't
    // override it.
    let root_baseline = match root_ext {
        None | Some(serde_yaml::Value::Null) => None,
        Some(v) => parse_retries_value(v, op_id, /*inherited=*/ true)?,
    };

    let op = match op_ext {
        // Op missing → inherit the root baseline (or `None` when also absent).
        Some(v) => v,
        None => return Ok(root_baseline),
    };

    // Op is a boolean.
    if let serde_yaml::Value::Bool(b) = op {
        if !*b {
            // `false` disables retries on this operation regardless of root.
            return Ok(Some(RetriesConfig::disabled()));
        }
        // `true` adopts the root baseline; falls back to all-defaults when
        // root is absent or also a boolean.
        return Ok(Some(root_baseline.unwrap_or_default()));
    }

    // Op is an object. The root baseline (if enabled) is the starting
    // config; the op fields override field-by-field. When the root is
    // explicitly disabled, the op block re-enables retries (the more
    // specific block wins).
    let baseline = match root_baseline {
        Some(cfg) if cfg.enabled => cfg,
        _ => RetriesConfig::default(),
    };

    let map = match op {
        serde_yaml::Value::Mapping(m) => m,
        other => {
            return Err(CliError::Discovery(format!(
                "Invalid operation-level `x-fern-retries` for operation '{op_id}': expected \
                an object or boolean, got {}.",
                describe_yaml_kind(other)
            )));
        }
    };

    let config = apply_retries_object(baseline, map, op_id, /*inherited=*/ false)?;

    // `max_attempts: 0` is treated identically to `disabled: true` so the
    // executor doesn't have to special-case the count itself.
    if config.max_attempts == 0 {
        return Ok(Some(RetriesConfig::disabled()));
    }

    Ok(Some(config))
}

/// Parse a standalone `x-fern-retries` value (root or operation) into a
/// [`RetriesConfig`]. Used for the root baseline: takes the raw extension
/// value and returns the resolved config (or `None` when the value is
/// `null`). Bool/object are handled inline; unknown shapes error out.
fn parse_retries_value(
    value: &serde_yaml::Value,
    op_id: &str,
    inherited: bool,
) -> Result<Option<RetriesConfig>, CliError> {
    match value {
        serde_yaml::Value::Null => Ok(None),
        serde_yaml::Value::Bool(true) => Ok(Some(RetriesConfig::default())),
        serde_yaml::Value::Bool(false) => Ok(Some(RetriesConfig::disabled())),
        serde_yaml::Value::Mapping(map) => {
            let config =
                apply_retries_object(RetriesConfig::default(), map, op_id, inherited)?;
            if config.max_attempts == 0 {
                return Ok(Some(RetriesConfig::disabled()));
            }
            Ok(Some(config))
        }
        other => Err(CliError::Discovery(format!(
            "Invalid {} `x-fern-retries` for operation '{op_id}': expected an object or \
            boolean, got {}.",
            if inherited { "inherited" } else { "operation-level" },
            describe_yaml_kind(other)
        ))),
    }
}

/// Apply the fields of an `x-fern-retries` object on top of an existing
/// [`RetriesConfig`]. Unknown keys are ignored (forward-compatible).
fn apply_retries_object(
    mut config: RetriesConfig,
    map: &serde_yaml::Mapping,
    op_id: &str,
    inherited: bool,
) -> Result<RetriesConfig, CliError> {
    // Canonical fern shape: `{ disabled: true | false }`.
    if let Some(v) = map.get(serde_yaml::Value::String("disabled".to_string())) {
        match v {
            serde_yaml::Value::Bool(disabled) => {
                if *disabled {
                    return Ok(RetriesConfig::disabled());
                }
                config.enabled = true;
            }
            other => {
                return Err(CliError::Discovery(format!(
                    "Invalid {} `x-fern-retries` for operation '{op_id}': field `disabled` \
                    must be a boolean, got {}.",
                    if inherited { "inherited" } else { "operation-level" },
                    describe_yaml_kind(other)
                )));
            }
        }
    }

    // `max` / `max_attempts` / `max-attempts` — accept all three spellings
    // since the upstream IR has not yet settled on one; the fern docs
    // refer to "max retry attempts" colloquially.
    if let Some(v) = retries_field(map, &["max_attempts", "max-attempts", "max"]) {
        let parsed = match v {
            serde_yaml::Value::Number(n) => n.as_u64(),
            other => {
                return Err(CliError::Discovery(format!(
                    "Invalid {} `x-fern-retries` for operation '{op_id}': field `max_attempts` \
                    must be a non-negative integer, got {}.",
                    if inherited { "inherited" } else { "operation-level" },
                    describe_yaml_kind(other)
                )));
            }
        };
        let parsed = parsed.ok_or_else(|| {
            CliError::Discovery(format!(
                "Invalid {} `x-fern-retries` for operation '{op_id}': field `max_attempts` \
                must be a non-negative integer.",
                if inherited { "inherited" } else { "operation-level" },
            ))
        })?;
        config.max_attempts = u32::try_from(parsed).map_err(|_| {
            CliError::Discovery(format!(
                "Invalid {} `x-fern-retries` for operation '{op_id}': field `max_attempts` \
                must fit in a u32, got {parsed}.",
                if inherited { "inherited" } else { "operation-level" },
            ))
        })?;
    }

    if let Some(v) = retries_field(map, &["base_delay_ms", "base-delay-ms", "base"]) {
        let parsed = match v {
            serde_yaml::Value::Number(n) => n.as_u64().ok_or_else(|| {
                CliError::Discovery(format!(
                    "Invalid {} `x-fern-retries` for operation '{op_id}': field \
                    `base_delay_ms` must be a non-negative integer.",
                    if inherited { "inherited" } else { "operation-level" },
                ))
            })?,
            other => {
                return Err(CliError::Discovery(format!(
                    "Invalid {} `x-fern-retries` for operation '{op_id}': field \
                    `base_delay_ms` must be an integer, got {}.",
                    if inherited { "inherited" } else { "operation-level" },
                    describe_yaml_kind(other)
                )));
            }
        };
        config.base_delay_ms = parsed;
    }

    if let Some(v) = retries_field(map, &["factor", "backoff_factor", "backoff-factor"]) {
        let parsed = retries_required_f64(v, "factor", op_id, inherited)?;
        if parsed < 1.0 {
            return Err(CliError::Discovery(format!(
                "Invalid {} `x-fern-retries` for operation '{op_id}': field `factor` must be \
                >= 1.0, got {parsed}.",
                if inherited { "inherited" } else { "operation-level" },
            )));
        }
        config.factor = parsed;
    }

    if let Some(v) = retries_field(map, &["jitter"]) {
        let parsed = retries_required_f64(v, "jitter", op_id, inherited)?;
        if !(0.0..=1.0).contains(&parsed) {
            return Err(CliError::Discovery(format!(
                "Invalid {} `x-fern-retries` for operation '{op_id}': field `jitter` must be \
                in [0.0, 1.0], got {parsed}.",
                if inherited { "inherited" } else { "operation-level" },
            )));
        }
        config.jitter = parsed;
    }

    Ok(config)
}

/// First-of-aliases lookup for `x-fern-retries` field reads. Returns the
/// first matching value (any present alias) so authors can use either
/// `max_attempts` / `max-attempts` / `max` (or the corresponding
/// `base_delay_ms` / `base-delay-ms` / `base`) interchangeably.
fn retries_field<'a>(
    map: &'a serde_yaml::Mapping,
    aliases: &[&str],
) -> Option<&'a serde_yaml::Value> {
    for alias in aliases {
        if let Some(v) = map.get(serde_yaml::Value::String((*alias).to_string())) {
            return Some(v);
        }
    }
    None
}

fn retries_required_f64(
    value: &serde_yaml::Value,
    field: &str,
    op_id: &str,
    inherited: bool,
) -> Result<f64, CliError> {
    match value {
        serde_yaml::Value::Number(n) => n.as_f64().ok_or_else(|| {
            CliError::Discovery(format!(
                "Invalid {} `x-fern-retries` for operation '{op_id}': field `{field}` must be \
                a finite number.",
                if inherited { "inherited" } else { "operation-level" },
            ))
        }),
        other => Err(CliError::Discovery(format!(
            "Invalid {} `x-fern-retries` for operation '{op_id}': field `{field}` must be a \
            number, got {}.",
            if inherited { "inherited" } else { "operation-level" },
            describe_yaml_kind(other)
        ))),
    }
}

fn describe_yaml_kind(value: &serde_yaml::Value) -> &'static str {
    match value {
        serde_yaml::Value::Null => "null",
        serde_yaml::Value::Bool(_) => "boolean",
        serde_yaml::Value::Number(_) => "number",
        serde_yaml::Value::String(_) => "string",
        serde_yaml::Value::Sequence(_) => "array",
        serde_yaml::Value::Mapping(_) => "object",
        serde_yaml::Value::Tagged(_) => "tagged value",
    }
}

// ---------------------------------------------------------------------------

fn camel_to_kebab(s: &str) -> String {
    let mut result = String::with_capacity(s.len() + 4);
    for ch in s.chars() {
        if !ch.is_ascii_alphanumeric() {
            if !result.is_empty() && !result.ends_with('-') {
                result.push('-');
            }
        } else if ch.is_uppercase() {
            if !result.is_empty() && !result.ends_with('-') {
                result.push('-');
            }
            result.push(ch.to_lowercase().next().unwrap());
        } else {
            result.push(ch);
        }
    }
    while result.ends_with('-') {
        result.pop();
    }
    result
}

/// Tokenize a string the way Fern's OpenAPI importer does: camelCase-only
/// strings split on each capital letter; everything else splits on
/// non-alphanumeric runs. All tokens lowercased, empties dropped.
fn tokenize(s: &str) -> Vec<String> {
    let is_camel_case = s.chars().next().is_some_and(|c| c.is_ascii_lowercase())
        && s.chars().all(|c| c.is_ascii_alphanumeric())
        && s.chars().any(|c| c.is_ascii_uppercase());

    let raw: Vec<String> = if is_camel_case {
        let mut tokens = Vec::new();
        let mut current = String::new();
        for c in s.chars() {
            if c.is_ascii_uppercase() && !current.is_empty() {
                tokens.push(std::mem::take(&mut current));
            }
            current.push(c);
        }
        if !current.is_empty() {
            tokens.push(current);
        }
        tokens
    } else {
        s.split(|c: char| !c.is_ascii_alphanumeric())
            .map(str::to_string)
            .collect()
    };

    raw.into_iter()
        .filter(|t| !t.is_empty())
        .map(|t| t.to_lowercase())
        .collect()
}

/// Inject one synthetic header `MethodParameter` per spec-root
/// idempotency header into an idempotent operation's parameter map. The
/// existing header-parameter pathway in `commands.rs` and `executor.rs`
/// then handles flag exposure (kebab-cased `--<name>`) and on-the-wire
/// header transmission (`location: "header"`).
///
/// The parameter key (HashMap key) is the on-the-wire header name
/// (used directly as the HTTP header). The kebab-cased `--<flag>`
/// derives from [`IdempotencyHeader::name`] when present
/// (`MethodParameter.flag_name_override`), otherwise from the header.
/// This mirrors the upstream Fern OpenAPI importer, where `name`
/// becomes the SDK parameter identifier.
///
/// Spec-declared parameters with the same HashMap key win — we do not
/// overwrite them, which preserves any per-operation customization
/// (e.g. an `Idempotency-Key` param declared explicitly in `parameters:`
/// with a custom description).
fn inject_idempotency_header_params(
    params: &mut HashMap<String, MethodParameter>,
    idempotency_headers: &[IdempotencyHeader],
) {
    for h in idempotency_headers {
        if params.contains_key(&h.header) {
            continue;
        }
        let description = h
            .name
            .as_ref()
            .map(|n| format!("Idempotency header `{}` (param `{}`).", h.header, n))
            .unwrap_or_else(|| format!("Idempotency header `{}`.", h.header));
        let flag_name_override = h.name.as_ref().map(|n| to_kebab_flag(n));
        params.insert(
            h.header.clone(),
            MethodParameter {
                param_type: Some("string".to_string()),
                description: Some(description),
                location: Some("header".to_string()),
                env_var: h.env.clone(),
                flag_name_override,
                ..Default::default()
            },
        );
    }
}

/// Mirror Fern's OpenAPI importer behavior: when an operation's group is
/// derived from a tag (no `x-fern-sdk-group-name`), strip tag tokens that
/// prefix the operationId. `tag="Customers", operationId="customersList"`
/// → `list`. No-op when the operationId doesn't start with the tag tokens.
fn strip_tag_prefix(operation_id: &str, tag: &str) -> String {
    let tag_tokens = tokenize(tag);
    let op_tokens = tokenize(operation_id);
    if tag_tokens.is_empty() || op_tokens.len() <= tag_tokens.len() {
        return operation_id.to_string();
    }
    for (i, t) in tag_tokens.iter().enumerate() {
        if op_tokens.get(i) != Some(t) {
            return operation_id.to_string();
        }
    }
    op_tokens[tag_tokens.len()..].join("-")
}

// ---------------------------------------------------------------------------
// Schema conversion helpers
// ---------------------------------------------------------------------------

/// Resolve effective enum values for a schema, combining the OpenAPI `enum`
/// field with the OpenAPI 3.1 / JSON Schema 2020-12 `const` keyword. A
/// present `const` is lowered into a one-element enum so existing
/// enum-aware code paths (CLI flag value validation, help rendering) pick
/// it up without further changes. An explicit `enum` wins over `const`
/// when both are present.
fn effective_enum_values(obj: &OpenApiSchemaObject) -> Option<Vec<String>> {
    if let Some(values) = &obj.enum_values {
        return Some(values.clone());
    }
    let const_value = obj.const_value.as_ref()?;
    Some(vec![yaml_scalar_to_string(const_value)])
}

/// Lower an `oneOf` / `anyOf` / `allOf` array of OpenAPI schemas into the
/// IR's `JsonSchemaProperty` form. Used by both `convert_schema_object`
/// (component-schema root) and `convert_schema_property` (nested property).
fn convert_composition_branches(branches: &[OpenApiSchemaObject]) -> Vec<JsonSchemaProperty> {
    branches.iter().map(convert_schema_property).collect()
}

/// If `obj` has an OpenAPI 3.1 / JSON Schema 2020-12 `const`, return the
/// const as a typed JSON value to install as the CLI flag's client-side
/// default. Pairs with the const→single-element enum lowering in
/// `effective_enum_values`: the flag accepts exactly the const value (or
/// rejects everything else via the enum parser), and becomes optional
/// because omitting it auto-injects the const at request time.
fn const_default_value(obj: &OpenApiSchemaObject) -> Option<serde_json::Value> {
    yaml_value_to_json(obj.const_value.as_ref()?)
}

/// Coerce a YAML scalar (string, number, boolean) to its string form for
/// downstream use in CLI flag enumerations. Non-scalars fall back to the
/// Debug rendering — callers only invoke this on values that should be
/// scalar by spec, so the fallback is a diagnostic, not a feature.
fn yaml_scalar_to_string(v: &serde_yaml::Value) -> String {
    match v {
        serde_yaml::Value::String(s) => s.clone(),
        serde_yaml::Value::Number(n) => n.to_string(),
        serde_yaml::Value::Bool(b) => b.to_string(),
        other => format!("{other:?}"),
    }
}

fn convert_schema_object(obj: &OpenApiSchemaObject) -> JsonSchema {
    if let Some(ref_path) = &obj.schema_ref {
        let name = strip_ref_prefix(ref_path);
        return JsonSchema {
            schema_ref: Some(name),
            ..Default::default()
        };
    }

    let properties = obj
        .properties
        .iter()
        .map(|(k, v)| (k.clone(), convert_schema_property(v)))
        .collect();

    JsonSchema {
        id: None,
        schema_type: obj.schema_type().map(str::to_string),
        nullable: obj.is_nullable(),
        description: obj.description.clone(),
        properties,
        schema_ref: None,
        items: obj.items.as_ref().map(|i| Box::new(convert_schema_property(i))),
        required: obj.required.clone(),
        one_of: convert_composition_branches(&obj.one_of),
        any_of: convert_composition_branches(&obj.any_of),
        all_of: convert_composition_branches(&obj.all_of),
        additional_properties: obj
            .additional_properties
            .as_ref()
            .map(|ap| Box::new(convert_schema_property(ap))),
    }
}

fn convert_schema_property(obj: &OpenApiSchemaObject) -> JsonSchemaProperty {
    if let Some(ref_path) = &obj.schema_ref {
        let name = strip_ref_prefix(ref_path);
        return JsonSchemaProperty {
            schema_ref: Some(name),
            ..Default::default()
        };
    }

    let properties = obj
        .properties
        .iter()
        .map(|(k, v)| (k.clone(), convert_schema_property(v)))
        .collect();

    JsonSchemaProperty {
        prop_type: obj.schema_type().map(str::to_string),
        nullable: obj.is_nullable(),
        description: obj.description.clone(),
        schema_ref: None,
        format: obj.format.clone(),
        items: obj.items.as_ref().map(|i| Box::new(convert_schema_property(i))),
        properties,
        required: obj.required.clone(),
        read_only: obj.read_only,
        // Lower the YAML `default:` to a serde_json::Value so wire type
        // (number / bool / object) survives. YAML constructs not
        // representable in JSON (sequence-keyed maps) round-trip to
        // `None` — that's acceptable for what is fundamentally a
        // documentation hint.
        default: obj
            .default
            .as_ref()
            .and_then(|v| serde_json::to_value(v).ok()),
        enum_values: effective_enum_values(obj),
        minimum: obj.inclusive_min(),
        maximum: obj.inclusive_max(),
        exclusive_minimum: obj.exclusive_min(),
        exclusive_maximum: obj.exclusive_max(),
        example: obj.example.clone(),
        examples: obj.examples.clone(),
        one_of: convert_composition_branches(&obj.one_of),
        any_of: convert_composition_branches(&obj.any_of),
        all_of: convert_composition_branches(&obj.all_of),
        additional_properties: obj
            .additional_properties
            .as_ref()
            .map(|ap| Box::new(convert_schema_property(ap))),
    }
}

fn strip_ref_prefix(ref_path: &str) -> String {
    // Handles "#/components/schemas/Foo" and "#/components/parameters/Foo"
    ref_path
        .rsplit('/')
        .next()
        .unwrap_or(ref_path)
        .to_string()
}

// ---------------------------------------------------------------------------
// x-fern-global-headers
// ---------------------------------------------------------------------------

/// Lower a YAML scalar (string, integer, float, bool) used as a global
/// header's `default` into the on-the-wire string form. Returns `None`
/// for nulls, sequences, and mappings — those shapes aren't meaningful
/// as an HTTP header value, so we drop them rather than send something
/// nonsensical like `Some(["a","b"])` on the wire.
fn lower_global_header_default(value: &serde_yaml::Value) -> Option<String> {
    match value {
        serde_yaml::Value::String(s) => Some(s.clone()),
        serde_yaml::Value::Bool(b) => Some(b.to_string()),
        serde_yaml::Value::Number(n) => Some(n.to_string()),
        // Null, Sequence, Mapping, Tagged — not a valid header value.
        _ => None,
    }
}

/// Lower the spec-root `x-fern-global-headers` block into the canonical
/// [`GlobalHeader`] discovery types. Mirrors the upstream Fern OpenAPI
/// importer's `getGlobalHeaders.ts`: entries without a `header` are
/// rejected at deserialize-time by serde; everything else is optional
/// and falls back to sensible defaults (required, no env, no default).
///
/// `x-fern-default` wins over `default` when both are present.
fn lower_global_headers(raws: &[RawGlobalHeader]) -> Vec<GlobalHeader> {
    raws.iter()
        .map(|raw| {
            let default_yaml = raw.x_fern_default.as_ref().or(raw.default.as_ref());
            GlobalHeader {
                header: raw.header.clone(),
                name: raw.name.clone(),
                optional: raw.optional.unwrap_or(false),
                env: raw.env.clone(),
                default: default_yaml.and_then(lower_global_header_default),
            }
        })
        .collect()
}

// ---------------------------------------------------------------------------
// x-fern-groups
// ---------------------------------------------------------------------------

/// Lower the document-root `x-fern-groups` block into the canonical
/// [`SdkGroupInfo`] discovery type, keyed by the kebab-cased group
/// identifier so it matches the resource-tree keys built from
/// `x-fern-sdk-group-name`.
///
/// Mirrors fern's `getFernGroups.ts` / `SdkGroupInfo` IR shape
/// (`{ summary?, description? }`). Entries are kept verbatim — fern
/// does not invent additional fields, and neither do we. Empty
/// entries (both fields `None`) are preserved so the lookup tells
/// "no metadata" from "explicitly empty metadata", though both
/// render the same in `--help` today.
fn lower_fern_groups(raws: &HashMap<String, RawFernGroup>) -> HashMap<String, SdkGroupInfo> {
    raws.iter()
        .map(|(key, raw)| {
            (
                camel_to_kebab(key),
                SdkGroupInfo {
                    summary: raw.summary.clone(),
                    description: raw.description.clone(),
                },
            )
        })
        .collect()
}

// ---------------------------------------------------------------------------
// x-fern-sdk-variables
// ---------------------------------------------------------------------------

/// Lower the spec-root `x-fern-sdk-variables` block into a flat list of
/// [`SdkVariable`] entries. Mirrors Fern's openapi-ir-parser
/// `getVariableDefinitions.ts`: each variable is keyed by name, declares
/// a schema with `type` and optional `description`, and is only honored
/// when `type` is `string`. Non-string entries are logged and dropped so
/// the rest of the spec still loads — matching the upstream importer's
/// `Variable <name> has unsupported schema` behavior without failing
/// the whole spec load (the CLI is intentionally permissive).
fn parse_sdk_variables(mapping: Option<&serde_yaml::Mapping>) -> Vec<SdkVariable> {
    let Some(mapping) = mapping else {
        return Vec::new();
    };
    let mut out = Vec::with_capacity(mapping.len());
    for (name_val, schema_val) in mapping {
        let name = match name_val.as_str() {
            Some(s) => s.to_string(),
            None => {
                tracing::warn!(
                    "x-fern-sdk-variables entry has non-string key {:?}; skipping",
                    name_val
                );
                continue;
            }
        };
        let schema_map = match schema_val.as_mapping() {
            Some(m) => m,
            None => {
                tracing::warn!(
                    "x-fern-sdk-variables entry '{name}' is not an object; skipping"
                );
                continue;
            }
        };
        let ty = schema_map
            .get(serde_yaml::Value::String("type".into()))
            .and_then(|v| v.as_str())
            .unwrap_or("string")
            .to_string();
        if ty != "string" {
            tracing::warn!(
                "x-fern-sdk-variables entry '{name}' has unsupported type '{ty}'; \
                 only string variables are supported today (skipping)"
            );
            continue;
        }
        let description = schema_map
            .get(serde_yaml::Value::String("description".into()))
            .and_then(|v| v.as_str())
            .map(str::to_string);
        out.push(SdkVariable {
            name,
            ty,
            description,
        });
    }
    out
}

// ---------------------------------------------------------------------------
// Parameter conversion
// ---------------------------------------------------------------------------

fn convert_parameter(
    param: &OpenApiParameter,
    ref_site_default: Option<&serde_yaml::Value>,
) -> (String, MethodParameter) {
    let (param_type, enum_values, schema_default, format, fern_enum, minimum, maximum) = match &param.schema {
        Some(s) => (
            s.schema_type.clone(),
            s.enum_values.clone(),
            s.default.as_ref(),
            s.format.clone(),
            convert_fern_enum(s.x_fern_enum.as_ref()),
            s.minimum,
            s.maximum,
        ),
        None => (None, None, None, None, None, None, None),
    };

    // `x-fern-default` is the only source of a client-side default —
    // i.e. a value the CLI will (a) advertise in `--help` via clap's
    // `[default: ...]` and (b) substitute into the outgoing request
    // when the user omits the flag. Within the extension, ref-site wins
    // over the resolved component parameter, mirroring fern's
    // openapi-ir-parser precedence:
    //   getExtension(parameter, FERN_DEFAULT)
    //     ?? getExtension(resolvedParameter, FERN_DEFAULT)
    let client_yaml_default: Option<&serde_yaml::Value> =
        ref_site_default.or(param.x_fern_default.as_ref());
    let default_value = client_yaml_default.and_then(yaml_value_to_json);

    // The OpenAPI standard `default:` keyword on a parameter's schema
    // describes server-side behavior — it tells the client what the API
    // will do if the value is omitted, not what the client should send.
    // We surface it in `--help` as a documentation hint only.
    //
    // When `x-fern-default` is present it supersedes the documentation
    // hint for display too (showing two different defaults would confuse
    // users), so we drop the schema default in that case.
    let documentation_default_value = if default_value.is_some() {
        None
    } else {
        schema_default.and_then(yaml_value_to_json)
    };

    // Operation-level `x-fern-availability` wins; otherwise fall back to
    // OpenAPI's standard `deprecated: true` flag so flags marked deprecated
    // in the source spec still surface a `[DEPRECATED]` badge in `--help`.
    let availability = match param.x_fern_availability {
        Some(a) => Some(a),
        None if param.deprecated => Some(Availability::Deprecated),
        None => None,
    };

    // `x-fern-sdk-variable` is only honored on `in: path` parameters —
    // Fern's IR drops references on query/header/cookie params with a
    // log line, and so do we (the parameter still surfaces as a normal
    // per-op flag).
    let variable_reference = match param.x_fern_sdk_variable.as_deref() {
        Some(name) if param.location.as_deref() == Some("path") => Some(name.to_string()),
        Some(name) => {
            tracing::warn!(
                "x-fern-sdk-variable '{name}' on non-path parameter '{}' is ignored",
                param.name
            );
            None
        }
        None => None,
    };

    let mp = MethodParameter {
        param_type,
        description: param.description.clone(),
        location: param.location.clone(),
        required: param.required,
        format,
        default_value,
        documentation_default_value,
        enum_values,
        minimum,
        maximum,
        style: param.style.clone(),
        explode: param.explode,
        deprecated: param.deprecated,
        availability,
        fern_enum,
        variable_reference,
        ..Default::default()
    };

    (param.name.clone(), mp)
}

/// Lower the raw YAML `x-fern-enum` map into the internal representation.
/// Drops entries whose `name` and `description` are both empty/whitespace
/// so downstream clap rendering doesn't emit blank labels or help text.
/// Returns `None` if the extension is absent or every entry was empty —
/// `None` is the signal cli-sdk uses to mean "fall back to wire values".
fn convert_fern_enum(
    raw: Option<&HashMap<String, OpenApiFernEnumValue>>,
) -> Option<HashMap<String, crate::openapi::discovery::FernEnumValue>> {
    let raw = raw?;
    let normalize = |s: &Option<String>| -> Option<String> {
        s.as_ref().and_then(|v| {
            let t = v.trim();
            if t.is_empty() {
                None
            } else {
                Some(t.to_string())
            }
        })
    };
    let mut out: HashMap<String, crate::openapi::discovery::FernEnumValue> = HashMap::new();
    for (wire, entry) in raw {
        let display_name = normalize(&entry.name);
        let description = normalize(&entry.description);
        if display_name.is_none() && description.is_none() {
            continue;
        }
        out.insert(
            wire.clone(),
            crate::openapi::discovery::FernEnumValue {
                display_name,
                description,
            },
        );
    }
    if out.is_empty() { None } else { Some(out) }
}

/// Convert a `serde_yaml::Value` into a `serde_json::Value` for storage on
/// `MethodParameter::default_value` (from `x-fern-default`) and
/// `MethodParameter::documentation_default_value` (from the standard
/// OpenAPI `default:` keyword). Mirrors YAML's scalar coverage so a
/// `100` keeps its integer type, `true` keeps its boolean type, and
/// `"abc"` stays a string. Tagged values are unwrapped; `~`/`null`
/// collapses to `Value::Null`.
fn yaml_value_to_json(v: &serde_yaml::Value) -> Option<serde_json::Value> {
    match v {
        serde_yaml::Value::Null => Some(serde_json::Value::Null),
        serde_yaml::Value::Bool(b) => Some(serde_json::Value::Bool(*b)),
        serde_yaml::Value::Number(n) => {
            if let Some(u) = n.as_u64() {
                Some(serde_json::Value::Number(u.into()))
            } else if let Some(i) = n.as_i64() {
                Some(serde_json::Value::Number(i.into()))
            } else if let Some(f) = n.as_f64() {
                serde_json::Number::from_f64(f).map(serde_json::Value::Number)
            } else {
                None
            }
        }
        serde_yaml::Value::String(s) => Some(serde_json::Value::String(s.clone())),
        serde_yaml::Value::Sequence(seq) => Some(serde_json::Value::Array(
            seq.iter().filter_map(yaml_value_to_json).collect(),
        )),
        serde_yaml::Value::Mapping(map) => {
            let mut obj = serde_json::Map::new();
            for (k, val) in map {
                let key = match k {
                    serde_yaml::Value::String(s) => s.clone(),
                    other => serde_yaml::to_string(other).ok()?.trim().to_string(),
                };
                if let Some(jv) = yaml_value_to_json(val) {
                    obj.insert(key, jv);
                }
            }
            Some(serde_json::Value::Object(obj))
        }
        serde_yaml::Value::Tagged(t) => yaml_value_to_json(&t.value),
    }
}

fn resolve_parameter<'a>(
    por: &'a OpenApiParamOrRef,
    components: &'a Option<OpenApiComponents>,
) -> Option<&'a OpenApiParameter> {
    match por {
        OpenApiParamOrRef::Inline(p) => Some(p.as_ref()),
        OpenApiParamOrRef::Ref { ref_path, .. } => {
            let name = strip_ref_prefix(ref_path);
            components
                .as_ref()
                .and_then(|c| c.parameters.get(&name))
        }
    }
}

/// Resolve the effective `x-fern-parameter-name` for a parameter using
/// the same precedence as `x-fern-ignore`: a value placed at the
/// **ref-site** object (alongside `$ref`) wins over the value on the
/// **resolved component parameter**. Inline parameters short-circuit to
/// their own value. Returns `None` when no alias is set.
///
/// Implements the same semantics as fern's openapi-ir-parser
/// (`getParameterName.ts` + the `??` chain used for `x-fern-ignore`):
/// ```ts
/// const alias =
///     getExtension<string>(parameter, PARAMETER_NAME) ??
///     getExtension<string>(resolvedParameter, PARAMETER_NAME);
/// ```
fn resolve_parameter_display_name(
    por: &OpenApiParamOrRef,
    components: &Option<OpenApiComponents>,
) -> Option<String> {
    match por {
        OpenApiParamOrRef::Inline(p) => p.x_fern_parameter_name.clone(),
        OpenApiParamOrRef::Ref {
            x_fern_parameter_name: ref_site,
            ..
        } => {
            let resolved = resolve_parameter(por, components)
                .and_then(|p| p.x_fern_parameter_name.clone());
            ref_site.clone().or(resolved)
        }
    }
}

/// Resolve the effective `x-fern-ignore` value for a parameter, mirroring
/// fern's precedence: a value on the **ref-site object** (placed next to
/// `$ref`) wins over the value on the **resolved component parameter**.
/// Inline parameters are a single site, so they short-circuit. Returns
/// `false` when no flag is set at any level.
///
/// Implements the same semantics as fern's openapi-ir-parser:
/// ```ts
/// const shouldIgnore =
///     getExtension<boolean>(parameter, IGNORE) ??
///     getExtension<boolean>(resolvedParameter, IGNORE);
/// ```
fn parameter_should_ignore(
    por: &OpenApiParamOrRef,
    components: &Option<OpenApiComponents>,
) -> bool {
    match por {
        OpenApiParamOrRef::Inline(p) => p.x_fern_ignore.unwrap_or(false),
        OpenApiParamOrRef::Ref {
            x_fern_ignore: ref_site,
            ..
        } => {
            let resolved = resolve_parameter(por, components).and_then(|p| p.x_fern_ignore);
            ref_site.or(resolved).unwrap_or(false)
        }
    }
}

// ---------------------------------------------------------------------------
// Core conversion
// ---------------------------------------------------------------------------

/// Load and convert an OpenAPI 3.0 YAML spec into the internal `RestDescription`.
pub fn load_openapi_spec(yaml_str: &str, cli_name: &str) -> Result<RestDescription, CliError> {
    let value: serde_yaml::Value = serde_yaml::from_str(yaml_str)
        .map_err(|e| CliError::Discovery(format!("Failed to parse OpenAPI spec: {e}")))?;
    load_openapi_spec_from_value(value, cli_name)
}

/// Load and convert an OpenAPI spec from a pre-parsed `serde_yaml::Value`.
///
/// This is the workhorse behind both [`load_openapi_spec`] (plain string) and
/// the overrides path where a base spec and override YAML are deep-merged into
/// a single `Value` before deserialization.
pub fn load_openapi_spec_from_value(
    value: serde_yaml::Value,
    cli_name: &str,
) -> Result<RestDescription, CliError> {
    let spec: OpenApiSpec = serde_yaml::from_value(value)
        .map_err(|e| CliError::Discovery(format!("Failed to parse OpenAPI spec: {e}")))?;

    let root_url = spec
        .servers
        .first()
        .map(|s| s.url.clone())
        .unwrap_or_default();

    // Lower the spec's top-level `servers:` array into the internal
    // representation. Order is preserved so callers can rely on
    // "first server is the default" — the same rule that
    // populates `root_url` above.
    let top_level_servers: Vec<crate::openapi::discovery::Server> = spec
        .servers
        .iter()
        .map(OpenApiServer::to_discovery_server)
        .collect();

    // Convert component schemas.
    //
    // TODO(FER-9864): mirror fern's component-schema + property-level
    // `x-fern-ignore` here once body fields surface as CLI flags. Fern's
    // openapi-ir-parser drops ignored schemas in `convertSchemas.ts` and
    // ignored properties in `convertObject.ts`; the CLI today only exposes
    // operations + parameters, so those levels are a no-op for now and
    // intentionally left unhandled.
    let schemas: HashMap<String, JsonSchema> = spec
        .components
        .as_ref()
        .map(|c| {
            c.schemas
                .iter()
                .map(|(name, obj)| (name.clone(), convert_schema_object(obj)))
                .collect()
        })
        .unwrap_or_default();

    // OpenAPI 3.1 `webhooks` describe inbound operations (server → user),
    // so we capture them at parse time but do not lower them into CLI
    // subcommands. A non-empty block is surfaced at debug level so users
    // can see why a spec with only webhooks produces no commands.
    if !spec.webhooks.is_empty() {
        tracing::debug!(
            "Spec declares {} webhook(s); webhooks are inbound and not lowered to CLI subcommands.",
            spec.webhooks.len(),
        );
    }

    // Lower components.securitySchemes to discovery types
    let security_schemes: HashMap<String, SecurityScheme> = spec
        .components
        .as_ref()
        .map(|c| {
            c.security_schemes
                .iter()
                .map(|(name, raw)| (name.clone(), lower_security_scheme(raw)))
                .collect()
        })
        .unwrap_or_default();

    // Detect pagination token parameter name from components/parameters
    let (pagination_query_param, pagination_response_path) = detect_pagination_config(&spec);

    // Normalize `x-fern-base-path`: trim ASCII whitespace and treat an empty
    // string as absent so downstream slash-joining doesn't have to worry about
    // a degenerate "" case. Leading/trailing slashes are preserved here —
    // `build_url` is what normalizes them into exactly one slash between
    // segments, so we don't lose authoring intent at parse time.
    let base_path = normalize_base_path(spec.x_fern_base_path.as_deref());

    // Lower spec-root `x-fern-idempotency-headers` into discovery types. Each
    // entry will be materialized as a CLI flag on every idempotent operation
    // below; non-idempotent operations never see these headers.
    let idempotency_headers: Vec<IdempotencyHeader> = spec
        .x_fern_idempotency_headers
        .as_ref()
        .map(|raws| {
            raws.iter()
                .map(|raw| IdempotencyHeader {
                    header: raw.header.clone(),
                    name: raw.name.clone(),
                    env: raw.env.clone(),
                })
                .collect()
        })
        .unwrap_or_default();

    // Lower the spec-root `x-fern-sdk-variables` block once. Variables
    // surface as global flags later in `CliApp::run_async`; storing them
    // on `RestDescription` keeps the parser as the single source of
    // truth for both flag registration and per-operation substitution.
    let sdk_variables = parse_sdk_variables(spec.x_fern_sdk_variables.as_ref());

    // Spec-root `x-fern-retries`. Operations inherit this block when they
    // either omit `x-fern-retries` or set it to `true`. Parsed once here
    // so per-op resolution stays a cheap merge.
    let spec_root_retries = parse_retries_value(
        spec.x_fern_retries.as_ref().unwrap_or(&serde_yaml::Value::Null),
        /*op_id=*/ "<spec-root>",
        /*inherited=*/ true,
    )?;

    // Lower the spec-root `x-fern-global-headers` block once. Globals
    // surface as root flags in `CliApp::run_async` and are stamped on
    // every outgoing request by the executor (per-operation parameters
    // with the same wire-name still win).
    let global_headers: Vec<GlobalHeader> = spec
        .x_fern_global_headers
        .as_ref()
        .map(|raws| lower_global_headers(raws))
        .unwrap_or_default();

    // Lower the document-root `x-fern-groups` extension. Keys are
    // kebab-cased so they match the resource-tree keys built from
    // `x-fern-sdk-group-name` further down. Mirrors fern's
    // `XFernGroupsSchema` (record of `{ summary?, description? }`).
    let groups: HashMap<String, SdkGroupInfo> = spec
        .x_fern_groups
        .as_ref()
        .map(lower_fern_groups)
        .unwrap_or_default();

    let mut doc = RestDescription {
        name: cli_name.to_string(),
        version: spec.info.version.clone(),
        title: spec.info.title.clone(),
        description: spec.info.description.clone(),
        root_url: root_url.clone(),
        servers: top_level_servers,
        service_path: String::new(),
        base_path,
        schemas,
        security_schemes,
        pagination_token_query_param: pagination_query_param,
        pagination_token_response_path: pagination_response_path,
        idempotency_headers,
        sdk_variables,
        retries: spec_root_retries.clone(),
        global_headers,
        groups,
        ..Default::default()
    };

    // Spec-level security default. Inherited by every operation that
    // doesn't declare its own `security:` block. An operation's
    // `security: []` (explicit empty) overrides the default with anonymous.
    let spec_default_security = spec.security.clone();

    // Spec-root `x-fern-pagination`. Per-op `x-fern-pagination: true`
    // inherits this block; per-op missing-or-`false` ignores it.
    let spec_root_pagination = spec.x_fern_pagination.clone();

    // Spec-root `x-fern-retries`. Per-op `x-fern-retries: true` adopts
    // this block; per-op `false` or `{ disabled: true }` overrides it;
    // per-op object merges over it field-by-field.
    let spec_root_retries_raw = spec.x_fern_retries.clone();

    // Build a reference to the component schemas for $ref body resolution.
    let empty_component_schemas: HashMap<String, OpenApiSchemaObject> = HashMap::new();
    let component_schemas: &HashMap<String, OpenApiSchemaObject> = spec
        .components
        .as_ref()
        .map(|c| &c.schemas)
        .unwrap_or(&empty_component_schemas);

    // Build a reference to the component responses for $ref resolution.
    let empty_component_responses: HashMap<String, OpenApiResponse> = HashMap::new();
    let component_responses: &HashMap<String, OpenApiResponse> = spec
        .components
        .as_ref()
        .map(|c| &c.responses)
        .unwrap_or(&empty_component_responses);

    // Process each path + method
    #[allow(clippy::type_complexity)]
    let http_methods: &[(&str, fn(&OpenApiPathItem) -> &Option<OpenApiOperation>)] = &[
        ("GET", |p: &OpenApiPathItem| &p.get),
        ("POST", |p: &OpenApiPathItem| &p.post),
        ("PUT", |p: &OpenApiPathItem| &p.put),
        ("PATCH", |p: &OpenApiPathItem| &p.patch),
        ("DELETE", |p: &OpenApiPathItem| &p.delete),
    ];

    for (path, path_item) in &spec.paths {
        for &(http_method, accessor) in http_methods {
            let operation = match accessor(path_item) {
                Some(op) => op,
                None => continue,
            };

            // Fern parity: `x-fern-ignore: true` drops the operation from the
            // generated CLI surface entirely. The operation does not appear
            // as a subcommand, in `--help`, or in completions. Log message
            // mirrors fern's openapi-ir-parser wording so the two systems
            // produce consistent diagnostics.
            if operation.x_fern_ignore.unwrap_or(false) {
                tracing::debug!(
                    "{} {} is marked with x-fern-ignore. Skipping.",
                    http_method,
                    path
                );
                continue;
            }

            // Resolve group name: prefer x-fern-sdk-group-name, fall back to first tag
            let fern_group;
            let tag_group;
            let group_name: &Vec<String> = match &operation.x_fern_sdk_group_name {
                Some(g) if !g.is_empty() => g,
                _ => match operation.tags.as_ref().and_then(|t| t.first()) {
                    Some(tag) => {
                        tag_group = vec![tag.clone()];
                        &tag_group
                    }
                    None => {
                        // Fall back to first path segment as group
                        let segment = path
                            .trim_start_matches('/')
                            .split('/')
                            .next()
                            .unwrap_or("default")
                            .to_string();
                        fern_group = vec![segment];
                        &fern_group
                    }
                },
            };

            // Resolve method name: prefer x-fern-sdk-method-name, fall back to operationId or http+path.
            // When the group came from a tag (no x-fern-sdk-group-name), strip
            // tag tokens that prefix the operationId so e.g. `Customers` tag
            // + `customersList` operation → method `list` rather than
            // `customers-list`. Mirrors Fern's OpenAPI importer.
            let method_name = match &operation.x_fern_sdk_method_name {
                Some(m) => m.clone(),
                None => match &operation.operation_id {
                    Some(id) => {
                        let stripped = if operation.x_fern_sdk_group_name.is_none() {
                            match operation.tags.as_ref().and_then(|t| t.first()) {
                                Some(tag) => strip_tag_prefix(id, tag),
                                None => id.clone(),
                            }
                        } else {
                            id.clone()
                        };
                        camel_to_kebab(&stripped)
                    }
                    None => format!(
                        "{}-{}",
                        http_method.to_lowercase(),
                        path.trim_start_matches('/').replace('/', "-")
                    ),
                },
            };

            // Collect parameters (path-level + operation-level). Parameters
            // marked `x-fern-ignore: true` are dropped — they don't surface
            // as CLI flags and aren't sent in the outgoing request.
            //
            // The flag is read with fern's precedence: a value placed at
            // the **ref-site** object (alongside `$ref`) wins over the
            // value on the resolved component parameter. This matches
            // OpenAPI 3.1's allowance of sibling fields next to `$ref` and
            // fern's overlay system, which routinely uses ref-site ignores.
            let mut params = HashMap::new();
            for por in path_item.parameters.iter().chain(operation.parameters.iter()) {
                if parameter_should_ignore(por, &spec.components) {
                    tracing::debug!(
                        "{} {} has a parameter marked with x-fern-ignore. Skipping.",
                        http_method,
                        path
                    );
                    continue;
                }
                let display_name = resolve_parameter_display_name(por, &spec.components);
                if let Some(p) = resolve_parameter(por, &spec.components) {
                    // Ref-site `x-fern-default` (placed alongside `$ref`) wins
                    // over the value on the resolved component parameter —
                    // mirrors fern's importer precedence for `getExtension`.
                    let ref_site_default = match por {
                        OpenApiParamOrRef::Ref { x_fern_default, .. } => x_fern_default.as_ref(),
                        OpenApiParamOrRef::Inline(_) => None,
                    };
                    let (name, mut mp) = convert_parameter(p, ref_site_default);
                    mp.display_name = display_name;
                    params.insert(name, mp);
                }
            }

            // Handle request body — also harvests body-located parameters so
            // the command builder can render per-field flags alongside `--json`.
            let (request, binary_request_body, body_encoding, body_params, multipart_fields) =
                extract_request_body(
                &operation.request_body,
                operation.operation_id.as_deref().unwrap_or("unknown"),
                &mut doc.schemas,
                component_schemas,
            );

            // Extract the primary success response schema. Inline response
            // schemas are registered in doc.schemas under a synthetic
            // `{operation_id}_response` name so the help layer can look
            // them up uniformly with named ($ref'd) responses.
            let response = extract_response(
                &operation.responses,
                operation.operation_id.as_deref().unwrap_or("unknown"),
                &mut doc.schemas,
                component_responses,
            );

            // Skip body fields whose names collide with existing path/query/header
            // params — those win, since the spec's `parameters` array is the
            // canonical source for non-body inputs.
            for (name, param) in body_params {
                params.entry(name).or_insert(param);
            }

            let description = operation
                .summary
                .clone()
                .or_else(|| operation.description.clone());

            let method_root_url = operation.servers
                .first()
                .map(|s| s.url.clone())
                .unwrap_or_else(|| root_url.clone());

            // Per-op `servers:` overrides replace the global default for
            // this operation. Lower them into the internal representation
            // so the executor can route the global `--server <name>` flag
            // against per-op named entries before falling back to
            // `method_root_url` (the first per-op server).
            let method_servers: Vec<crate::openapi::discovery::Server> = operation
                .servers
                .iter()
                .map(OpenApiServer::to_discovery_server)
                .collect();

            // OpenAPI inheritance: operation-level `security` (including an
            // explicit empty array) takes precedence; otherwise inherit the
            // spec-level default; if neither is present the operation has no
            // declared policy.
            let security_requirements = match &operation.security {
                Some(reqs) => Some(reqs.clone()),
                None => spec_default_security.clone(),
            };

            let pagination = resolve_pagination_extension(
                operation.x_fern_pagination.as_ref(),
                spec_root_pagination.as_ref(),
                operation.operation_id.as_deref().unwrap_or("unknown"),
            )?;

            let retries = resolve_retries_extension(
                operation.x_fern_retries.as_ref(),
                spec_root_retries_raw.as_ref(),
                operation.operation_id.as_deref().unwrap_or("unknown"),
            )?;

            // `x-fern-availability` wins; otherwise fall back to OpenAPI's
            // standard `deprecated: true` flag so deprecated ops still get
            // a `[DEPRECATED]` badge without requiring the extension.
            let availability = match operation.x_fern_availability {
                Some(a) => Some(a),
                None if operation.deprecated => Some(Availability::Deprecated),
                None => None,
            };

            let idempotent = operation.x_fern_idempotent.unwrap_or(false);

            // `x-fern-cli-idempotency: false` explicitly disables the
            // auto-generated Idempotency-Key header on this operation.
            let no_auto_idempotency_key = operation
                .x_fern_cli_idempotency
                .map(|v| !v)
                .unwrap_or(false);

            // `x-fern-audiences` is an array of strings; missing means
            // `[]`. Stored verbatim so the command-tree filter can
            // mirror fern's `some(...)` membership check exactly. See
            // discovery.rs `RestMethod::audiences` for the rationale on
            // why this is parser-recorded but only consumed at the
            // command-tree layer.
            let audiences = operation.x_fern_audiences.clone().unwrap_or_default();

            // Materialize idempotency-header flags on idempotent operations
            // ONLY. Each spec-root `x-fern-idempotency-headers` entry becomes
            // a synthetic header MethodParameter so the existing
            // header-parameter pathway (clap flag → executor request
            // header) handles the value. Non-idempotent siblings get no
            // such parameter and therefore never send these headers on the
            // wire, even if the user passes the flag explicitly (clap
            // rejects it as unknown).
            if idempotent {
                inject_idempotency_header_params(&mut params, &doc.idempotency_headers);
            }

            let return_value = operation
                .x_fern_sdk_return_value
                .as_ref()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty());

            let streaming = parse_streaming_extension(
                operation.x_fern_streaming.as_ref(),
                operation.operation_id.as_deref().unwrap_or("unknown"),
            )?;

            let has_binary_response = response_has_binary_media_type(&operation.responses, component_responses);

            // Mutual exclusivity: an operation that's both streamed and
            // paginated is incoherent — pagination drives a loop of
            // requests against fully-buffered responses, while
            // streaming consumes a single open response incrementally.
            // The upstream Fern IR doesn't generate a meaningful
            // combination either; mirror that by failing at parse time
            // so spec authors get a single clear error instead of an
            // ambiguous runtime fallback.
            if streaming.is_some() && pagination.is_some() {
                return Err(CliError::Discovery(format!(
                    "Operation '{}' declares both `x-fern-streaming` and \
                    `x-fern-pagination`, which are mutually exclusive. Streaming \
                    operations open a single long-lived response; paginated \
                    operations issue multiple requests against unary responses.",
                    operation.operation_id.as_deref().unwrap_or("unknown"),
                )));
            }


            let rest_method = RestMethod {
                id: operation.operation_id.clone(),
                description,
                http_method: http_method.to_string(),
                path: path.clone(),
                parameters: params,
                request,
                response,
                root_url: method_root_url,
                servers: method_servers,
                binary_request_body,
                multipart_fields,
                body_encoding,
                security_requirements,
                pagination,
                availability,
                idempotent,
                no_auto_idempotency_key,
                return_value,
                streaming,
                retries,
                audiences,
                has_binary_response,
                ..Default::default()
            };

            // Walk group_name to create/find nested resources
            let kebab_groups: Vec<String> =
                group_name.iter().map(|g| camel_to_kebab(g)).collect();

            insert_method_into_resources(&mut doc.resources, &kebab_groups, &method_name, rest_method);
        }
    }

    // Fern parity: if every operation under a path/group was ignored, prune
    // the now-empty group so it doesn't appear as a subcommand with no
    // leaves in `--help` or completions.
    prune_empty_resources(&mut doc.resources);

    Ok(doc)
}

/// Recursively drop resources that contain no methods and no non-empty
/// nested resources. Called after all paths have been processed so that
/// `x-fern-ignore`-only paths don't leave orphan groups in the command tree.
fn prune_empty_resources(resources: &mut HashMap<String, RestResource>) {
    resources.retain(|_, resource| {
        prune_empty_resources(&mut resource.resources);
        !resource.methods.is_empty() || !resource.resources.is_empty()
    });
}

/// Walk the group name list to find or create nested resources and insert the method.
fn insert_method_into_resources(
    resources: &mut HashMap<String, RestResource>,
    groups: &[String],
    method_name: &str,
    method: RestMethod,
) {
    if groups.is_empty() {
        return;
    }

    let resource = resources
        .entry(groups[0].clone())
        .or_default();

    if groups.len() == 1 {
        resource.methods.insert(method_name.to_string(), method);
    } else {
        insert_method_into_resources(&mut resource.resources, &groups[1..], method_name, method);
    }
}

/// Extract request body info from an OpenAPI requestBody.
///
/// Maximum recursion depth for flattening nested request body object properties
/// into dot-notation flags. Mirrors `MAX_INPUT_DEPTH` in `graphql/parser.rs`.
/// Properties at depth >= MAX_BODY_DEPTH are not flattened — `--json` remains
/// the only way to supply them.
const MAX_BODY_DEPTH: u8 = 3;

/// Result of [`extract_request_body`], as
/// `(json_schema, binary_body, body_encoding, body_params, multipart_fields)`.
/// See the function docs for per-field semantics.
type ExtractedRequestBody = (
    Option<SchemaRef>,
    Option<BinaryRequestBody>,
    BodyEncoding,
    HashMap<String, MethodParameter>,
    Vec<MultipartField>,
);

/// Decide whether any 2xx response declares a non-JSON content media type.
///
/// Mirrors the runtime predicate in
/// `src/openapi/executor.rs:1973-1974` — JSON means `application/json` or
/// `text/json`; anything else (audio/*, image/*, application/octet-stream,
/// text/csv, application/pdf, …) is routed to the binary file-writing path
/// in `handle_binary_response`. We walk only 2xx and `2XX`/`2xx` status
/// codes — the binary-body affordance is for successful responses, not the
/// JSON error shapes commonly declared on 4xx/5xx of the same operation
/// (which is why the mixed-response case still surfaces `--output`).
///
/// An empty `responses` map, or one whose 2xx entries have no `content`
/// block (e.g. `204 No Content`), returns `false` — there's no body to
/// write, so `--output` would be meaningless.
fn response_has_binary_media_type(
    responses: &HashMap<String, OpenApiResponseOrRef>,
    component_responses: &HashMap<String, OpenApiResponse>,
) -> bool {
    for (status, response_or_ref) in responses {
        if !is_success_status(status) {
            continue;
        }
        let Some(response) = resolve_response_ref(response_or_ref, component_responses) else {
            continue;
        };
        let Some(content) = response.content.as_ref() else {
            continue;
        };
        for media_type in content.keys() {
            if !is_json_media_type(media_type) {
                return true;
            }
        }
    }
    false
}

fn is_success_status(status: &str) -> bool {
    // OpenAPI accepts `200`, `201`, ..., and the wildcard `2XX` / `2xx`.
    // The `default` key is the catch-all (typically errors) — not a 2xx.
    let s = status.trim();
    if s.eq_ignore_ascii_case("2XX") {
        return true;
    }
    s.starts_with('2') && s.len() == 3 && s[1..].chars().all(|c| c.is_ascii_digit())
}

fn is_json_media_type(media_type: &str) -> bool {
    // Mirror the executor's runtime predicate so the gate aligns with the
    // path actually taken at request time.
    media_type.contains("application/json") || media_type.contains("text/json")
}

/// Returns `(json_schema, binary_body, body_encoding, body_params, multipart_fields)`:
/// - `json_schema`: a SchemaRef for the JSON request body (if `application/json` is declared).
/// - `binary_body`: metadata when the operation expects a raw binary body
///   (any non-JSON / non-form media type).
/// - `body_encoding`: how the request body should be serialized on the wire.
/// - `body_params`: per-field flag map; when the body is an inline object schema,
///   each property up to MAX_BODY_DEPTH is exposed as a body-located [`MethodParameter`]
///   with dotted keys for nested fields. `$ref` bodies are resolved from
///   `component_schemas` and their properties flattened with the same depth rules.
/// - `multipart_fields`: per-field metadata for `multipart/form-data` bodies.
fn extract_request_body(
    request_body: &Option<OpenApiRequestBody>,
    operation_id: &str,
    schemas: &mut HashMap<String, JsonSchema>,
    component_schemas: &HashMap<String, OpenApiSchemaObject>,
) -> ExtractedRequestBody {
    let Some(body) = request_body.as_ref() else {
        return (None, None, BodyEncoding::Json, HashMap::new(), Vec::new());
    };
    let Some(content) = body.content.as_ref() else {
        return (None, None, BodyEncoding::Json, HashMap::new(), Vec::new());
    };

    if let Some(media) = content.get("application/json") {
        if let Some(schema_obj) = media.schema.as_ref() {
            if let Some(ref_path) = &schema_obj.schema_ref {
                let name = strip_ref_prefix(ref_path);
                let body_params = component_schemas
                    .get(&name)
                    .map(|resolved| flatten_body_params(resolved, component_schemas, 0))
                    .unwrap_or_default();
                return (
                    Some(SchemaRef {
                        schema_ref: Some(name),
                        ..Default::default()
                    }),
                    None,
                    BodyEncoding::Json,
                    body_params,
                    Vec::new(),
                );
            }

            let body_params = flatten_body_params(schema_obj, component_schemas, 0);

            let synthetic_name = format!("{operation_id}_request");
            let converted = convert_schema_object(schema_obj);
            schemas.insert(synthetic_name.clone(), converted);

            return (
                Some(SchemaRef {
                    schema_ref: Some(synthetic_name),
                    ..Default::default()
                }),
                None,
                BodyEncoding::Json,
                body_params,
                Vec::new(),
            );
        }
    }

    // Handle multipart/form-data bodies. Each property in the schema
    // becomes a CLI flag; file-typed fields accept a path and are streamed
    // as binary parts.
    if let Some(media) = content.get("multipart/form-data") {
        let multipart_fields = extract_multipart_fields(
            media.schema.as_ref(),
            &media.encoding,
            component_schemas,
            operation_id,
        );
        if !multipart_fields.is_empty() {
            return (None, None, BodyEncoding::Json, HashMap::new(), multipart_fields);
        }
    }

    // No JSON or multipart body declared — check for form-urlencoded body next.
    if let Some(media) = content.get("application/x-www-form-urlencoded") {
        if let Some(schema_obj) = media.schema.as_ref() {
            if let Some(ref_path) = &schema_obj.schema_ref {
                let name = strip_ref_prefix(ref_path);
                let body_params = component_schemas
                    .get(&name)
                    .map(|resolved| flatten_body_params(resolved, component_schemas, 0))
                    .unwrap_or_default();
                return (
                    Some(SchemaRef {
                        schema_ref: Some(name),
                        ..Default::default()
                    }),
                    None,
                    BodyEncoding::FormUrlEncoded,
                    body_params,
                    Vec::new(),
                );
            }

            let body_params = flatten_body_params(schema_obj, component_schemas, 0);

            let synthetic_name = format!("{operation_id}_request");
            let converted = convert_schema_object(schema_obj);
            schemas.insert(synthetic_name.clone(), converted);

            return (
                Some(SchemaRef {
                    schema_ref: Some(synthetic_name),
                    ..Default::default()
                }),
                None,
                BodyEncoding::FormUrlEncoded,
                body_params,
                Vec::new(),
            );
        }
    }

    // No JSON, multipart, or form body — look for a binary content type.
    // `multipart/form-data` and `application/x-www-form-urlencoded` are
    // explicitly excluded (handled above).
    let Some((content_type, media)) = content.iter().find(|(ct, _)| {
        let ct = ct.as_str();
        ct != "application/x-www-form-urlencoded" && ct != "multipart/form-data"
    }) else {
        return (None, None, BodyEncoding::Json, HashMap::new(), Vec::new());
    };

    let is_binary_format = media
        .schema
        .as_ref()
        .and_then(|s| s.format.as_deref())
        .map(|f| f == "binary")
        .unwrap_or(false);

    let flag_name = body
        .x_fern_parameter_name
        .as_deref()
        .map(camel_to_kebab)
        .unwrap_or_else(|| {
            if is_binary_format {
                "file".to_string()
            } else {
                "body".to_string()
            }
        });

    (
        None,
        Some(BinaryRequestBody {
            content_type: content_type.clone(),
            flag_name,
        }),
        BodyEncoding::Json,
        HashMap::new(),
        Vec::new(),
    )
}

/// Resolve a response-level `$ref` or return the inline response directly.
fn resolve_response_ref<'a>(
    r: &'a OpenApiResponseOrRef,
    component_responses: &'a HashMap<String, OpenApiResponse>,
) -> Option<&'a OpenApiResponse> {
    match r {
        OpenApiResponseOrRef::Inline(resp) => Some(resp),
        OpenApiResponseOrRef::Ref { ref_path } => {
            let name = strip_ref_prefix(ref_path);
            component_responses.get(&name)
        }
    }
}

/// Pick the response entry for the primary success: numerically-lowest 2xx
/// status code, falling back to `default`.
fn select_primary_response<'a>(
    responses: &'a HashMap<String, OpenApiResponseOrRef>,
    component_responses: &'a HashMap<String, OpenApiResponse>,
) -> Option<&'a OpenApiResponse> {
    let mut twoxx: Vec<(u16, &str, &OpenApiResponse)> = responses
        .iter()
        .filter_map(|(code, r)| {
            let n = status_code_sort_key(code)?;
            if (200..300).contains(&n) {
                let resolved = resolve_response_ref(r, component_responses)?;
                Some((n, code.as_str(), resolved))
            } else {
                None
            }
        })
        .collect();
    if !twoxx.is_empty() {
        twoxx.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(b.1)));
        return Some(twoxx[0].2);
    }
    responses
        .get("default")
        .and_then(|r| resolve_response_ref(r, component_responses))
}

/// Parse an OpenAPI status code key into a `u16` for band-membership checks
/// and sorting. Wildcards (`"2XX"`) map to the highest code in their band
/// so explicit codes sort before them.
fn status_code_sort_key(code: &str) -> Option<u16> {
    if let Ok(n) = code.parse::<u16>() {
        return Some(n);
    }
    let mut digits = String::with_capacity(3);
    for c in code.chars() {
        if c.is_ascii_digit() {
            digits.push(c);
        } else if c == 'X' || c == 'x' {
            digits.push('9');
        } else {
            return None;
        }
    }
    if digits.is_empty() {
        return None;
    }
    digits.parse::<u16>().ok()
}

/// Pick the response content type: `application/json` → `*/json` → first
/// non-JSON. Sorted by key before picking for determinism.
fn select_response_content_type(
    content: &HashMap<String, OpenApiMediaType>,
) -> Option<(&String, &OpenApiMediaType)> {
    if let Some(entry) = content.get_key_value("application/json") {
        return Some(entry);
    }
    let mut entries: Vec<_> = content.iter().collect();
    entries.sort_by_key(|(k, _)| k.to_ascii_lowercase());
    if let Some((k, v)) = entries.iter().find(|(ct, _)| ct.eq_ignore_ascii_case("application/json")) {
        return Some((*k, *v));
    }
    let json_like = entries.iter().find(|(ct, _)| {
        let lower = ct.to_ascii_lowercase();
        lower.ends_with("/json") || lower.ends_with("+json")
    });
    if let Some((k, v)) = json_like {
        return Some((*k, *v));
    }
    entries.into_iter().next()
}

/// Extract the primary success response's JSON schema as `Option<SchemaRef>`.
/// Selects the lowest 2xx status code (falling back to `default`), resolves
/// response-level `$ref`s against `components.responses`, picks the best
/// content type, and returns the schema reference. Inline schemas are
/// registered in `schemas` under a synthetic `{operation_id}_response` name.
fn extract_response(
    responses: &HashMap<String, OpenApiResponseOrRef>,
    operation_id: &str,
    schemas: &mut HashMap<String, JsonSchema>,
    component_responses: &HashMap<String, OpenApiResponse>,
) -> Option<SchemaRef> {
    let response = select_primary_response(responses, component_responses)?;
    let content = match response.content.as_ref() {
        Some(c) if !c.is_empty() => c,
        _ => return None,
    };

    let (content_type, media) = select_response_content_type(content)?;

    let ct_lower = content_type.to_ascii_lowercase();
    let is_event_stream = ct_lower == "text/event-stream";
    let is_json_like = ct_lower == "application/json"
        || ct_lower.ends_with("/json")
        || ct_lower.ends_with("+json");

    if !is_json_like && !is_event_stream {
        return None;
    }

    let schema_obj = media.schema.as_ref()?;

    if let Some(ref_path) = schema_obj.schema_ref.as_ref() {
        Some(SchemaRef {
            schema_ref: Some(strip_ref_prefix(ref_path)),
            parameter_name: None,
        })
    } else {
        let mut synthetic_name = format!("{operation_id}_response");
        if schemas.contains_key(&synthetic_name) {
            synthetic_name = format!("{operation_id}_inline_response");
        }
        let converted = convert_schema_object(schema_obj);
        schemas.insert(synthetic_name.clone(), converted);
        Some(SchemaRef {
            schema_ref: Some(synthetic_name),
            parameter_name: None,
        })
    }
}

/// Walk a `multipart/form-data` schema and emit one [`MultipartField`] per
/// property. Resolves `$ref` to `components/schemas` for the root schema
/// and for individual properties. File fields are identified by
/// `type: string, format: binary` (or legacy `type: file`).
///
/// `encoding` is the media type's OpenAPI `encoding` object; a per-property
/// `contentType` there overrides the content type inferred from the schema
/// (the default being `application/octet-stream` for file parts and
/// `text/plain` for text parts). This is the OAS 3.x mechanism for, e.g.,
/// declaring that a string field carries `application/json`.
fn extract_multipart_fields(
    schema: Option<&OpenApiSchemaObject>,
    encoding: &HashMap<String, OpenApiEncoding>,
    component_schemas: &HashMap<String, OpenApiSchemaObject>,
    operation_id: &str,
) -> Vec<MultipartField> {
    let Some(schema) = schema else {
        tracing::warn!(
            operation = operation_id,
            "multipart/form-data body has no schema; skipping",
        );
        return Vec::new();
    };

    // Resolve top-level $ref.
    let resolved = if let Some(ref_path) = &schema.schema_ref {
        let name = strip_ref_prefix(ref_path);
        match component_schemas.get(&name) {
            Some(r) => r,
            None => {
                tracing::warn!(
                    operation = operation_id,
                    schema_ref = name,
                    "unresolvable $ref for multipart body; skipping",
                );
                return Vec::new();
            }
        }
    } else {
        schema
    };

    if resolved.schema_type() != Some("object") {
        tracing::warn!(
            operation = operation_id,
            "multipart/form-data schema is not an object; skipping",
        );
        return Vec::new();
    }

    let required_set: std::collections::HashSet<&str> =
        resolved.required.iter().map(String::as_str).collect();

    let mut fields: Vec<MultipartField> = resolved
        .properties
        .iter()
        .map(|(name, prop)| {
            let (is_file, inferred_ct) = classify_multipart_property(prop, component_schemas);
            // A `contentType` in the `encoding` object wins over the
            // schema-inferred default for this part.
            let content_type = encoding
                .get(name)
                .and_then(|e| e.content_type.clone())
                .or(inferred_ct);
            MultipartField {
                wire_name: name.clone(),
                is_file,
                description: prop.description.clone(),
                required: required_set.contains(name.as_str()),
                content_type,
            }
        })
        .collect();
    fields.sort_by(|a, b| a.wire_name.cmp(&b.wire_name));
    fields
}

/// Determine whether a multipart property is a file upload and its content type.
fn classify_multipart_property(
    prop: &OpenApiSchemaObject,
    component_schemas: &HashMap<String, OpenApiSchemaObject>,
) -> (bool, Option<String>) {
    // Resolve $ref if present.
    let resolved = if let Some(ref_path) = &prop.schema_ref {
        let name = strip_ref_prefix(ref_path);
        component_schemas.get(&name).unwrap_or(prop)
    } else {
        prop
    };

    let ty = resolved.schema_type();
    let fmt = resolved.format.as_deref();

    // `type: string, format: binary` or legacy `type: file`
    if (ty == Some("string") && fmt == Some("binary")) || ty == Some("file") {
        let ct = Some("application/octet-stream".to_string());
        return (true, ct);
    }

    // Array of binary files (e.g. `type: array, items: { type: string, format: binary }`)
    if ty == Some("array") {
        if let Some(items) = &resolved.items {
            if (items.schema_type() == Some("string")
                && items.format.as_deref() == Some("binary"))
                || items.schema_type() == Some("file")
            {
                return (true, Some("application/octet-stream".to_string()));
            }
        }
    }

    (false, None)
}

/// Recursively walk an object schema and emit one body-located [`MethodParameter`]
/// per property, up to `MAX_BODY_DEPTH` levels deep. Nested object properties
/// use dotted keys (e.g. `"name.first"`). Array properties set `repeated: true`
/// so the command builder renders `ArgAction::Append`. Read-only properties are
/// skipped. Non-object schemas at the root return an empty map.
fn flatten_body_params(
    schema: &OpenApiSchemaObject,
    component_schemas: &HashMap<String, OpenApiSchemaObject>,
    depth: u8,
) -> HashMap<String, MethodParameter> {
    flatten_body_params_prefix(schema, component_schemas, depth, "")
}

/// True when the schema admits JSON `null` *and* its base type is a scalar
/// the CLI lowers to a single flag (`string` / `integer` / `number` /
/// `boolean`). Composite types (`array`, `object`) stay false even when the
/// schema marks them nullable — see ADR-0003 for why the null-sentinel
/// surface is scalar-only.
fn is_scalar_nullable(obj: &OpenApiSchemaObject) -> bool {
    if !obj.is_nullable() {
        return false;
    }
    matches!(
        obj.schema_type(),
        Some("string") | Some("integer") | Some("number") | Some("boolean"),
    )
}

/// Recognize the "nullable union" composition shape from ADR-0005:
/// `oneOf` or `anyOf` with **exactly one** null-sentinel branch and **all
/// other branches** reducing to the same scalar base type. Returns
/// `Some(base_type)` on a match so the caller can promote the schema to a
/// nullable scalar — same downstream path as ADR-0003's intrinsic
/// nullability — or `None` when the composition is a true union, doesn't
/// have a null branch, or mixes scalar types.
///
/// Non-null branches may be inline (`{type: scalar}`) or a `$ref` resolving
/// through `component_schemas` to a scalar component. `allOf` is never
/// promoted (intersection with null has no inhabitants).
fn recognize_nullable_union(
    obj: &OpenApiSchemaObject,
    component_schemas: &HashMap<String, OpenApiSchemaObject>,
) -> Option<&'static str> {
    // Pick the composition list. `oneOf` and `anyOf` are treated
    // identically for nullable-union purposes — the JSON Schema distinction
    // (exactly-one vs at-least-one branch matches) is irrelevant when the
    // shape is `T | null`. See ADR-0005, "Negative" #3.
    let branches: &[OpenApiSchemaObject] = if !obj.one_of.is_empty() {
        &obj.one_of
    } else if !obj.any_of.is_empty() {
        &obj.any_of
    } else {
        return None;
    };

    if branches.len() < 2 {
        return None;
    }

    let mut null_count: usize = 0;
    let mut base_type: Option<&'static str> = None;

    for branch in branches {
        if is_null_sentinel(branch) {
            null_count += 1;
            continue;
        }
        let resolved = resolve_branch_scalar_type(branch, component_schemas)?;
        match base_type {
            None => base_type = Some(resolved),
            Some(existing) if existing == resolved => {}
            // Mixed scalar types — true union, not nullable. Bail.
            Some(_) => return None,
        }
    }

    // Exactly one null branch. Multiple nulls is a malformed spec; zero is
    // not a nullable union at all.
    if null_count != 1 {
        return None;
    }
    base_type
}

/// True when this composition branch is the "null branch" of a nullable
/// union: either `{type: 'null'}` / `{type: ['null']}` (3.1) or a bare
/// `{nullable: true}` with no other type-bearing fields (3.0 idiom).
fn is_null_sentinel(obj: &OpenApiSchemaObject) -> bool {
    if obj.schema_ref.is_some() {
        return false;
    }
    if obj.schema_type() == Some("null") {
        return true;
    }
    // 3.0 idiom: a branch with just `nullable: true` and no concrete type.
    obj.is_nullable() && obj.schema_type().is_none()
}

/// If `branch` resolves to one of the four scalar base types the null
/// sentinel surface supports, return that type. `$ref` branches resolve
/// one level through `component_schemas` — nested resolution (ref → ref →
/// scalar) is not supported; that pattern is rare and adds graph-walking
/// complexity to a recognizer that should fail-closed.
fn resolve_branch_scalar_type(
    branch: &OpenApiSchemaObject,
    component_schemas: &HashMap<String, OpenApiSchemaObject>,
) -> Option<&'static str> {
    let schema = if let Some(ref_path) = &branch.schema_ref {
        let name = strip_ref_prefix(ref_path);
        component_schemas.get(&name)?
    } else {
        branch
    };
    match schema.schema_type()? {
        "string" => Some("string"),
        "integer" => Some("integer"),
        "number" => Some("number"),
        "boolean" => Some("boolean"),
        _ => None,
    }
}

/// Maximum depth of `$ref` chain resolution. Prevents infinite loops from
/// cyclic `$ref` chains (e.g. `A: {$ref: B}`, `B: {$ref: A}`).
const MAX_REF_CHAIN_DEPTH: u8 = 8;

/// Follow a `$ref` chain through `component_schemas` until reaching a
/// terminal schema (one without a `$ref`). Returns `None` if the chain
/// is unresolvable or exceeds `MAX_REF_CHAIN_DEPTH`.
fn resolve_ref_chain<'a>(
    schema: &'a OpenApiSchemaObject,
    component_schemas: &'a HashMap<String, OpenApiSchemaObject>,
) -> Option<&'a OpenApiSchemaObject> {
    let mut current = schema;
    for _ in 0..MAX_REF_CHAIN_DEPTH {
        match &current.schema_ref {
            Some(ref_path) => {
                let name = strip_ref_prefix(ref_path);
                current = component_schemas.get(&name)?;
            }
            None => return Some(current),
        }
    }
    if current.schema_ref.is_none() {
        return Some(current);
    }
    tracing::warn!("$ref chain exceeded {MAX_REF_CHAIN_DEPTH} levels; likely cyclic");
    None
}

/// Recognize a `oneOf` / `anyOf` union where one branch is a scalar type `T`
/// and another is `type: array` with `items.type: T`. This pattern
/// (e.g. `Addresses: oneOf [string, array<string>]`) should surface as a
/// repeated flag so the CLI accepts both single values and JSON arrays.
/// Returns `Some(element_type)` when the union matches, `None` otherwise.
fn recognize_scalar_or_array_union<'a>(
    obj: &'a OpenApiSchemaObject,
    component_schemas: &'a HashMap<String, OpenApiSchemaObject>,
) -> Option<&'a str> {
    let branches: &[OpenApiSchemaObject] = if !obj.one_of.is_empty() {
        &obj.one_of
    } else if !obj.any_of.is_empty() {
        &obj.any_of
    } else {
        return None;
    };

    if branches.len() < 2 {
        return None;
    }

    let mut scalar_type: Option<&str> = None;
    let mut array_item_type: Option<&str> = None;

    for branch in branches {
        let resolved = if let Some(ref_path) = &branch.schema_ref {
            let name = strip_ref_prefix(ref_path);
            component_schemas.get(&name)?
        } else {
            branch
        };

        if is_null_sentinel(resolved) {
            continue;
        }

        match resolved.schema_type() {
            Some("array") => {
                let item_type = resolved
                    .items
                    .as_ref()
                    .and_then(|it| it.schema_type());
                match item_type {
                    Some(t) => {
                        if array_item_type.is_some() {
                            return None; // multiple array branches
                        }
                        array_item_type = Some(t);
                    }
                    None => return None,
                }
            }
            Some(t) if t != "object" => {
                if scalar_type.is_some() {
                    return None; // multiple scalar branches
                }
                scalar_type = Some(t);
            }
            _ => return None,
        }
    }

    match (scalar_type, array_item_type) {
        (Some(s), Some(a)) if s == a => Some(s),
        _ => None,
    }
}

/// Maximum depth of consecutive `allOf` recursion. Cyclic `$ref` chains
/// (`Foo: {allOf: [{$ref: Foo}, ...]}`) are degenerate but legal; this cap
/// stops the walk before it explodes. Distinct from `MAX_BODY_DEPTH`,
/// which counts *user-visible* nesting (dot-notation depth). `allOf` is
/// transparent to the user, so it gets its own bound — see ADR-0004.
///
/// **Keep in sync with `MAX_ALL_OF_DEPTH_VALIDATOR` in
/// `src/openapi/executor.rs`.** The two paths can't share the constant
/// directly per AGENTS.md (parser and validator are deliberately
/// independent module surfaces) but the value must match so a spec that
/// the parser tolerates is also tolerable to the validator.
const MAX_ALL_OF_DEPTH: u8 = 8;

/// Walk `schema.allOf` recursively and return the merged property bag
/// plus the union of every branch's `required:` array, including the
/// schema's own `properties:` and `required:`. Each `allOf` branch
/// contributes its own properties (recursively, resolving `$ref` through
/// `component_schemas`); duplicate property names follow last-branch-wins
/// with a `tracing::warn!` so silently-overlapping specs surface.
///
/// Returns `None` when `schema.all_of` is empty — the caller iterates
/// `schema.properties` directly without paying for a HashMap clone of
/// the existing property bag. Box's ~163 operations exercise this fast
/// path on every operation whose body isn't an `allOf` composition.
fn merge_all_of_properties(
    schema: &OpenApiSchemaObject,
    component_schemas: &HashMap<String, OpenApiSchemaObject>,
) -> Option<(HashMap<String, OpenApiSchemaObject>, std::collections::HashSet<String>)> {
    if schema.all_of.is_empty() {
        return None;
    }
    let mut props: HashMap<String, OpenApiSchemaObject> = HashMap::new();
    let mut required: std::collections::HashSet<String> = std::collections::HashSet::new();
    walk_all_of(&mut props, &mut required, schema, component_schemas, 0);
    Some((props, required))
}

fn walk_all_of(
    props: &mut HashMap<String, OpenApiSchemaObject>,
    required: &mut std::collections::HashSet<String>,
    schema: &OpenApiSchemaObject,
    component_schemas: &HashMap<String, OpenApiSchemaObject>,
    depth: u8,
) {
    if depth >= MAX_ALL_OF_DEPTH {
        tracing::warn!(
            "allOf recursion exceeded {MAX_ALL_OF_DEPTH} levels; truncating. Likely a cyclic $ref chain."
        );
        return;
    }
    // Branches first (in declaration order); the schema's own properties
    // come last so they act as the final overlay, matching the
    // last-branch-wins convention from ADR-0004.
    for branch in &schema.all_of {
        if let Some(ref_path) = &branch.schema_ref {
            let name = strip_ref_prefix(ref_path);
            match component_schemas.get(&name) {
                Some(resolved) => walk_all_of(props, required, resolved, component_schemas, depth + 1),
                None => tracing::warn!("allOf branch references unresolvable schema: {ref_path}"),
            }
        } else {
            walk_all_of(props, required, branch, component_schemas, depth + 1);
        }
    }
    for (name, prop) in &schema.properties {
        if props.contains_key(name) {
            tracing::warn!(
                "allOf merge: property '{name}' declared by multiple branches; last-branch-wins"
            );
        }
        props.insert(name.clone(), prop.clone());
    }
    for r in &schema.required {
        required.insert(r.clone());
    }
}

fn flatten_body_params_prefix(
    schema: &OpenApiSchemaObject,
    component_schemas: &HashMap<String, OpenApiSchemaObject>,
    depth: u8,
    prefix: &str,
) -> HashMap<String, MethodParameter> {
    let mut out = HashMap::new();
    // Entry condition: standard object body, or a root-level `allOf:`
    // composition (no `type:` declared, but the branches contribute the
    // property set). Without the `allOf` clause an `allOf`-bodied
    // operation would silently produce zero flags. See ADR-0004 §
    // "Root-level vs property-level".
    let has_all_of = !schema.all_of.is_empty();
    if depth >= MAX_BODY_DEPTH || (schema.schema_type() != Some("object") && !has_all_of) {
        return out;
    }

    // `merge_all_of_properties` returns `None` when there's no `allOf`,
    // so the non-composition path iterates `schema.properties` directly
    // without paying for a HashMap clone. See ADR-0004.
    let merged = merge_all_of_properties(schema, component_schemas);
    let (properties, required): (
        &HashMap<String, OpenApiSchemaObject>,
        std::collections::HashSet<&str>,
    ) = match &merged {
        Some((p, r)) => (p, r.iter().map(String::as_str).collect()),
        None => (
            &schema.properties,
            schema.required.iter().map(String::as_str).collect(),
        ),
    };

    for (name, prop) in properties {
        if prop.read_only {
            continue;
        }
        let full_key = if prefix.is_empty() {
            name.clone()
        } else {
            format!("{prefix}.{name}")
        };

        // $ref property: resolve from component_schemas before checking type.
        // Follow ref chains (A → B → C) to reach the terminal schema.
        if let Some(ref_path) = &prop.schema_ref {
            let ref_name = strip_ref_prefix(ref_path);
            let direct_resolved = component_schemas.get(&ref_name);
            let resolved = direct_resolved.and_then(|s| resolve_ref_chain(s, component_schemas));
            if let Some(resolved) = resolved {
                // Recurse for object-shaped *or* allOf-shaped resolved
                // schemas — the latter is the inheritance pattern
                // (`Mixin: {allOf: [Base, extras]}`) Box uses heavily.
                if resolved.schema_type() == Some("object") || !resolved.all_of.is_empty() {
                    let nested = flatten_body_params_prefix(resolved, component_schemas, depth + 1, &full_key);
                    if !nested.is_empty() {
                        out.extend(nested);
                        out.insert(
                            full_key.clone(),
                            MethodParameter {
                                param_type: Some("object".to_string()),
                                location: Some("body".to_string()),
                                required: false,
                                description: prop
                                    .description
                                    .clone()
                                    .or_else(|| resolved.description.clone()),
                                ..Default::default()
                            },
                        );
                        continue;
                    }
                }
                // Recognize oneOf/anyOf [T, array<T>] unions and emit as a
                // repeated flag so the executor JSON-parses array inputs
                // instead of passing them as literal strings.
                if let Some(element_type) = recognize_scalar_or_array_union(resolved, component_schemas) {
                    let const_default = const_default_value(resolved);
                    let has_null_branch = resolved.one_of.iter()
                        .chain(resolved.any_of.iter())
                        .any(|b| {
                            let eff = b.schema_ref.as_ref().and_then(|r| {
                                component_schemas.get(&strip_ref_prefix(r))
                            }).unwrap_or(b);
                            is_null_sentinel(eff)
                        });
                    out.insert(
                        full_key,
                        MethodParameter {
                            param_type: Some(element_type.to_string()),
                            description: prop.description.clone().or_else(|| resolved.description.clone()),
                            location: Some("body".to_string()),
                            required: required.contains(name.as_str()) && const_default.is_none(),
                            format: resolved.format.clone(),
                            default_value: const_default,
                            repeated: true,
                            scalar_or_array: true,
                            nullable: resolved.is_nullable() || has_null_branch,
                            ..Default::default()
                        },
                    );
                    continue;
                }
                // Non-object ref or empty recursion — emit with resolved type.
                // Promote nullable-union compositions to a scalar flag
                // routed through ADR-0003's sentinel; see ADR-0005.
                let promoted_scalar = recognize_nullable_union(resolved, component_schemas);
                let is_array = resolved.schema_type() == Some("array");
                let const_default = const_default_value(resolved);
                out.insert(
                    full_key,
                    MethodParameter {
                        param_type: if is_array {
                            Some("string".to_string())
                        } else if let Some(t) = promoted_scalar {
                            Some(t.to_string())
                        } else {
                            resolved.schema_type().map(str::to_string)
                        },
                        description: prop.description.clone().or_else(|| resolved.description.clone()),
                        location: Some("body".to_string()),
                        // A `const` makes the field effectively optional: the
                        // value is fixed, so we auto-inject it via default_value
                        // when omitted. Spec's `required:` only matters when the
                        // user could meaningfully choose to omit a value.
                        required: required.contains(name.as_str()) && const_default.is_none(),
                        format: resolved.format.clone(),
                        enum_values: effective_enum_values(resolved),
                        default_value: const_default,
                        repeated: is_array,
                        nullable: is_scalar_nullable(resolved) || promoted_scalar.is_some(),
                        ..Default::default()
                    },
                );
            }
            // Unresolvable $ref — skip rather than emitting a typeless flag.
            continue;
        }

        let prop_type = prop.schema_type();

        // Nested object *or* property-level allOf: recurse to emit
        // dot-notation flags. If nothing comes back (no sub-properties
        // or depth limit hit), fall through to the default insert below.
        if prop_type == Some("object") || !prop.all_of.is_empty() {
            let nested = flatten_body_params_prefix(prop, component_schemas, depth + 1, &full_key);
            if !nested.is_empty() {
                out.extend(nested);
                out.insert(
                    full_key.clone(),
                    MethodParameter {
                        param_type: Some("object".to_string()),
                        location: Some("body".to_string()),
                        required: false,
                        description: prop.description.clone(),
                        ..Default::default()
                    },
                );
                continue;
            }
        }

        // Recognize inline oneOf/anyOf [T, array<T>] unions.
        if let Some(element_type) = recognize_scalar_or_array_union(prop, component_schemas) {
            let const_default = const_default_value(prop);
            let has_null_branch = prop.one_of.iter()
                .chain(prop.any_of.iter())
                .any(|b| {
                    let eff = b.schema_ref.as_ref().and_then(|r| {
                        component_schemas.get(&strip_ref_prefix(r))
                    }).unwrap_or(b);
                    is_null_sentinel(eff)
                });
            out.insert(
                full_key,
                MethodParameter {
                    param_type: Some(element_type.to_string()),
                    description: prop.description.clone(),
                    location: Some("body".to_string()),
                    required: required.contains(name.as_str()) && const_default.is_none(),
                    format: prop.format.clone(),
                    default_value: const_default,
                    repeated: true,
                    scalar_or_array: true,
                    nullable: prop.is_nullable() || has_null_branch,
                    ..Default::default()
                },
            );
            continue;
        }

        // Promote nullable-union compositions (`anyOf: [scalar, null]`
        // or the same shape with `oneOf`) to a nullable scalar flag.
        // Returns None when the composition is a true union or absent.
        let promoted_scalar = recognize_nullable_union(prop, component_schemas);
        let is_array = prop_type == Some("array");
        let const_default = const_default_value(prop);
        out.insert(
            full_key,
            MethodParameter {
                param_type: if is_array {
                    Some("string".to_string())
                } else if let Some(t) = promoted_scalar {
                    Some(t.to_string())
                } else {
                    prop_type.map(str::to_string)
                },
                description: prop.description.clone(),
                location: Some("body".to_string()),
                required: required.contains(name.as_str()) && const_default.is_none(),
                format: prop.format.clone(),
                enum_values: effective_enum_values(prop),
                default_value: const_default,
                repeated: is_array,
                nullable: is_scalar_nullable(prop) || promoted_scalar.is_some(),
                ..Default::default()
            },
        );
    }
    out
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_convert_parameter_lowers_schema_min_max_into_method_parameter() {
        // Parser must read `minimum:` / `maximum:` from the parameter's
        // schema into MethodParameter — otherwise the new f64-typed
        // fields are unreachable from real specs and ADR-0006's
        // per-property bound promise only holds for body fields.
        let raw = r#"
            name: limit
            in: query
            schema:
                type: integer
                minimum: 1
                maximum: 100
        "#;
        let p: OpenApiParameter = serde_yaml::from_str(raw).unwrap();
        let (name, mp) = convert_parameter(&p, None);
        assert_eq!(name, "limit");
        assert_eq!(mp.minimum, Some(1.0), "minimum must lower from schema");
        assert_eq!(mp.maximum, Some(100.0), "maximum must lower from schema");
    }

    #[test]
    fn test_camel_to_kebab() {
        assert_eq!(camel_to_kebab("scheduledEvents"), "scheduled-events");
        assert_eq!(camel_to_kebab("eventTypes"), "event-types");
        assert_eq!(camel_to_kebab("users"), "users");
        assert_eq!(camel_to_kebab("dataCompliance"), "data-compliance");
        assert_eq!(camel_to_kebab("ABC"), "a-b-c");
        // Tags from OpenAPI specs often contain spaces or hyphens — these
        // should collapse to a single hyphen, not preserve a space before
        // the next word's leading character.
        assert_eq!(camel_to_kebab("Channel Settings"), "channel-settings");
        assert_eq!(camel_to_kebab("Attribute Values"), "attribute-values");
        assert_eq!(camel_to_kebab("Metafields Batch"), "metafields-batch");
        assert_eq!(camel_to_kebab("foo--bar"), "foo-bar");
        assert_eq!(camel_to_kebab("CustomerList"), "customer-list");
    }

    /// Locks `build.rs::to_kebab` and `parser.rs::camel_to_kebab` to the
    /// same output. They must be byte-for-byte equivalent so the smoke-test
    /// constants emitted by build.rs match what the parser produces at
    /// runtime. If this test fails after a build.rs edit, sync the two impls.
    #[test]
    fn test_build_rs_to_kebab_matches_parser_camel_to_kebab() {
        // Inline copy of build.rs::to_kebab — drift here is the whole point
        // of the test, so we can't just call it.
        fn build_rs_to_kebab(s: &str) -> String {
            let mut result = String::with_capacity(s.len() + 4);
            for ch in s.chars() {
                if !ch.is_ascii_alphanumeric() {
                    if !result.is_empty() && !result.ends_with('-') {
                        result.push('-');
                    }
                } else if ch.is_uppercase() {
                    if !result.is_empty() && !result.ends_with('-') {
                        result.push('-');
                    }
                    result.push(ch.to_lowercase().next().unwrap());
                } else {
                    result.push(ch);
                }
            }
            while result.ends_with('-') {
                result.pop();
            }
            result
        }
        for case in [
            "scheduledEvents",
            "Metadata taxonomies",  // hit the bug that started this
            "Channel Settings",
            "foo--bar",
            "CustomerList",
            "ABC",
            "with.dot.separators",
            "trailing---dashes-",
            "leading---dashes",
            "_leading_underscore",
        ] {
            assert_eq!(
                build_rs_to_kebab(case),
                camel_to_kebab(case),
                "drift between build.rs::to_kebab and parser::camel_to_kebab for input {case:?}"
            );
        }
    }

    #[test]
    fn test_tokenize_camel_and_other() {
        // camelCase: split on capitals
        assert_eq!(tokenize("getCustomers"), vec!["get", "customers"]);
        assert_eq!(tokenize("customersList"), vec!["customers", "list"]);
        // snake_case / spaces / mixed: split on non-alphanumeric
        assert_eq!(tokenize("customer_addresses"), vec!["customer", "addresses"]);
        assert_eq!(tokenize("Customer Addresses"), vec!["customer", "addresses"]);
        // already a single token
        assert_eq!(tokenize("customers"), vec!["customers"]);
    }

    #[test]
    fn test_strip_tag_prefix_strips_when_op_starts_with_tag() {
        // Fern parity: `Customers` tag + `customersList` operationId → `list`.
        assert_eq!(strip_tag_prefix("customersList", "Customers"), "list");
        // Multi-token tag ("Customer Addresses") matches multi-token op prefix.
        assert_eq!(
            strip_tag_prefix("customerAddressesList", "Customer Addresses"),
            "list"
        );
    }

    #[test]
    fn test_strip_tag_prefix_no_strip_when_no_overlap() {
        // BigCommerce-style: op `getCustomers` doesn't start with tag tokens.
        assert_eq!(strip_tag_prefix("getCustomers", "Customers"), "getCustomers");
    }

    #[test]
    fn test_method_name_strips_tag_prefix_with_tag_grouping() {
        // Tag-driven group + operationId starts with tag → method = remainder.
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://x.com" }]
paths:
  /customers:
    get:
      tags: [Customers]
      operationId: customersList
      responses: { "200": { description: ok } }
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        let customers = &doc.resources["customers"];
        assert!(customers.methods.contains_key("list"), "method should be `list` after strip");
    }

    #[test]
    fn test_method_name_keeps_operation_id_when_no_tag_overlap() {
        // BigCommerce-shape: operationId doesn't start with tag → method
        // stays as full kebab'd operationId. Matches Fern's behavior.
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://x.com" }]
paths:
  /customers:
    get:
      tags: [Customers]
      operationId: getCustomers
      responses: { "200": { description: ok } }
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        let customers = &doc.resources["customers"];
        assert!(customers.methods.contains_key("get-customers"));
    }

    #[test]
    fn test_binary_request_body_flag_name_defaults_to_file_for_format_binary() {
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://x.com" }]
paths:
  /upload:
    post:
      x-fern-sdk-group-name: files
      x-fern-sdk-method-name: upload
      operationId: uploadFile
      requestBody:
        content:
          application/octet-stream:
            schema:
              type: string
              format: binary
      responses: { "200": { description: ok } }
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        let upload = &doc.resources["files"].methods["upload"];
        let binary = upload.binary_request_body.as_ref().unwrap();
        assert_eq!(binary.content_type, "application/octet-stream");
        assert_eq!(binary.flag_name, "file");
    }

    #[test]
    fn test_binary_request_body_honors_x_fern_parameter_name() {
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://x.com" }]
paths:
  /audio:
    post:
      x-fern-sdk-group-name: audio
      x-fern-sdk-method-name: send
      operationId: sendAudio
      requestBody:
        x-fern-parameter-name: audioFile
        content:
          audio/mpeg:
            schema:
              type: string
              format: binary
      responses: { "200": { description: ok } }
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        let send = &doc.resources["audio"].methods["send"];
        let binary = send.binary_request_body.as_ref().unwrap();
        assert_eq!(binary.content_type, "audio/mpeg");
        assert_eq!(binary.flag_name, "audio-file");
    }

    #[test]
    fn test_binary_request_body_defaults_to_body_when_not_binary_format() {
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://x.com" }]
paths:
  /text:
    post:
      x-fern-sdk-group-name: text
      x-fern-sdk-method-name: send
      operationId: sendText
      requestBody:
        content:
          text/plain:
            schema:
              type: string
      responses: { "200": { description: ok } }
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        let send = &doc.resources["text"].methods["send"];
        let binary = send.binary_request_body.as_ref().unwrap();
        assert_eq!(binary.content_type, "text/plain");
        assert_eq!(binary.flag_name, "body");
    }

    #[test]
    fn test_has_binary_response_true_for_audio_2xx() {
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://x.com" }]
paths:
  /tts:
    post:
      x-fern-sdk-group-name: tts
      x-fern-sdk-method-name: convert
      operationId: convertTts
      responses:
        "200":
          description: ok
          content:
            audio/mpeg:
              schema: { type: string, format: binary }
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        let convert = &doc.resources["tts"].methods["convert"];
        assert!(
            convert.has_binary_response,
            "audio/mpeg 2xx should flip has_binary_response on"
        );
    }

    #[test]
    fn test_has_binary_response_false_for_json_only_2xx() {
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://x.com" }]
paths:
  /models:
    get:
      x-fern-sdk-group-name: models
      x-fern-sdk-method-name: list
      operationId: listModels
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema: { type: array, items: { type: object } }
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        let list = &doc.resources["models"].methods["list"];
        assert!(
            !list.has_binary_response,
            "JSON-only 2xx must NOT flip has_binary_response on"
        );
    }

    #[test]
    fn test_has_binary_response_mixed_binary_2xx_and_json_4xx() {
        // The edge case the user called out: a 2xx that returns audio and
        // a 4xx that returns JSON-shaped errors must still surface --output
        // because the success path is what writes the file.
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://x.com" }]
paths:
  /tts:
    post:
      x-fern-sdk-group-name: tts
      x-fern-sdk-method-name: convert
      operationId: convertTts
      responses:
        "200":
          description: ok
          content:
            audio/mpeg:
              schema: { type: string, format: binary }
        "422":
          description: validation error
          content:
            application/json:
              schema: { type: object }
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        let convert = &doc.resources["tts"].methods["convert"];
        assert!(
            convert.has_binary_response,
            "mixed (audio 2xx + JSON 4xx) must keep --output available"
        );
    }

    #[test]
    fn test_has_binary_response_false_for_non_json_only_on_4xx() {
        // Symmetric inverse of the mixed case: a 4xx with a non-JSON shape
        // does NOT, on its own, make the operation binary — only 2xx
        // bodies are written via --output.
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://x.com" }]
paths:
  /models:
    get:
      x-fern-sdk-group-name: models
      x-fern-sdk-method-name: list
      operationId: listModels
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema: { type: object }
        "400":
          description: error
          content:
            text/plain:
              schema: { type: string }
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        let list = &doc.resources["models"].methods["list"];
        assert!(
            !list.has_binary_response,
            "text/plain on a 4xx must not flip the binary-response gate"
        );
    }

    #[test]
    fn test_has_binary_response_honors_2xx_wildcard() {
        // OpenAPI lets specs use a `2XX` wildcard instead of a specific
        // status code. The gate must treat that the same as `200`/`201`.
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://x.com" }]
paths:
  /download:
    get:
      x-fern-sdk-group-name: files
      x-fern-sdk-method-name: download
      operationId: downloadFile
      responses:
        "2XX":
          description: ok
          content:
            application/octet-stream:
              schema: { type: string, format: binary }
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        let dl = &doc.resources["files"].methods["download"];
        assert!(
            dl.has_binary_response,
            "the 2XX wildcard must be treated as a success status"
        );
    }

    #[test]
    fn test_has_binary_response_false_for_empty_responses() {
        // No declared response media types → can't know, default to false.
        // The runtime still honors the actual Content-Type when the request
        // is made, but the help surface shouldn't advertise --output
        // speculatively for ops that don't declare any body shape.
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://x.com" }]
paths:
  /ping:
    get:
      x-fern-sdk-group-name: ops
      x-fern-sdk-method-name: ping
      operationId: ping
      responses:
        "204":
          description: no content
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        let ping = &doc.resources["ops"].methods["ping"];
        assert!(
            !ping.has_binary_response,
            "204 No Content has no body — --output is meaningless, gate stays off"
        );
    }

    #[test]
    fn test_multipart_form_data_fields_parsed() {
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://x.com" }]
paths:
  /uploads:
    post:
      x-fern-sdk-group-name: uploads
      x-fern-sdk-method-name: create
      operationId: uploadsCreate
      requestBody:
        content:
          multipart/form-data:
            schema:
              type: object
              required: [file]
              properties:
                file:
                  type: string
                  format: binary
                  description: The file to upload
                purpose:
                  type: string
                  description: Purpose of the upload
      responses: { "201": { description: ok } }
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        let create = &doc.resources["uploads"].methods["create"];
        assert_eq!(create.multipart_fields.len(), 2);

        let file_field = create
            .multipart_fields
            .iter()
            .find(|f| f.wire_name == "file")
            .expect("file field missing");
        assert!(file_field.is_file);
        assert!(file_field.required);
        assert_eq!(
            file_field.description.as_deref(),
            Some("The file to upload")
        );

        let purpose_field = create
            .multipart_fields
            .iter()
            .find(|f| f.wire_name == "purpose")
            .expect("purpose field missing");
        assert!(!purpose_field.is_file);
        assert!(!purpose_field.required);
    }

    #[test]
    fn test_multipart_form_data_with_ref_schema() {
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://x.com" }]
paths:
  /files:
    post:
      x-fern-sdk-group-name: files
      x-fern-sdk-method-name: upload
      operationId: filesUpload
      requestBody:
        content:
          multipart/form-data:
            schema:
              $ref: '#/components/schemas/FileUpload'
      responses: { "200": { description: ok } }
components:
  schemas:
    FileUpload:
      type: object
      required: [content]
      properties:
        content:
          type: string
          format: binary
        label:
          type: string
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        let upload = &doc.resources["files"].methods["upload"];
        assert_eq!(upload.multipart_fields.len(), 2);

        let content = upload
            .multipart_fields
            .iter()
            .find(|f| f.wire_name == "content")
            .expect("content field missing");
        assert!(content.is_file);
        assert!(content.required);

        let label = upload
            .multipart_fields
            .iter()
            .find(|f| f.wire_name == "label")
            .expect("label field missing");
        assert!(!label.is_file);
        assert!(!label.required);
    }

    #[test]
    fn test_multipart_encoding_content_type_overrides_inferred() {
        // The OpenAPI `encoding` object pins a per-part Content-Type that
        // wins over the schema-inferred default: here `metadata` is a plain
        // string (would default to a text part) but is declared
        // `application/json`, and the file part's octet-stream default is
        // overridden to `image/png`.
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://x.com" }]
paths:
  /uploads:
    post:
      x-fern-sdk-group-name: uploads
      x-fern-sdk-method-name: create
      operationId: uploadsCreate
      requestBody:
        content:
          multipart/form-data:
            schema:
              type: object
              properties:
                file:
                  type: string
                  format: binary
                metadata:
                  type: string
            encoding:
              file:
                contentType: image/png
              metadata:
                contentType: application/json
      responses: { "201": { description: ok } }
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        let create = &doc.resources["uploads"].methods["create"];

        let file_field = create
            .multipart_fields
            .iter()
            .find(|f| f.wire_name == "file")
            .expect("file field missing");
        assert!(file_field.is_file);
        assert_eq!(
            file_field.content_type.as_deref(),
            Some("image/png"),
            "encoding.contentType should override the octet-stream default",
        );

        let metadata_field = create
            .multipart_fields
            .iter()
            .find(|f| f.wire_name == "metadata")
            .expect("metadata field missing");
        assert!(!metadata_field.is_file);
        assert_eq!(
            metadata_field.content_type.as_deref(),
            Some("application/json"),
            "a text part can carry a per-part Content-Type via encoding",
        );
    }

    #[test]
    fn test_multipart_file_part_defaults_to_octet_stream_without_encoding() {
        // Absent an `encoding` entry, a binary part keeps the OpenAPI
        // default content type and a text part stays untyped (None →
        // reqwest's text/plain at send time).
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://x.com" }]
paths:
  /uploads:
    post:
      x-fern-sdk-group-name: uploads
      x-fern-sdk-method-name: create
      operationId: uploadsCreate
      requestBody:
        content:
          multipart/form-data:
            schema:
              type: object
              properties:
                file:
                  type: string
                  format: binary
                note:
                  type: string
      responses: { "201": { description: ok } }
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        let create = &doc.resources["uploads"].methods["create"];

        let file_field = create
            .multipart_fields
            .iter()
            .find(|f| f.wire_name == "file")
            .unwrap();
        assert_eq!(
            file_field.content_type.as_deref(),
            Some("application/octet-stream"),
        );

        let note_field = create
            .multipart_fields
            .iter()
            .find(|f| f.wire_name == "note")
            .unwrap();
        assert_eq!(note_field.content_type, None);
    }

    #[test]
    fn test_multipart_does_not_produce_json_body() {
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://x.com" }]
paths:
  /uploads:
    post:
      x-fern-sdk-group-name: uploads
      x-fern-sdk-method-name: create
      operationId: uploadsCreate
      requestBody:
        content:
          multipart/form-data:
            schema:
              type: object
              properties:
                file:
                  type: string
                  format: binary
      responses: { "200": { description: ok } }
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        let create = &doc.resources["uploads"].methods["create"];
        assert!(
            create.request.is_none(),
            "multipart ops should not have a JSON request schema"
        );
        assert!(
            create.binary_request_body.is_none(),
            "multipart ops should not have a binary_request_body"
        );
        assert!(
            !create.multipart_fields.is_empty(),
            "multipart ops should have multipart_fields"
        );
    }

    #[test]
    fn test_group_name_accepts_scalar_string() {
        // AssemblyAI and other Fern specs write `x-fern-sdk-group-name: transcripts`
        // as a bare string; the parser should accept it as a single-element list.
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://x.com" }]
paths:
  /transcripts:
    get:
      x-fern-sdk-group-name: transcripts
      x-fern-sdk-method-name: list
      operationId: listTranscripts
      responses: { "200": { description: ok } }
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        assert!(doc.resources.contains_key("transcripts"));
        assert!(doc.resources["transcripts"].methods.contains_key("list"));
    }

    #[test]
    fn test_method_name_skips_strip_when_explicit_group_name() {
        // x-fern-sdk-group-name is the source of truth; tag-driven strip is
        // bypassed so the operationId surfaces verbatim.
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://x.com" }]
paths:
  /customers:
    get:
      tags: [Customers]
      x-fern-sdk-group-name: ["customers"]
      operationId: customersList
      responses: { "200": { description: ok } }
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        let customers = &doc.resources["customers"];
        assert!(
            customers.methods.contains_key("customers-list"),
            "explicit group-name disables tag-prefix strip"
        );
    }

    #[test]
    fn test_nested_group_names() {
        let yaml = r#"
openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
servers:
  - url: https://api.example.com
paths:
  /parent/{id}/child:
    get:
      operationId: get-child
      summary: Get a child resource
      x-fern-sdk-group-name:
        - parent
        - child
      x-fern-sdk-method-name: get-child
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: OK
"#;
        let doc = load_openapi_spec(yaml, "test").unwrap();
        assert!(doc.resources.contains_key("parent"));
        let parent = &doc.resources["parent"];
        assert!(parent.methods.is_empty());
        assert!(parent.resources.contains_key("child"));
        let child = &parent.resources["child"];
        assert!(child.methods.contains_key("get-child"));
    }

    // -----------------------------------------------------------------
    // x-fern-ignore — operation-level + parameter-level
    // -----------------------------------------------------------------

    #[test]
    fn test_x_fern_ignore_drops_operation() {
        let yaml = r#"
openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
servers:
  - url: https://api.example.com
paths:
  /users:
    get:
      operationId: users-list
      x-fern-sdk-group-name: ["users"]
      x-fern-sdk-method-name: list
      x-fern-ignore: true
      responses:
        '200':
          description: OK
"#;
        let doc = load_openapi_spec(yaml, "test").unwrap();
        assert!(
            !doc.resources.contains_key("users"),
            "ignored operation's group should be pruned when no other ops remain"
        );
    }

    #[test]
    fn test_x_fern_ignore_drops_parameter() {
        let yaml = r#"
openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
servers:
  - url: https://api.example.com
paths:
  /users:
    get:
      operationId: users-list
      x-fern-sdk-group-name: ["users"]
      x-fern-sdk-method-name: list
      parameters:
        - name: keep_me
          in: query
          schema:
            type: string
        - name: drop_me
          in: query
          x-fern-ignore: true
          schema:
            type: string
      responses:
        '200':
          description: OK
"#;
        let doc = load_openapi_spec(yaml, "test").unwrap();
        let list = &doc.resources["users"].methods["list"];
        assert!(
            list.parameters.contains_key("keep_me"),
            "non-ignored param should survive"
        );
        assert!(
            !list.parameters.contains_key("drop_me"),
            "ignored param should be absent from operation"
        );
    }

    #[test]
    fn test_x_fern_ignore_mixed_path_keeps_non_ignored_ops() {
        // Same path, two operations: GET is ignored, POST is kept.
        let yaml = r#"
openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
servers:
  - url: https://api.example.com
paths:
  /users:
    get:
      operationId: users-list
      x-fern-sdk-group-name: ["users"]
      x-fern-sdk-method-name: list
      x-fern-ignore: true
      responses:
        '200':
          description: OK
    post:
      operationId: users-create
      x-fern-sdk-group-name: ["users"]
      x-fern-sdk-method-name: create
      responses:
        '201':
          description: Created
"#;
        let doc = load_openapi_spec(yaml, "test").unwrap();
        let users = &doc.resources["users"];
        assert!(!users.methods.contains_key("list"), "ignored op absent");
        assert!(users.methods.contains_key("create"), "non-ignored op kept");
    }

    #[test]
    fn test_x_fern_ignore_prunes_empty_nested_group() {
        // A nested group whose only leaf is ignored should be pruned all the
        // way up — the empty parent group must not appear as a subcommand
        // with no children.
        let yaml = r#"
openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
servers:
  - url: https://api.example.com
paths:
  /parent/child:
    get:
      operationId: only-op
      x-fern-sdk-group-name: ["parent", "child"]
      x-fern-sdk-method-name: get
      x-fern-ignore: true
      responses:
        '200':
          description: OK
  /siblings:
    get:
      operationId: siblings-list
      x-fern-sdk-group-name: ["siblings"]
      x-fern-sdk-method-name: list
      responses:
        '200':
          description: OK
"#;
        let doc = load_openapi_spec(yaml, "test").unwrap();
        assert!(
            !doc.resources.contains_key("parent"),
            "empty parent group should be pruned after only child is ignored"
        );
        assert!(
            doc.resources.contains_key("siblings"),
            "unrelated groups must remain"
        );
    }

    #[test]
    fn test_x_fern_ignore_default_false_keeps_operation_and_parameter() {
        // Sanity check: omitting `x-fern-ignore` keeps the operation and
        // its parameters exactly as before — no behavior change for specs
        // that don't use the extension.
        let yaml = r#"
openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
servers:
  - url: https://api.example.com
paths:
  /users:
    get:
      operationId: users-list
      x-fern-sdk-group-name: ["users"]
      x-fern-sdk-method-name: list
      parameters:
        - name: filter
          in: query
          schema:
            type: string
      responses:
        '200':
          description: OK
"#;
        let doc = load_openapi_spec(yaml, "test").unwrap();
        let list = &doc.resources["users"].methods["list"];
        assert!(list.parameters.contains_key("filter"));
    }

    #[test]
    fn test_x_fern_ignore_at_parameter_ref_site_drops_parameter() {
        // Fern parity: when `x-fern-ignore: true` lives on the **ref-site**
        // object (alongside `$ref`), the parameter is dropped even when the
        // referenced component itself has no ignore flag. Mirrors fern's
        // openapi-ir-parser precedence:
        //   getExtension(parameter, IGNORE) ?? getExtension(resolvedParameter, IGNORE)
        // — ref-site wins, fallback to resolved. OpenAPI 3.1 explicitly
        // allows sibling fields next to `$ref`, and fern's overlay system
        // routinely places ignores at the ref site.
        let yaml = r#"
openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
servers:
  - url: https://api.example.com
paths:
  /users:
    get:
      operationId: users-list
      x-fern-sdk-group-name: ["users"]
      x-fern-sdk-method-name: list
      parameters:
        - $ref: '#/components/parameters/Filter'
          x-fern-ignore: true
        - $ref: '#/components/parameters/Cursor'
      responses:
        '200':
          description: OK
components:
  parameters:
    Filter:
      name: filter
      in: query
      schema:
        type: string
    Cursor:
      name: cursor
      in: query
      schema:
        type: string
"#;
        let doc = load_openapi_spec(yaml, "test").unwrap();
        let list = &doc.resources["users"].methods["list"];
        assert!(
            !list.parameters.contains_key("filter"),
            "ref-site x-fern-ignore should drop the parameter even when the resolved component has no flag"
        );
        assert!(
            list.parameters.contains_key("cursor"),
            "ref to a non-ignored component should still produce a parameter"
        );
    }

    #[test]
    fn test_x_fern_ignore_at_component_drops_parameter_via_any_ref() {
        // Mirror image of the ref-site test: when the **resolved component**
        // carries the ignore flag and the ref site does not, every $ref to
        // that component should drop the parameter. This is the fallback
        // half of fern's `??` precedence.
        let yaml = r#"
openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
servers:
  - url: https://api.example.com
paths:
  /users:
    get:
      operationId: users-list
      x-fern-sdk-group-name: ["users"]
      x-fern-sdk-method-name: list
      parameters:
        - $ref: '#/components/parameters/Legacy'
        - $ref: '#/components/parameters/Cursor'
      responses:
        '200':
          description: OK
components:
  parameters:
    Legacy:
      name: legacy
      in: query
      x-fern-ignore: true
      schema:
        type: string
    Cursor:
      name: cursor
      in: query
      schema:
        type: string
"#;
        let doc = load_openapi_spec(yaml, "test").unwrap();
        let list = &doc.resources["users"].methods["list"];
        assert!(
            !list.parameters.contains_key("legacy"),
            "component-level x-fern-ignore should drop the parameter when reached via $ref"
        );
        assert!(list.parameters.contains_key("cursor"));
    }

    // -----------------------------------------------------------------
    // x-fern-parameter-name — alias the CLI flag while keeping the
    // original wire name on the outgoing HTTP request. Mirrors fern's
    // openapi-ir-parser `parameterNameOverride` (see
    // packages/cli/api-importers/openapi/openapi-ir-parser/src/openapi/v3/converters/endpoint/convertParameters.ts).
    // -----------------------------------------------------------------

    #[test]
    fn test_x_fern_parameter_name_inline_sets_display_name() {
        // Canonical Fern example: a header parameter named `X-Fern-Version`
        // is renamed to `version` on the SDK / CLI surface. The map key
        // stays the wire name so the executor still sends it as a header
        // with the original name.
        let yaml = r#"
openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
servers:
  - url: https://api.example.com
paths:
  /things:
    get:
      operationId: things-list
      x-fern-sdk-group-name: ["things"]
      x-fern-sdk-method-name: list
      parameters:
        - name: X-Fern-Version
          in: header
          x-fern-parameter-name: version
          schema:
            type: string
      responses:
        '200':
          description: OK
"#;
        let doc = load_openapi_spec(yaml, "test").unwrap();
        let list = &doc.resources["things"].methods["list"];
        let p = list
            .parameters
            .get("X-Fern-Version")
            .expect("parameter should still be keyed by wire name");
        assert_eq!(
            p.display_name.as_deref(),
            Some("version"),
            "display_name should hold the x-fern-parameter-name alias"
        );
        assert_eq!(p.location.as_deref(), Some("header"));
    }

    #[test]
    fn test_x_fern_parameter_name_absent_leaves_display_name_none() {
        // Sanity: when the extension is absent, `display_name` stays
        // `None` so downstream code falls back to the wire name when
        // building the CLI flag.
        let yaml = r#"
openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
servers:
  - url: https://api.example.com
paths:
  /things:
    get:
      operationId: things-list
      x-fern-sdk-group-name: ["things"]
      x-fern-sdk-method-name: list
      parameters:
        - name: filter
          in: query
          schema:
            type: string
      responses:
        '200':
          description: OK
"#;
        let doc = load_openapi_spec(yaml, "test").unwrap();
        let list = &doc.resources["things"].methods["list"];
        let p = list.parameters.get("filter").expect("filter param missing");
        assert!(
            p.display_name.is_none(),
            "missing x-fern-parameter-name should leave display_name = None"
        );
    }

    #[test]
    fn test_x_fern_parameter_name_at_ref_site_wins_over_component() {
        // Ref-site precedence (matches the `??` chain fern uses for both
        // x-fern-ignore and x-fern-parameter-name). The component-level
        // alias is `legacyName`, but the ref-site override is `newName`
        // — the ref-site value wins.
        let yaml = r#"
openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
servers:
  - url: https://api.example.com
paths:
  /things:
    get:
      operationId: things-list
      x-fern-sdk-group-name: ["things"]
      x-fern-sdk-method-name: list
      parameters:
        - $ref: '#/components/parameters/LegacyParam'
          x-fern-parameter-name: newName
      responses:
        '200':
          description: OK
components:
  parameters:
    LegacyParam:
      name: legacy_param
      in: query
      x-fern-parameter-name: legacyName
      schema:
        type: string
"#;
        let doc = load_openapi_spec(yaml, "test").unwrap();
        let list = &doc.resources["things"].methods["list"];
        let p = list
            .parameters
            .get("legacy_param")
            .expect("wire name (param name) should still be the map key");
        assert_eq!(
            p.display_name.as_deref(),
            Some("newName"),
            "ref-site x-fern-parameter-name should win over the resolved component value"
        );
    }

    #[test]
    fn test_x_fern_parameter_name_falls_back_to_component_when_ref_site_absent() {
        // The fallback half of the `??` precedence: when the ref site has
        // no alias, the resolved component's `x-fern-parameter-name` is
        // used. This is the common case for shared parameter components.
        let yaml = r#"
openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
servers:
  - url: https://api.example.com
paths:
  /things:
    get:
      operationId: things-list
      x-fern-sdk-group-name: ["things"]
      x-fern-sdk-method-name: list
      parameters:
        - $ref: '#/components/parameters/SharedHeader'
      responses:
        '200':
          description: OK
components:
  parameters:
    SharedHeader:
      name: X-Fern-Version
      in: header
      x-fern-parameter-name: version
      schema:
        type: string
"#;
        let doc = load_openapi_spec(yaml, "test").unwrap();
        let list = &doc.resources["things"].methods["list"];
        let p = list
            .parameters
            .get("X-Fern-Version")
            .expect("wire name should be the map key");
        assert_eq!(
            p.display_name.as_deref(),
            Some("version"),
            "component-level x-fern-parameter-name should be honored when ref site has none"
        );
    }

    #[test]
    fn test_x_fern_parameter_name_kebab_normalization_via_commands_builder() {
        // The parser stores the raw alias as-is; kebab-casing is the
        // command builder's responsibility (see `to_kebab_flag` in
        // src/text.rs). This test pins the parser contract: the value
        // stored on `MethodParameter::display_name` must match what the
        // spec wrote, so the flag-builder can canonicalize it itself.
        let yaml = r#"
openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
servers:
  - url: https://api.example.com
paths:
  /things:
    get:
      operationId: things-list
      x-fern-sdk-group-name: ["things"]
      x-fern-sdk-method-name: list
      parameters:
        - name: X-Some-Wire-Header
          in: header
          x-fern-parameter-name: customerAccountId
          schema:
            type: string
      responses:
        '200':
          description: OK
"#;
        let doc = load_openapi_spec(yaml, "test").unwrap();
        let list = &doc.resources["things"].methods["list"];
        let p = &list.parameters["X-Some-Wire-Header"];
        // Raw value, exactly as the spec wrote it. `to_kebab_flag`
        // converts `customerAccountId` → `customer-account-id`.
        assert_eq!(p.display_name.as_deref(), Some("customerAccountId"));
        // And the unit test for kebab normalization itself already lives
        // in `src/text.rs` — see `test_to_kebab_flag`.
        assert_eq!(
            crate::text::to_kebab_flag(p.display_name.as_deref().unwrap()),
            "customer-account-id"
        );
    }

    // -----------------------------------------------------------------
    // x-fern-default vs. OpenAPI standard `default:`
    //
    // We split the two sources because they mean different things:
    //   * `x-fern-default` is a CLIENT-SIDE default — the CLI sends it
    //     on the wire when the user omits the flag, and it shows in
    //     `--help` via clap's `[default: ...]`. Stored on
    //     `MethodParameter::default_value`.
    //   * `default:` (OpenAPI standard) is a DOCUMENTATION HINT about
    //     server behavior. It is rendered as ` [API default: ...]` in
    //     `--help` but never sent on the wire. Stored on
    //     `MethodParameter::documentation_default_value`.
    //
    // Within `x-fern-default`, fern's openapi-ir-parser precedence
    // applies: ref-site beats the resolved component parameter, i.e.
    //   getExtension(parameter, FERN_DEFAULT)
    //     ?? getExtension(resolvedParameter, FERN_DEFAULT).
    //
    // When `x-fern-default` is present, the schema `default:` is
    // dropped from `documentation_default_value` too so `--help`
    // doesn't render two conflicting `[default: ...]` lines.
    // -----------------------------------------------------------------

    fn fern_default_yaml(parameters_block: &str) -> String {
        format!(
            r#"
openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
servers:
  - url: https://api.example.com
paths:
  /users:
    get:
      operationId: users-list
      x-fern-sdk-group-name: ["users"]
      x-fern-sdk-method-name: list
      parameters:
{parameters_block}
      responses:
        '200':
          description: OK
"#
        )
    }

    #[test]
    fn test_default_value_absent_when_no_default_anywhere() {
        // Sanity check: omitting both `default:` and `x-fern-default`
        // leaves both fields `None` — no clap default and no help-text
        // suffix get emitted.
        let yaml = fern_default_yaml(
            "        - name: cursor\n          in: query\n          schema:\n            type: string",
        );
        let doc = load_openapi_spec(&yaml, "t").unwrap();
        let cursor = doc.resources["users"].methods["list"]
            .parameters
            .get("cursor")
            .unwrap();
        assert!(cursor.default_value.is_none());
        assert!(cursor.documentation_default_value.is_none());
    }

    #[test]
    fn test_standard_openapi_default_lowers_as_documentation_only() {
        // OpenAPI's standard `default:` describes server behavior and is
        // doc-only for the CLI: it must populate the documentation field
        // (so `--help` can mention it) but must NOT populate the
        // client-side default field — sending it on the wire when the
        // caller omits the flag would change the API contract. Numbers
        // keep their JSON type so the help-text suffix renders `25` not
        // `"25"`.
        let yaml = fern_default_yaml(
            "        - name: limit\n          in: query\n          schema:\n            type: integer\n            default: 100",
        );
        let doc = load_openapi_spec(&yaml, "t").unwrap();
        let limit = doc.resources["users"].methods["list"]
            .parameters
            .get("limit")
            .unwrap();
        assert!(
            limit.default_value.is_none(),
            "schema `default:` must not produce a client-side default"
        );
        assert_eq!(
            limit.documentation_default_value,
            Some(serde_json::Value::Number(100.into())),
            "schema `default: 100` should round-trip as a JSON number on the documentation field"
        );
    }

    #[test]
    fn test_x_fern_default_alone_lowers_as_client_default() {
        // `x-fern-default` with no standard `default:` is plumbed into
        // the client-side `default_value` field. Covers string, boolean,
        // and integer scalar forms — the documentation field stays
        // `None` because there is no schema `default:` to surface.
        let yaml = fern_default_yaml(
            r#"        - name: region
          in: query
          x-fern-default: "us-east-1"
          schema:
            type: string
        - name: enabled
          in: query
          x-fern-default: true
          schema:
            type: boolean
        - name: pageSize
          in: query
          x-fern-default: 50
          schema:
            type: integer"#,
        );
        let doc = load_openapi_spec(&yaml, "t").unwrap();
        let params = &doc.resources["users"].methods["list"].parameters;
        assert_eq!(
            params["region"].default_value,
            Some(serde_json::Value::String("us-east-1".to_string()))
        );
        assert!(params["region"].documentation_default_value.is_none());
        assert_eq!(
            params["enabled"].default_value,
            Some(serde_json::Value::Bool(true))
        );
        assert!(params["enabled"].documentation_default_value.is_none());
        assert_eq!(
            params["pageSize"].default_value,
            Some(serde_json::Value::Number(50.into()))
        );
        assert!(params["pageSize"].documentation_default_value.is_none());
    }

    #[test]
    fn test_x_fern_default_supersedes_schema_default_for_help_too() {
        // When both are present we want the client-side default field
        // populated AND the documentation field cleared, so `--help`
        // doesn't render two conflicting `[default: ...]` lines. The
        // user-visible default is what the CLI will actually do (send
        // `50`); the underlying server default is intentionally hidden
        // because the API author opted into overriding it.
        let yaml = fern_default_yaml(
            r#"        - name: limit
          in: query
          x-fern-default: 50
          schema:
            type: integer
            default: 100"#,
        );
        let doc = load_openapi_spec(&yaml, "t").unwrap();
        let limit = doc.resources["users"].methods["list"]
            .parameters
            .get("limit")
            .unwrap();
        assert_eq!(
            limit.default_value,
            Some(serde_json::Value::Number(50.into())),
            "x-fern-default must drive the client-side default"
        );
        assert!(
            limit.documentation_default_value.is_none(),
            "schema.default should not also be surfaced when x-fern-default is set"
        );
    }

    #[test]
    fn test_x_fern_default_at_ref_site_wins_over_resolved_component() {
        // Ref-site precedence: when `x-fern-default` is placed alongside
        // a `$ref`, it wins over the value on the resolved component
        // parameter. Mirrors fern's `getExtension(parameter, FERN_DEFAULT)
        // ?? getExtension(resolvedParameter, FERN_DEFAULT)`. The schema
        // `default:` (a doc hint) is also suppressed because the
        // client-side default takes over the `--help` slot.
        let yaml = r#"
openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
servers:
  - url: https://api.example.com
paths:
  /users:
    get:
      operationId: users-list
      x-fern-sdk-group-name: ["users"]
      x-fern-sdk-method-name: list
      parameters:
        - $ref: '#/components/parameters/Region'
          x-fern-default: "eu-west-1"
      responses:
        '200':
          description: OK
components:
  parameters:
    Region:
      name: region
      in: query
      x-fern-default: "us-east-1"
      schema:
        type: string
        default: "us-west-2"
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        let region = doc.resources["users"].methods["list"]
            .parameters
            .get("region")
            .unwrap();
        assert_eq!(
            region.default_value,
            Some(serde_json::Value::String("eu-west-1".to_string())),
            "ref-site x-fern-default must win over both component-level x-fern-default and schema.default"
        );
        assert!(
            region.documentation_default_value.is_none(),
            "schema.default should be suppressed when a client-side default exists"
        );
    }

    #[test]
    fn test_x_fern_default_from_resolved_component_when_no_ref_site_override() {
        // Fallback half of the precedence: with no ref-site
        // `x-fern-default`, the value on the resolved component
        // parameter populates the client-side default, and the schema
        // `default:` is still suppressed because the client-side slot
        // is taken.
        let yaml = r#"
openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
servers:
  - url: https://api.example.com
paths:
  /users:
    get:
      operationId: users-list
      x-fern-sdk-group-name: ["users"]
      x-fern-sdk-method-name: list
      parameters:
        - $ref: '#/components/parameters/Region'
      responses:
        '200':
          description: OK
components:
  parameters:
    Region:
      name: region
      in: query
      x-fern-default: "us-east-1"
      schema:
        type: string
        default: "us-west-2"
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        let region = doc.resources["users"].methods["list"]
            .parameters
            .get("region")
            .unwrap();
        assert_eq!(
            region.default_value,
            Some(serde_json::Value::String("us-east-1".to_string()))
        );
        assert!(region.documentation_default_value.is_none());
    }

    #[test]
    fn test_schema_default_via_ref_lowers_as_documentation_only() {
        // Even when the parameter is reached via `$ref`, a schema-level
        // `default:` with no `x-fern-default` anywhere must NOT become a
        // client-side default. It populates the documentation field so
        // `--help` can surface `[API default: us-west-2]` without
        // forcing the CLI to send the value on the wire.
        let yaml = r#"
openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
servers:
  - url: https://api.example.com
paths:
  /users:
    get:
      operationId: users-list
      x-fern-sdk-group-name: ["users"]
      x-fern-sdk-method-name: list
      parameters:
        - $ref: '#/components/parameters/Region'
      responses:
        '200':
          description: OK
components:
  parameters:
    Region:
      name: region
      in: query
      schema:
        type: string
        default: "us-west-2"
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        let region = doc.resources["users"].methods["list"]
            .parameters
            .get("region")
            .unwrap();
        assert!(
            region.default_value.is_none(),
            "schema.default reached via $ref must stay doc-only"
        );
        assert_eq!(
            region.documentation_default_value,
            Some(serde_json::Value::String("us-west-2".to_string()))
        );
    }

    #[test]
    fn test_inline_request_body_produces_per_field_body_params() {
        // An inline object schema in `requestBody` should expose each top-level
        // property as a body-located MethodParameter so that the command builder
        // can render per-field flags. Read-only fields are skipped, and required
        // fields keep their `required` bit so the executor can enforce them.
        let yaml = r#"
openapi: "3.0.0"
info:
  title: API
  version: "1.0"
servers:
  - url: https://api.example.com
paths:
  /things:
    post:
      x-fern-sdk-group-name: ["things"]
      x-fern-sdk-method-name: create
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - name
              properties:
                name:
                  type: string
                count:
                  type: integer
                tags:
                  type: array
                  items:
                    type: string
                server_generated_id:
                  type: string
                  readOnly: true
      responses:
        "201":
          description: created
"#;
        let doc = load_openapi_spec(yaml, "test").unwrap();
        let create = &doc.resources["things"].methods["create"];

        let name = create
            .parameters
            .get("name")
            .expect("name should be a body param");
        assert_eq!(name.location.as_deref(), Some("body"));
        assert_eq!(name.param_type.as_deref(), Some("string"));
        assert!(name.required, "name is in `required` and should be marked");

        let count = create
            .parameters
            .get("count")
            .expect("count should be a body param");
        assert_eq!(count.location.as_deref(), Some("body"));
        assert_eq!(count.param_type.as_deref(), Some("integer"));
        assert!(!count.required);

        // Array body properties become repeated flags (repeated: true, param_type: string).
        let tags = create
            .parameters
            .get("tags")
            .expect("tags should be a body param");
        assert_eq!(tags.location.as_deref(), Some("body"));
        assert!(tags.repeated, "array body prop should have repeated: true");
        assert_eq!(tags.param_type.as_deref(), Some("string"));

        // Read-only fields don't get a flag — they're server-managed.
        assert!(
            !create.parameters.contains_key("server_generated_id"),
            "readOnly properties should be skipped"
        );
    }

    #[test]
    fn test_body_depth_3_plus_not_flattened() {
        // Mirrors MAX_INPUT_DEPTH in graphql/parser.rs: depths 0, 1, 2 are
        // flattened into dot-notation flags; depth >= 3 is not.
        let yaml = r#"
openapi: "3.0.0"
info:
  title: API
  version: "1.0"
servers:
  - url: https://api.example.com
paths:
  /users:
    post:
      x-fern-sdk-group-name: ["users"]
      x-fern-sdk-method-name: create
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                name:
                  type: string
                address:
                  type: object
                  properties:
                    city:
                      type: string
                    location:
                      type: object
                      properties:
                        street:
                          type: string
                        geo:
                          type: object
                          properties:
                            lat:
                              type: number
      responses:
        "201":
          description: created
"#;
        let doc = load_openapi_spec(yaml, "test").unwrap();
        let create = &doc.resources["users"].methods["create"];

        // Depth-0: top-level scalar.
        assert!(create.parameters.contains_key("name"), "depth-0 'name' should be a flag");

        // Depth-1: one level of nesting.
        assert!(create.parameters.contains_key("address.city"), "depth-1 'address.city' should be a flag");

        // Depth-2: two levels of nesting — now emitted (matches GraphQL behaviour).
        assert!(create.parameters.contains_key("address.location.street"), "depth-2 'address.location.street' should be a flag");

        // Depth-3: NOT emitted — beyond MAX_BODY_DEPTH.
        assert!(!create.parameters.contains_key("address.location.geo.lat"), "depth-3 'address.location.geo.lat' must not be a flag");
        // address.location.geo surfaces as a plain object flag (depth limit hit, recursion returns empty).
        assert!(create.parameters.contains_key("address.location.geo"), "depth-2 object at limit should surface as plain flag");
    }

    #[test]
    fn test_ref_property_within_inline_schema_resolved() {
        // A property within an inline body schema that uses $ref should be
        // resolved from components/schemas rather than emitted as a typeless flag.
        let yaml = r#"
openapi: "3.0.0"
info:
  title: API
  version: "1.0"
servers:
  - url: https://api.example.com
paths:
  /orders:
    post:
      x-fern-sdk-group-name: ["orders"]
      x-fern-sdk-method-name: create
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                note:
                  type: string
                address:
                  $ref: '#/components/schemas/Address'
      responses:
        "201":
          description: Created order
components:
  schemas:
    Address:
      type: object
      properties:
        city:
          type: string
        zip:
          type: string
"#;
        let doc = load_openapi_spec(yaml, "test").unwrap();
        let create = &doc.resources["orders"].methods["create"];

        // Top-level scalar — present as-is.
        assert!(create.parameters.contains_key("note"), "'note' should be a flag");

        // $ref to an object at depth 0 — resolved and flattened into dot-notation flags.
        assert!(create.parameters.contains_key("address.city"), "'address.city' should be a flag after $ref resolution");
        assert!(create.parameters.contains_key("address.zip"), "'address.zip' should be a flag after $ref resolution");

        // The $ref itself should appear as an object-typed shorthand flag (not a typeless flag).
        let addr = create.parameters.get("address").expect("'address' should appear as an object-typed shorthand flag");
        assert_eq!(addr.param_type.as_deref(), Some("object"), "'address' must have param_type 'object', not be typeless");
    }

    #[test]
    fn test_inline_object_body_param_emits_parent_object_flag() {
        // For an inline object property, flatten_body_params_prefix should emit BOTH
        // the parent key (param_type: "object", required: false) AND the dot-notation
        // sub-flags (e.g. "name.first", "name.last").
        let yaml = r#"
openapi: "3.0.0"
info:
  title: API
  version: "1.0"
servers:
  - url: https://api.example.com
paths:
  /users:
    post:
      x-fern-sdk-group-name: ["users"]
      x-fern-sdk-method-name: create
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required:
                - name
              properties:
                name:
                  type: object
                  description: Full name of the user
                  properties:
                    first:
                      type: string
                    last:
                      type: string
      responses:
        "201":
          description: created
"#;
        let doc = load_openapi_spec(yaml, "test").unwrap();
        let create = &doc.resources["users"].methods["create"];

        // Sub-flags must exist.
        assert!(create.parameters.contains_key("name.first"), "name.first sub-flag must be present");
        assert!(create.parameters.contains_key("name.last"), "name.last sub-flag must be present");

        // Parent object-level flag must ALSO exist.
        let parent = create.parameters.get("name")
            .expect("parent 'name' object flag must be present");
        assert_eq!(parent.param_type.as_deref(), Some("object"), "parent flag must have param_type 'object'");
        assert_eq!(parent.location.as_deref(), Some("body"), "parent flag must have location 'body'");
        // required is always false at CLI level for object shorthand flags.
        assert!(!parent.required, "parent object flag must be required: false regardless of schema required");
        assert_eq!(parent.description.as_deref(), Some("Full name of the user"), "parent flag should carry description");
    }

    #[test]
    fn test_ref_object_body_param_emits_parent_object_flag() {
        // For a $ref that resolves to an object, flatten_body_params_prefix should emit
        // BOTH the parent key (param_type: "object", required: false) AND the dot-notation
        // sub-flags.
        let yaml = r#"
openapi: "3.0.0"
info:
  title: API
  version: "1.0"
servers:
  - url: https://api.example.com
paths:
  /orders:
    post:
      x-fern-sdk-group-name: ["orders"]
      x-fern-sdk-method-name: create
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                address:
                  $ref: '#/components/schemas/Address'
      responses:
        "201":
          description: Created order
components:
  schemas:
    Address:
      type: object
      description: Shipping address
      properties:
        city:
          type: string
        zip:
          type: string
"#;
        let doc = load_openapi_spec(yaml, "test").unwrap();
        let create = &doc.resources["orders"].methods["create"];

        // Sub-flags must still exist.
        assert!(create.parameters.contains_key("address.city"), "'address.city' must be present");
        assert!(create.parameters.contains_key("address.zip"), "'address.zip' must be present");

        // Parent object-level flag must ALSO exist now.
        let parent = create.parameters.get("address")
            .expect("parent 'address' object flag must be present for $ref branch");
        assert_eq!(parent.param_type.as_deref(), Some("object"), "parent flag must have param_type 'object'");
        assert_eq!(parent.location.as_deref(), Some("body"), "parent flag must have location 'body'");
        assert!(!parent.required, "parent object flag must be required: false");
        // $ref properties typically carry no inline description; the parent
        // flag must fall back to the resolved schema's description so --help
        // is not blank.
        assert_eq!(
            parent.description.as_deref(),
            Some("Shipping address"),
            "parent $ref object flag should fall back to the resolved schema's description"
        );
    }

    #[test]
    fn test_inline_body_does_not_clobber_query_params_with_same_name() {
        // If a body schema property collides with an existing query/path/header
        // parameter, the spec's `parameters` array wins — body-flag generation
        // shouldn't silently turn a query param into a body param.
        let yaml = r#"
openapi: "3.0.0"
info:
  title: API
  version: "1.0"
servers:
  - url: https://api.example.com
paths:
  /things:
    post:
      x-fern-sdk-group-name: ["things"]
      x-fern-sdk-method-name: create
      parameters:
        - name: name
          in: query
          schema:
            type: string
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                name:
                  type: string
                description:
                  type: string
      responses:
        "201":
          description: created
"#;
        let doc = load_openapi_spec(yaml, "test").unwrap();
        let create = &doc.resources["things"].methods["create"];

        // `name` was claimed by the query param first — it stays a query param.
        let name = &create.parameters["name"];
        assert_eq!(name.location.as_deref(), Some("query"));

        // `description` doesn't collide, lands in the body normally.
        let description = &create.parameters["description"];
        assert_eq!(description.location.as_deref(), Some("body"));
    }

    #[test]
    fn test_per_operation_server_override() {
        let yaml = r#"
openapi: "3.0.0"
info:
  title: "API"
  version: "1.0"
servers:
  - url: "https://api.example.com"
paths:
  /upload:
    post:
      servers:
        - url: "https://upload.example.com"
      x-fern-sdk-group-name: ["uploads"]
      x-fern-sdk-method-name: create
      responses:
        "200":
          description: ok
  /users:
    get:
      x-fern-sdk-group-name: ["users"]
      x-fern-sdk-method-name: list
      responses:
        "200":
          description: ok
"#;
        let doc = load_openapi_spec(yaml, "test").unwrap();
        // Upload operation has its own server — should use it
        let upload = doc.resources["uploads"].methods["create"].clone();
        assert_eq!(upload.root_url, "https://upload.example.com");
        // Users operation has no server override — falls back to spec-level
        let users = doc.resources["users"].methods["list"].clone();
        assert_eq!(users.root_url, "https://api.example.com");
    }

    // ------------------------------------------------------------------
    // x-fern-idempotent + x-fern-idempotency-headers (FER-9864 P1).
    // ------------------------------------------------------------------

    /// Spec-root `x-fern-idempotency-headers` lowers to
    /// `RestDescription.idempotency_headers` with the same shape, and an
    /// operation marked `x-fern-idempotent: true` carries that flag
    /// through to `RestMethod.idempotent`.
    #[test]
    fn test_idempotency_headers_parsed_from_spec_root() {
        let yaml = r#"
openapi: 3.0.2
info:
  title: Idempotency Test
  version: "1.0"
servers:
  - url: https://api.example.com
x-fern-idempotency-headers:
  - header: Idempotency-Key
    name: idempotency_key
    env: API_IDEMPOTENCY_KEY
  - header: X-Trace-Id
paths:
  /payments:
    post:
      x-fern-sdk-group-name: [payments]
      x-fern-sdk-method-name: create
      operationId: payments_create
      x-fern-idempotent: true
      responses:
        "201":
          description: ok
"#;
        let doc = load_openapi_spec(yaml, "test").unwrap();
        assert_eq!(doc.idempotency_headers.len(), 2, "both header entries parsed");
        assert_eq!(doc.idempotency_headers[0].header, "Idempotency-Key");
        assert_eq!(doc.idempotency_headers[0].name.as_deref(), Some("idempotency_key"));
        assert_eq!(doc.idempotency_headers[0].env.as_deref(), Some("API_IDEMPOTENCY_KEY"));
        assert_eq!(doc.idempotency_headers[1].header, "X-Trace-Id");
        assert!(doc.idempotency_headers[1].name.is_none());
        assert!(doc.idempotency_headers[1].env.is_none());
    }

    /// `x-fern-idempotent: true` toggles `RestMethod.idempotent` and
    /// synthesizes one header `MethodParameter` per spec-root entry. A
    /// sibling operation without the extension is unaffected — its
    /// parameter map contains no idempotency-header entries, which is
    /// what guarantees the flags are not surfaced and the header is not
    /// sent on non-idempotent ops.
    #[test]
    fn test_idempotent_op_surfaces_header_param_non_idempotent_does_not() {
        let yaml = r#"
openapi: 3.0.2
info:
  title: Idempotency Test
  version: "1.0"
servers:
  - url: https://api.example.com
x-fern-idempotency-headers:
  - header: Idempotency-Key
    name: idempotency_key
    env: API_IDEMPOTENCY_KEY
paths:
  /payments:
    get:
      x-fern-sdk-group-name: [payments]
      x-fern-sdk-method-name: list
      operationId: payments_list
      responses:
        "200":
          description: ok
    post:
      x-fern-sdk-group-name: [payments]
      x-fern-sdk-method-name: create
      operationId: payments_create
      x-fern-idempotent: true
      responses:
        "201":
          description: ok
"#;
        let doc = load_openapi_spec(yaml, "test").unwrap();
        let payments = doc.resources.get("payments").expect("payments group");

        // Idempotent op
        let create = payments.methods.get("create").expect("create method");
        assert!(create.idempotent, "create is x-fern-idempotent: true");
        let idem_param = create
            .parameters
            .get("Idempotency-Key")
            .expect("synthetic idempotency header parameter exists");
        assert_eq!(idem_param.location.as_deref(), Some("header"));
        assert_eq!(idem_param.env_var.as_deref(), Some("API_IDEMPOTENCY_KEY"));

        // Non-idempotent sibling
        let list = payments.methods.get("list").expect("list method");
        assert!(!list.idempotent, "list is not idempotent");
        assert!(
            !list.parameters.contains_key("Idempotency-Key"),
            "non-idempotent op must not surface idempotency-header params",
        );
    }

    /// An operation marked idempotent but with no spec-root header
    /// definitions still flips `idempotent = true`; no synthetic
    /// parameters are added because there are no headers to inject.
    #[test]
    fn test_idempotent_op_without_spec_root_headers_has_no_synthetic_params() {
        let yaml = r#"
openapi: 3.0.2
info:
  title: Idempotency Test
  version: "1.0"
servers:
  - url: https://api.example.com
paths:
  /payments:
    post:
      x-fern-sdk-group-name: [payments]
      x-fern-sdk-method-name: create
      operationId: payments_create
      x-fern-idempotent: true
      responses:
        "201":
          description: ok
"#;
        let doc = load_openapi_spec(yaml, "test").unwrap();
        assert!(doc.idempotency_headers.is_empty());
        let create = &doc.resources["payments"].methods["create"];
        assert!(create.idempotent);
        assert!(
            create.parameters.is_empty(),
            "no synthetic params without spec-root header definitions",
        );
    }

    /// When the `IdempotencyHeader` entry sets `name`, the synthetic
    /// `MethodParameter` carries a `flag_name_override` derived from
    /// `to_kebab_flag(name)`. The HashMap key remains the wire header
    /// name (so the executor still sends the correct HTTP header).
    /// This is the case the upstream Fern OpenAPI importer's SDK
    /// parameter naming covers — a header like `X-Trace-Id` with
    /// `name: trace_id` materializes as `--trace-id` on the CLI, not
    /// `--x-trace-id`.
    #[test]
    fn test_idempotent_op_uses_name_for_flag_derivation() {
        let yaml = r#"
openapi: 3.0.2
info:
  title: Idempotency Test
  version: "1.0"
servers:
  - url: https://api.example.com
x-fern-idempotency-headers:
  - header: X-Trace-Id
    name: trace_id
  - header: Idempotency-Key
paths:
  /payments:
    post:
      x-fern-sdk-group-name: [payments]
      x-fern-sdk-method-name: create
      operationId: payments_create
      x-fern-idempotent: true
      responses:
        "201":
          description: ok
"#;
        let doc = load_openapi_spec(yaml, "test").unwrap();
        let create = &doc.resources["payments"].methods["create"];

        // X-Trace-Id with `name: trace_id` → wire key stays
        // `X-Trace-Id`, but the flag becomes `--trace-id`.
        let trace = create.parameters.get("X-Trace-Id").unwrap();
        assert_eq!(trace.flag_name_override.as_deref(), Some("trace-id"));
        assert_eq!(trace.location.as_deref(), Some("header"));

        // No `name` → no override; flag derives from the header name
        // via the existing `to_kebab_flag` path in `commands.rs`.
        let idem = create.parameters.get("Idempotency-Key").unwrap();
        assert!(idem.flag_name_override.is_none());
    }

    /// Spec-declared parameters always win over a synthetic injection
    /// with the same key — a per-operation `Idempotency-Key` declaration
    /// keeps its description, schema, and any other customizations the
    /// author put on it.
    #[test]
    fn test_spec_declared_param_wins_over_injection() {
        let yaml = r#"
openapi: 3.0.2
info:
  title: Idempotency Test
  version: "1.0"
servers:
  - url: https://api.example.com
x-fern-idempotency-headers:
  - header: Idempotency-Key
    env: API_IDEMPOTENCY_KEY
paths:
  /payments:
    post:
      x-fern-sdk-group-name: [payments]
      x-fern-sdk-method-name: create
      operationId: payments_create
      x-fern-idempotent: true
      parameters:
        - name: Idempotency-Key
          in: header
          description: Custom description from author.
          schema:
            type: string
      responses:
        "201":
          description: ok
"#;
        let doc = load_openapi_spec(yaml, "test").unwrap();
        let create = &doc.resources["payments"].methods["create"];
        let p = create
            .parameters
            .get("Idempotency-Key")
            .expect("declared param present");
        assert_eq!(p.description.as_deref(), Some("Custom description from author."));
        assert!(
            p.env_var.is_none(),
            "spec-declared param does not pick up env_var from the spec-root extension",
        );
    }

    // ------------------------------------------------------------------
    // x-fern-global-headers (FER-9864 P2).
    // ------------------------------------------------------------------

    /// Absent extension → empty `global_headers` (the default-empty
    /// `Vec` codepath). Pins the wire-compat baseline so a spec that
    /// does not opt in is not changed.
    #[test]
    fn test_global_headers_absent_yields_empty_vec() {
        let yaml = r#"
openapi: 3.0.2
info:
  title: T
  version: "1.0"
servers:
  - url: https://api.example.com
paths:
  /things:
    get:
      x-fern-sdk-group-name: [things]
      x-fern-sdk-method-name: list
      operationId: things_list
      responses:
        "200":
          description: ok
"#;
        let doc = load_openapi_spec(yaml, "test").unwrap();
        assert!(doc.global_headers.is_empty());
    }

    /// Full entry round-trips every field through the parser into
    /// `RestDescription.global_headers`. Mirrors the upstream Fern
    /// importer shape from `getGlobalHeaders.ts`.
    #[test]
    fn test_global_headers_full_entry_round_trips() {
        let yaml = r#"
openapi: 3.0.2
info:
  title: T
  version: "1.0"
servers:
  - url: https://api.example.com
x-fern-global-headers:
  - header: X-API-Version
    name: apiVersion
    optional: false
    env: API_VERSION
    default: "2024-01-01"
paths:
  /things:
    get:
      x-fern-sdk-group-name: [things]
      x-fern-sdk-method-name: list
      operationId: things_list
      responses:
        "200":
          description: ok
"#;
        let doc = load_openapi_spec(yaml, "test").unwrap();
        assert_eq!(doc.global_headers.len(), 1);
        let h = &doc.global_headers[0];
        assert_eq!(h.header, "X-API-Version");
        assert_eq!(h.name.as_deref(), Some("apiVersion"));
        assert!(!h.optional);
        assert_eq!(h.env.as_deref(), Some("API_VERSION"));
        assert_eq!(h.default.as_deref(), Some("2024-01-01"));
    }

    /// Optional fields absent → defaults applied: `name` and `env` and
    /// `default` are `None`, `optional` falls back to `false` (matching
    /// upstream Fern's `?? false` default).
    #[test]
    fn test_global_headers_minimal_entry_uses_defaults() {
        let yaml = r#"
openapi: 3.0.2
info:
  title: T
  version: "1.0"
servers:
  - url: https://api.example.com
x-fern-global-headers:
  - header: X-Trace-Id
paths:
  /things:
    get:
      x-fern-sdk-group-name: [things]
      x-fern-sdk-method-name: list
      operationId: things_list
      responses:
        "200":
          description: ok
"#;
        let doc = load_openapi_spec(yaml, "test").unwrap();
        let h = &doc.global_headers[0];
        assert_eq!(h.header, "X-Trace-Id");
        assert!(h.name.is_none());
        assert!(!h.optional, "optional defaults to false (i.e. required)");
        assert!(h.env.is_none());
        assert!(h.default.is_none());
    }

    /// `optional: true` lowers to `GlobalHeader.optional = true`.
    /// Surfaces the required/optional toggle that the CLI registration
    /// path consumes to decide whether to error on a missing value.
    #[test]
    fn test_global_headers_optional_true_lowers_to_optional() {
        let yaml = r#"
openapi: 3.0.2
info:
  title: T
  version: "1.0"
servers:
  - url: https://api.example.com
x-fern-global-headers:
  - header: X-Optional
    optional: true
paths:
  /things:
    get:
      x-fern-sdk-group-name: [things]
      x-fern-sdk-method-name: list
      operationId: things_list
      responses:
        "200":
          description: ok
"#;
        let doc = load_openapi_spec(yaml, "test").unwrap();
        assert!(doc.global_headers[0].optional);
    }

    /// `default` accepts string / bool / number — they all lower to a
    /// string for the outgoing HTTP header. Anything else (null /
    /// sequence / mapping) drops to `None` rather than crashing.
    #[test]
    fn test_global_headers_default_accepts_scalar_types() {
        let yaml = r#"
openapi: 3.0.2
info:
  title: T
  version: "1.0"
servers:
  - url: https://api.example.com
x-fern-global-headers:
  - header: X-String
    default: "literal"
  - header: X-Bool
    default: true
  - header: X-Number
    default: 42
  - header: X-Null
    default: null
paths:
  /things:
    get:
      x-fern-sdk-group-name: [things]
      x-fern-sdk-method-name: list
      operationId: things_list
      responses:
        "200":
          description: ok
"#;
        let doc = load_openapi_spec(yaml, "test").unwrap();
        let by_header = |name: &str| -> &crate::openapi::discovery::GlobalHeader {
            doc.global_headers
                .iter()
                .find(|h| h.header == name)
                .expect("header parsed")
        };
        assert_eq!(by_header("X-String").default.as_deref(), Some("literal"));
        assert_eq!(by_header("X-Bool").default.as_deref(), Some("true"));
        assert_eq!(by_header("X-Number").default.as_deref(), Some("42"));
        assert!(
            by_header("X-Null").default.is_none(),
            "`null` is not a usable HTTP header value, so it drops to None"
        );
    }

    /// `x-fern-default` takes precedence over `default` when both are
    /// present, mirroring the upstream Fern importer where the
    /// Fern-namespaced field is the authoritative source for header
    /// defaults.
    #[test]
    fn test_global_headers_x_fern_default_overrides_default() {
        let yaml = r#"
openapi: 3.0.2
info:
  title: T
  version: "1.0"
servers:
  - url: https://api.example.com
x-fern-global-headers:
  - header: X-Stage
    default: "production"
    x-fern-default: "development"
paths:
  /things:
    get:
      x-fern-sdk-group-name: [things]
      x-fern-sdk-method-name: list
      operationId: things_list
      responses:
        "200":
          description: ok
"#;
        let doc = load_openapi_spec(yaml, "test").unwrap();
        assert_eq!(
            doc.global_headers[0].default.as_deref(),
            Some("development"),
            "x-fern-default wins over default"
        );
    }

    /// Multiple entries preserve declaration order. The registration
    /// pass in `app.rs` later iterates this Vec to register flags, and
    /// help-text ordering follows source order — pin that here so the
    /// surface is stable across refactors.
    #[test]
    fn test_global_headers_preserves_declaration_order() {
        let yaml = r#"
openapi: 3.0.2
info:
  title: T
  version: "1.0"
servers:
  - url: https://api.example.com
x-fern-global-headers:
  - header: First
  - header: Second
  - header: Third
paths:
  /things:
    get:
      x-fern-sdk-group-name: [things]
      x-fern-sdk-method-name: list
      operationId: things_list
      responses:
        "200":
          description: ok
"#;
        let doc = load_openapi_spec(yaml, "test").unwrap();
        let headers: Vec<&str> =
            doc.global_headers.iter().map(|h| h.header.as_str()).collect();
        assert_eq!(headers, vec!["First", "Second", "Third"]);
    }

    // ------------------------------------------------------------------
    // x-fern-groups (FER-9864 P3).
    //
    // Document-root extension that decorates `x-fern-sdk-group-name`
    // groups with `summary` / `description` metadata for the help
    // surface. Shape mirrors the upstream Fern OpenAPI importer's
    // `XFernGroupsSchema` zod schema and matching `SdkGroupInfo` IR
    // type:
    //   fern-api/fern packages/cli/api-importers/openapi/openapi-ir-parser/src/openapi/v3/extensions/getFernGroups.ts:8-14
    //   fern-api/fern packages/cli/api-importers/openapi/openapi-ir/fern/definition/finalIr.yml:51-54
    // ------------------------------------------------------------------

    const X_FERN_GROUPS_SPEC_SKELETON: &str = r#"
openapi: 3.0.2
info:
  title: t
  version: "1"
servers:
  - url: https://api.example.com
paths:
  /things:
    get:
      x-fern-sdk-group-name: [things]
      x-fern-sdk-method-name: list
      operationId: things_list
      responses:
        "200":
          description: ok
"#;

    /// Baseline: with no `x-fern-groups` extension on the document
    /// root, `RestDescription::groups` is the empty map. This is the
    /// "feature opted out" path — every consumer that calls
    /// `doc.groups.get(...)` falls back to the legacy
    /// `Operations on '<name>'` rendering.
    #[test]
    fn test_x_fern_groups_absent_yields_empty_map() {
        let doc = load_openapi_spec(X_FERN_GROUPS_SPEC_SKELETON, "test").unwrap();
        assert!(doc.groups.is_empty());
    }

    /// Single-group case: both `summary` and `description` flow
    /// through to `SdkGroupInfo` verbatim. Verifies the kebab-cased
    /// lookup key matches the resource-tree key the command builder
    /// uses.
    #[test]
    fn test_x_fern_groups_single_group_round_trips() {
        let yaml = r#"
openapi: 3.0.2
info:
  title: t
  version: "1"
servers:
  - url: https://api.example.com
x-fern-groups:
  things:
    summary: Things Operations
    description: Long-form prose explaining the things group.
paths:
  /things:
    get:
      x-fern-sdk-group-name: [things]
      x-fern-sdk-method-name: list
      operationId: things_list
      responses:
        "200":
          description: ok
"#;
        let doc = load_openapi_spec(yaml, "test").unwrap();
        let info = doc.groups.get("things").expect("things entry present");
        assert_eq!(info.summary.as_deref(), Some("Things Operations"));
        assert_eq!(
            info.description.as_deref(),
            Some("Long-form prose explaining the things group.")
        );
    }

    /// Multiple groups parse independently. Order is irrelevant for
    /// the HashMap lookup, so the test asserts on per-key shape rather
    /// than iteration order.
    #[test]
    fn test_x_fern_groups_multiple_groups_parse_independently() {
        let yaml = r#"
openapi: 3.0.2
info:
  title: t
  version: "1"
servers:
  - url: https://api.example.com
x-fern-groups:
  things:
    summary: Things Operations
  widgets:
    summary: Widgets Operations
    description: A second group.
paths:
  /things:
    get:
      x-fern-sdk-group-name: [things]
      x-fern-sdk-method-name: list
      operationId: things_list
      responses:
        "200":
          description: ok
  /widgets:
    get:
      x-fern-sdk-group-name: [widgets]
      x-fern-sdk-method-name: list
      operationId: widgets_list
      responses:
        "200":
          description: ok
"#;
        let doc = load_openapi_spec(yaml, "test").unwrap();
        assert_eq!(doc.groups.len(), 2);
        assert_eq!(
            doc.groups["things"].summary.as_deref(),
            Some("Things Operations"),
        );
        assert!(doc.groups["things"].description.is_none());
        assert_eq!(
            doc.groups["widgets"].summary.as_deref(),
            Some("Widgets Operations"),
        );
        assert_eq!(
            doc.groups["widgets"].description.as_deref(),
            Some("A second group."),
        );
    }

    /// Summary-only entry: `description` stays `None` so the command
    /// builder falls back to the `about()` text when rendering
    /// `--long-help`.
    #[test]
    fn test_x_fern_groups_summary_only_keeps_description_none() {
        let yaml = r#"
openapi: 3.0.2
info:
  title: t
  version: "1"
servers:
  - url: https://api.example.com
x-fern-groups:
  things:
    summary: Things Operations
paths:
  /things:
    get:
      x-fern-sdk-group-name: [things]
      x-fern-sdk-method-name: list
      operationId: things_list
      responses:
        "200":
          description: ok
"#;
        let doc = load_openapi_spec(yaml, "test").unwrap();
        let info = doc.groups.get("things").expect("things entry present");
        assert_eq!(info.summary.as_deref(), Some("Things Operations"));
        assert!(info.description.is_none());
    }

    /// Description-only entry: `summary` stays `None`. The command
    /// builder then keeps the legacy `Operations on '<name>'` about
    /// line while still surfacing the description via
    /// `long_about()`.
    #[test]
    fn test_x_fern_groups_description_only_keeps_summary_none() {
        let yaml = r#"
openapi: 3.0.2
info:
  title: t
  version: "1"
servers:
  - url: https://api.example.com
x-fern-groups:
  things:
    description: Long-form prose about the group.
paths:
  /things:
    get:
      x-fern-sdk-group-name: [things]
      x-fern-sdk-method-name: list
      operationId: things_list
      responses:
        "200":
          description: ok
"#;
        let doc = load_openapi_spec(yaml, "test").unwrap();
        let info = doc.groups.get("things").expect("things entry present");
        assert!(info.summary.is_none());
        assert_eq!(
            info.description.as_deref(),
            Some("Long-form prose about the group."),
        );
    }

    /// Group keys are kebab-cased so they line up with the resource
    /// keys the command builder produces from `x-fern-sdk-group-name`
    /// (which itself runs through `camel_to_kebab`). A `myGroup` entry
    /// surfaces as `my-group`; the original casing is intentionally
    /// not preserved.
    #[test]
    fn test_x_fern_groups_keys_are_kebab_cased() {
        let yaml = r#"
openapi: 3.0.2
info:
  title: t
  version: "1"
servers:
  - url: https://api.example.com
x-fern-groups:
  myGroup:
    summary: Pretty Label
paths:
  /things:
    get:
      x-fern-sdk-group-name: [myGroup]
      x-fern-sdk-method-name: list
      operationId: things_list
      responses:
        "200":
          description: ok
"#;
        let doc = load_openapi_spec(yaml, "test").unwrap();
        assert!(doc.groups.contains_key("my-group"));
        assert!(!doc.groups.contains_key("myGroup"));
        assert_eq!(
            doc.groups["my-group"].summary.as_deref(),
            Some("Pretty Label"),
        );
    }

    /// Unrelated extra fields inside a group entry are ignored
    /// rather than rejected. Fern's `getFernGroups.ts` schema is a
    /// `z.object({ summary, description })` (no `.strict()`), so the
    /// importer also tolerates extras — we mirror that to stay
    /// forward-compatible with the documented `groups:` nesting
    /// field on the wire (which the cli-sdk does not consume).
    #[test]
    fn test_x_fern_groups_tolerates_unknown_fields() {
        let yaml = r#"
openapi: 3.0.2
info:
  title: t
  version: "1"
servers:
  - url: https://api.example.com
x-fern-groups:
  things:
    summary: Things Operations
    groups: [other]
paths:
  /things:
    get:
      x-fern-sdk-group-name: [things]
      x-fern-sdk-method-name: list
      operationId: things_list
      responses:
        "200":
          description: ok
"#;
        let doc = load_openapi_spec(yaml, "test").unwrap();
        assert_eq!(
            doc.groups["things"].summary.as_deref(),
            Some("Things Operations"),
        );
    }

    // ------------------------------------------------------------------
    // Security scheme parsing + per-operation security inheritance.
    // ------------------------------------------------------------------

    fn first_method<'a>(doc: &'a RestDescription, group: &str, method: &str) -> &'a RestMethod {
        doc.resources
            .get(group)
            .unwrap_or_else(|| panic!("resource '{group}' missing"))
            .methods
            .get(method)
            .unwrap_or_else(|| panic!("method '{method}' on '{group}' missing"))
    }

    #[test]
    fn test_parses_http_bearer_security_scheme() {
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://x.com" }]
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
paths:
  /things:
    get:
      x-fern-sdk-group-name: ["things"]
      x-fern-sdk-method-name: list
      responses: { "200": { description: ok } }
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        assert_eq!(
            doc.security_schemes.get("bearerAuth"),
            Some(&SecurityScheme::HttpBearer),
        );
    }

    #[test]
    fn test_parses_http_basic_security_scheme() {
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://x.com" }]
components:
  securitySchemes:
    basicAuth:
      type: http
      scheme: basic
paths: {}
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        assert_eq!(
            doc.security_schemes.get("basicAuth"),
            Some(&SecurityScheme::HttpBasic),
        );
    }

    #[test]
    fn test_parses_apikey_header_and_query() {
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://x.com" }]
components:
  securitySchemes:
    headerKey:
      type: apiKey
      in: header
      name: X-Api-Key
    queryKey:
      type: apiKey
      in: query
      name: api_key
paths: {}
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        assert_eq!(
            doc.security_schemes.get("headerKey"),
            Some(&SecurityScheme::ApiKeyHeader {
                name: "X-Api-Key".to_string(),
            }),
        );
        assert_eq!(
            doc.security_schemes.get("queryKey"),
            Some(&SecurityScheme::ApiKeyQuery {
                name: "api_key".to_string(),
            }),
        );
    }

    #[test]
    fn test_parses_oauth2_security_scheme_as_oauth2() {
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://x.com" }]
components:
  securitySchemes:
    oauthScheme:
      type: oauth2
      flows:
        clientCredentials:
          tokenUrl: https://x.com/token
          scopes:
            read: read scope
paths: {}
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        assert_eq!(
            doc.security_schemes.get("oauthScheme"),
            Some(&SecurityScheme::OAuth2),
        );
    }

    #[test]
    fn test_unknown_security_type_falls_through_to_other() {
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://x.com" }]
components:
  securitySchemes:
    weird:
      type: mutualTLS
paths: {}
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        match doc.security_schemes.get("weird") {
            Some(SecurityScheme::Other(s)) => assert_eq!(s, "mutualtls"),
            other => panic!("unexpected scheme: {other:?}"),
        }
    }

    #[test]
    fn test_operation_inherits_spec_level_security() {
        // Top-level `security: [{bearerAuth: []}]` is inherited by an
        // operation that doesn't declare its own.
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://x.com" }]
security:
  - bearerAuth: []
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
paths:
  /things:
    get:
      x-fern-sdk-group-name: ["things"]
      x-fern-sdk-method-name: list
      responses: { "200": { description: ok } }
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        let m = first_method(&doc, "things", "list");
        let reqs = m
            .security_requirements
            .as_ref()
            .expect("inherited requirements present");
        assert_eq!(reqs.len(), 1);
        assert!(reqs[0].contains_key("bearerAuth"));
    }

    #[test]
    fn test_operation_security_overrides_spec_default() {
        // Operation declares its own `security` — that wins over the spec
        // default, even if it picks a different scheme.
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://x.com" }]
security:
  - bearerAuth: []
components:
  securitySchemes:
    bearerAuth: { type: http, scheme: bearer }
    apiKey: { type: apiKey, in: header, name: X-Api-Key }
paths:
  /admin:
    get:
      x-fern-sdk-group-name: ["admin"]
      x-fern-sdk-method-name: ping
      security:
        - apiKey: []
      responses: { "200": { description: ok } }
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        let m = first_method(&doc, "admin", "ping");
        let reqs = m.security_requirements.as_ref().unwrap();
        assert_eq!(reqs.len(), 1);
        assert!(reqs[0].contains_key("apiKey"));
        assert!(!reqs[0].contains_key("bearerAuth"));
    }

    #[test]
    fn test_explicit_empty_operation_security_means_anonymous() {
        // `security: []` on an operation is meaningful — it explicitly opts
        // out of the spec-level default, marking the endpoint anonymous.
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://x.com" }]
security:
  - bearerAuth: []
components:
  securitySchemes:
    bearerAuth: { type: http, scheme: bearer }
paths:
  /public:
    get:
      x-fern-sdk-group-name: ["public"]
      x-fern-sdk-method-name: ping
      security: []
      responses: { "200": { description: ok } }
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        let m = first_method(&doc, "public", "ping");
        let reqs = m.security_requirements.as_ref().unwrap();
        assert!(
            reqs.is_empty(),
            "explicit empty array should produce Some(vec![]), got {reqs:?}",
        );
    }

    #[test]
    fn test_no_security_anywhere_leaves_requirements_none() {
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://x.com" }]
paths:
  /things:
    get:
      x-fern-sdk-group-name: ["things"]
      x-fern-sdk-method-name: list
      responses: { "200": { description: ok } }
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        let m = first_method(&doc, "things", "list");
        assert!(m.security_requirements.is_none());
    }

    #[test]
    fn test_spec_level_empty_security_inherited_as_anonymous() {
        // `security: []` at the spec root means every operation is
        // anonymous by default unless it declares its own. Inheritance
        // should propagate the explicit empty vec through.
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://x.com" }]
security: []
paths:
  /things:
    get:
      x-fern-sdk-group-name: ["things"]
      x-fern-sdk-method-name: list
      responses: { "200": { description: ok } }
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        let m = first_method(&doc, "things", "list");
        let reqs = m.security_requirements.as_ref().unwrap();
        assert!(
            reqs.is_empty(),
            "spec-level explicit anonymous should propagate, got {reqs:?}",
        );
    }

    #[test]
    fn test_security_scheme_type_and_scheme_are_case_insensitive() {
        // OpenAPI doesn't formally constrain casing on `type` / `scheme`;
        // real-world specs vary. Match generously.
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://x.com" }]
components:
  securitySchemes:
    a:
      type: HTTP
      scheme: Bearer
    b:
      type: ApiKey
      in: HEADER
      name: X-Api-Key
paths: {}
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        assert_eq!(doc.security_schemes.get("a"), Some(&SecurityScheme::HttpBearer));
        assert_eq!(
            doc.security_schemes.get("b"),
            Some(&SecurityScheme::ApiKeyHeader {
                name: "X-Api-Key".to_string(),
            }),
        );
    }

    #[test]
    fn test_operation_can_reference_undeclared_scheme() {
        // An operation referencing a scheme not in components.securitySchemes
        // is preserved verbatim — Phase 3's RoutingAuthProvider will simply
        // have no binding for it and fall through. Some real-world specs
        // reference externally-configured schemes this way.
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://x.com" }]
paths:
  /thing:
    get:
      x-fern-sdk-group-name: ["thing"]
      x-fern-sdk-method-name: get
      security:
        - externalScheme: []
      responses: { "200": { description: ok } }
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        let m = first_method(&doc, "thing", "get");
        let reqs = m.security_requirements.as_ref().unwrap();
        assert_eq!(reqs.len(), 1);
        assert!(reqs[0].contains_key("externalScheme"));
        // No declaration in components.securitySchemes — that's fine.
        assert!(doc.security_schemes.is_empty());
    }

    #[test]
    fn test_or_of_ands_security_requirements() {
        // The classic `[{a: []}, {b: [], c: []}]` shape: satisfy a alone, OR
        // (b AND c). Verifies we preserve the structure verbatim.
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://x.com" }]
components:
  securitySchemes:
    a: { type: http, scheme: bearer }
    b: { type: apiKey, in: header, name: X-B }
    c: { type: apiKey, in: header, name: X-C }
paths:
  /complex:
    get:
      x-fern-sdk-group-name: ["complex"]
      x-fern-sdk-method-name: get
      security:
        - a: []
        - b: []
          c: []
      responses: { "200": { description: ok } }
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        let m = first_method(&doc, "complex", "get");
        let reqs = m.security_requirements.as_ref().unwrap();
        assert_eq!(reqs.len(), 2);
        // First alternative: just `a`.
        assert!(reqs[0].contains_key("a"));
        assert_eq!(reqs[0].len(), 1);
        // Second alternative: `b` AND `c`.
        assert!(reqs[1].contains_key("b"));
        assert!(reqs[1].contains_key("c"));
        assert_eq!(reqs[1].len(), 2);
    }

    // -----------------------------------------------------------------------
    // deep_merge_yaml tests — matches Fern CLI mergeWithOverrides behavior
    // -----------------------------------------------------------------------

    // -- Scalar / map basics ------------------------------------------------

    #[test]
    fn test_deep_merge_scalars_override_wins() {
        let base: serde_yaml::Value = serde_yaml::from_str("title: Original").unwrap();
        let overrides: serde_yaml::Value = serde_yaml::from_str("title: Overridden").unwrap();
        let merged = deep_merge_yaml(base, overrides);
        assert_eq!(merged["title"], serde_yaml::Value::String("Overridden".into()));
    }

    #[test]
    fn test_deep_merge_adds_new_keys() {
        let base: serde_yaml::Value = serde_yaml::from_str("a: 1").unwrap();
        let overrides: serde_yaml::Value = serde_yaml::from_str("b: 2").unwrap();
        let merged = deep_merge_yaml(base, overrides);
        assert_eq!(merged["a"], serde_yaml::Value::Number(1.into()));
        assert_eq!(merged["b"], serde_yaml::Value::Number(2.into()));
    }

    /// Fern CLI test: "should handle nested object merging"
    #[test]
    fn test_deep_merge_nested_object_merging() {
        let base: serde_yaml::Value = serde_yaml::from_str(r#"
            config:
              settings:
                theme: light
                notifications: true
        "#).unwrap();
        let overrides: serde_yaml::Value = serde_yaml::from_str(r#"
            config:
              settings:
                theme: dark
                sound: false
        "#).unwrap();
        let merged = deep_merge_yaml(base, overrides);
        assert_eq!(merged["config"]["settings"]["theme"], serde_yaml::Value::String("dark".into()));
        assert_eq!(merged["config"]["settings"]["notifications"], serde_yaml::Value::Bool(true));
        assert_eq!(merged["config"]["settings"]["sound"], serde_yaml::Value::Bool(false));
    }

    /// Fern CLI test: "deep-merges nested objects rather than replacing them"
    #[test]
    fn test_deep_merge_nested_sibling_keys() {
        let base: serde_yaml::Value = serde_yaml::from_str(r#"
            foo:
              bar:
                existingKey: original
        "#).unwrap();
        let overrides: serde_yaml::Value = serde_yaml::from_str(r#"
            foo:
              bar:
                newKey: added
        "#).unwrap();
        let merged = deep_merge_yaml(base, overrides);
        assert_eq!(
            merged["foo"]["bar"]["existingKey"],
            serde_yaml::Value::String("original".into())
        );
        assert_eq!(
            merged["foo"]["bar"]["newKey"],
            serde_yaml::Value::String("added".into())
        );
    }

    #[test]
    fn test_deep_merge_nested_openapi_paths() {
        let base: serde_yaml::Value = serde_yaml::from_str(r#"
            paths:
              /users:
                get:
                  summary: List users
                  operationId: listUsers
        "#).unwrap();
        let overrides: serde_yaml::Value = serde_yaml::from_str(r#"
            paths:
              /users:
                get:
                  x-fern-sdk-group-name: [users]
                  x-fern-sdk-method-name: list
        "#).unwrap();
        let merged = deep_merge_yaml(base, overrides);
        assert_eq!(
            merged["paths"]["/users"]["get"]["summary"],
            serde_yaml::Value::String("List users".into())
        );
        assert_eq!(
            merged["paths"]["/users"]["get"]["operationId"],
            serde_yaml::Value::String("listUsers".into())
        );
        assert_eq!(
            merged["paths"]["/users"]["get"]["x-fern-sdk-method-name"],
            serde_yaml::Value::String("list".into())
        );
    }

    // -- Null deletion (omitDeepBy(isNull)) ---------------------------------

    #[test]
    fn test_deep_merge_null_deletes_key() {
        let base: serde_yaml::Value = serde_yaml::from_str(r#"
            info:
              title: API
              description: A description
        "#).unwrap();
        let overrides: serde_yaml::Value = serde_yaml::from_str(r#"
            info:
              description: null
        "#).unwrap();
        let merged = deep_merge_yaml(base, overrides);
        assert_eq!(merged["info"]["title"], serde_yaml::Value::String("API".into()));
        let info = merged["info"].as_mapping().unwrap();
        assert!(!info.contains_key("description"), "null should delete the key");
    }

    /// Fern CLI test: "removes null values from merged result"
    #[test]
    fn test_deep_merge_null_removes_from_merged_result() {
        let base: serde_yaml::Value = serde_yaml::from_str(r#"
            title: Title
            description: A description
        "#).unwrap();
        let overrides: serde_yaml::Value = serde_yaml::from_str(r#"
            description: null
        "#).unwrap();
        let merged = deep_merge_yaml(base, overrides);
        assert_eq!(merged["title"], serde_yaml::Value::String("Title".into()));
        assert!(!merged.as_mapping().unwrap().contains_key("description"));
    }

    /// Nulls inside non-allowlisted keys are still removed.
    #[test]
    fn test_deep_merge_removes_pre_existing_nulls_outside_examples() {
        let base: serde_yaml::Value = serde_yaml::from_str(r#"
            type: object
            properties:
              name:
                type: string
                description: null
        "#).unwrap();
        let overrides: serde_yaml::Value = serde_yaml::from_str("{}").unwrap();
        let merged = deep_merge_yaml(base, overrides);
        let name = merged["properties"]["name"].as_mapping().unwrap();
        assert!(name.contains_key("type"));
        assert!(!name.contains_key("description"), "null outside examples should be removed");
    }

    /// Fern CLI parity: nulls inside `examples` keys are preserved
    /// (allowNullKeys = ["examples"]).
    #[test]
    fn test_deep_merge_preserves_nulls_inside_examples() {
        let base: serde_yaml::Value = serde_yaml::from_str(r#"
            type: object
            properties:
              name:
                type: string
                examples:
                  example1: John
                  example2: null
        "#).unwrap();
        let overrides: serde_yaml::Value = serde_yaml::from_str("{}").unwrap();
        let merged = deep_merge_yaml(base, overrides);
        let examples = merged["properties"]["name"]["examples"].as_mapping().unwrap();
        assert!(examples.contains_key("example1"));
        assert!(examples.contains_key("example2"), "null inside examples should be preserved");
        assert!(examples.get("example2").unwrap().is_null());
    }

    /// Nulls deeply nested under an `examples` key are also preserved.
    #[test]
    fn test_deep_merge_preserves_nulls_deeply_nested_under_examples() {
        let base: serde_yaml::Value = serde_yaml::from_str(r#"
            examples:
              myExample:
                value:
                  name: John
                  email: null
                  nested:
                    field: null
        "#).unwrap();
        let overrides: serde_yaml::Value = serde_yaml::from_str("{}").unwrap();
        let merged = deep_merge_yaml(base, overrides);
        let value = &merged["examples"]["myExample"]["value"];
        assert!(value["email"].is_null(), "null under examples descendant preserved");
        assert!(value["nested"]["field"].is_null(), "deeply nested null under examples preserved");
    }

    /// Nulls outside `examples` are removed even when siblings of examples.
    #[test]
    fn test_deep_merge_mixed_examples_and_non_examples_nulls() {
        let base: serde_yaml::Value = serde_yaml::from_str(r#"
            schema:
              description: null
              examples:
                ex1: null
        "#).unwrap();
        let overrides: serde_yaml::Value = serde_yaml::from_str("{}").unwrap();
        let merged = deep_merge_yaml(base, overrides);
        let schema = merged["schema"].as_mapping().unwrap();
        assert!(!schema.contains_key("description"), "null outside examples removed");
        let examples = schema.get("examples").unwrap().as_mapping().unwrap();
        assert!(examples.contains_key("ex1"), "null inside examples preserved");
    }

    /// Null deletion should be recursive through deeply nested maps.
    #[test]
    fn test_deep_merge_null_deletes_deeply_nested() {
        let base: serde_yaml::Value = serde_yaml::from_str(r#"
            a:
              b:
                c:
                  keep: true
                  remove_me: value
        "#).unwrap();
        let overrides: serde_yaml::Value = serde_yaml::from_str(r#"
            a:
              b:
                c:
                  remove_me: null
        "#).unwrap();
        let merged = deep_merge_yaml(base, overrides);
        let c = merged["a"]["b"]["c"].as_mapping().unwrap();
        assert!(c.contains_key("keep"));
        assert!(!c.contains_key("remove_me"));
    }

    // -- Array of primitives: replaced wholesale (Fern parity) --------------

    /// Fern CLI test: "should replace arrays of primitives"
    #[test]
    fn test_deep_merge_primitive_arrays_replaced_wholesale() {
        let base: serde_yaml::Value = serde_yaml::from_str(r#"
            tags: [tag1, tag2]
        "#).unwrap();
        let overrides: serde_yaml::Value = serde_yaml::from_str(r#"
            tags: [tag3, tag4]
        "#).unwrap();
        let merged = deep_merge_yaml(base, overrides);
        let tags = merged["tags"].as_sequence().unwrap();
        assert_eq!(tags.len(), 2);
        assert_eq!(tags[0], serde_yaml::Value::String("tag3".into()));
        assert_eq!(tags[1], serde_yaml::Value::String("tag4".into()));
    }

    #[test]
    fn test_deep_merge_primitive_array_shorter_override_replaces() {
        let base: serde_yaml::Value = serde_yaml::from_str("tags: [a, b, c]").unwrap();
        let overrides: serde_yaml::Value = serde_yaml::from_str("tags: [x]").unwrap();
        let merged = deep_merge_yaml(base, overrides);
        let tags = merged["tags"].as_sequence().unwrap();
        assert_eq!(tags.len(), 1);
        assert_eq!(tags[0], serde_yaml::Value::String("x".into()));
    }

    // -- Arrays of objects: merged element-by-element (Fern parity) ---------

    /// Fern CLI test: "should merge arrays of objects"
    #[test]
    fn test_deep_merge_object_arrays_merged_by_index() {
        let base: serde_yaml::Value = serde_yaml::from_str(r#"
            items:
              - id: 1
                name: Item 1
              - id: 2
                name: Item 2
        "#).unwrap();
        let overrides: serde_yaml::Value = serde_yaml::from_str(r#"
            items:
              - id: 1
                description: Updated Item 1
        "#).unwrap();
        let merged = deep_merge_yaml(base, overrides);
        let items = merged["items"].as_sequence().unwrap();
        // Element 0 merged: base {id:1, name: Item 1} + override {id:1, description: Updated Item 1}
        assert_eq!(items[0]["id"], serde_yaml::Value::Number(1.into()));
        assert_eq!(items[0]["name"], serde_yaml::Value::String("Item 1".into()));
        assert_eq!(items[0]["description"], serde_yaml::Value::String("Updated Item 1".into()));
        // Element 1 carried from base (override only has 1 element)
        assert_eq!(items.len(), 2);
        assert_eq!(items[1]["id"], serde_yaml::Value::Number(2.into()));
        assert_eq!(items[1]["name"], serde_yaml::Value::String("Item 2".into()));
    }

    /// Override array longer than base — extra elements appended.
    #[test]
    fn test_deep_merge_object_arrays_override_longer() {
        let base: serde_yaml::Value = serde_yaml::from_str(r#"
            servers:
              - url: "https://a.com"
        "#).unwrap();
        let overrides: serde_yaml::Value = serde_yaml::from_str(r#"
            servers:
              - url: "https://a-patched.com"
              - url: "https://b.com"
        "#).unwrap();
        let merged = deep_merge_yaml(base, overrides);
        let servers = merged["servers"].as_sequence().unwrap();
        assert_eq!(servers.len(), 2);
        assert_eq!(servers[0]["url"], serde_yaml::Value::String("https://a-patched.com".into()));
        assert_eq!(servers[1]["url"], serde_yaml::Value::String("https://b.com".into()));
    }

    /// OpenAPI parameters array (array of objects) should merge by index.
    #[test]
    fn test_deep_merge_parameters_array_merges_by_index() {
        let base: serde_yaml::Value = serde_yaml::from_str(r#"
            parameters:
              - name: limit
                in: query
                required: false
              - name: offset
                in: query
                required: false
        "#).unwrap();
        let overrides: serde_yaml::Value = serde_yaml::from_str(r#"
            parameters:
              - description: Maximum number of results
        "#).unwrap();
        let merged = deep_merge_yaml(base, overrides);
        let params = merged["parameters"].as_sequence().unwrap();
        assert_eq!(params.len(), 2);
        // First param: merged with override
        assert_eq!(params[0]["name"], serde_yaml::Value::String("limit".into()));
        assert_eq!(params[0]["description"], serde_yaml::Value::String("Maximum number of results".into()));
        // Second param: untouched from base
        assert_eq!(params[1]["name"], serde_yaml::Value::String("offset".into()));
    }

    // -- Mixed arrays (primitives + objects): replaced wholesale -------------

    #[test]
    fn test_deep_merge_mixed_array_replaced_wholesale() {
        let base: serde_yaml::Value = serde_yaml::from_str(r#"
            mixed:
              - name: obj
              - just_a_string
        "#).unwrap();
        let overrides: serde_yaml::Value = serde_yaml::from_str(r#"
            mixed:
              - replaced: true
        "#).unwrap();
        let merged = deep_merge_yaml(base, overrides);
        let mixed = merged["mixed"].as_sequence().unwrap();
        // Base had mixed types → override replaces wholesale
        assert_eq!(mixed.len(), 1);
    }

    // -- Enum arrays (primitives) in schemas --------------------------------

    #[test]
    fn test_deep_merge_enum_array_replaced() {
        let base: serde_yaml::Value = serde_yaml::from_str(r#"
            accountStatus:
              type: string
              enum: [active, suspended, deleted]
        "#).unwrap();
        let overrides: serde_yaml::Value = serde_yaml::from_str(r#"
            accountStatus:
              enum: [active, suspended, deleted, inactive]
        "#).unwrap();
        let merged = deep_merge_yaml(base, overrides);
        let enums = merged["accountStatus"]["enum"].as_sequence().unwrap();
        assert_eq!(enums.len(), 4);
        assert_eq!(enums[3], serde_yaml::Value::String("inactive".into()));
        // type preserved from base
        assert_eq!(merged["accountStatus"]["type"], serde_yaml::Value::String("string".into()));
    }

    // -- Overrides-resolution fixture parity --------------------------------

    /// Matches the Fern CLI overrides-resolution fixture: override adds a new
    /// property (lastName) to an existing schema, preserving existing ones.
    #[test]
    fn test_deep_merge_override_adds_schema_property() {
        let base: serde_yaml::Value = serde_yaml::from_str(r#"
            components:
              schemas:
                UserUpdate:
                  type: object
                  properties:
                    name:
                      type: string
                    email:
                      type: string
                      nullable: true
        "#).unwrap();
        let overrides: serde_yaml::Value = serde_yaml::from_str(r#"
            components:
              schemas:
                UserUpdate:
                  type: object
                  properties:
                    name:
                      type: string
                    lastName:
                      type: string
                    email:
                      type: string
                      nullable: true
        "#).unwrap();
        let merged = deep_merge_yaml(base, overrides);
        let props = merged["components"]["schemas"]["UserUpdate"]["properties"]
            .as_mapping().unwrap();
        assert!(props.contains_key("name"));
        assert!(props.contains_key("lastName"), "new property from override");
        assert!(props.contains_key("email"));
    }

    /// Override introduces an entirely new schema that doesn't exist in the base.
    #[test]
    fn test_deep_merge_override_adds_new_schema() {
        let base: serde_yaml::Value = serde_yaml::from_str(r#"
            components:
              schemas:
                User:
                  type: object
                  properties:
                    id:
                      type: string
        "#).unwrap();
        let overrides: serde_yaml::Value = serde_yaml::from_str(r#"
            components:
              schemas:
                UserStats:
                  type: object
                  properties:
                    totalLogins:
                      type: integer
        "#).unwrap();
        let merged = deep_merge_yaml(base, overrides);
        let schemas = merged["components"]["schemas"].as_mapping().unwrap();
        assert!(schemas.contains_key("User"), "base schema preserved");
        assert!(schemas.contains_key("UserStats"), "new schema from override");
    }

    // -- Sequential override application ------------------------------------

    #[test]
    fn test_deep_merge_multiple_overrides_applied_sequentially() {
        let base: serde_yaml::Value = serde_yaml::from_str("a: 1\nb: 2\nc: 3").unwrap();
        let ovr1: serde_yaml::Value = serde_yaml::from_str("a: 10\nd: 4").unwrap();
        let ovr2: serde_yaml::Value = serde_yaml::from_str("a: 100\nb: null").unwrap();
        let merged = deep_merge_yaml(deep_merge_yaml(base, ovr1), ovr2);
        assert_eq!(merged["a"], serde_yaml::Value::Number(100.into()));
        assert!(!merged.as_mapping().unwrap().contains_key("b"));
        assert_eq!(merged["c"], serde_yaml::Value::Number(3.into()));
        assert_eq!(merged["d"], serde_yaml::Value::Number(4.into()));
    }

    // -- Empty overrides is identity ----------------------------------------

    #[test]
    fn test_deep_merge_empty_override_is_identity() {
        let base: serde_yaml::Value = serde_yaml::from_str(r#"
            info:
              title: API
              version: "1.0"
        "#).unwrap();
        let overrides: serde_yaml::Value = serde_yaml::from_str("{}").unwrap();
        let merged = deep_merge_yaml(base.clone(), overrides);
        // With the exception of pre-existing nulls being removed, result
        // should match. This base has none, so it should be identical.
        assert_eq!(merged["info"]["title"], base["info"]["title"]);
        assert_eq!(merged["info"]["version"], base["info"]["version"]);
    }

    // -- End-to-end: override adds Fern extensions, parser reflects them ----

    #[test]
    fn test_deep_merge_override_adds_fern_extensions_to_spec() {
        let base_yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://api.example.com" }]
paths:
  /customers:
    get:
      tags: [Customers]
      operationId: getCustomers
      responses: { "200": { description: ok } }
"#;
        let overrides_yaml = r#"
paths:
  /customers:
    get:
      x-fern-sdk-group-name: [customers]
      x-fern-sdk-method-name: list
"#;
        // Without overrides: method name from operationId
        let doc_no_override = load_openapi_spec(base_yaml, "t").unwrap();
        let customers = &doc_no_override.resources["customers"];
        assert!(customers.methods.contains_key("get-customers"));

        // With overrides: method name from x-fern-sdk-method-name
        let base_val: serde_yaml::Value = serde_yaml::from_str(base_yaml).unwrap();
        let ovr_val: serde_yaml::Value = serde_yaml::from_str(overrides_yaml).unwrap();
        let merged = deep_merge_yaml(base_val, ovr_val);
        let doc_with_override = load_openapi_spec_from_value(merged, "t").unwrap();
        let customers = &doc_with_override.resources["customers"];
        assert!(
            customers.methods.contains_key("list"),
            "override should set method name to 'list', got keys: {:?}",
            customers.methods.keys().collect::<Vec<_>>()
        );
    }

    /// Multi-operation override: adds fern extensions to multiple endpoints.
    #[test]
    fn test_deep_merge_multi_operation_fern_extensions() {
        let base_yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://api.example.com" }]
paths:
  /customers:
    get:
      tags: [Customers]
      operationId: getCustomers
      responses: { "200": { description: ok } }
    post:
      tags: [Customers]
      operationId: createCustomer
      responses: { "201": { description: created } }
  /orders:
    get:
      tags: [Orders]
      operationId: getOrders
      responses: { "200": { description: ok } }
"#;
        let overrides_yaml = r#"
paths:
  /customers:
    get:
      x-fern-sdk-group-name: [customers]
      x-fern-sdk-method-name: list
    post:
      x-fern-sdk-group-name: [customers]
      x-fern-sdk-method-name: create
  /orders:
    get:
      x-fern-sdk-group-name: [orders]
      x-fern-sdk-method-name: list
"#;
        let base_val: serde_yaml::Value = serde_yaml::from_str(base_yaml).unwrap();
        let ovr_val: serde_yaml::Value = serde_yaml::from_str(overrides_yaml).unwrap();
        let merged = deep_merge_yaml(base_val, ovr_val);
        let doc = load_openapi_spec_from_value(merged, "t").unwrap();
        let customers = &doc.resources["customers"];
        assert!(customers.methods.contains_key("list"));
        assert!(customers.methods.contains_key("create"));
        let orders = &doc.resources["orders"];
        assert!(orders.methods.contains_key("list"));
    }

    /// Override re-groups an operation into a different resource.
    #[test]
    fn test_deep_merge_override_changes_group_name() {
        let base_yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://api.example.com" }]
paths:
  /admin/users:
    get:
      tags: [Admin]
      operationId: adminListUsers
      responses: { "200": { description: ok } }
"#;
        let overrides_yaml = r#"
paths:
  /admin/users:
    get:
      x-fern-sdk-group-name: [admin, users]
      x-fern-sdk-method-name: list
"#;
        let base_val: serde_yaml::Value = serde_yaml::from_str(base_yaml).unwrap();
        let ovr_val: serde_yaml::Value = serde_yaml::from_str(overrides_yaml).unwrap();
        let merged = deep_merge_yaml(base_val, ovr_val);
        let doc = load_openapi_spec_from_value(merged, "t").unwrap();
        let admin = &doc.resources["admin"];
        let users = &admin.resources["users"];
        assert!(
            users.methods.contains_key("list"),
            "override should place method under admin.users"
        );
    }

    // -- Null removal inside arrays of objects ------------------------------

    #[test]
    fn test_deep_merge_null_removed_inside_object_array() {
        let base: serde_yaml::Value = serde_yaml::from_str(r#"
            items:
              - name: keep
                remove: value
        "#).unwrap();
        let overrides: serde_yaml::Value = serde_yaml::from_str(r#"
            items:
              - remove: null
        "#).unwrap();
        let merged = deep_merge_yaml(base, overrides);
        let item = &merged["items"].as_sequence().unwrap()[0];
        let map = item.as_mapping().unwrap();
        assert!(map.contains_key("name"));
        assert!(!map.contains_key("remove"), "null inside object array element should be removed");
    }

    // -- Verification: from_str vs from_value round-trip --------------------

    // -- Verification: allowNullKeys covers all Fern CLI keys ---------------

    #[test]
    fn test_allow_null_keys_covers_all_fern_cli_keys() {
        assert!(ALLOW_NULL_KEYS.contains(&"examples"));
        assert!(ALLOW_NULL_KEYS.contains(&"example"));
        assert!(ALLOW_NULL_KEYS.contains(&"x-fern-examples"));
        assert!(ALLOW_NULL_KEYS.contains(&"x-code-samples"));
        assert!(ALLOW_NULL_KEYS.contains(&"x-codeSamples"));
        assert_eq!(ALLOW_NULL_KEYS.len(), 5, "should have exactly 5 keys matching Fern CLI");
    }

    #[test]
    fn test_null_preserved_under_example_singular() {
        let base: serde_yaml::Value = serde_yaml::from_str(r#"
            schema:
              example: null
              description: null
        "#).unwrap();
        let merged = deep_merge_yaml(base.clone(), serde_yaml::Value::Mapping(serde_yaml::Mapping::new()));
        let map = merged.as_mapping().unwrap();
        let schema = map.get("schema").unwrap().as_mapping().unwrap();
        assert!(schema.contains_key("example"), "'example' (singular) null should be preserved");
        assert!(!schema.contains_key("description"), "'description' null should be removed");
    }

    #[test]
    fn test_null_preserved_under_x_fern_examples() {
        let base: serde_yaml::Value = serde_yaml::from_str(r#"
            x-fern-examples:
              - value: null
        "#).unwrap();
        let merged = deep_merge_yaml(base, serde_yaml::Value::Mapping(serde_yaml::Mapping::new()));
        let seq = merged["x-fern-examples"].as_sequence().unwrap();
        let item = seq[0].as_mapping().unwrap();
        assert!(item.get("value").unwrap().is_null(), "null under x-fern-examples should be preserved");
    }

    #[test]
    fn test_null_preserved_under_x_code_samples() {
        let base: serde_yaml::Value = serde_yaml::from_str(r#"
            x-code-samples:
              - lang: python
                source: null
        "#).unwrap();
        let merged = deep_merge_yaml(base, serde_yaml::Value::Mapping(serde_yaml::Mapping::new()));
        let item = &merged["x-code-samples"].as_sequence().unwrap()[0];
        assert!(item["source"].is_null(), "null under x-code-samples should be preserved");
    }

    // -- Verification: real overrides e2e -----------------------------------

    // -- Verification: all_objects heuristic --------------------------------

    #[test]
    fn test_all_objects_empty_arrays_vacuous_truth() {
        assert!(all_objects(&[]), "empty array should pass all_objects (vacuous truth)");
        let base: serde_yaml::Value = serde_yaml::from_str("items: []").unwrap();
        let ovr: serde_yaml::Value = serde_yaml::from_str("items: []").unwrap();
        let merged = deep_merge_yaml(base, ovr);
        assert_eq!(merged["items"].as_sequence().unwrap().len(), 0, "two empty arrays merge to empty");
    }

    #[test]
    fn test_all_objects_servers_array_is_all_objects() {
        let yaml = r#"
servers:
  - url: https://api.example.com
  - url: https://api2.example.com
"#;
        let val: serde_yaml::Value = serde_yaml::from_str(yaml).unwrap();
        let servers = val["servers"].as_sequence().unwrap();
        assert!(all_objects(servers), "servers array should be all objects → index-merge path");
    }

    #[test]
    fn test_all_objects_tags_array_is_primitives() {
        let yaml = r#"
tags:
  - Customers
  - Orders
"#;
        let val: serde_yaml::Value = serde_yaml::from_str(yaml).unwrap();
        let tags = val["tags"].as_sequence().unwrap();
        assert!(!all_objects(tags), "string array should NOT be all objects → replace path");
    }

    // ---------------------------------------------------------------
    // `x-fern-pagination` resolution
    // ---------------------------------------------------------------

    fn yaml(input: &str) -> serde_yaml::Value {
        serde_yaml::from_str(input).expect("valid yaml in test fixture")
    }

    #[test]
    fn test_strip_pagination_prefix_request_and_response() {
        assert_eq!(strip_pagination_prefix("$request.cursor"), "cursor");
        assert_eq!(
            strip_pagination_prefix("$response.pagination.next_cursor"),
            "pagination.next_cursor"
        );
        // No prefix: returned verbatim. This matches the upstream importer,
        // which is intentionally lenient about callers that already passed
        // a dotted path.
        assert_eq!(strip_pagination_prefix("plain"), "plain");
    }

    #[test]
    fn test_resolve_pagination_cursor_form_strips_prefixes() {
        let op = yaml(
            r#"
cursor: $request.starting_after
next_cursor: $response.pagination.next
results: $response.data
"#,
        );
        let cfg = resolve_pagination_extension(Some(&op), None, "listFoos")
            .unwrap()
            .expect("cursor form should produce Some(...)");
        match cfg {
            PaginationConfig::Cursor {
                cursor,
                next_cursor,
                results,
            } => {
                assert_eq!(cursor, "starting_after");
                assert_eq!(next_cursor, "pagination.next");
                assert_eq!(results, "data");
            }
            other => panic!("expected Cursor, got {other:?}"),
        }
    }

    #[test]
    fn test_resolve_pagination_offset_form_with_step_and_has_next_page() {
        let op = yaml(
            r#"
offset: $request.page
results: $response.users
step: $request.page_size
has-next-page: $response.meta.has_more
"#,
        );
        let cfg = resolve_pagination_extension(Some(&op), None, "listUsers")
            .unwrap()
            .expect("offset form should produce Some(...)");
        match cfg {
            PaginationConfig::Offset {
                offset,
                results,
                step,
                has_next_page,
            } => {
                assert_eq!(offset, "page");
                assert_eq!(results, "users");
                assert_eq!(step.as_deref(), Some("page_size"));
                assert_eq!(has_next_page.as_deref(), Some("meta.has_more"));
            }
            other => panic!("expected Offset, got {other:?}"),
        }
    }

    #[test]
    fn test_resolve_pagination_inherits_root_when_op_is_true() {
        let root = yaml(
            r#"
cursor: $request.cursor
next_cursor: $response.next_cursor
results: $response.items
"#,
        );
        let op = serde_yaml::Value::Bool(true);
        let cfg = resolve_pagination_extension(Some(&op), Some(&root), "listFoos")
            .unwrap()
            .expect("true should inherit root config");
        match cfg {
            PaginationConfig::Cursor {
                cursor,
                next_cursor,
                results,
            } => {
                assert_eq!(cursor, "cursor");
                assert_eq!(next_cursor, "next_cursor");
                assert_eq!(results, "items");
            }
            other => panic!("expected Cursor, got {other:?}"),
        }
    }

    #[test]
    fn test_resolve_pagination_op_false_inherits_root_like_upstream() {
        // Upstream `getFernPaginationExtension.ts` treats *any* boolean —
        // including `false` — as "look up the root extension". Mirror that
        // exactly so cli-sdk has parity with the rest of the Fern toolchain.
        let root = yaml(
            r#"
cursor: $request.cursor
next_cursor: $response.next_cursor
results: $response.items
"#,
        );
        let op = serde_yaml::Value::Bool(false);
        let cfg = resolve_pagination_extension(Some(&op), Some(&root), "listFoos")
            .unwrap()
            .expect("false should still resolve via root (upstream parity)");
        assert!(matches!(cfg, PaginationConfig::Cursor { .. }));
    }

    #[test]
    fn test_resolve_pagination_missing_extension_returns_none() {
        let cfg = resolve_pagination_extension(None, None, "listFoos").unwrap();
        assert!(cfg.is_none(), "absent extension → fall back to heuristic");
    }

    #[test]
    fn test_resolve_pagination_op_true_without_root_returns_none() {
        // Upstream returns `undefined` (no pagination) when the op asks to
        // inherit but no root block exists. It does *not* raise. Mirror.
        let op = serde_yaml::Value::Bool(true);
        let cfg = resolve_pagination_extension(Some(&op), None, "listFoos").unwrap();
        assert!(
            cfg.is_none(),
            "true without root → no pagination (upstream parity)"
        );
    }

    #[test]
    fn test_resolve_pagination_discrimination_order_matches_upstream() {
        // Upstream's `convertPaginationExtension` discriminates by checking
        // `cursor` first, then `next_uri`, then `next_path`, then `offset`.
        // When multiple keys collide we must pick the cursor branch — the
        // first one — to stay consistent with how user specs are
        // interpreted by the rest of the Fern toolchain.
        let op = yaml(
            r#"
cursor: $request.cursor
offset: $request.page
results: $response.items
next_cursor: $response.next
"#,
        );
        let cfg = resolve_pagination_extension(Some(&op), None, "listFoos")
            .unwrap()
            .expect("should resolve to cursor variant");
        assert!(
            matches!(cfg, PaginationConfig::Cursor { .. }),
            "cursor should win when both `cursor` and `offset` are present"
        );
    }

    #[test]
    fn test_resolve_pagination_unknown_form_errors() {
        // Just `results` — no discriminator. Upstream throws
        // `Invalid pagination extension`; we surface a discovery error
        // referencing every valid form so the user can debug.
        let op = yaml("results: $response.items\n");
        let err = resolve_pagination_extension(Some(&op), None, "listFoos")
            .expect_err("unknown form should error");
        let msg = format!("{err}");
        assert!(msg.contains("cursor"), "got: {msg}");
        assert!(msg.contains("next_uri"), "got: {msg}");
        assert!(msg.contains("next_path"), "got: {msg}");
        assert!(msg.contains("offset"), "got: {msg}");
        assert!(msg.contains("custom"), "got: {msg}");
    }

    #[test]
    fn test_resolve_pagination_non_object_form_errors() {
        let op = yaml("- not\n- an\n- object\n");
        let err = resolve_pagination_extension(Some(&op), None, "listFoos")
            .expect_err("sequence should error");
        assert!(
            format!("{err}").contains("expected an object"),
            "got: {err}"
        );
    }

    #[test]
    fn test_resolve_pagination_cursor_form_requires_all_fields() {
        // `next_cursor` is missing.
        let op = yaml(
            r#"
cursor: $request.starting_after
results: $response.data
"#,
        );
        let err = resolve_pagination_extension(Some(&op), None, "listFoos")
            .expect_err("missing next_cursor should error");
        assert!(
            format!("{err}").contains("next_cursor"),
            "got: {err}"
        );
    }

    #[test]
    fn test_resolve_pagination_uri_form() {
        let op = yaml(
            r#"
next_uri: $response.next
results: $response.items
"#,
        );
        let cfg = resolve_pagination_extension(Some(&op), None, "listFoos")
            .unwrap()
            .expect("uri form should resolve");
        match cfg {
            PaginationConfig::Uri { next_uri, results } => {
                assert_eq!(next_uri, "next");
                assert_eq!(results, "items");
            }
            other => panic!("expected Uri, got {other:?}"),
        }
    }

    #[test]
    fn test_resolve_pagination_path_form() {
        let op = yaml(
            r#"
next_path: $response.links.next
results: $response.entries
"#,
        );
        let cfg = resolve_pagination_extension(Some(&op), None, "listFoos")
            .unwrap()
            .expect("path form should resolve");
        match cfg {
            PaginationConfig::Path { next_path, results } => {
                assert_eq!(next_path, "links.next");
                assert_eq!(results, "entries");
            }
            other => panic!("expected Path, got {other:?}"),
        }
    }

    #[test]
    fn test_resolve_pagination_custom_form() {
        let op = yaml(
            r#"
type: custom
results: $response.items
"#,
        );
        let cfg = resolve_pagination_extension(Some(&op), None, "listFoos")
            .unwrap()
            .expect("custom form should resolve");
        match cfg {
            PaginationConfig::Custom { results } => assert_eq!(results, "items"),
            other => panic!("expected Custom, got {other:?}"),
        }
    }

    #[test]
    fn test_resolve_pagination_custom_form_rejects_unknown_type() {
        // `type: anythingElse` is not a valid discriminator, so we fall
        // through to the "unknown form" error.
        let op = yaml(
            r#"
type: nonsense
results: $response.items
"#,
        );
        let err = resolve_pagination_extension(Some(&op), None, "listFoos")
            .expect_err("non-custom `type` should error");
        assert!(
            format!("{err}").contains("`type: custom`"),
            "got: {err}"
        );
    }

    #[test]
    fn test_resolve_pagination_op_bool_with_root_bool_is_validation_error() {
        // Mirrors upstream: when both per-op and root are booleans, raise.
        let root = serde_yaml::Value::Bool(true);
        let op = serde_yaml::Value::Bool(true);
        let err = resolve_pagination_extension(Some(&op), Some(&root), "listFoos")
            .expect_err("root-also-bool should error");
        assert!(
            format!("{err}").contains("spec-root"),
            "got: {err}"
        );
    }

    #[test]
    fn test_resolve_pagination_uri_form_requires_both_fields() {
        // `results` is missing.
        let op = yaml("next_uri: $response.next\n");
        let err = resolve_pagination_extension(Some(&op), None, "listFoos")
            .expect_err("missing results should error");
        assert!(format!("{err}").contains("results"), "got: {err}");
    }

    #[test]
    fn test_resolve_pagination_offset_form_with_optional_fields() {
        let op = yaml(
            r#"
offset: $request.page
results: $response.items
step: $request.page_size
has-next-page: $response.has_more
"#,
        );
        let cfg = resolve_pagination_extension(Some(&op), None, "listFoos")
            .unwrap()
            .expect("offset form should resolve");
        match cfg {
            PaginationConfig::Offset {
                offset,
                results,
                step,
                has_next_page,
            } => {
                assert_eq!(offset, "page");
                assert_eq!(results, "items");
                assert_eq!(step.as_deref(), Some("page_size"));
                assert_eq!(has_next_page.as_deref(), Some("has_more"));
            }
            other => panic!("expected Offset, got {other:?}"),
        }
    }

    // ------------------------------------------------------------------
    // x-fern-availability — operation level
    // ------------------------------------------------------------------

    /// Build a single-operation spec with the given `extra` YAML injected
    /// inside the GET operation. Returns the parsed `RestMethod`.
    fn parse_op_with_extra(extra: &str) -> RestDescription {
        let yaml = format!(
            r#"
openapi: "3.0.0"
info: {{ title: T, version: "1.0" }}
servers: [{{ url: "https://x.com" }}]
paths:
  /things:
    get:
      x-fern-sdk-group-name: ["things"]
      x-fern-sdk-method-name: list
{extra}
      responses: {{ "200": {{ description: ok }} }}
"#
        );
        load_openapi_spec(&yaml, "t").unwrap()
    }

    #[test]
    fn test_operation_availability_beta() {
        let doc = parse_op_with_extra("      x-fern-availability: beta");
        let m = first_method(&doc, "things", "list");
        assert_eq!(m.availability, Some(Availability::Beta));
    }

    #[test]
    fn test_operation_availability_pre_release() {
        let doc = parse_op_with_extra("      x-fern-availability: pre-release");
        let m = first_method(&doc, "things", "list");
        assert_eq!(m.availability, Some(Availability::PreRelease));
    }

    #[test]
    fn test_operation_availability_generally_available_canonical() {
        let doc = parse_op_with_extra("      x-fern-availability: generally-available");
        let m = first_method(&doc, "things", "list");
        assert_eq!(m.availability, Some(Availability::GenerallyAvailable));
    }

    #[test]
    fn test_operation_availability_alias_ga() {
        let doc = parse_op_with_extra("      x-fern-availability: ga");
        let m = first_method(&doc, "things", "list");
        assert_eq!(m.availability, Some(Availability::GenerallyAvailable));
    }

    #[test]
    fn test_operation_availability_alpha() {
        let doc = parse_op_with_extra("      x-fern-availability: alpha");
        let m = first_method(&doc, "things", "list");
        assert_eq!(m.availability, Some(Availability::Alpha));
    }

    #[test]
    fn test_operation_availability_preview() {
        let doc = parse_op_with_extra("      x-fern-availability: preview");
        let m = first_method(&doc, "things", "list");
        assert_eq!(m.availability, Some(Availability::Preview));
    }

    #[test]
    fn test_operation_availability_legacy() {
        let doc = parse_op_with_extra("      x-fern-availability: legacy");
        let m = first_method(&doc, "things", "list");
        assert_eq!(m.availability, Some(Availability::Legacy));
    }

    /// `stable` is NOT a valid Fern availability — the Fern OpenAPI
    /// importer accepts only `ga` (and the canonical
    /// `generally-available`). Make sure cli-sdk rejects `stable` for
    /// parity, so it can't silently work in one tool and not the other.
    #[test]
    fn test_operation_availability_stable_is_rejected() {
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://x.com" }]
paths:
  /things:
    get:
      x-fern-sdk-group-name: ["things"]
      x-fern-sdk-method-name: list
      x-fern-availability: stable
      responses: { "200": { description: ok } }
"#;
        let err = load_openapi_spec(yaml, "t")
            .expect_err("`stable` must NOT be accepted — only `ga` and `generally-available` are");
        let msg = err.to_string();
        assert!(
            msg.contains("unknown variant") || msg.contains("variant `stable`"),
            "expected serde deser error mentioning the unknown variant `stable`, got: {msg}",
        );
    }

    /// Locks in the canonical wire spelling for `pre-release` so the
    /// kebab-case rename can't drift. The Fern OpenAPI IR importer
    /// collapses `pre-release` into `Beta`; cli-sdk deliberately keeps
    /// `PreRelease` distinct (see `Availability` enum docs).
    #[test]
    fn test_operation_availability_pre_release_wire_spelling() {
        let doc = parse_op_with_extra("      x-fern-availability: pre-release");
        let m = first_method(&doc, "things", "list");
        assert_eq!(
            m.availability,
            Some(Availability::PreRelease),
            "`pre-release` must deser to its own variant, not collapse to Beta",
        );
        assert_eq!(m.availability.unwrap().as_str(), "pre-release");
        assert_eq!(m.availability.unwrap().badge(), Some("[PRE-RELEASE]"));
    }

    #[test]
    fn test_operation_availability_deprecated_value() {
        let doc = parse_op_with_extra("      x-fern-availability: deprecated");
        let m = first_method(&doc, "things", "list");
        assert_eq!(m.availability, Some(Availability::Deprecated));
    }

    #[test]
    fn test_operation_availability_absent_defaults_to_none() {
        let doc = parse_op_with_extra("");
        let m = first_method(&doc, "things", "list");
        assert_eq!(m.availability, None, "no extension and no deprecated flag → no badge");
    }

    #[test]
    fn test_operation_openapi_deprecated_true_falls_back_to_deprecated() {
        let doc = parse_op_with_extra("      deprecated: true");
        let m = first_method(&doc, "things", "list");
        assert_eq!(
            m.availability,
            Some(Availability::Deprecated),
            "OpenAPI standard `deprecated: true` should lower to Availability::Deprecated when x-fern-availability is absent",
        );
    }

    #[test]
    fn test_operation_x_fern_availability_overrides_openapi_deprecated() {
        // Both set — x-fern-availability wins.
        let doc = parse_op_with_extra(
            "      deprecated: true\n      x-fern-availability: beta",
        );
        let m = first_method(&doc, "things", "list");
        assert_eq!(
            m.availability,
            Some(Availability::Beta),
            "explicit x-fern-availability must override OpenAPI deprecated:true",
        );
    }

    // ------------------------------------------------------------------
    // x-fern-availability — parameter level
    // ------------------------------------------------------------------

    #[test]
    fn test_parameter_availability_beta() {
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://x.com" }]
paths:
  /things:
    get:
      x-fern-sdk-group-name: ["things"]
      x-fern-sdk-method-name: list
      parameters:
        - name: legacy_filter
          in: query
          x-fern-availability: beta
          schema: { type: string }
      responses: { "200": { description: ok } }
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        let m = first_method(&doc, "things", "list");
        let p = m.parameters.get("legacy_filter").expect("param missing");
        assert_eq!(p.availability, Some(Availability::Beta));
    }

    #[test]
    fn test_parameter_openapi_deprecated_falls_back_to_deprecated_availability() {
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers: [{ url: "https://x.com" }]
paths:
  /things:
    get:
      x-fern-sdk-group-name: ["things"]
      x-fern-sdk-method-name: list
      parameters:
        - name: legacy_filter
          in: query
          deprecated: true
          schema: { type: string }
      responses: { "200": { description: ok } }
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        let m = first_method(&doc, "things", "list");
        let p = m.parameters.get("legacy_filter").expect("param missing");
        assert_eq!(p.availability, Some(Availability::Deprecated));
        assert!(p.deprecated, "raw deprecated flag is still preserved");
    }

    // -----------------------------------------------------------------------
    // x-fern-base-path
    // -----------------------------------------------------------------------

    /// Spec without `x-fern-base-path` → `RestDescription.base_path` is None.
    #[test]
    fn test_x_fern_base_path_absent_yields_none() {
        let yaml = r#"
openapi: "3.0.0"
info: { title: t, version: "1.0" }
servers: [{ url: "https://api.example.com" }]
paths:
  /things:
    get:
      x-fern-sdk-group-name: [things]
      x-fern-sdk-method-name: list
      responses: { "200": { description: ok } }
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        assert_eq!(doc.base_path, None);
    }

    /// Spec with leading-slash `x-fern-base-path` is captured verbatim.
    #[test]
    fn test_x_fern_base_path_with_leading_slash_captured_verbatim() {
        let yaml = r#"
openapi: "3.0.0"
info: { title: t, version: "1.0" }
servers: [{ url: "https://api.example.com" }]
x-fern-base-path: /v1
paths:
  /things:
    get:
      x-fern-sdk-group-name: [things]
      x-fern-sdk-method-name: list
      responses: { "200": { description: ok } }
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        assert_eq!(doc.base_path.as_deref(), Some("/v1"));
    }

    /// Spec without a leading slash on `x-fern-base-path` is captured as
    /// authored — `build_url` normalizes slashes at request time so the
    /// parser does not reshape the user's input.
    #[test]
    fn test_x_fern_base_path_without_leading_slash_captured_verbatim() {
        let yaml = r#"
openapi: "3.0.0"
info: { title: t, version: "1.0" }
servers: [{ url: "https://api.example.com" }]
x-fern-base-path: api/public
paths:
  /things:
    get:
      x-fern-sdk-group-name: [things]
      x-fern-sdk-method-name: list
      responses: { "200": { description: ok } }
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        assert_eq!(doc.base_path.as_deref(), Some("api/public"));
    }

    /// Empty / whitespace-only `x-fern-base-path` collapses to None so
    /// the executor's slash-edge logic doesn't have to handle the empty
    /// case.
    #[test]
    fn test_x_fern_base_path_empty_string_collapses_to_none() {
        let yaml = r#"
openapi: "3.0.0"
info: { title: t, version: "1.0" }
servers: [{ url: "https://api.example.com" }]
x-fern-base-path: ""
paths:
  /things:
    get:
      x-fern-sdk-group-name: [things]
      x-fern-sdk-method-name: list
      responses: { "200": { description: ok } }
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        assert_eq!(doc.base_path, None);
    }

    /// `x-fern-base-path` does not affect the command tree — operations
    /// are still grouped by `x-fern-sdk-group-name` only, not nested
    /// under the base path.
    #[test]
    fn test_x_fern_base_path_does_not_affect_command_tree() {
        let yaml = r#"
openapi: "3.0.0"
info: { title: t, version: "1.0" }
servers: [{ url: "https://api.example.com" }]
x-fern-base-path: /v1
paths:
  /things:
    get:
      x-fern-sdk-group-name: [things]
      x-fern-sdk-method-name: list
      responses: { "200": { description: ok } }
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        // Resource grouping is unaffected — no `v1` namespace inserted.
        assert!(doc.resources.contains_key("things"));
        assert!(!doc.resources.contains_key("v1"));
        // The operation's stored path is also unchanged — base_path is
        // only applied at URL-construction time, not baked into method.path.
        let m = &doc.resources["things"].methods["list"];
        assert_eq!(m.path, "/things");
    }

    /// `normalize_base_path` helper: trims surrounding whitespace, treats
    /// empty/whitespace-only as absent, otherwise returns the raw value.
    /// Direct coverage of the helper independent of YAML parsing.
    #[test]
    fn test_normalize_base_path() {
        assert_eq!(normalize_base_path(None), None);
        assert_eq!(normalize_base_path(Some("")), None);
        assert_eq!(normalize_base_path(Some("   ")), None);
        assert_eq!(normalize_base_path(Some("/v1")), Some("/v1".to_string()));
        assert_eq!(normalize_base_path(Some("v1")), Some("v1".to_string()));
        assert_eq!(normalize_base_path(Some("  /v1  ")), Some("/v1".to_string()));
    }

    // ------------------------------------------------------------------
    // x-fern-sdk-return-value
    //
    // Mirrors upstream `FernOpenAPIExtension.RESPONSE_PROPERTY` — the
    // extension is a string referencing a property on the response body.
    // Stored on `RestMethod.return_value` as `Option<String>`, with
    // leading/trailing whitespace trimmed and empty/whitespace-only
    // values normalized to `None` so downstream code only sees a
    // resolvable path or nothing.
    // ------------------------------------------------------------------

    #[test]
    fn test_operation_return_value_absent_is_none() {
        let doc = parse_op_with_extra("");
        let m = first_method(&doc, "things", "list");
        assert_eq!(
            m.return_value, None,
            "no x-fern-sdk-return-value → return_value is None (executor prints full body)",
        );
    }

    #[test]
    fn test_operation_return_value_top_level_path() {
        let doc = parse_op_with_extra("      x-fern-sdk-return-value: data");
        let m = first_method(&doc, "things", "list");
        assert_eq!(m.return_value.as_deref(), Some("data"));
    }

    #[test]
    fn test_operation_return_value_nested_dotted_path() {
        let doc = parse_op_with_extra("      x-fern-sdk-return-value: result.items");
        let m = first_method(&doc, "things", "list");
        assert_eq!(
            m.return_value.as_deref(),
            Some("result.items"),
            "dotted paths are preserved verbatim; the executor walks them at runtime",
        );
    }

    #[test]
    fn test_operation_return_value_empty_string_is_none() {
        // Empty / whitespace-only is meaningless for path resolution.
        // Normalize to `None` so the executor can't be tripped into
        // emitting a confusing "path '' did not resolve" error.
        let doc = parse_op_with_extra("      x-fern-sdk-return-value: \"\"");
        let m = first_method(&doc, "things", "list");
        assert_eq!(m.return_value, None);
    }

    #[test]
    fn test_operation_return_value_whitespace_trimmed() {
        let doc = parse_op_with_extra("      x-fern-sdk-return-value: \"  data  \"");
        let m = first_method(&doc, "things", "list");
        assert_eq!(
            m.return_value.as_deref(),
            Some("data"),
            "surrounding whitespace is trimmed; an inner space would still survive",
        );
    }

    // ------------------------------------------------------------------
    // Named-server parsing — `x-fern-server-name` (v2) and `x-name` (v1).
    // ------------------------------------------------------------------

    #[test]
    fn test_named_server_v2_spelling_is_parsed() {
        // Fern v2 canonical spelling `x-fern-server-name` populates
        // `Server.name`. The first server in declaration order remains
        // the default — its URL is what drives `RestDescription.root_url`
        // for the no-flag case.
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers:
  - url: "https://api.example.com"
    x-fern-server-name: Production
    description: "Production environment"
  - url: "https://staging.example.com"
    x-fern-server-name: Staging
paths:
  /things:
    get:
      x-fern-sdk-group-name: ["things"]
      x-fern-sdk-method-name: list
      responses: { "200": { description: ok } }
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        assert_eq!(doc.servers.len(), 2);
        assert_eq!(doc.servers[0].name.as_deref(), Some("Production"));
        assert_eq!(doc.servers[0].url, "https://api.example.com");
        assert_eq!(
            doc.servers[0].description.as_deref(),
            Some("Production environment"),
        );
        assert_eq!(doc.servers[1].name.as_deref(), Some("Staging"));
        let named: Vec<_> = doc.named_servers().collect();
        assert_eq!(named.len(), 2);
    }

    #[test]
    fn test_named_server_v1_alias_x_name_is_recognized() {
        // Older specs that haven't migrated to `x-fern-server-name` use
        // the legacy alias `x-name`. The parser accepts it for
        // backwards compatibility.
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers:
  - url: "https://api.example.com"
    x-name: LegacyProd
paths:
  /things:
    get:
      x-fern-sdk-group-name: ["things"]
      x-fern-sdk-method-name: list
      responses: { "200": { description: ok } }
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        assert_eq!(doc.servers.len(), 1);
        assert_eq!(doc.servers[0].name.as_deref(), Some("LegacyProd"));
    }

    #[test]
    fn test_named_server_empty_v1_falls_through_to_v2() {
        // Defensive parity: an `x-name: ""` on the same entry as a
        // valid `x-fern-server-name: Production` must not shadow the
        // v2 value. The parser treats empty/whitespace-only extensions
        // as "absent" before applying the v1-over-v2 fallback, so a
        // blank legacy alias falls through to the canonical Fern
        // spelling instead of dropping the server's name entirely.
        // Mirrors the existing `test_empty_and_whitespace_server_names_are_dropped`
        // guarantee on the v2 side.
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers:
  - url: "https://api.example.com"
    x-name: ""
    x-fern-server-name: Production
  - url: "https://whitespace.example.com"
    x-name: "   "
    x-fern-server-name: Staging
paths:
  /things:
    get:
      x-fern-sdk-group-name: ["things"]
      x-fern-sdk-method-name: list
      responses: { "200": { description: ok } }
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        assert_eq!(doc.servers.len(), 2);
        assert_eq!(doc.servers[0].name.as_deref(), Some("Production"));
        assert_eq!(doc.servers[1].name.as_deref(), Some("Staging"));
    }

    #[test]
    fn test_named_server_empty_v2_still_falls_back_to_v1() {
        // Symmetric case: an empty `x-fern-server-name: ""` must not
        // suppress a valid `x-name: OldProd` on the same entry. Even
        // though v1 wins outright when both are present, this test
        // pins the per-field trim+filter behavior so future refactors
        // can't regress into the "first field always wins, even when
        // blank" trap.
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers:
  - url: "https://api.example.com"
    x-name: OldProd
    x-fern-server-name: ""
paths:
  /things:
    get:
      x-fern-sdk-group-name: ["things"]
      x-fern-sdk-method-name: list
      responses: { "200": { description: ok } }
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        assert_eq!(doc.servers.len(), 1);
        assert_eq!(doc.servers[0].name.as_deref(), Some("OldProd"));
    }

    #[test]
    fn test_named_server_v1_wins_when_both_present() {
        // When both v2 (`x-fern-server-name`) and v1 (`x-name`) are
        // present on the same entry, v1 wins to mirror fern's
        // `getExtension([SERVER_NAME_V1, SERVER_NAME_V2])` first-match
        // semantics in
        // `packages/cli/api-importers/openapi/openapi-ir-parser/src/openapi/v3/converters/convertServer.ts:72-75`.
        // Fern's order is the source of truth — don't flip this even
        // if v2-wins reads more naturally.
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers:
  - url: "https://api.example.com"
    x-fern-server-name: NewName
    x-name: OldName
paths:
  /things:
    get:
      x-fern-sdk-group-name: ["things"]
      x-fern-sdk-method-name: list
      responses: { "200": { description: ok } }
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        assert_eq!(doc.servers.len(), 1);
        assert_eq!(doc.servers[0].name.as_deref(), Some("OldName"));
    }

    #[test]
    fn test_no_named_servers_when_extensions_absent() {
        // Plain OpenAPI servers without either extension carry no name.
        // The CLI surface stays unchanged for these specs — no
        // `--server` flag is exposed downstream.
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers:
  - url: "https://api.example.com"
paths:
  /things:
    get:
      x-fern-sdk-group-name: ["things"]
      x-fern-sdk-method-name: list
      responses: { "200": { description: ok } }
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        assert_eq!(doc.servers.len(), 1);
        assert!(doc.servers[0].name.is_none());
        assert_eq!(doc.named_servers().count(), 0);
    }

    #[test]
    fn test_per_operation_servers_override_is_captured() {
        // Per-operation `servers:` blocks lower into
        // `RestMethod.servers` independently of the top-level set, and
        // they are authoritative for that operation (the executor
        // resolves `--server <NAME>` against this list first when it's
        // non-empty).
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers:
  - url: "https://api.example.com"
    x-fern-server-name: Production
paths:
  /uploads:
    post:
      x-fern-sdk-group-name: ["uploads"]
      x-fern-sdk-method-name: create
      servers:
        - url: "https://upload.example.com"
          x-fern-server-name: Upload
      responses: { "200": { description: ok } }
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        let m = first_method(&doc, "uploads", "create");
        assert_eq!(m.servers.len(), 1);
        assert_eq!(m.servers[0].name.as_deref(), Some("Upload"));
        assert_eq!(m.servers[0].url, "https://upload.example.com");
        // Top-level set is preserved separately.
        assert_eq!(doc.servers.len(), 1);
        assert_eq!(doc.servers[0].name.as_deref(), Some("Production"));
    }

    #[test]
    fn test_empty_and_whitespace_server_names_are_dropped() {
        // Empty or whitespace-only `x-fern-server-name` / `x-name`
        // values would leak into clap's allowed-list as blank strings
        // and into the `Servers:` help block as a blank-named row. The
        // parser trims and filters them at the source so downstream
        // code never has to defend against this.
        let yaml = r#"
openapi: "3.0.0"
info: { title: T, version: "1.0" }
servers:
  - url: "https://blank.example"
    x-fern-server-name: ""
  - url: "https://whitespace.example"
    x-fern-server-name: "   "
  - url: "https://blank-legacy.example"
    x-name: ""
  - url: "https://trimmed.example"
    x-fern-server-name: "  Production  "
paths:
  /things:
    get:
      x-fern-sdk-group-name: ["things"]
      x-fern-sdk-method-name: list
      responses: { "200": { description: ok } }
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        assert_eq!(doc.servers.len(), 4, "unnamed entries are still preserved");
        // First three entries' names are filtered out (empty after trim).
        assert!(doc.servers[0].name.is_none());
        assert!(doc.servers[1].name.is_none());
        assert!(doc.servers[2].name.is_none());
        // Surrounding whitespace is trimmed.
        assert_eq!(doc.servers[3].name.as_deref(), Some("Production"));
        // Only the trimmed-but-non-empty entry is selectable via --server.
        assert_eq!(doc.named_servers().count(), 1);
    }

    // ------------------------------------------------------------------
    // x-fern-enum — per-value overrides on parameter enums
    //
    // Mirrors the upstream Fern importer
    // (packages/cli/api-importers/openapi/openapi-ir-parser/src/openapi/v3/
    //  extensions/getFernEnum.ts), which models the extension as
    // `Record<wireValue, { description?, name?, casing? }>`. cli-sdk
    // consumes only `name` (display alias) and `description`; `casing`
    // is an SDK-codegen concern.
    // ------------------------------------------------------------------

    fn parse_users_list_user_type(extra_indented: &str) -> MethodParameter {
        let yaml = format!(
            r#"
openapi: "3.0.0"
info: {{ title: T, version: "1.0" }}
servers: [{{ url: "https://x.com" }}]
paths:
  /users:
    get:
      x-fern-sdk-group-name: ["users"]
      x-fern-sdk-method-name: list
      parameters:
        - name: user_type
          in: query
          schema:
            type: string
            enum: [all, managed, external]
{extra_indented}
      responses: {{ "200": {{ description: ok }} }}
"#
        );
        let doc = load_openapi_spec(&yaml, "t").unwrap();
        let m = first_method(&doc, "users", "list");
        m.parameters
            .get("user_type")
            .expect("user_type param missing")
            .clone()
    }

    /// Absent extension: `fern_enum` stays `None` and the wire values
    /// flow through unchanged.
    #[test]
    fn test_x_fern_enum_absent_yields_none() {
        let p = parse_users_list_user_type("");
        assert!(
            p.fern_enum.is_none(),
            "no x-fern-enum should produce None, got {:?}",
            p.fern_enum
        );
        assert_eq!(
            p.enum_values.as_deref(),
            Some(["all", "managed", "external"].as_slice())
                .map(|s| s.iter().map(|v| v.to_string()).collect::<Vec<_>>())
                .as_deref(),
        );
    }

    /// Every value carries both `name` and `description`: the parser
    /// should preserve each per-value override keyed by the wire value.
    #[test]
    fn test_x_fern_enum_full_override_round_trips_per_value_fields() {
        let p = parse_users_list_user_type(
            "            x-fern-enum:
              all:
                name: All
                description: Every user, including external collaborators.
              managed:
                name: Managed
                description: Users your enterprise manages.
              external:
                name: External
                description: External collaborators only.",
        );
        let map = p.fern_enum.expect("x-fern-enum should be parsed");
        assert_eq!(map.len(), 3, "every enum value should have an entry");

        let all = map.get("all").expect("`all` entry missing");
        assert_eq!(all.display_name.as_deref(), Some("All"));
        assert_eq!(
            all.description.as_deref(),
            Some("Every user, including external collaborators."),
        );

        let managed = map.get("managed").expect("`managed` entry missing");
        assert_eq!(managed.display_name.as_deref(), Some("Managed"));
        assert_eq!(
            managed.description.as_deref(),
            Some("Users your enterprise manages."),
        );

        let external = map.get("external").expect("`external` entry missing");
        assert_eq!(external.display_name.as_deref(), Some("External"));
        assert_eq!(
            external.description.as_deref(),
            Some("External collaborators only."),
        );
    }

    /// Partial override: only some wire values appear under `x-fern-enum`,
    /// and listed entries may set only one of `name` / `description`.
    /// Missing entries must NOT synthesize blank overrides — they stay
    /// out of the map so downstream code falls back to the raw wire
    /// value with no description.
    #[test]
    fn test_x_fern_enum_partial_override_skips_missing_entries() {
        let p = parse_users_list_user_type(
            "            x-fern-enum:
              managed:
                description: Users your enterprise manages.
              external:
                name: External",
        );
        let map = p.fern_enum.expect("x-fern-enum should be parsed");

        assert!(
            !map.contains_key("all"),
            "values absent from x-fern-enum must not appear in the map; got {map:?}",
        );

        let managed = map.get("managed").expect("`managed` entry missing");
        assert_eq!(
            managed.display_name, None,
            "`managed` set only description; display_name should remain None",
        );
        assert_eq!(
            managed.description.as_deref(),
            Some("Users your enterprise manages."),
        );

        let external = map.get("external").expect("`external` entry missing");
        assert_eq!(external.display_name.as_deref(), Some("External"));
        assert_eq!(
            external.description, None,
            "`external` set only name; description should remain None",
        );
    }

    /// Empty / whitespace-only `name` and `description` strings are
    /// treated the same as absent, and an entry with both empty fields
    /// is dropped entirely. Without this guard, downstream clap rendering
    /// would emit empty help strings and a meaningless display alias.
    #[test]
    fn test_x_fern_enum_drops_empty_entries() {
        let p = parse_users_list_user_type(
            "            x-fern-enum:
              all:
                name: \"\"
                description: \"  \"
              managed:
                name: Managed",
        );
        let map = p.fern_enum.expect("x-fern-enum should be parsed");
        assert!(
            !map.contains_key("all"),
            "entries with only whitespace fields must be dropped, got {map:?}",
        );
        assert!(map.contains_key("managed"));
    }

    /// `resolve_enum_display_to_wire` is the bridge between the CLI
    /// surface (which accepts either display name or wire value) and
    /// the HTTP layer (which only ever sees the wire value). This test
    /// pins the contract end to end: parser → `MethodParameter` →
    /// resolution.
    #[test]
    fn test_x_fern_enum_display_to_wire_round_trip() {
        let p = parse_users_list_user_type(
            "            x-fern-enum:
              all:
                name: All
              managed:
                name: Managed
                description: Managed users.
              external: {}",
        );

        // Display name → wire value
        assert_eq!(p.resolve_enum_display_to_wire("All").as_ref(), "all");
        assert_eq!(
            p.resolve_enum_display_to_wire("Managed").as_ref(),
            "managed"
        );

        // Wire value passes through untouched
        assert_eq!(p.resolve_enum_display_to_wire("all").as_ref(), "all");
        assert_eq!(
            p.resolve_enum_display_to_wire("external").as_ref(),
            "external",
            "value with empty x-fern-enum entry must round-trip as-is",
        );

        // Unknown input is returned unchanged (clap rejects this before
        // we ever hit the executor; we only assert non-mutation here).
        assert_eq!(p.resolve_enum_display_to_wire("Bogus").as_ref(), "Bogus");
    }

    /// Without `x-fern-enum`, the resolver must be a pure identity —
    /// the param-level helper should never block requests on enums
    /// that don't opt into the extension.
    #[test]
    fn test_resolve_enum_display_to_wire_identity_without_fern_enum() {
        let p = parse_users_list_user_type("");
        assert!(p.fern_enum.is_none());
        assert_eq!(
            p.resolve_enum_display_to_wire("managed").as_ref(),
            "managed"
        );
        assert_eq!(
            p.resolve_enum_display_to_wire("unknown").as_ref(),
            "unknown"
        );
    }

    // -----------------------------------------------------------------
    // x-fern-sdk-variables / x-fern-sdk-variable
    // -----------------------------------------------------------------

    #[test]
    fn test_sdk_variables_parses_string_entries_with_descriptions() {
        let yaml = r#"
openapi: "3.0.0"
info:
  title: Garden API
  version: "1.0"
servers:
  - url: https://api.example.com
x-fern-sdk-variables:
  gardenId:
    type: string
    description: The garden tenant identifier.
  zoneId:
    type: string
paths: {}
"#;
        let doc = load_openapi_spec(yaml, "garden").unwrap();
        assert_eq!(doc.sdk_variables.len(), 2, "expected two declared variables");
        // Preserves declaration order so --help renders deterministically.
        assert_eq!(doc.sdk_variables[0].name, "gardenId");
        assert_eq!(doc.sdk_variables[0].ty, "string");
        assert_eq!(
            doc.sdk_variables[0].description.as_deref(),
            Some("The garden tenant identifier."),
        );
        assert_eq!(doc.sdk_variables[1].name, "zoneId");
        assert_eq!(doc.sdk_variables[1].description, None);
    }

    #[test]
    fn test_sdk_variables_skips_non_string_types() {
        // Fern docs say only strings are supported today. Non-string
        // entries are dropped (with a warn-level log); the parser stays
        // permissive so downstream behavior degrades to "missing flag"
        // rather than a hard load failure.
        let yaml = r#"
openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
servers:
  - url: https://api.example.com
x-fern-sdk-variables:
  count:
    type: integer
  name:
    type: string
paths: {}
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        assert_eq!(doc.sdk_variables.len(), 1);
        assert_eq!(doc.sdk_variables[0].name, "name");
    }

    #[test]
    fn test_sdk_variable_marks_path_parameter() {
        let yaml = r#"
openapi: "3.0.0"
info:
  title: Garden API
  version: "1.0"
servers:
  - url: https://api.example.com
x-fern-sdk-variables:
  gardenId:
    type: string
paths:
  /gardens/{gardenId}/zones:
    get:
      operationId: zones-list
      x-fern-sdk-group-name: ["zones"]
      x-fern-sdk-method-name: list
      parameters:
        - name: gardenId
          in: path
          required: true
          x-fern-sdk-variable: gardenId
          schema: { type: string }
      responses:
        "200":
          description: ok
"#;
        let doc = load_openapi_spec(yaml, "garden").unwrap();
        let method = doc
            .resources
            .get("zones")
            .and_then(|r| r.methods.get("list"))
            .expect("zones.list missing");
        let param = method
            .parameters
            .get("gardenId")
            .expect("gardenId param missing");
        assert_eq!(
            param.variable_reference.as_deref(),
            Some("gardenId"),
            "path parameter should be marked variable-bound",
        );
    }

    #[test]
    fn test_sdk_variable_on_non_path_parameter_is_ignored() {
        // Fern's IR only honors variable references on `in: path`
        // parameters; references on query/header/cookie are logged and
        // dropped so the parameter still surfaces as a normal flag.
        let yaml = r#"
openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
servers:
  - url: https://api.example.com
x-fern-sdk-variables:
  tenant:
    type: string
paths:
  /things:
    get:
      operationId: things-list
      x-fern-sdk-group-name: ["things"]
      x-fern-sdk-method-name: list
      parameters:
        - name: tenant
          in: query
          x-fern-sdk-variable: tenant
          schema: { type: string }
      responses:
        "200":
          description: ok
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        let method = doc
            .resources
            .get("things")
            .and_then(|r| r.methods.get("list"))
            .expect("things.list missing");
        let param = method.parameters.get("tenant").expect("tenant missing");
        assert!(
            param.variable_reference.is_none(),
            "x-fern-sdk-variable on a query parameter should NOT mark it variable-bound",
        );
    }

    #[test]
    fn test_plain_path_param_without_variable_reference() {
        // Regression guard: a path parameter without `x-fern-sdk-variable`
        // must continue to surface as a normal per-operation flag (no
        // accidental variable_reference inheritance).
        let yaml = r#"
openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
servers:
  - url: https://api.example.com
paths:
  /files/{file_id}:
    get:
      operationId: files-get
      x-fern-sdk-group-name: ["files"]
      x-fern-sdk-method-name: get
      parameters:
        - name: file_id
          in: path
          required: true
          schema: { type: string }
      responses:
        "200":
          description: ok
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        let method = doc
            .resources
            .get("files")
            .and_then(|r| r.methods.get("get"))
            .expect("files.get missing");
        let param = method.parameters.get("file_id").expect("file_id missing");
        assert_eq!(param.variable_reference, None);
        assert_eq!(param.location.as_deref(), Some("path"));
    }

    #[test]
    fn test_sdk_variables_absent_yields_empty_vec() {
        let yaml = r#"
openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
servers:
  - url: https://api.example.com
paths: {}
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        assert!(doc.sdk_variables.is_empty());
    }

    // ---------------------------------------------------------------------
    // x-fern-streaming parsing
    //
    // Exercises every form the upstream importer recognizes plus the
    // failure modes we explicitly validate. Each test isolates one
    // shape so a regression points at the exact branch in
    // `parse_streaming_extension`.
    // ---------------------------------------------------------------------

    /// Shared helper to parse a spec stub with the given
    /// `x-fern-streaming` value and return the resolved streaming
    /// config for a single hardcoded operation.
    fn streaming_for(extension_yaml: &str) -> Result<Option<StreamingConfig>, CliError> {
        let yaml = format!(
            r#"
openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
servers:
  - url: https://api.example.com
paths:
  /stream:
    post:
      operationId: streamChat
      x-fern-streaming: {extension_yaml}
      responses:
        "200":
          description: ok
"#
        );
        let doc = load_openapi_spec(&yaml, "stream-spec")?;
        Ok(doc
            .resources
            .get("stream")
            .and_then(|r| r.methods.get("stream-chat"))
            .and_then(|m| m.streaming.clone()))
    }

    #[test]
    fn test_streaming_boolean_true_is_ndjson() {
        // Upstream's boolean shorthand picks NDJSON (so that callers
        // who haven't chosen a wire format don't get SSE semantics).
        let result = streaming_for("true").unwrap();
        assert_eq!(result, Some(StreamingConfig::Json { terminator: None }));
    }

    #[test]
    fn test_streaming_boolean_false_is_none() {
        let result = streaming_for("false").unwrap();
        assert_eq!(result, None);
    }

    #[test]
    fn test_streaming_object_format_sse() {
        let result = streaming_for("{ format: sse }").unwrap();
        assert_eq!(result, Some(StreamingConfig::Sse { terminator: None }));
    }

    #[test]
    fn test_streaming_object_format_json() {
        let result = streaming_for("{ format: json }").unwrap();
        assert_eq!(result, Some(StreamingConfig::Json { terminator: None }));
    }

    #[test]
    fn test_streaming_object_sse_with_terminator() {
        let result = streaming_for(r#"{ format: sse, terminator: "[DONE]" }"#).unwrap();
        assert_eq!(
            result,
            Some(StreamingConfig::Sse {
                terminator: Some("[DONE]".to_string())
            })
        );
    }

    #[test]
    fn test_streaming_object_default_format_is_json() {
        // Matches the typed SDKs (TS / C#) and the upstream importer:
        // an object with no `format` field defaults to NDJSON, the
        // same as the boolean shorthand. Callers that want SSE must
        // declare `format: sse` explicitly.
        let result = streaming_for(r#"{ terminator: "[END]" }"#).unwrap();
        assert_eq!(
            result,
            Some(StreamingConfig::Json {
                terminator: Some("[END]".to_string())
            })
        );
    }

    #[test]
    fn test_streaming_object_format_text() {
        // `format: text` mirrors Fern IR's `TextStreamChunk` variant
        // (see `packages/ir-sdk/.../http.yml`). No terminator field
        // and no payload type — raw lines are emitted verbatim.
        let result = streaming_for("{ format: text }").unwrap();
        assert_eq!(result, Some(StreamingConfig::Text));
    }

    #[test]
    fn test_streaming_text_rejects_terminator() {
        // `TextStreamChunk` has no `terminator` field; flagging it at
        // parse time keeps misconfigurations from silently no-op'ing
        // at runtime.
        let err = streaming_for(r#"{ format: text, terminator: "EOF" }"#).unwrap_err();
        let msg = format!("{err}");
        assert!(
            msg.contains("`terminator` is not supported for `format: text`"),
            "unexpected error: {msg}"
        );
    }

    #[test]
    fn test_streaming_invalid_format_errors() {
        let err = streaming_for("{ format: websocket }").unwrap_err();
        let msg = format!("{err}");
        assert!(
            msg.contains("`format` must be `sse`, `json`, or `text`"),
            "unexpected error: {msg}"
        );
        assert!(msg.contains("websocket"), "unexpected error: {msg}");
    }

    #[test]
    fn test_streaming_invalid_kind_errors() {
        // A scalar that isn't a boolean is meaningless.
        let err = streaming_for(r#""sse""#).unwrap_err();
        let msg = format!("{err}");
        assert!(
            msg.contains("expected a boolean or an object"),
            "unexpected error: {msg}"
        );
    }

    #[test]
    fn test_streaming_and_pagination_mutually_exclusive() {
        let yaml = r#"
openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
servers:
  - url: https://api.example.com
paths:
  /events:
    get:
      operationId: listEvents
      x-fern-streaming: true
      x-fern-pagination:
        cursor: cursor
        next_cursor: $response.next_cursor
        results: $response.events
      responses:
        "200":
          description: ok
"#;
        let err = load_openapi_spec(yaml, "stream-page").unwrap_err();
        let msg = format!("{err}");
        assert!(
            msg.contains("`x-fern-streaming`")
                && msg.contains("`x-fern-pagination`")
                && msg.contains("mutually exclusive"),
            "expected mutual-exclusion error, got: {msg}"
        );
    }

    // ---------------------------------------------------------------
    // `x-fern-retries` resolution
    // ---------------------------------------------------------------

    #[test]
    fn test_resolve_retries_absent_returns_none() {
        // Neither root nor op declared the extension. Operations
        // without an explicit policy stay opt-in — the executor
        // returns `None` and skips the retry wrapper entirely.
        let cfg = resolve_retries_extension(None, None, "getFoo").unwrap();
        assert!(cfg.is_none());
    }

    #[test]
    fn test_resolve_retries_op_true_no_root_uses_defaults() {
        // `x-fern-retries: true` on an op without a root block
        // materializes the cli-sdk runtime defaults (max=2,
        // base=250ms, factor=2.0, jitter=0.1) — conservative for an
        // interactive CLI where users expect fast, observable failures.
        let op = serde_yaml::Value::Bool(true);
        let cfg = resolve_retries_extension(Some(&op), None, "getFoo")
            .unwrap()
            .expect("op:true materializes defaults");
        assert_eq!(cfg, RetriesConfig::default());
        assert!(cfg.enabled);
        assert_eq!(cfg.max_attempts, crate::openapi::discovery::DEFAULT_RETRY_MAX_ATTEMPTS);
        assert_eq!(cfg.base_delay_ms, crate::openapi::discovery::DEFAULT_RETRY_BASE_DELAY_MS);
    }

    #[test]
    fn test_resolve_retries_op_false_disables_regardless_of_root() {
        // Per-op `false` short-circuits to `disabled` even when the
        // root block enabled retries (op specificity > spec defaults).
        let root = yaml("max_attempts: 5\nbase_delay_ms: 1000\n");
        let op = serde_yaml::Value::Bool(false);
        let cfg = resolve_retries_extension(Some(&op), Some(&root), "getFoo")
            .unwrap()
            .expect("op:false yields explicit disabled config");
        assert!(!cfg.enabled);
        assert_eq!(cfg, RetriesConfig::disabled());
    }

    #[test]
    fn test_resolve_retries_op_missing_inherits_root_object() {
        // Op block missing → inherit the root config verbatim.
        let root = yaml("max_attempts: 7\nbase_delay_ms: 250\nfactor: 3.0\njitter: 0.0\n");
        let cfg = resolve_retries_extension(None, Some(&root), "getFoo")
            .unwrap()
            .expect("missing op inherits root config");
        assert!(cfg.enabled);
        assert_eq!(cfg.max_attempts, 7);
        assert_eq!(cfg.base_delay_ms, 250);
        assert!((cfg.factor - 3.0).abs() < f64::EPSILON);
        assert!((cfg.jitter - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_resolve_retries_op_true_inherits_root_object() {
        // `x-fern-retries: true` on the op should adopt the root
        // baseline (not start over from defaults). This is the
        // shorthand authors use to opt every endpoint into a spec-wide
        // retry policy.
        let root = yaml("max_attempts: 5\nbase_delay_ms: 1000\n");
        let op = serde_yaml::Value::Bool(true);
        let cfg = resolve_retries_extension(Some(&op), Some(&root), "getFoo")
            .unwrap()
            .expect("op:true adopts root baseline");
        assert_eq!(cfg.max_attempts, 5);
        assert_eq!(cfg.base_delay_ms, 1000);
    }

    #[test]
    fn test_resolve_retries_op_object_overrides_root_field_by_field() {
        // Per-op object merges over the root baseline. Fields the op
        // doesn't mention keep the root values; fields it does mention
        // override. Matches the pagination resolver's field-by-field
        // merge semantics.
        let root = yaml("max_attempts: 5\nbase_delay_ms: 1000\nfactor: 2.0\njitter: 0.2\n");
        let op = yaml("max_attempts: 10\n");
        let cfg = resolve_retries_extension(Some(&op), Some(&root), "getFoo")
            .unwrap()
            .expect("op object merges over root");
        assert_eq!(cfg.max_attempts, 10, "op overrides root");
        assert_eq!(cfg.base_delay_ms, 1000, "root inherited");
        assert!((cfg.factor - 2.0).abs() < f64::EPSILON);
        assert!((cfg.jitter - 0.2).abs() < f64::EPSILON);
    }

    #[test]
    fn test_resolve_retries_root_disabled_inherited_by_default() {
        // Spec-root `{ disabled: true }` should propagate by default
        // to operations that don't declare their own block.
        let root = yaml("disabled: true\n");
        let cfg = resolve_retries_extension(None, Some(&root), "getFoo")
            .unwrap()
            .expect("disabled root inherited");
        assert!(!cfg.enabled);
    }

    #[test]
    fn test_resolve_retries_op_object_reenables_after_root_disabled() {
        // An explicit per-op object takes precedence over a disabled
        // root. Authors can opt a single endpoint back in even when
        // the spec-level policy is off.
        let root = yaml("disabled: true\n");
        let op = yaml("max_attempts: 4\n");
        let cfg = resolve_retries_extension(Some(&op), Some(&root), "getFoo")
            .unwrap()
            .expect("per-op object re-enables");
        assert!(cfg.enabled);
        assert_eq!(cfg.max_attempts, 4);
    }

    #[test]
    fn test_resolve_retries_upstream_disabled_object() {
        // Canonical upstream shape: `{ disabled: true }` per
        // `getFernRetriesExtension.ts`. We must round-trip it.
        let op = yaml("disabled: true\n");
        let cfg = resolve_retries_extension(Some(&op), None, "getFoo")
            .unwrap()
            .expect("disabled:true yields explicit disabled");
        assert_eq!(cfg, RetriesConfig::disabled());
    }

    #[test]
    fn test_resolve_retries_max_zero_treated_as_disabled() {
        // `max_attempts: 0` means "never retry" — equivalent to
        // `disabled: true`. Normalize here so the executor doesn't
        // have to special-case the count.
        let op = yaml("max_attempts: 0\n");
        let cfg = resolve_retries_extension(Some(&op), None, "getFoo")
            .unwrap()
            .expect("max=0 normalizes to disabled");
        assert!(!cfg.enabled);
    }

    #[test]
    fn test_resolve_retries_max_attempts_alias_spellings() {
        // `max` / `max-attempts` / `max_attempts` are interchangeable
        // (forward-compat with upstream which may pick any one).
        let op_snake = yaml("max_attempts: 6\n");
        let op_kebab = yaml("max-attempts: 6\n");
        let op_short = yaml("max: 6\n");
        for op in [op_snake, op_kebab, op_short] {
            let cfg = resolve_retries_extension(Some(&op), None, "getFoo")
                .unwrap()
                .unwrap();
            assert_eq!(cfg.max_attempts, 6);
        }
    }

    #[test]
    fn test_resolve_retries_invalid_max_negative_errors() {
        // Negative values must be rejected (u32 can't hold them) —
        // surface a clear discovery error.
        let op = yaml("max_attempts: -1\n");
        let err = resolve_retries_extension(Some(&op), None, "getFoo")
            .unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("max_attempts"), "{msg}");
    }

    #[test]
    fn test_resolve_retries_invalid_factor_below_one_errors() {
        // Backoff factor < 1.0 would mean delays shrink, which is
        // nonsensical. Reject to catch authoring bugs.
        let op = yaml("factor: 0.5\n");
        let err = resolve_retries_extension(Some(&op), None, "getFoo")
            .unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("factor"), "{msg}");
    }

    #[test]
    fn test_resolve_retries_invalid_jitter_out_of_range_errors() {
        // Jitter is a fraction in [0, 1]; anything else is an
        // authoring bug.
        let op = yaml("jitter: 1.5\n");
        let err = resolve_retries_extension(Some(&op), None, "getFoo")
            .unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("jitter"), "{msg}");
    }

    #[test]
    fn test_resolve_retries_invalid_shape_errors() {
        // Arrays/strings are not a valid shape. Mirror the
        // pagination resolver's strict typing.
        let op = yaml("- 1\n- 2\n");
        let err = resolve_retries_extension(Some(&op), None, "getFoo")
            .unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("x-fern-retries"), "{msg}");
    }

    #[test]
    fn test_resolve_retries_invalid_disabled_non_bool_errors() {
        // `disabled` must be boolean. Surface authoring bugs early.
        let op = yaml("disabled: yes-please\n");
        let err = resolve_retries_extension(Some(&op), None, "getFoo")
            .unwrap_err();
        let msg = format!("{err}");
        assert!(msg.contains("disabled"), "{msg}");
    }

    #[test]
    fn test_load_openapi_spec_with_root_retries() {
        // End-to-end: a spec with a root `x-fern-retries` block and
        // no per-op blocks. Every operation inherits the root config.
        let yaml = r#"
openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
servers:
  - url: https://api.example.com
x-fern-retries:
  max_attempts: 5
  base_delay_ms: 250
paths:
  /foo:
    get:
      operationId: getFoo
      x-fern-sdk-method-name: get
      x-fern-sdk-group-name: foo
      responses:
        "200":
          description: ok
"#;
        let doc = load_openapi_spec(yaml, "t").unwrap();
        let root_cfg = doc.retries.as_ref().expect("root retries set");
        assert_eq!(root_cfg.max_attempts, 5);
        assert_eq!(root_cfg.base_delay_ms, 250);

        let foo = doc.resources.get("foo").expect("foo resource");
        let get = foo
            .methods
            .values()
            .find(|m| m.id.as_deref() == Some("getFoo"))
            .expect("getFoo");
        let op_cfg = get.retries.as_ref().expect("op inherited retries");
        assert_eq!(op_cfg.max_attempts, 5);
        assert_eq!(op_cfg.base_delay_ms, 250);
    }

    // ------------------------------------------------------------------
    // x-fern-audiences (operation level)
    //
    // Mirrors fern-api/fern's OpenAPI importer
    // (`packages/cli/api-importers/openapi/openapi-ir-parser/src/openapi/v3/converters/operation/convertHttpOperation.ts:330`):
    //
    //     audiences: getExtension<string[]>(operation, FernOpenAPIExtension.AUDIENCES) ?? []
    //
    // — i.e. an array-of-strings extension on the operation object,
    // defaulting to `[]` when missing. Filtering itself happens at the
    // command-tree-build stage (see
    // `crate::openapi::commands::filter_doc_by_audiences`), so the
    // parser's job is to faithfully surface what the spec declares.
    // ------------------------------------------------------------------

    #[test]
    fn test_x_fern_audiences_missing_yields_empty_vec() {
        let doc = parse_op_with_extra("");
        let m = first_method(&doc, "things", "list");
        assert!(
            m.audiences.is_empty(),
            "missing x-fern-audiences should yield empty vec, got: {:?}",
            m.audiences
        );
    }

    #[test]
    fn test_x_fern_audiences_explicit_empty_yields_empty_vec() {
        // Mirrors fern: an explicitly empty `x-fern-audiences: []` is
        // indistinguishable from "missing" — both lower to `[]` in the IR.
        let doc = parse_op_with_extra("      x-fern-audiences: []");
        let m = first_method(&doc, "things", "list");
        assert!(m.audiences.is_empty());
    }

    #[test]
    fn test_x_fern_audiences_single_value() {
        let doc = parse_op_with_extra(
            "      x-fern-audiences:\n        - public",
        );
        let m = first_method(&doc, "things", "list");
        assert_eq!(m.audiences, vec!["public".to_string()]);
    }

    #[test]
    fn test_x_fern_audiences_multiple_values_preserve_order() {
        // fern stores audiences as a `string[]` without dedup or sort
        // (`convertHttpOperation.ts:330` is a direct passthrough). We
        // do the same — preserve user-declared order so downstream
        // consumers can rely on the spec's listing.
        let doc = parse_op_with_extra(
            "      x-fern-audiences:\n        - public\n        - internal\n        - beta",
        );
        let m = first_method(&doc, "things", "list");
        assert_eq!(
            m.audiences,
            vec![
                "public".to_string(),
                "internal".to_string(),
                "beta".to_string(),
            ],
        );
    }

    #[test]
    fn test_x_fern_audiences_preserves_duplicate_entries() {
        // Defensive: don't silently dedup. The fern importer passes
        // the raw array through, so mirroring that means duplicate
        // entries land verbatim in the IR (the audience filter does
        // its own membership check and is dedup-tolerant).
        let doc = parse_op_with_extra(
            "      x-fern-audiences:\n        - public\n        - public",
        );
        let m = first_method(&doc, "things", "list");
        assert_eq!(
            m.audiences,
            vec!["public".to_string(), "public".to_string()],
        );
    }
    // -- Real-world OpenAPI 3.1 specs (parse sweep) ----------------------
    //
    // These fixtures are real customer/prospect specs that declare
    // `openapi: 3.1.0`. They sweep the new 3.1 surface area (type arrays,
    // numeric exclusive bounds, const, composition, webhooks, schema-level
    // examples) against actual wire shapes rather than synthetic snippets.

    // -- JSON Schema composition (oneOf / anyOf / allOf) -----------------

    #[test]
    fn test_composition_one_of_captures_branches() {
        let obj: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            oneOf:
              - type: string
              - type: integer
            "#,
        )
        .unwrap();
        let prop = convert_schema_property(&obj);
        assert_eq!(prop.one_of.len(), 2);
        assert_eq!(prop.one_of[0].prop_type.as_deref(), Some("string"));
        assert_eq!(prop.one_of[1].prop_type.as_deref(), Some("integer"));
    }

    #[test]
    fn test_composition_any_of_and_all_of() {
        let obj: OpenApiSchemaObject = serde_yaml::from_str(
            r##"
            allOf:
              - $ref: "#/components/schemas/Base"
              - type: object
                properties:
                  extra:
                    type: string
            anyOf:
              - type: number
              - type: string
            "##,
        )
        .unwrap();
        let prop = convert_schema_property(&obj);
        assert_eq!(prop.all_of.len(), 2);
        assert_eq!(prop.all_of[0].schema_ref.as_deref(), Some("Base"));
        assert_eq!(prop.any_of.len(), 2);
        assert_eq!(prop.any_of[0].prop_type.as_deref(), Some("number"));
    }

    #[test]
    fn test_composition_at_parent_json_schema_level() {
        // Component-schema roots can themselves be a oneOf/anyOf/allOf (heavy
        // pattern in Auth0's spec). The IR's parent JsonSchema must capture
        // these, not just the property-level variants.
        let obj: OpenApiSchemaObject = serde_yaml::from_str(
            r##"
            allOf:
              - $ref: "#/components/schemas/Base"
              - type: object
                properties:
                  extra:
                    type: string
            "##,
        )
        .unwrap();
        let s = convert_schema_object(&obj);
        assert_eq!(s.all_of.len(), 2);
        assert_eq!(s.all_of[0].schema_ref.as_deref(), Some("Base"));
        assert_eq!(s.all_of[1].prop_type.as_deref(), Some("object"));
    }

    #[test]
    fn test_composition_nullable_via_oneof_with_null_type() {
        let obj: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            oneOf:
              - type: string
              - type: "null"
            "#,
        )
        .unwrap();
        let prop = convert_schema_property(&obj);
        assert_eq!(prop.one_of.len(), 2);
        assert_eq!(prop.one_of[1].prop_type.as_deref(), Some("null"));
    }

    // -- ADR-0004: allOf flattening into per-field flags -----------------

    #[test]
    fn test_all_of_flattens_inline_branches_at_root() {
        // Root-level allOf with two inline branches. The flattener must
        // emit flags from both, not silently drop them.
        let schema: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            allOf:
              - type: object
                required: [id]
                properties:
                  id:
                    type: string
              - type: object
                properties:
                  extra:
                    type: string
            "#,
        )
        .unwrap();
        let params = flatten_body_params(&schema, &HashMap::new(), 0);
        assert!(params.contains_key("id"), "id from first branch: {params:?}");
        assert!(params.contains_key("extra"), "extra from second branch: {params:?}");
        assert!(params["id"].required, "id was required in base branch");
        assert!(!params["extra"].required, "extra was not in any required list");
    }

    #[test]
    fn test_all_of_resolves_ref_branches() {
        // The dominant Box pattern: `allOf: [{$ref: Base}, {inline overlay}]`.
        // The flattener must resolve the ref through component_schemas and
        // merge the resolved properties with the overlay's.
        let schema: OpenApiSchemaObject = serde_yaml::from_str(
            r##"
            allOf:
              - $ref: "#/components/schemas/Base"
              - type: object
                properties:
                  extra:
                    type: integer
            "##,
        )
        .unwrap();
        let base: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            type: object
            required: [id]
            properties:
              id:
                type: string
              created_at:
                type: string
            "#,
        )
        .unwrap();
        let mut components = HashMap::new();
        components.insert("Base".to_string(), base);
        let params = flatten_body_params(&schema, &components, 0);
        assert!(params.contains_key("id"));
        assert!(params.contains_key("created_at"));
        assert!(params.contains_key("extra"));
        assert!(params["id"].required, "id required via base $ref");
        assert!(!params["extra"].required);
        assert_eq!(params["extra"].param_type.as_deref(), Some("integer"));
    }

    #[test]
    fn test_all_of_last_branch_wins_on_duplicate_property() {
        // When two branches declare the same property name, the latter
        // wins — including type/enum constraints. This matches our
        // last-branch-wins merge convention from ADR-0004.
        let schema: OpenApiSchemaObject = serde_yaml::from_str(
            r##"
            allOf:
              - type: object
                properties:
                  status:
                    type: string
                    description: Base status (no enum).
              - type: object
                properties:
                  status:
                    type: string
                    enum: [draft, sent]
                    description: Overlay status with enum.
            "##,
        )
        .unwrap();
        let params = flatten_body_params(&schema, &HashMap::new(), 0);
        let status = &params["status"];
        assert_eq!(
            status.enum_values.as_deref(),
            Some(["draft".to_string(), "sent".to_string()].as_slice()),
            "overlay's enum should win: {status:?}",
        );
    }

    #[test]
    fn test_all_of_unions_required_arrays_across_branches() {
        // `required: [a]` in branch 1 plus `required: [b]` in branch 2
        // means BOTH a and b are required overall.
        let schema: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            allOf:
              - type: object
                required: [a]
                properties:
                  a:
                    type: string
              - type: object
                required: [b]
                properties:
                  b:
                    type: string
            "#,
        )
        .unwrap();
        let params = flatten_body_params(&schema, &HashMap::new(), 0);
        assert!(params["a"].required, "a required from branch 1");
        assert!(params["b"].required, "b required from branch 2");
    }

    #[test]
    fn test_all_of_inside_object_property_flattens_dot_notation() {
        // The "property-level allOf" case: `attachment: {type: object,
        // allOf: [...]}` should produce `--attachment.url`, etc., not a
        // single `--attachment` blob.
        let schema: OpenApiSchemaObject = serde_yaml::from_str(
            r##"
            type: object
            properties:
              attachment:
                type: object
                allOf:
                  - $ref: "#/components/schemas/AttachmentBase"
                  - type: object
                    properties:
                      checksum:
                        type: string
            "##,
        )
        .unwrap();
        let base: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            type: object
            properties:
              url:
                type: string
            "#,
        )
        .unwrap();
        let mut components = HashMap::new();
        components.insert("AttachmentBase".to_string(), base);
        let params = flatten_body_params(&schema, &components, 0);
        assert!(params.contains_key("attachment.url"), "{params:?}");
        assert!(params.contains_key("attachment.checksum"), "{params:?}");
    }

    #[test]
    fn test_all_of_is_transparent_to_max_body_depth() {
        // ADR-0004: `allOf` does NOT consume MAX_BODY_DEPTH. A spec that
        // chains six allOf wrappers above the actual properties should
        // still flatten the leaf fields. (MAX_BODY_DEPTH = 3, but
        // crossing 6 allOf boundaries doesn't decrement it.)
        let schema: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            allOf:
              - allOf:
                  - allOf:
                      - allOf:
                          - allOf:
                              - allOf:
                                  - type: object
                                    required: [leaf]
                                    properties:
                                      leaf:
                                        type: string
            "#,
        )
        .unwrap();
        let params = flatten_body_params(&schema, &HashMap::new(), 0);
        assert!(
            params.contains_key("leaf"),
            "deep allOf chain should still flatten: {params:?}",
        );
        assert!(params["leaf"].required);
    }

    #[test]
    fn test_all_of_unresolvable_ref_skipped_silently() {
        // A $ref pointing to a nonexistent component schema should not
        // crash the flattener — log + skip is the policy.
        let schema: OpenApiSchemaObject = serde_yaml::from_str(
            r##"
            allOf:
              - $ref: "#/components/schemas/NonExistent"
              - type: object
                properties:
                  alive:
                    type: string
            "##,
        )
        .unwrap();
        let params = flatten_body_params(&schema, &HashMap::new(), 0);
        assert!(params.contains_key("alive"), "second branch still flattens");
        assert_eq!(params.len(), 1, "no ghost property from unresolved ref");
    }

    // -- ADR-0005: nullable-union promotion ------------------------------

    #[test]
    fn test_recognize_nullable_union_inline_any_of() {
        // Pydantic / Devin pattern: `anyOf: [{type: string}, {type: 'null'}]`.
        let obj: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            anyOf:
              - type: string
              - type: "null"
            "#,
        )
        .unwrap();
        assert_eq!(
            recognize_nullable_union(&obj, &HashMap::new()),
            Some("string"),
        );
    }

    #[test]
    fn test_recognize_nullable_union_inline_one_of() {
        // Same shape via `oneOf` — same semantics for the nullable case.
        let obj: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            oneOf:
              - type: integer
              - type: "null"
            "#,
        )
        .unwrap();
        assert_eq!(
            recognize_nullable_union(&obj, &HashMap::new()),
            Some("integer"),
        );
    }

    #[test]
    fn test_recognize_nullable_union_with_ref_to_scalar() {
        // The non-null branch can be a `$ref` resolving to a scalar
        // component schema. The recognizer follows the ref one level.
        let obj: OpenApiSchemaObject = serde_yaml::from_str(
            r##"
            oneOf:
              - $ref: "#/components/schemas/ThreadIdString"
              - type: "null"
            "##,
        )
        .unwrap();
        let base: OpenApiSchemaObject = serde_yaml::from_str("type: string\n").unwrap();
        let mut components = HashMap::new();
        components.insert("ThreadIdString".to_string(), base);
        assert_eq!(
            recognize_nullable_union(&obj, &components),
            Some("string"),
        );
    }

    #[test]
    fn test_recognize_nullable_union_30_idiom_with_nullable_branch() {
        // OpenAPI 3.0 idiom: the "null branch" is a standalone
        // `{nullable: true}` with no concrete type. The recognizer
        // accepts this as equivalent to `{type: 'null'}`.
        let obj: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            anyOf:
              - type: number
              - nullable: true
            "#,
        )
        .unwrap();
        assert_eq!(
            recognize_nullable_union(&obj, &HashMap::new()),
            Some("number"),
        );
    }

    #[test]
    fn test_recognize_nullable_union_mixed_scalar_types_is_not_promoted() {
        // `[string, integer, null]` is a true union with a null branch —
        // not a nullable scalar. The recognizer must reject this.
        let obj: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            anyOf:
              - type: string
              - type: integer
              - type: "null"
            "#,
        )
        .unwrap();
        assert_eq!(recognize_nullable_union(&obj, &HashMap::new()), None);
    }

    #[test]
    fn test_recognize_nullable_union_no_null_branch_is_not_promoted() {
        let obj: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            anyOf:
              - type: string
              - type: integer
            "#,
        )
        .unwrap();
        assert_eq!(recognize_nullable_union(&obj, &HashMap::new()), None);
    }

    #[test]
    fn test_recognize_nullable_union_all_of_never_promoted() {
        // `allOf: [scalar, null]` is intersection-with-null — empty.
        // The recognizer must NOT promote `allOf` even when one branch
        // is a null sentinel (it would be a degenerate spec anyway).
        let obj: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            allOf:
              - type: string
              - type: "null"
            "#,
        )
        .unwrap();
        assert_eq!(recognize_nullable_union(&obj, &HashMap::new()), None);
    }

    #[test]
    fn test_recognize_nullable_union_two_null_branches_not_promoted() {
        // Two null branches is a malformed spec; recognizer fails closed.
        let obj: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            anyOf:
              - type: "null"
              - type: "null"
            "#,
        )
        .unwrap();
        assert_eq!(recognize_nullable_union(&obj, &HashMap::new()), None);
    }

    #[test]
    fn test_recognize_nullable_union_ref_to_non_scalar_not_promoted() {
        // If the non-null branch's `$ref` resolves to an object/array,
        // it doesn't reduce to a scalar — fail closed.
        let obj: OpenApiSchemaObject = serde_yaml::from_str(
            r##"
            anyOf:
              - $ref: "#/components/schemas/Big"
              - type: "null"
            "##,
        )
        .unwrap();
        let big: OpenApiSchemaObject = serde_yaml::from_str("type: object\n").unwrap();
        let mut components = HashMap::new();
        components.insert("Big".to_string(), big);
        assert_eq!(recognize_nullable_union(&obj, &components), None);
    }

    // -- resolve_ref_chain ----------------------------------------------------

    #[test]
    fn test_resolve_ref_chain_single_hop() {
        let schema: OpenApiSchemaObject =
            serde_yaml::from_str(r##"$ref: "#/components/schemas/Foo""##).unwrap();
        let foo: OpenApiSchemaObject = serde_yaml::from_str("type: string\n").unwrap();
        let mut components = HashMap::new();
        components.insert("Foo".to_string(), foo);
        let resolved = resolve_ref_chain(&schema, &components).unwrap();
        assert_eq!(resolved.schema_type(), Some("string"));
    }

    #[test]
    fn test_resolve_ref_chain_multi_hop() {
        // A -> B -> C (terminal: type: array, items.type: string)
        let a: OpenApiSchemaObject =
            serde_yaml::from_str(r##"$ref: "#/components/schemas/B""##).unwrap();
        let b: OpenApiSchemaObject =
            serde_yaml::from_str(r##"$ref: "#/components/schemas/C""##).unwrap();
        let c: OpenApiSchemaObject =
            serde_yaml::from_str("type: array\nitems:\n  type: string\n").unwrap();
        let mut components = HashMap::new();
        components.insert("B".to_string(), b);
        components.insert("C".to_string(), c);
        let resolved = resolve_ref_chain(&a, &components).unwrap();
        assert_eq!(resolved.schema_type(), Some("array"));
    }

    #[test]
    fn test_resolve_ref_chain_already_terminal() {
        let schema: OpenApiSchemaObject = serde_yaml::from_str("type: integer\n").unwrap();
        let components = HashMap::new();
        let resolved = resolve_ref_chain(&schema, &components).unwrap();
        assert_eq!(resolved.schema_type(), Some("integer"));
    }

    #[test]
    fn test_resolve_ref_chain_broken_returns_none() {
        let schema: OpenApiSchemaObject =
            serde_yaml::from_str(r##"$ref: "#/components/schemas/Missing""##).unwrap();
        let components = HashMap::new();
        assert!(resolve_ref_chain(&schema, &components).is_none());
    }

    // -- recognize_scalar_or_array_union ---------------------------------------

    #[test]
    fn test_scalar_or_array_union_oneof() {
        let obj: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            oneOf:
              - type: string
              - type: array
                items:
                  type: string
            "#,
        )
        .unwrap();
        assert_eq!(recognize_scalar_or_array_union(&obj, &HashMap::new()), Some("string"));
    }

    #[test]
    fn test_scalar_or_array_union_anyof() {
        let obj: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            anyOf:
              - type: string
              - type: array
                items:
                  type: string
            "#,
        )
        .unwrap();
        assert_eq!(recognize_scalar_or_array_union(&obj, &HashMap::new()), Some("string"));
    }

    #[test]
    fn test_scalar_or_array_union_with_null() {
        let obj: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            oneOf:
              - type: string
              - type: array
                items:
                  type: string
              - type: "null"
            "#,
        )
        .unwrap();
        assert_eq!(recognize_scalar_or_array_union(&obj, &HashMap::new()), Some("string"));
    }

    #[test]
    fn test_scalar_or_array_union_not_matching() {
        let obj: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            oneOf:
              - type: string
              - type: integer
            "#,
        )
        .unwrap();
        assert!(recognize_scalar_or_array_union(&obj, &HashMap::new()).is_none());
    }

    #[test]
    fn test_scalar_or_array_union_rejects_extra_branches() {
        // oneOf [string, array<string>, object] must NOT match — the
        // object branch is not representable as a repeated flag.
        let obj: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            oneOf:
              - type: string
              - type: array
                items:
                  type: string
              - type: object
            "#,
        )
        .unwrap();
        assert!(recognize_scalar_or_array_union(&obj, &HashMap::new()).is_none());
    }

    #[test]
    fn test_scalar_or_array_union_rejects_mismatched_array() {
        // oneOf [string, array<integer>, array<string>] must NOT match —
        // multiple array branches are ambiguous.
        let obj: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            oneOf:
              - type: string
              - type: array
                items:
                  type: integer
              - type: array
                items:
                  type: string
            "#,
        )
        .unwrap();
        assert!(recognize_scalar_or_array_union(&obj, &HashMap::new()).is_none());
    }

    #[test]
    fn test_scalar_or_array_union_integer_type() {
        let obj: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            oneOf:
              - type: integer
              - type: array
                items:
                  type: integer
            "#,
        )
        .unwrap();
        assert_eq!(recognize_scalar_or_array_union(&obj, &HashMap::new()), Some("integer"));
    }

    #[test]
    fn test_scalar_or_array_union_type_mismatch_returns_none() {
        // oneOf [string, array<integer>] — scalar and array item types differ.
        let obj: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            oneOf:
              - type: string
              - type: array
                items:
                  type: integer
            "#,
        )
        .unwrap();
        assert!(recognize_scalar_or_array_union(&obj, &HashMap::new()).is_none());
    }

    #[test]
    fn test_scalar_or_array_union_with_ref() {
        let obj: OpenApiSchemaObject = serde_yaml::from_str(
            r##"
            oneOf:
              - type: string
              - $ref: "#/components/schemas/StringArray"
            "##,
        )
        .unwrap();
        let arr: OpenApiSchemaObject =
            serde_yaml::from_str("type: array\nitems:\n  type: string\n").unwrap();
        let mut components = HashMap::new();
        components.insert("StringArray".to_string(), arr);
        assert_eq!(recognize_scalar_or_array_union(&obj, &components), Some("string"));
    }

    #[test]
    fn test_flatten_body_params_ref_chain_union() {
        // End-to-end: a body property with $ref -> $ref -> oneOf [string, array<string>]
        // should produce a repeated string parameter.
        let schema: OpenApiSchemaObject = serde_yaml::from_str(
            r##"
            type: object
            required:
              - to
            properties:
              to:
                $ref: "#/components/schemas/SendMessageTo"
            "##,
        )
        .unwrap();
        let send_msg_to: OpenApiSchemaObject =
            serde_yaml::from_str(r##"$ref: "#/components/schemas/Addresses""##).unwrap();
        let addresses: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            oneOf:
              - type: string
              - type: array
                items:
                  type: string
            "#,
        )
        .unwrap();
        let mut components = HashMap::new();
        components.insert("SendMessageTo".to_string(), send_msg_to);
        components.insert("Addresses".to_string(), addresses);
        let params = flatten_body_params_prefix(&schema, &components, 0, "");
        let to_param = params.get("to").expect("'to' parameter should exist");
        assert_eq!(to_param.param_type.as_deref(), Some("string"));
        assert!(to_param.repeated, "'to' should be marked as repeated");
        assert!(to_param.required, "'to' should be required");
        assert!(!to_param.nullable, "'to' should not be nullable (no null branch)");
    }

    #[test]
    fn test_flatten_body_params_nullable_string_array_union() {
        // oneOf [string, array<string>, null] → repeated + nullable
        let schema: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            type: object
            properties:
              cc:
                oneOf:
                  - type: string
                  - type: array
                    items:
                      type: string
                  - type: "null"
            "#,
        )
        .unwrap();
        let components = HashMap::new();
        let params = flatten_body_params_prefix(&schema, &components, 0, "");
        let cc_param = params.get("cc").expect("'cc' parameter should exist");
        assert_eq!(cc_param.param_type.as_deref(), Some("string"));
        assert!(cc_param.repeated, "'cc' should be marked as repeated");
        assert!(cc_param.nullable, "'cc' should be nullable (has null branch)");
    }

    #[test]
    fn test_flatten_promotes_nullable_union_field() {
        // End-to-end: a body property with `anyOf: [string, null]`
        // becomes a `nullable: true` scalar MethodParameter, not a
        // typeless `VALUE` flag.
        let schema: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            type: object
            properties:
              authorId:
                anyOf:
                  - type: string
                  - type: "null"
            "#,
        )
        .unwrap();
        let params = flatten_body_params(&schema, &HashMap::new(), 0);
        let author = &params["authorId"];
        assert!(author.nullable, "should be promoted to nullable: {author:?}");
        assert_eq!(author.param_type.as_deref(), Some("string"));
    }

    #[test]
    fn test_flatten_promotes_nullable_union_via_ref_to_scalar() {
        // Same as above, but the non-null branch is `{$ref: ThreadIdString}`
        // where ThreadIdString resolves to `type: string`. Recognizer
        // follows the ref.
        let schema: OpenApiSchemaObject = serde_yaml::from_str(
            r##"
            type: object
            properties:
              threadId:
                oneOf:
                  - $ref: "#/components/schemas/ThreadIdString"
                  - type: "null"
            "##,
        )
        .unwrap();
        let thread_id: OpenApiSchemaObject = serde_yaml::from_str("type: string\n").unwrap();
        let mut components = HashMap::new();
        components.insert("ThreadIdString".to_string(), thread_id);
        let params = flatten_body_params(&schema, &components, 0);
        let thread = &params["threadId"];
        assert!(thread.nullable, "should be promoted: {thread:?}");
        assert_eq!(thread.param_type.as_deref(), Some("string"));
    }

    // -- OpenAPI 3.0/3.1 examples ----------------------------------------

    #[test]
    fn test_example_30_single() {
        let obj: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            type: string
            example: "hello"
            "#,
        )
        .unwrap();
        let prop = convert_schema_property(&obj);
        assert_eq!(
            prop.example,
            Some(serde_yaml::Value::String("hello".to_string())),
        );
        assert!(prop.examples.is_none());
    }

    #[test]
    fn test_examples_31_list() {
        let obj: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            type: string
            examples:
              - "alpha"
              - "beta"
            "#,
        )
        .unwrap();
        let prop = convert_schema_property(&obj);
        let seq = prop.examples.as_ref().and_then(|v| v.as_sequence()).unwrap();
        assert_eq!(seq.len(), 2);
        assert_eq!(seq[0], serde_yaml::Value::String("alpha".to_string()));
        assert_eq!(seq[1], serde_yaml::Value::String("beta".to_string()));
        assert!(prop.example.is_none());
    }

    #[test]
    fn test_examples_lax_30_map_form() {
        // BigCommerce-style schema-level `examples` map (out-of-spec for
        // OpenAPI 3.0 at the schema level, but real-world specs use it).
        // The parser must round-trip without erroring.
        let obj: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            type: array
            examples:
              Response:
                value:
                  - red
                  - green
            "#,
        )
        .unwrap();
        let prop = convert_schema_property(&obj);
        let map = prop.examples.as_ref().and_then(|v| v.as_mapping()).unwrap();
        assert!(map.contains_key(serde_yaml::Value::String("Response".to_string())));
    }

    // -- OpenAPI 3.0/3.1 numeric bounds ----------------------------------

    #[test]
    fn test_bounds_30_inclusive() {
        let obj: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            type: integer
            minimum: 0
            maximum: 100
            "#,
        )
        .unwrap();
        let prop = convert_schema_property(&obj);
        assert_eq!(prop.minimum, Some(0.0));
        assert_eq!(prop.maximum, Some(100.0));
        assert_eq!(prop.exclusive_minimum, None);
        assert_eq!(prop.exclusive_maximum, None);
    }

    #[test]
    fn test_bounds_30_exclusive_flag_promotes_minimum() {
        let obj: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            type: integer
            minimum: 5
            exclusiveMinimum: true
            "#,
        )
        .unwrap();
        let prop = convert_schema_property(&obj);
        assert_eq!(prop.minimum, None, "minimum becomes exclusive in 3.0 flag form");
        assert_eq!(prop.exclusive_minimum, Some(5.0));
    }

    #[test]
    fn test_bounds_31_numeric_form() {
        let obj: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            type: integer
            exclusiveMinimum: 5
            exclusiveMaximum: 99.5
            "#,
        )
        .unwrap();
        let prop = convert_schema_property(&obj);
        assert_eq!(prop.minimum, None);
        assert_eq!(prop.exclusive_minimum, Some(5.0));
        assert_eq!(prop.exclusive_maximum, Some(99.5));
    }

    #[test]
    fn test_bounds_30_and_31_produce_same_ir_for_strict_minimum() {
        let obj_30: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            type: integer
            minimum: 5
            exclusiveMinimum: true
            "#,
        )
        .unwrap();
        let obj_31: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            type: integer
            exclusiveMinimum: 5
            "#,
        )
        .unwrap();
        let p30 = convert_schema_property(&obj_30);
        let p31 = convert_schema_property(&obj_31);
        assert_eq!(p30.minimum, p31.minimum);
        assert_eq!(p30.exclusive_minimum, p31.exclusive_minimum);
    }

    #[test]
    fn test_bounds_30_exclusive_maximum_flag_promotes_maximum() {
        // Symmetric to test_bounds_30_exclusive_flag_promotes_minimum — locks
        // exclusiveMaximum's 3.0 boolean form against the same code path.
        let obj: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            type: integer
            maximum: 99
            exclusiveMaximum: true
            "#,
        )
        .unwrap();
        let prop = convert_schema_property(&obj);
        assert_eq!(prop.maximum, None, "maximum becomes exclusive in 3.0 flag form");
        assert_eq!(prop.exclusive_maximum, Some(99.0));
    }

    #[test]
    fn test_bounds_30_exclusive_false_keeps_inclusive() {
        let obj: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            type: integer
            minimum: 5
            exclusiveMinimum: false
            "#,
        )
        .unwrap();
        let prop = convert_schema_property(&obj);
        assert_eq!(prop.minimum, Some(5.0));
        assert_eq!(prop.exclusive_minimum, None);
    }

    // -- OpenAPI 3.1 const ------------------------------------------------

    #[test]
    fn test_const_lowers_to_single_element_enum() {
        let obj: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            type: string
            const: webhook.user.created
            "#,
        )
        .unwrap();
        let prop = convert_schema_property(&obj);
        assert_eq!(
            prop.enum_values.as_deref(),
            Some(&["webhook.user.created".to_string()][..]),
        );
    }

    #[test]
    fn test_const_numeric_value() {
        let obj: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            type: integer
            const: 42
            "#,
        )
        .unwrap();
        let prop = convert_schema_property(&obj);
        assert_eq!(prop.enum_values.as_deref(), Some(&["42".to_string()][..]));
    }

    #[test]
    fn test_const_lowered_through_flatten_body_params_inline() {
        // Inline-property branch: `const` reaches the generated CLI flag as
        // (a) a single-value enum constraint, (b) a client-side default
        // that auto-injects on omission, and (c) optional even if the
        // parent's required: list names it.
        let schema: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            type: object
            required: [status]
            properties:
              status:
                type: string
                const: active
            "#,
        )
        .unwrap();
        let component_schemas = HashMap::new();
        let params = flatten_body_params(&schema, &component_schemas, 0);
        let status = params.get("status").expect("status flag should be emitted");
        assert_eq!(status.enum_values.as_deref(), Some(&["active".to_string()][..]));
        assert_eq!(status.default_value, Some(serde_json::Value::String("active".into())));
        assert!(!status.required, "const-bearing flag must be optional");
    }

    #[test]
    fn test_const_lowered_through_flatten_body_params_via_ref() {
        // $ref-resolution branch: same three properties hold when the const
        // lives on a $ref-resolved component schema.
        let schema: OpenApiSchemaObject = serde_yaml::from_str(
            r##"
            type: object
            required: [role]
            properties:
              role:
                $ref: "#/components/schemas/Role"
            "##,
        )
        .unwrap();
        let role_schema: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            type: string
            const: admin
            "#,
        )
        .unwrap();
        let mut component_schemas = HashMap::new();
        component_schemas.insert("Role".to_string(), role_schema);
        let params = flatten_body_params(&schema, &component_schemas, 0);
        let role = params.get("role").expect("role flag should be emitted");
        assert_eq!(role.enum_values.as_deref(), Some(&["admin".to_string()][..]));
        assert_eq!(role.default_value, Some(serde_json::Value::String("admin".into())));
        assert!(!role.required, "const-bearing $ref'd flag must be optional");
    }

    #[test]
    fn test_const_numeric_default_keeps_wire_type() {
        // A numeric const lands on the wire as a JSON number, not a string —
        // critical for body fields whose const is meaningful as a literal
        // type rather than a label.
        let schema: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            type: object
            properties:
              version:
                type: integer
                const: 2
            "#,
        )
        .unwrap();
        let params = flatten_body_params(&schema, &HashMap::new(), 0);
        let version = params.get("version").unwrap();
        assert_eq!(
            version.default_value,
            Some(serde_json::Value::Number(serde_json::Number::from(2))),
            "numeric const must default to JSON number",
        );
    }

    #[test]
    fn test_const_does_not_override_explicit_enum() {
        let obj: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            type: string
            enum: [a, b]
            const: c
            "#,
        )
        .unwrap();
        let prop = convert_schema_property(&obj);
        assert_eq!(
            prop.enum_values.as_deref(),
            Some(&["a".to_string(), "b".to_string()][..]),
        );
    }

    // -- OpenAPI 3.1 webhooks ---------------------------------------------

    #[test]
    fn test_webhooks_block_parses_and_is_ignored_for_commands() {
        let yaml = r##"
openapi: "3.1.0"
info:
  title: Webhook-only spec
  version: "1.0.0"
paths: {}
webhooks:
  userCreated:
    post:
      operationId: handleUserCreated
      requestBody:
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/User"
      responses:
        "200":
          description: OK
components:
  schemas:
    User:
      type: object
      properties:
        id: { type: string }
"##;
        let value: serde_yaml::Value = serde_yaml::from_str(yaml).unwrap();
        let desc = load_openapi_spec_from_value(value, "test-cli").expect("spec should parse");
        // Component schema is still reachable via discovery.
        assert!(desc.schemas.contains_key("User"));
        // No CLI methods generated.
        let total_methods: usize = desc.resources.values().map(|r| r.methods.len()).sum();
        assert_eq!(total_methods, 0, "webhook ops must not become subcommands");
    }

    // -- OpenAPI 3.1 nullability ------------------------------------------

    #[test]
    fn test_nullable_30_explicit_field() {
        let obj: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            type: string
            nullable: true
            "#,
        )
        .unwrap();
        assert_eq!(obj.schema_type(), Some("string"));
        assert!(obj.is_nullable());
        let prop = convert_schema_property(&obj);
        assert!(prop.nullable);
        assert_eq!(prop.prop_type.as_deref(), Some("string"));
    }

    #[test]
    fn test_nullable_31_type_array_with_null() {
        let obj: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            type: ["string", "null"]
            "#,
        )
        .unwrap();
        assert_eq!(obj.schema_type(), Some("string"));
        assert!(obj.is_nullable());
        let prop = convert_schema_property(&obj);
        assert!(prop.nullable);
        assert_eq!(prop.prop_type.as_deref(), Some("string"));
    }

    #[test]
    fn test_nullable_31_type_array_null_first() {
        // Order shouldn't matter — `find` picks first non-null, presence of
        // "null" anywhere flips nullability on.
        let obj: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            type: ["null", "integer"]
            "#,
        )
        .unwrap();
        assert_eq!(obj.schema_type(), Some("integer"));
        assert!(obj.is_nullable());
    }

    #[test]
    fn test_nullable_31_type_array_only_null() {
        let obj: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            type: ["null"]
            "#,
        )
        .unwrap();
        assert_eq!(obj.schema_type(), None);
        assert!(obj.is_nullable());
    }

    #[test]
    fn test_nullable_30_regression_plain_type() {
        let obj: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            type: string
            "#,
        )
        .unwrap();
        assert_eq!(obj.schema_type(), Some("string"));
        assert!(!obj.is_nullable());
        let prop = convert_schema_property(&obj);
        assert!(!prop.nullable);
    }

    #[test]
    fn test_nullable_at_parent_json_schema_level() {
        // The parent JsonSchema (returned by convert_schema_object) carries
        // its own nullable flag — covers the case where a top-level
        // request/response body schema is itself nullable rather than just
        // having nullable properties.
        let obj_30: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            type: object
            nullable: true
            "#,
        )
        .unwrap();
        let obj_31: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            type: ["object", "null"]
            "#,
        )
        .unwrap();
        let s_30 = convert_schema_object(&obj_30);
        let s_31 = convert_schema_object(&obj_31);
        assert!(s_30.nullable);
        assert!(s_31.nullable);
        assert_eq!(s_30.schema_type.as_deref(), Some("object"));
        assert_eq!(s_31.schema_type.as_deref(), Some("object"));
    }

    #[test]
    fn test_flatten_body_params_marks_scalar_nullable_30() {
        let schema: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            type: object
            properties:
              userId:
                type: string
                nullable: true
            "#,
        )
        .unwrap();
        let params = flatten_body_params(&schema, &HashMap::new(), 0);
        let user_id = params.get("userId").expect("userId flag should be emitted");
        assert!(user_id.nullable, "scalar nullable (3.0) must propagate to MethodParameter");
    }

    #[test]
    fn test_flatten_body_params_marks_scalar_nullable_31() {
        let schema: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            type: object
            properties:
              userId:
                type: ["string", "null"]
            "#,
        )
        .unwrap();
        let params = flatten_body_params(&schema, &HashMap::new(), 0);
        let user_id = params.get("userId").expect("userId flag should be emitted");
        assert!(user_id.nullable, "scalar nullable (3.1) must propagate to MethodParameter");
    }

    #[test]
    fn test_flatten_body_params_non_nullable_scalar_stays_false() {
        let schema: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            type: object
            properties:
              userId:
                type: string
            "#,
        )
        .unwrap();
        let params = flatten_body_params(&schema, &HashMap::new(), 0);
        let user_id = params.get("userId").unwrap();
        assert!(!user_id.nullable);
    }

    #[test]
    fn test_flatten_body_params_nullable_integer_and_boolean_and_number() {
        // Three scalar variants beyond string: all must propagate nullable.
        let schema: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            type: object
            properties:
              count:
                type: ["integer", "null"]
              active:
                type: ["boolean", "null"]
              ratio:
                type: ["number", "null"]
            "#,
        )
        .unwrap();
        let params = flatten_body_params(&schema, &HashMap::new(), 0);
        assert!(params["count"].nullable);
        assert!(params["active"].nullable);
        assert!(params["ratio"].nullable);
    }

    #[test]
    fn test_flatten_body_params_non_scalar_nullable_not_propagated() {
        // type: [array, null] and type: [object, null] must NOT set
        // param.nullable=true. Arrays + nullable would collide with
        // ArgAction::Append; object-nullable has no parent flag to attach to.
        let schema: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            type: object
            properties:
              tags:
                type: ["array", "null"]
                items:
                  type: string
              metadata:
                type: ["object", "null"]
                properties:
                  code:
                    type: string
            "#,
        )
        .unwrap();
        let params = flatten_body_params(&schema, &HashMap::new(), 0);
        // tags is an array → repeated, single flag, nullable must be false.
        assert!(!params["tags"].nullable, "nullable array must not set param.nullable");
        // metadata is flattened to metadata.code; the only emitted flag is
        // the inner scalar, which is non-nullable.
        assert!(!params["metadata.code"].nullable);
    }

    #[test]
    fn test_flatten_body_params_nested_nullable_via_dot_notation() {
        // metadata.code where code is nullable: dot-notation should preserve
        // the nullable flag on the leaf.
        let schema: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            type: object
            properties:
              metadata:
                type: object
                properties:
                  code:
                    type: ["string", "null"]
            "#,
        )
        .unwrap();
        let params = flatten_body_params(&schema, &HashMap::new(), 0);
        assert!(params["metadata.code"].nullable);
    }

    #[test]
    fn test_nullable_schema_object_lowering() {
        let obj_30: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            type: object
            properties:
              email:
                type: string
                nullable: true
            "#,
        )
        .unwrap();
        let obj_31: OpenApiSchemaObject = serde_yaml::from_str(
            r#"
            type: object
            properties:
              email:
                type: ["string", "null"]
            "#,
        )
        .unwrap();
        let lowered_30 = convert_schema_object(&obj_30);
        let lowered_31 = convert_schema_object(&obj_31);
        assert_eq!(lowered_30.schema_type.as_deref(), Some("object"));
        assert_eq!(lowered_31.schema_type.as_deref(), Some("object"));
        assert!(lowered_30.properties["email"].nullable);
        assert!(lowered_31.properties["email"].nullable);
        assert_eq!(
            lowered_30.properties["email"].prop_type.as_deref(),
            Some("string"),
        );
        assert_eq!(
            lowered_31.properties["email"].prop_type.as_deref(),
            Some("string"),
        );
    }

    // -----------------------------------------------------------------------
    // Response-level $ref resolution helpers
    // -----------------------------------------------------------------------

    #[test]
    fn test_status_code_sort_key_numeric() {
        assert_eq!(status_code_sort_key("200"), Some(200));
        assert_eq!(status_code_sort_key("201"), Some(201));
        assert_eq!(status_code_sort_key("404"), Some(404));
    }

    #[test]
    fn test_status_code_sort_key_wildcard() {
        assert_eq!(status_code_sort_key("2XX"), Some(299));
        assert_eq!(status_code_sort_key("2xx"), Some(299));
        assert_eq!(status_code_sort_key("20X"), Some(209));
    }

    #[test]
    fn test_status_code_sort_key_default_returns_none() {
        assert_eq!(status_code_sort_key("default"), None);
    }

    #[test]
    fn test_resolve_response_ref_inline() {
        let resp = OpenApiResponse {
            content: Some(HashMap::new()),
        };
        let r = OpenApiResponseOrRef::Inline(resp);
        let components = HashMap::new();
        assert!(resolve_response_ref(&r, &components).is_some());
    }

    #[test]
    fn test_resolve_response_ref_resolves_ref() {
        let resp = OpenApiResponse {
            content: Some(HashMap::new()),
        };
        let mut components = HashMap::new();
        components.insert("Foo".to_string(), resp);

        let r = OpenApiResponseOrRef::Ref {
            ref_path: "#/components/responses/Foo".to_string(),
        };
        let resolved = resolve_response_ref(&r, &components);
        assert!(resolved.is_some(), "should resolve $ref to component response");
    }

    #[test]
    fn test_resolve_response_ref_missing_component() {
        let r = OpenApiResponseOrRef::Ref {
            ref_path: "#/components/responses/Missing".to_string(),
        };
        let components = HashMap::new();
        assert!(resolve_response_ref(&r, &components).is_none());
    }

    #[test]
    fn test_select_primary_response_picks_lowest_2xx() {
        let resp_200 = OpenApiResponse {
            content: Some(HashMap::new()),
        };
        let resp_201 = OpenApiResponse {
            content: Some(HashMap::new()),
        };
        let mut responses = HashMap::new();
        responses.insert(
            "201".to_string(),
            OpenApiResponseOrRef::Inline(resp_201),
        );
        responses.insert(
            "200".to_string(),
            OpenApiResponseOrRef::Inline(resp_200),
        );
        let components = HashMap::new();
        let result = select_primary_response(&responses, &components);
        assert!(result.is_some(), "should select a 2xx response");
    }

    #[test]
    fn test_select_primary_response_falls_back_to_default() {
        let resp = OpenApiResponse {
            content: Some(HashMap::new()),
        };
        let mut responses = HashMap::new();
        responses.insert(
            "default".to_string(),
            OpenApiResponseOrRef::Inline(resp),
        );
        let components = HashMap::new();
        let result = select_primary_response(&responses, &components);
        assert!(result.is_some(), "should fall back to 'default'");
    }

    #[test]
    fn test_extract_response_with_ref_schema() {
        let mut schemas = HashMap::new();
        let mut component_responses = HashMap::new();

        let mut content = HashMap::new();
        content.insert(
            "application/json".to_string(),
            OpenApiMediaType {
                schema: Some(OpenApiSchemaObject {
                    schema_ref: Some("#/components/schemas/Widget".to_string()),
                    ..Default::default()
                }),
                encoding: HashMap::new(),
            },
        );
        component_responses.insert(
            "WidgetResp".to_string(),
            OpenApiResponse {
                content: Some(content),
            },
        );

        let mut responses = HashMap::new();
        responses.insert(
            "200".to_string(),
            OpenApiResponseOrRef::Ref {
                ref_path: "#/components/responses/WidgetResp".to_string(),
            },
        );

        let result = extract_response(&responses, "test_op", &mut schemas, &component_responses);
        assert!(result.is_some(), "should extract response schema from $ref'd response");
        let sr = result.unwrap();
        assert_eq!(sr.schema_ref.as_deref(), Some("Widget"));
    }

    #[test]
    fn test_extract_response_inline_schema() {
        let mut schemas = HashMap::new();
        let component_responses = HashMap::new();

        let mut content = HashMap::new();
        content.insert(
            "application/json".to_string(),
            OpenApiMediaType {
                schema: Some(OpenApiSchemaObject {
                    type_field: TypeField { schema_type: Some("object".to_string()), null_in_array: false },
                    ..Default::default()
                }),
                encoding: HashMap::new(),
            },
        );

        let mut responses = HashMap::new();
        responses.insert(
            "200".to_string(),
            OpenApiResponseOrRef::Inline(OpenApiResponse {
                content: Some(content),
            }),
        );

        let result = extract_response(&responses, "inline_op", &mut schemas, &component_responses);
        assert!(result.is_some(), "should extract inline response schema");
        let sr = result.unwrap();
        assert_eq!(
            sr.schema_ref.as_deref(),
            Some("inline_op_response"),
            "inline schema should be registered under synthetic name",
        );
        assert!(
            schemas.contains_key("inline_op_response"),
            "inline schema must be stored in schemas map",
        );
    }
}
