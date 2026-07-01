//! Internal OpenAPI Representation
//!
//! Data structures representing an OpenAPI API's resources, methods, parameters, and schemas.
//! These structs serve as the internal representation that the command builder and
//! executor consume.

use std::collections::HashMap;

use serde::Deserialize;

/// Top-level API description.
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RestDescription {
    pub name: String,
    pub version: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub root_url: String,
    /// All top-level `servers:` entries from the spec, in declaration order.
    /// `root_url` is the URL of the first entry (kept for backwards
    /// compatibility with existing call sites). Servers with a resolved
    /// `name` (from `x-name`, falling back to `x-fern-server-name`) drive
    /// the global `--server <name>` flag — when the spec has at least one
    /// named server, the flag is exposed and its allowed values are the
    /// top-level named server names. Unnamed entries are still preserved
    /// here so the order matches the spec; helpers like
    /// [`RestDescription::named_servers`] filter them out for the help
    /// surface.
    #[serde(default, skip)]
    pub servers: Vec<Server>,
    #[serde(default)]
    pub service_path: String,
    pub base_url: Option<String>,
    /// Common prefix prepended to every operation path at request time —
    /// sourced from the spec-level `x-fern-base-path` extension. Used to
    /// declare a shared base like `/v1` or `/api/public` once on the spec
    /// instead of duplicating it on every path. Mirrors the upstream
    /// Fern OpenAPI importer:
    /// <https://github.com/fern-api/fern/blob/main/packages/cli/api-importers/openapi/openapi-ir-parser/src/openapi/v3/extensions/getFernBasePath.ts>
    ///
    /// At request time the executor inserts this between the server URL
    /// and the operation path with exactly one slash between segments.
    /// An empty string is treated the same as `None`.
    pub base_path: Option<String>,
    #[serde(default)]
    pub schemas: HashMap<String, JsonSchema>,
    #[serde(default)]
    pub resources: HashMap<String, RestResource>,
    #[serde(default)]
    pub parameters: HashMap<String, MethodParameter>,
    pub auth: Option<AuthDescription>,
    /// Auth schemes declared in `components.securitySchemes`. The key is the
    /// scheme name as it appears in the spec — that name is what
    /// per-operation `security` requirements reference, and what
    /// `CliApp::auth_scheme(name, source)` binds a credential source to.
    #[serde(default)]
    pub security_schemes: HashMap<String, SecurityScheme>,
    /// Query parameter name for pagination tokens (default: "pageToken").
    #[serde(default)]
    pub pagination_token_query_param: Option<String>,
    /// Dotted path to next page token in response JSON (default: "nextPageToken").
    /// Supports nested paths like "pagination.next_page_token".
    #[serde(default)]
    pub pagination_token_response_path: Option<String>,
    /// Idempotency header definitions parsed from the spec-root
    /// [`x-fern-idempotency-headers`](https://buildwithfern.com/learn/api-definitions/openapi/extensions/idempotency-headers)
    /// extension. Empty when the extension is absent.
    ///
    /// Each entry describes a header that operations marked with
    /// `x-fern-idempotent: true` accept. The parser materializes one CLI
    /// flag per header on every idempotent operation; non-idempotent
    /// operations are unaffected and never send these headers.
    #[serde(default, skip)]
    pub idempotency_headers: Vec<IdempotencyHeader>,
    /// Constructor-style globals declared by the spec's top-level
    /// `x-fern-sdk-variables` extension. Each entry surfaces as a global
    /// CLI flag (kebab-cased) with an env-var fallback
    /// (SCREAMING_SNAKE_CASE of the variable name) and replaces the
    /// corresponding `{varName}` placeholder in path templates of
    /// operations whose path parameter carries `x-fern-sdk-variable`.
    ///
    /// See <https://buildwithfern.com/learn/api-definitions/openapi/extensions/sdk-variables>.
    #[serde(default, skip)]
    pub sdk_variables: Vec<SdkVariable>,
    /// Spec-root [`x-fern-retries`](https://buildwithfern.com/learn/api-definitions/openapi/extensions/retries)
    /// extension. Inherited by every operation that omits its own
    /// `x-fern-retries` block, or that sets `x-fern-retries: true` to
    /// opt in to the spec-root defaults. A per-op object merges over
    /// this baseline; a per-op `false` (or `{ disabled: true }`)
    /// disables retries on that operation regardless of root.
    #[serde(default, skip)]
    pub retries: Option<RetriesConfig>,
    /// Global header definitions parsed from the spec-root
    /// [`x-fern-global-headers`](https://buildwithfern.com/learn/api-definitions/openapi/extensions/global-headers)
    /// extension. Empty when the extension is absent.
    ///
    /// Each entry surfaces as a global CLI flag at the root of the
    /// command tree with an env-var fallback and (when configured) a
    /// baked-in default value. The resolved value is stamped on every
    /// outgoing request as the named HTTP header — per-operation
    /// parameters with the same wire-name win.
    #[serde(default, skip)]
    pub global_headers: Vec<GlobalHeader>,
    /// Top-level group metadata sourced from the document-root
    /// [`x-fern-groups`](https://buildwithfern.com/learn/api-definitions/openapi/extensions/groups)
    /// extension. Mirrors the upstream Fern OpenAPI importer's
    /// [`SdkGroupInfo`](https://github.com/fern-api/fern/blob/main/packages/cli/api-importers/openapi/openapi-ir-parser/src/openapi/v3/extensions/getFernGroups.ts)
    /// record (`{ summary?, description? }`).
    ///
    /// Keys are kebab-cased to match the resource keys built from
    /// `x-fern-sdk-group-name`, so a `foo` entry binds to the `foo`
    /// subcommand resource and a `myGroup` entry binds to the
    /// `my-group` resource. Values are purely metadata for `--help`
    /// rendering — `x-fern-groups` does NOT restructure the clap tree,
    /// matching fern's semantics where the extension only annotates
    /// existing groups for documentation.
    #[serde(default, skip)]
    pub groups: HashMap<String, SdkGroupInfo>,
}

/// Metadata for a single group declared via the spec-root
/// [`x-fern-groups`](https://buildwithfern.com/learn/api-definitions/openapi/extensions/groups)
/// extension.
///
/// Mirrors fern's `SdkGroupInfo` IR type (both fields optional):
/// <https://github.com/fern-api/fern/blob/main/packages/cli/api-importers/openapi/openapi-ir/fern/definition/finalIr.yml>
/// (`SdkGroupInfo { summary: optional<string>, description: optional<string> }`).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SdkGroupInfo {
    /// Short human-friendly label for the group. When present, replaces
    /// the default `Operations on '<name>'` text used as the clap
    /// subcommand's `about()` line.
    pub summary: Option<String>,
    /// Longer prose description of the group. When present, used as the
    /// clap subcommand's `long_about()` so `--help` shows the full text
    /// for the group.
    pub description: Option<String>,
}

/// A single global header definition from the spec-root
/// [`x-fern-global-headers`](https://buildwithfern.com/learn/api-definitions/openapi/extensions/global-headers)
/// extension. Mirrors the [`GlobalHeader`] IR type emitted by the
/// upstream Fern OpenAPI importer.
///
/// The CLI uses `name` (if set) to derive the kebab-cased flag name and
/// `header` as the on-the-wire HTTP header name. When `env` is set the
/// flag accepts the value from that environment variable as a fallback,
/// and `default` is used when neither the flag nor the env var is
/// supplied. Operations may opt out of sending the header by declaring
/// a same-named per-operation parameter, which takes precedence.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct GlobalHeader {
    /// HTTP header name sent on the wire (e.g. `X-API-Version`).
    pub header: String,
    /// Optional SDK/CLI parameter name. When set, used as the basis for
    /// the kebab-cased CLI flag name; otherwise the flag derives from
    /// `header`.
    pub name: Option<String>,
    /// When `false` (the default), the CLI flag is required — every
    /// outgoing request must carry a value. When `true`, the header is
    /// omitted from requests where no value resolved.
    pub optional: bool,
    /// Optional environment variable that provides a fallback value for
    /// the generated flag.
    pub env: Option<String>,
    /// Optional baked-in default value applied when neither the flag
    /// nor the environment variable is supplied. Mirrors the upstream
    /// `x-fern-default` shape — only the value is preserved; the
    /// schema type is informational.
    pub default: Option<String>,
}

/// A single idempotency-header definition from the spec-root
/// [`x-fern-idempotency-headers`](https://buildwithfern.com/learn/api-definitions/openapi/extensions/idempotency-headers)
/// extension. Mirrors the [`IdempotencyHeader`] IR type emitted by the
/// upstream Fern OpenAPI importer.
///
/// The CLI uses `name` (if set) to derive the kebab-cased flag name and
/// `header` as the on-the-wire HTTP header name. When `env` is set the
/// flag accepts the value from that environment variable as a fallback.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct IdempotencyHeader {
    /// HTTP header name sent on the wire (e.g. `Idempotency-Key`).
    pub header: String,
    /// Optional SDK/CLI parameter name. When set, used as the basis for
    /// the kebab-cased CLI flag name; otherwise the flag derives from
    /// `header`.
    pub name: Option<String>,
    /// Optional environment variable that provides a default value for
    /// the generated flag. Generators can override this at build time via
    /// [`crate::openapi::app::CliApp::idempotency_header_env`].
    pub env: Option<String>,
}

/// A spec-level `x-fern-sdk-variables` entry. Modeled as a constructor-style
/// global that operations can bind path parameters to via
/// `x-fern-sdk-variable: <name>`.
///
/// Fern's TS/Python/Java SDKs only support `type: string` here today, so the
/// parser warns and skips non-string entries (mirroring the upstream
/// importer's `Variable <name> has unsupported schema` rejection but without
/// failing the whole spec load — the CLI is intentionally permissive).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SdkVariable {
    /// Variable name as it appears in path templates (e.g. `gardenId`).
    pub name: String,
    /// Lowered OpenAPI primitive type. Always `string` today; carried so a
    /// future generator change can specialize the global flag's `value_name`.
    pub ty: String,
    /// One-line `--help` description (from the variable schema's
    /// `description:` field).
    pub description: Option<String>,
}

/// How the request body should be serialized on the wire.
///
/// Determines the `Content-Type` header and payload encoding strategy.
/// Modeled as an enum so future body formats (multipart/form-data, etc.)
/// can be added as variants without boolean proliferation.
///
/// ## OpenAPI form encoding options (future work)
///
/// For `FormUrlEncoded`, the OAS 3.x `encoding` map supports per-property
/// overrides: `style` (form | spaceDelimited | pipeDelimited | deepObject),
/// `explode` (true | false), `contentType`, and `allowReserved`. These are
/// not yet parsed or acted upon — the current implementation uses the
/// defaults (`style: form`, `explode: true`) which produce repeated keys
/// for arrays (e.g. `tag=a&tag=b`). When a real consumer needs non-default
/// serialization, these fields should be added to the `FormUrlEncoded`
/// variant as a `HashMap<String, PropertyEncoding>`.
#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BodyEncoding {
    /// `application/json` — the default encoding for request bodies.
    #[default]
    Json,
    /// `application/x-www-form-urlencoded` — flat key=value pairs.
    ///
    /// Current behavior: top-level keys emitted as-is, arrays repeat the
    /// key (`tag=a&tag=b`), nested objects are JSON-encoded as values.
    FormUrlEncoded,
    // Future variants:
    // MultipartFormData { encoding: HashMap<String, PropertyEncoding> },
}

impl BodyEncoding {
    /// The `Content-Type` header value for this encoding.
    pub fn content_type(&self) -> &'static str {
        match self {
            Self::Json => "application/json",
            Self::FormUrlEncoded => "application/x-www-form-urlencoded",
        }
    }

    /// Returns `true` when the encoding is form-urlencoded.
    pub fn is_form(&self) -> bool {
        matches!(self, Self::FormUrlEncoded)
    }
}

/// Lifecycle/availability of an operation or parameter, sourced from the
/// `x-fern-availability` extension on the OpenAPI element. Mirrors the
/// canonical Fern values documented at
/// <https://buildwithfern.com/learn/api-definitions/openapi/extensions/availability>.
///
/// `Deprecated` is also reached when an operation has no
/// `x-fern-availability` extension but does carry the OpenAPI
/// `deprecated: true` flag — in that case the parser surfaces
/// `Deprecated` (see `parser.rs`).
///
/// NOTE: deliberate divergence from the Fern OpenAPI IR importer
/// (`packages/cli/api-importers/openapi/openapi-ir-parser`): the importer
/// collapses `pre-release` into [`Availability::Beta`] in the IR, since
/// downstream SDK generators only need to know "is this stable" /
/// "is this pre-stable" / "is this gone". The cli-sdk parser keeps
/// `PreRelease` as its own variant so the help-output badge can
/// differentiate `[PRE-RELEASE]` from `[BETA]` — both are documented
/// values in the [Fern reference], and treating them as the same loses
/// signal at the CLI surface where the user is reading help text.
///
/// [Fern reference]: https://buildwithfern.com/learn/api-definitions/openapi/extensions/availability
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Availability {
    /// Pre-stable, in active development. Tagged `[ALPHA]` in help output.
    Alpha,
    /// Pre-release / preview API. Tagged `[PRE-RELEASE]` in help output.
    /// Distinct from [`Availability::Beta`] in cli-sdk; see enum docs.
    PreRelease,
    /// Public beta. Tagged `[BETA]` in help output.
    Beta,
    /// Public preview. Tagged `[PREVIEW]` in help output.
    Preview,
    /// Generally available. No badge — this is the implicit default when
    /// `x-fern-availability` is absent. Accepts `ga` as an alias (matches
    /// the Fern OpenAPI importer).
    #[serde(alias = "ga")]
    GenerallyAvailable,
    /// Deprecated; still callable but discouraged. Tagged `[DEPRECATED]`
    /// in help output. Also inferred from OpenAPI `deprecated: true`.
    Deprecated,
    /// Legacy / sunset API. Tagged `[LEGACY]` in help output.
    Legacy,
}

impl Availability {
    /// Returns the badge label used in CLI help output for this
    /// availability, or `None` for [`Availability::GenerallyAvailable`]
    /// (the implicit default — no badge).
    pub fn badge(self) -> Option<&'static str> {
        match self {
            Availability::Alpha => Some("[ALPHA]"),
            Availability::PreRelease => Some("[PRE-RELEASE]"),
            Availability::Beta => Some("[BETA]"),
            Availability::Preview => Some("[PREVIEW]"),
            Availability::GenerallyAvailable => None,
            Availability::Deprecated => Some("[DEPRECATED]"),
            Availability::Legacy => Some("[LEGACY]"),
        }
    }

    /// Lowercase wire identifier matching the canonical Fern spelling
    /// (`alpha`, `beta`, `pre-release`, `preview`, `generally-available`,
    /// `deprecated`, `legacy`). Used for the `availability` field
    /// surfaced in `--schema` output.
    pub fn as_str(self) -> &'static str {
        match self {
            Availability::Alpha => "alpha",
            Availability::PreRelease => "pre-release",
            Availability::Beta => "beta",
            Availability::Preview => "preview",
            Availability::GenerallyAvailable => "generally-available",
            Availability::Deprecated => "deprecated",
            Availability::Legacy => "legacy",
        }
    }
}

/// A single auth scheme declared in `components.securitySchemes`. Mirrors
/// the OpenAPI 3 Security Scheme Object, lowered to just the bits we
/// dispatch on at runtime.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub enum SecurityScheme {
    /// `type: http, scheme: bearer` → `Authorization: Bearer <token>`.
    HttpBearer,
    /// `type: http, scheme: basic` → `Authorization: Basic <base64>`.
    HttpBasic,
    /// `type: apiKey, in: header, name: X-Api-Key` → `<name>: <value>`.
    ApiKeyHeader { name: String },
    /// `type: apiKey, in: query, name: api_key` — represented for parsing
    /// fidelity. The CLI doesn't attach query-key auth itself today;
    /// `RoutingAuthProvider` will skip a requirement that names this scheme.
    ApiKeyQuery { name: String },
    /// `type: oauth2`. The CLI treats these the same as `HttpBearer` at
    /// request time — the user supplies an already-issued access token via
    /// env var. Token refresh is out of scope.
    OAuth2,
    /// Anything we don't model (mTLS, openIdConnect, etc.). Recorded so the
    /// scheme name is still routable if a separate provider is bound to it
    /// programmatically.
    Other(String),
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct AuthDescription {
    pub oauth2: Option<OAuth2Description>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct OAuth2Description {
    pub scopes: Option<HashMap<String, ScopeDescription>>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct ScopeDescription {
    pub description: Option<String>,
}

/// A resource which can contain methods and nested sub-resources.
#[derive(Debug, Clone, Deserialize, Default)]
pub struct RestResource {
    #[serde(default)]
    pub methods: HashMap<String, RestMethod>,
    #[serde(default)]
    pub resources: HashMap<String, RestResource>,
}

/// One entry from an OpenAPI `servers:` array (top-level or per-operation),
/// lowered into the internal representation.
///
/// `name` is populated from the Fern extensions `x-name` (v1, the
/// legacy alias) or `x-fern-server-name` (v2, the canonical Fern
/// spelling). When both are present on the same server entry, v1 wins
/// to mirror fern's `getExtension([SERVER_NAME_V1, SERVER_NAME_V2])`
/// first-match-wins semantics in
/// `packages/cli/api-importers/openapi/openapi-ir-parser/src/openapi/v3/converters/convertServer.ts:72-75`.
/// Unnamed servers (no `x-fern-server-name` and no `x-name`) carry
/// `None`; they still participate in the default-URL chain (first
/// server wins) but are not selectable via the global `--server <name>`
/// flag.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Server {
    /// Server URL as it appears in the spec (may contain `{variable}`
    /// placeholders that are substituted later by [`CliApp::server_var`]).
    pub url: String,
    /// Resolved server name from `x-name` (v1 legacy alias, preferred to
    /// mirror fern) or `x-fern-server-name` (v2 canonical Fern spelling).
    /// `None` for unnamed entries.
    pub name: Option<String>,
    /// Optional human-readable description from the spec — surfaced in
    /// `--help` next to the server URL.
    pub description: Option<String>,
}

impl RestDescription {
    /// Returns the top-level servers that have a resolved name, paired
    /// with the resolved name itself, in declaration order. Drives the
    /// global `--server <name>` flag's allowed values and the
    /// help-section listing.
    ///
    /// Yielding `(name, server)` tuples lets callers avoid re-checking
    /// `server.name.is_some()` after the filter — the name is right
    /// there, statically guaranteed to be non-empty (see
    /// [`OpenApiServer::resolved_name`] in the parser, which trims and
    /// drops empty strings at the source).
    pub fn named_servers(&self) -> impl Iterator<Item = (&str, &Server)> {
        self.servers
            .iter()
            .filter_map(|s| s.name.as_deref().map(|n| (n, s)))
    }
}

/// Default total attempts (initial + retries) when retries are enabled.
///
/// 4 total attempts = 3 retries. Matches the fern Python/TypeScript
/// runtime SDKs. The spec author can override this with
/// `x-fern-retries: { max_attempts: N }`.
///
/// This was raised from 2 (FER-10521) to align with the cross-SDK
/// default and the expectation that transient 5xx / 429 / network
/// failures benefit from multiple retry attempts. CLIs that are embedded in
/// long-running applications where the latency of an extra retry is
/// acceptable. The CLI is interactive — a 3-second backoff before the
/// final failure feels broken.
pub const DEFAULT_RETRY_MAX_ATTEMPTS: u32 = 4;

/// Default exponential-backoff base delay in milliseconds. The wait before
/// retry N is `base * factor^N` (plus jitter). With
/// [`DEFAULT_RETRY_MAX_ATTEMPTS`] = 4 the delays are 500ms, 1s, 2s.
pub const DEFAULT_RETRY_BASE_DELAY_MS: u64 = 500;

/// Default exponential-backoff growth factor.
pub const DEFAULT_RETRY_FACTOR: f64 = 2.0;

/// Default jitter fraction (`0.1` = ±10% of the computed delay).
pub const DEFAULT_RETRY_JITTER: f64 = 0.1;

/// Resolved retry policy for an endpoint (or the spec-root default),
/// lowered from the [`x-fern-retries`](https://buildwithfern.com/learn/api-definitions/openapi/extensions/retries)
/// extension.
///
/// Mirrors the upstream Fern OpenAPI importer's tagged shape — the
/// canonical lever is `disabled: bool`, which the importer surfaces as
/// `RetriesConfiguration::Disabled(value)`. cli-sdk extends the same
/// extension with optional knobs that the runtime retry loop honors at
/// request time: `max_attempts`, `base_delay_ms`, `factor`, `jitter`. The
/// extra knobs are forward-compatible with the upstream importer — they
/// are simply ignored on the fern side until the IR carries them.
///
/// Resolution precedence (handled by the parser):
/// - per-op block absent → inherit the spec-root block (or `None` if also absent)
/// - per-op `true` → spec-root config, or all-defaults when root is absent
/// - per-op `false` (or `{ disabled: true }`) → disabled regardless of root
/// - per-op object → root values, overridden field-by-field by the op block
#[derive(Debug, Clone, PartialEq)]
pub struct RetriesConfig {
    /// `true` (the default) means the executor's retry loop is active;
    /// `false` disables retries for the operation. Maps to upstream
    /// fern's `RetriesConfiguration::Disabled(value)` — the importer's
    /// `disabled: true` lowers here as `enabled: false`.
    pub enabled: bool,
    /// Maximum total attempts (the initial request counts as attempt 1).
    /// `max_attempts: 2` performs the request once and retries up to one
    /// additional time. Validated as `>= 0` at parse time; a value of
    /// `0` is treated identically to `disabled: true`.
    pub max_attempts: u32,
    /// Base delay between retries in milliseconds. The actual wait before
    /// retry `n` (1-indexed) is `base_delay_ms * factor^(n-1)`, plus
    /// optional jitter, capped by any server-supplied `Retry-After`.
    pub base_delay_ms: u64,
    /// Growth factor for exponential backoff (e.g. `2.0` doubles the
    /// delay each retry).
    pub factor: f64,
    /// Jitter fraction in `[0.0, 1.0]`. A value of `0.1` adds a uniform
    /// random offset in `±10%` of the computed delay so a stampede of
    /// clients does not synchronize retries.
    pub jitter: f64,
}

impl Default for RetriesConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            max_attempts: DEFAULT_RETRY_MAX_ATTEMPTS,
            base_delay_ms: DEFAULT_RETRY_BASE_DELAY_MS,
            factor: DEFAULT_RETRY_FACTOR,
            jitter: DEFAULT_RETRY_JITTER,
        }
    }
}

impl RetriesConfig {
    /// Explicitly-disabled retry policy. Returned by the parser when the
    /// spec sets `x-fern-retries: false` or `{ disabled: true }`. The
    /// executor short-circuits on this variant — no retry loop, no
    /// backoff, no Retry-After honor.
    pub fn disabled() -> Self {
        Self {
            enabled: false,
            max_attempts: 0,
            base_delay_ms: 0,
            factor: DEFAULT_RETRY_FACTOR,
            jitter: 0.0,
        }
    }
}

/// A single API method.
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RestMethod {
    pub id: Option<String>,
    pub description: Option<String>,
    pub http_method: String,
    pub path: String,
    #[serde(default)]
    pub parameters: HashMap<String, MethodParameter>,
    #[serde(default)]
    pub parameter_order: Vec<String>,
    pub request: Option<SchemaRef>,
    pub response: Option<SchemaRef>,
    #[serde(default)]
    pub scopes: Vec<String>,
    pub flat_path: Option<String>,
    #[serde(default)]
    pub supports_media_download: bool,
    #[serde(default)]
    pub supports_media_upload: bool,
    pub media_upload: Option<MediaUpload>,
    /// Per-operation base URL (populated from the spec's servers block during parsing).
    /// When non-empty, takes priority over RestDescription.root_url in URL construction.
    #[serde(default)]
    pub root_url: String,
    /// Per-operation `servers:` overrides (named or unnamed), in declaration
    /// order. Empty when the operation has no `servers:` block (the
    /// top-level [`RestDescription::servers`] applies instead).
    ///
    /// When non-empty, this list is the authoritative server set for the
    /// operation — per-op `servers:` *replaces* the global default, it does
    /// not augment it. The global `--server <name>` flag resolves against
    /// this list first for operations that have it; if the flag value
    /// doesn't match any per-op name, the executor falls back to
    /// [`RestMethod::root_url`] (the first per-op server) so per-op routing
    /// overrides are preserved.
    #[serde(default, skip)]
    pub servers: Vec<Server>,
    /// Metadata for operations whose request body is raw binary (e.g.
    /// `application/octet-stream`, `audio/mpeg`). When `Some`, the CLI exposes
    /// a typed flag that streams a file as the body with the declared content
    /// type.
    #[serde(default)]
    pub binary_request_body: Option<BinaryRequestBody>,
    /// Fields for a `multipart/form-data` request body. When non-empty, the
    /// executor sends the request as multipart instead of JSON, and each
    /// field surfaces as a per-operation CLI flag. Empty for non-multipart
    /// operations.
    #[serde(default, skip)]
    pub multipart_fields: Vec<MultipartField>,
    /// How the request body should be serialized on the wire.
    ///
    /// Defaults to `BodyEncoding::Json`. The executor reads this to decide
    /// the `Content-Type` header and encoding strategy.
    #[serde(default)]
    pub body_encoding: BodyEncoding,
    /// Lowered OpenAPI security requirements: OR of ANDs.
    ///
    /// - `None` — operation didn't declare `security` and there was no
    ///   spec-level default to inherit.
    /// - `Some(vec![])` — operation explicitly opts out (`security: []` in
    ///   the spec, or inherited explicit empty).
    /// - `Some(vec![req1, req2, ...])` — satisfy any one requirement; each
    ///   requirement is an AND of scheme names with their requested scopes.
    #[serde(default)]
    pub security_requirements: Option<Vec<HashMap<String, Vec<String>>>>,
    /// Resolved `x-fern-pagination` extension for this operation, after
    /// applying root-level inheritance (per-op `x-fern-pagination: true`
    /// inherits from the spec-root `x-fern-pagination` block).
    ///
    /// `None` means the operation has no explicit pagination config — the
    /// executor falls back to the document-wide heuristic
    /// (`pagination_token_query_param` + `pagination_token_response_path`).
    #[serde(default, skip)]
    pub pagination: Option<PaginationConfig>,
    /// Lowered `x-fern-availability` for the operation. `None` is the
    /// implicit default (no badge). When the extension is absent but the
    /// operation carries `deprecated: true`, the parser sets this to
    /// `Some(Availability::Deprecated)` so the standard OpenAPI flag is
    /// honored.
    #[serde(default)]
    pub availability: Option<Availability>,
    /// `true` when the operation is marked with
    /// [`x-fern-idempotent: true`](https://buildwithfern.com/learn/api-definitions/openapi/extensions/idempotent).
    /// Idempotent operations surface the spec-root idempotency-header
    /// definitions as CLI flags; non-idempotent operations do not, and
    /// never send idempotency headers on the wire.
    #[serde(default)]
    pub idempotent: bool,
    /// Resolved `x-fern-sdk-return-value` extension — a dot-separated key
    /// path through the JSON response body identifying the subvalue the
    /// SDK / CLI should return to the caller. `None` (the implicit
    /// default) means the executor prints the full response.
    ///
    /// Mirrors fern-api/fern's OpenAPI importer
    /// (`FernOpenAPIExtension.RESPONSE_PROPERTY = "x-fern-sdk-return-value"`):
    /// the value is consumed as a property path on the response body,
    /// surfacing only the named subvalue. cli-sdk extends this to
    /// support nested paths (e.g. `result.items`) at runtime — the
    /// upstream Fern Definition path resolves a single object property,
    /// but the CLI executor walks dotted paths the same way it does for
    /// `x-fern-pagination`'s `next_*` / `results` paths.
    #[serde(default)]
    pub return_value: Option<String>,
    /// Resolved `x-fern-streaming` extension. `None` means the operation
    /// returns a unary response and the executor reads/buffers the body
    /// normally. `Some(_)` opts the executor into incremental
    /// line-by-line response handling: each event/value is decoded as it
    /// arrives and emitted to stdout (or buffered when `--no-stream` is
    /// set). Mirrors the upstream Fern OpenAPI importer's
    /// `getFernStreamingExtension`
    /// (`fern-api/fern/.../extensions/getFernStreamingExtension.ts`).
    ///
    /// The runtime variant carries only what the executor needs at
    /// request time: the wire format (SSE vs newline-delimited JSON) and
    /// an optional terminator line. Upstream's `stream-condition` form
    /// (which generates a streaming-and-unary endpoint pair in typed
    /// SDKs) is parsed for parity but is not surfaced at the CLI
    /// runtime — the CLI exposes one command per OpenAPI operation, so
    /// the boolean stream-condition is treated as an unconditional
    /// stream.
    #[serde(default, skip)]
    pub streaming: Option<StreamingConfig>,
    /// When `true`, the executor does NOT auto-generate an
    /// `Idempotency-Key` header for this operation even though it uses
    /// POST/PUT/PATCH. Set from `x-fern-cli-idempotency: false`.
    #[serde(default, skip)]
    pub no_auto_idempotency_key: bool,
    /// Resolved `x-fern-retries` extension for this operation, after
    /// applying root-level inheritance (per-op `true` adopts the spec-root
    /// baseline; per-op object merges field-by-field over root). `None`
    /// means the operation has no retry policy at all — the executor
    /// runs the request exactly once. See [`RetriesConfig`] for the
    /// precedence rules.
    #[serde(default, skip)]
    pub retries: Option<RetriesConfig>,
    /// Resolved [`x-fern-audiences`](https://buildwithfern.com/learn/api-definitions/openapi/extensions/audiences)
    /// tags for this operation, in declaration order with duplicates
    /// preserved. Empty when the operation has no `x-fern-audiences`
    /// extension.
    ///
    /// Used by the audience-filter pass at command-tree build time
    /// (`commands::filter_doc_by_audiences`) to decide whether the
    /// operation appears as a CLI subcommand. Untouched at request
    /// time — the executor never inspects this field, matching fern's
    /// "drop from IR" semantics rather than "skip at runtime".
    ///
    /// Mirrors fern-api/fern's OpenAPI importer
    /// (`packages/cli/api-importers/openapi/openapi-ir-parser/src/openapi/v3/converters/operation/convertHttpOperation.ts:330`):
    /// `audiences: getExtension<string[]>(operation, FernOpenAPIExtension.AUDIENCES) ?? []`.
    ///
    /// `skip` mirrors the convention used by peer internal-only
    /// fields parsed from `x-fern-*` extensions (`retries`,
    /// `streaming`, `pagination`) — set programmatically by the
    /// parser, never round-tripped through `RestMethod` serialization.
    #[serde(default, skip)]
    pub audiences: Vec<String>,
    /// `true` when at least one `2xx` (or `2XX` wildcard) response declares
    /// a content media type that is not JSON. Used at command-build time to
    /// gate the `-o, --output PATH` flag: it's only meaningful for ops that
    /// can return a binary body (audio, octet-stream, image, etc.) and
    /// silently no-ops on pure-JSON ops, so the help surface hides it where
    /// it would do nothing. Empty `responses` block → `false`.
    #[serde(default, skip)]
    pub has_binary_response: bool,
}

/// Per-operation pagination configuration, resolved from the
/// [`x-fern-pagination`](https://buildwithfern.com/learn/api-definitions/openapi/extensions/pagination)
/// OpenAPI extension.
///
/// The five forms mirror `fern-api/fern`'s OpenAPI importer (see
/// `getPaginationExtension.ts`):
///
/// - [`PaginationConfig::Cursor`] — token-based forward pagination
/// - [`PaginationConfig::Offset`] — numeric offset pagination
/// - [`PaginationConfig::Uri`] — server returns a fully-formed next URL
/// - [`PaginationConfig::Path`] — server returns a relative next path
/// - [`PaginationConfig::Custom`] — caller-driven; the executor stops after
///   one request (no automatic continuation) and exposes only the
///   `results` extraction
///
/// `$request.` / `$response.` JSONPath prefixes are stripped during
/// parsing so values can be consumed directly: `cursor` / `offset` are the
/// request parameter name to populate on the next page, and `next_*`,
/// `results`, `has_next_page` are dotted JSON paths into the response.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PaginationConfig {
    /// Cursor-style pagination — send the previous response's
    /// `next_cursor` value as the request's `cursor` parameter on the next
    /// page. Pagination stops when `next_cursor` is absent, null, or empty.
    Cursor {
        /// Request parameter name receiving the cursor token.
        cursor: String,
        /// Dotted JSON path in the response to the next cursor token.
        next_cursor: String,
        /// Dotted JSON path in the response to the results array.
        results: String,
    },
    /// Offset-style pagination — send the running offset as the request's
    /// `offset` parameter on each page. Pagination stops when
    /// `has_next_page` is `false`, when the results array is empty, or
    /// when the configured page limit is reached.
    Offset {
        /// Request parameter name receiving the offset value.
        offset: String,
        /// Dotted JSON path in the response to the results array.
        results: String,
        /// Optional request parameter name holding the page-size step. When
        /// present, the offset advances by the step value the caller
        /// supplied (e.g. `--params '{"limit": 50}'`). When absent, the
        /// offset advances by the response page's results length.
        step: Option<String>,
        /// Optional dotted JSON path in the response to a boolean
        /// "more pages?" flag.
        has_next_page: Option<String>,
    },
    /// URI pagination — the server returns a fully-formed URL for the
    /// next page (e.g. `https://api.example.com/v1/things?cursor=abc`).
    /// The executor uses that URL verbatim for the next request.
    /// Pagination stops when the URL is absent, null, or empty.
    Uri {
        /// Dotted JSON path in the response to the next-page URL.
        next_uri: String,
        /// Dotted JSON path in the response to the results array.
        results: String,
    },
    /// Path pagination — like [`PaginationConfig::Uri`] but the response
    /// contains a relative path (e.g. `/v1/things?cursor=abc`) that the
    /// executor resolves against the original request's base URL.
    /// Pagination stops when the path is absent, null, or empty.
    Path {
        /// Dotted JSON path in the response to the next-page path.
        next_path: String,
        /// Dotted JSON path in the response to the results array.
        results: String,
    },
    /// Custom pagination — caller-driven. The CLI does not attempt
    /// automatic continuation; it issues exactly one request and only
    /// uses the `results` path for result extraction.
    Custom {
        /// Dotted JSON path in the response to the results array.
        results: String,
    },
}

/// Per-operation streaming configuration, resolved from the
/// [`x-fern-streaming`](https://buildwithfern.com/learn/api-definitions/openapi/extensions/streaming)
/// OpenAPI extension. Mirrors the upstream Fern OpenAPI importer's
/// `getFernStreamingExtension` tagged union — the three wire formats
/// the runtime distinguishes (`sse`, `json`, `text`) line up with
/// Fern IR's `StreamingResponse` union (see
/// `packages/ir-sdk/fern/apis/ir-types-latest/definition/http.yml`).
///
/// Recognized YAML shapes (parser side):
/// - `x-fern-streaming: true`              → [`StreamingConfig::Json`] with no terminator
///   (matches upstream's boolean shorthand: `format: "json"`).
/// - `x-fern-streaming: false`             → `None` (explicit opt-out).
/// - `x-fern-streaming: { format: sse }`   → [`StreamingConfig::Sse`].
/// - `x-fern-streaming: { format: json }`  → [`StreamingConfig::Json`].
/// - `x-fern-streaming: { format: text }`  → [`StreamingConfig::Text`].
/// - `{ format: sse, terminator: "[DONE]" }` → SSE with explicit terminator.
///
/// The optional `terminator` is the literal line that ends the stream
/// — for SSE, the event payload after the `data:` prefix; for JSON,
/// the full line. When unset, the executor reads until the server
/// closes the connection (matches the TS / C# typed-SDK runtimes,
/// which also skip the terminator check when the spec didn't declare
/// one). Text streams have no terminator concept.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StreamingConfig {
    /// Server-Sent Events stream (`format: sse`). Body is parsed line
    /// by line; lines beginning with `data: ` have the prefix stripped
    /// and the remainder is emitted as one event. Other SSE field
    /// lines (`event:`, `id:`, `retry:`, comment lines starting with
    /// `:`) are ignored at runtime.
    Sse {
        /// Optional sentinel line that terminates the stream
        /// (compared against the post-`data: ` event payload using
        /// exact equality, matching the C# generator). When `None`,
        /// the stream reads to EOF; mirrors the TS/C# typed-SDK
        /// behavior of only checking the terminator when the spec
        /// declared one.
        terminator: Option<String>,
    },
    /// Newline-delimited JSON stream (`format: json`, aka NDJSON /
    /// JSONL). Each non-empty line is a complete JSON value; the
    /// executor parses one value per line and emits it as it arrives.
    Json {
        /// Optional sentinel line that terminates the stream (compared
        /// against the raw line, before JSON parsing). When `None`,
        /// the stream ends when the server closes the connection.
        terminator: Option<String>,
    },
    /// Plain-text line stream (`format: text`). Each non-empty line is
    /// emitted verbatim as a raw string event — no JSON parsing, no
    /// SSE framing strip, no terminator check. Mirrors the C# SDK
    /// generator (`HttpEndpointGenerator.ts:815-825`), which reads
    /// the response line-by-line and `yield return line` for any
    /// non-empty line.
    ///
    /// `x-fern-sdk-return-value` is a no-op for text streams — the
    /// event payload is already a JSON string after escaping.
    Text,
}

/// Metadata describing a binary request body.
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct BinaryRequestBody {
    /// Content type to send with the request (e.g. `application/octet-stream`).
    pub content_type: String,
    /// CLI flag name (kebab-cased). Resolved from `x-fern-parameter-name` on
    /// the requestBody when present; falls back to `file` for `format: binary`
    /// schemas, otherwise `body`.
    pub flag_name: String,
}

/// A single field in a `multipart/form-data` request body. Each field
/// becomes a CLI flag whose value is sent as one part in the multipart
/// body. File-typed fields accept a filesystem path (or `@path` /
/// `-` for stdin) and are streamed as binary parts with the appropriate
/// content type.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MultipartField {
    /// Wire name sent as the `name` in `Content-Disposition: form-data; name="..."`.
    pub wire_name: String,
    /// `true` when the field's schema is `type: string, format: binary`
    /// (or `type: file`). File fields accept a path and stream the
    /// contents; text fields send the flag value as a UTF-8 text part.
    pub is_file: bool,
    /// Human-readable description from the spec (surfaces in `--help`).
    pub description: Option<String>,
    /// Whether the spec marks this field as required.
    pub required: bool,
    /// Content type hint for file parts (e.g. `application/octet-stream`).
    /// Only meaningful when `is_file` is true; text parts always use
    /// `text/plain; charset=utf-8`.
    pub content_type: Option<String>,
}

/// Media upload metadata.
#[derive(Debug, Clone, Deserialize, Default)]
pub struct MediaUpload {
    pub protocols: Option<MediaUploadProtocols>,
    pub accept: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct MediaUploadProtocols {
    pub simple: Option<MediaUploadProtocol>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct MediaUploadProtocol {
    pub path: String,
    pub multipart: Option<bool>,
}

/// A reference to a schema (e.g., `{ "$ref": "File" }`).
#[derive(Debug, Clone, Deserialize, Default)]
pub struct SchemaRef {
    #[serde(rename = "$ref")]
    pub schema_ref: Option<String>,
    #[serde(rename = "parameterName")]
    pub parameter_name: Option<String>,
}

/// A parameter definition for a method.
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MethodParameter {
    #[serde(rename = "type")]
    pub param_type: Option<String>,
    pub description: Option<String>,
    pub location: Option<String>,
    #[serde(default)]
    pub required: bool,
    pub format: Option<String>,
    /// Client-side default sourced only from the Fern `x-fern-default`
    /// extension. When set, the generated CLI plumbs this into clap's
    /// `.default_value(...)` (so the value shows up in `--help` and the
    /// flag becomes optional) AND substitutes the original JSON value
    /// into the outgoing request when the caller omits the flag. Stored
    /// as a typed `serde_json::Value` so numbers/booleans keep their
    /// wire type.
    ///
    /// Precedence within this field, **first match wins**:
    ///   1. `x-fern-default` placed at the ref-site (next to `$ref`)
    ///   2. `x-fern-default` on the resolved component parameter
    ///
    /// The OpenAPI standard `default:` keyword does **not** populate
    /// this field — it lives separately on
    /// [`documentation_default_value`]. See ticket FER-9864.
    pub default_value: Option<serde_json::Value>,
    /// Documentation hint sourced from the OpenAPI standard `default:`
    /// keyword on the parameter's `schema`. The OpenAPI spec defines
    /// `default:` as describing **server** behavior when the parameter
    /// is omitted — it is not a directive to clients to send the value.
    ///
    /// We surface this in `--help` (so users know what the API will do
    /// if they leave the flag off) but we do **not** wire it into
    /// clap's `.default_value(...)` and we do **not** send it on the
    /// wire. Only `x-fern-default` (stored on [`default_value`])
    /// produces a client-side default.
    ///
    /// Ignored when `default_value` is set — the extension supersedes
    /// the documentation hint for display purposes too.
    pub documentation_default_value: Option<serde_json::Value>,
    #[serde(rename = "enum")]
    pub enum_values: Option<Vec<String>>,
    pub enum_descriptions: Option<Vec<String>>,
    #[serde(default)]
    pub repeated: bool,
    /// True for `oneOf/anyOf [string, array<string>]` unions where a single
    /// value should be sent as a scalar string, not wrapped in a length-1
    /// array. Pure `type: array` params leave this `false`.
    #[serde(default)]
    pub scalar_or_array: bool,
    /// Inclusive numeric lower bound (matches [`JsonSchemaProperty::minimum`]).
    /// Typing the param side as `Option<f64>` keeps `--schema` output
    /// emit min/max as JSON numbers regardless of whether the property
    /// came from `parameters` or a request body schema.
    pub minimum: Option<f64>,
    /// Inclusive numeric upper bound. See [`Self::minimum`].
    pub maximum: Option<f64>,
    #[serde(default)]
    pub deprecated: bool,
    /// OpenAPI serialization style (form, deepObject, etc.)
    #[serde(default)]
    pub style: Option<String>,
    /// Whether arrays/objects should be exploded into separate params.
    #[serde(default)]
    pub explode: Option<bool>,
    /// Lowered `x-fern-availability` for the parameter. `None` is the
    /// implicit default (no badge).
    #[serde(default)]
    pub availability: Option<Availability>,
    /// True when this body parameter's schema admits JSON `null` as a valid
    /// value (OpenAPI 3.0 `nullable: true` or 3.1 `type: [..., "null"]`).
    /// Gated on scalar `param_type` (`string` / `integer` / `number` /
    /// `boolean`) — composite types stay false because the null sentinel
    /// surface is scalar-only (see ADR-0003). When true, the CLI accepts
    /// the literal `null` as a flag value and converts it to `Value::Null`
    /// at request-build time.
    #[serde(default)]
    pub nullable: bool,
    /// Optional environment variable that supplies a default value when
    /// the corresponding CLI flag is not passed. Populated for synthetic
    /// parameters injected by Fern extensions (e.g. idempotency headers);
    /// not currently set for spec-declared parameters.
    #[serde(default)]
    pub env_var: Option<String>,
    /// Override the kebab-cased long-flag derived from the parameter's
    /// HashMap key. When `Some(_)`, `commands.rs` uses this value
    /// verbatim as the `--<flag>` instead of running the key through
    /// `to_kebab_flag`. The clap arg ID — and the on-the-wire wire-key
    /// (e.g. HTTP header name) — still derives from the HashMap key, so
    /// the executor's lookup pathway is unchanged.
    ///
    /// Populated by `inject_idempotency_header_params` so an entry like
    /// `{ header: X-Trace-Id, name: trace_id }` surfaces as `--trace-id`
    /// (matching the SDK parameter naming the upstream Fern OpenAPI
    /// importer produces) while still sending the `X-Trace-Id` header.
    #[serde(default)]
    pub flag_name_override: Option<String>,
    /// Lowered `x-fern-parameter-name` for the parameter. When `Some`,
    /// the command builder renames the CLI flag (kebab-cased), while the
    /// executor keeps using the original wire name (the map key) for the
    /// outgoing HTTP request. Mirrors fern's OpenAPI importer, which uses
    /// the alias on the SDK surface but the wire name in the request.
    /// See https://buildwithfern.com/learn/api-definitions/openapi/extensions/parameter-name
    #[serde(default)]
    pub display_name: Option<String>,
    /// Lowered `x-fern-enum` per-value overrides. Keyed by the wire
    /// value. Entries are only present when the spec opted into the
    /// extension; absent → fall back to the raw wire value with no
    /// description.
    #[serde(default, skip)]
    pub fern_enum: Option<HashMap<String, FernEnumValue>>,
    /// Name of the spec-level `x-fern-sdk-variables` entry that supplies
    /// this parameter's value. Set when the parameter carries an
    /// `x-fern-sdk-variable: <name>` extension. Variable-bound path
    /// parameters are excluded from the per-operation flag surface; their
    /// value is read from the global root flag (or its env-var fallback)
    /// and substituted into the path template at request time.
    #[serde(default, skip)]
    pub variable_reference: Option<String>,
}

impl MethodParameter {
    /// Map a user-supplied value (which may be either the wire value or
    /// the `x-fern-enum` display alias) back to the **wire** value the
    /// HTTP layer must send. When no override matches, returns the input
    /// unchanged so non-enum params and absent extensions are pure
    /// identity.
    pub fn resolve_enum_display_to_wire<'a>(
        &self,
        input: &'a str,
    ) -> std::borrow::Cow<'a, str> {
        let Some(map) = self.fern_enum.as_ref() else {
            return std::borrow::Cow::Borrowed(input);
        };
        for (wire, entry) in map {
            if entry
                .display_name
                .as_deref()
                .is_some_and(|name| name == input)
            {
                return std::borrow::Cow::Owned(wire.clone());
            }
        }
        std::borrow::Cow::Borrowed(input)
    }
}

/// Per-value override for `x-fern-enum`. Mirrors the Fern OpenAPI IR
/// importer's `FernEnumConfig` entry — `description` and `name` are the
/// only fields cli-sdk consumes; `casing` is reserved for SDK codegen.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct FernEnumValue {
    /// User-facing rendered name. When set, surfaces as the canonical
    /// option in `--help` while the wire value remains accepted as an
    /// alias.
    pub display_name: Option<String>,
    /// Per-value description rendered in long `--help` output.
    pub description: Option<String>,
}

/// JSON Schema definition for request/response bodies.
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct JsonSchema {
    pub id: Option<String>,
    #[serde(rename = "type")]
    pub schema_type: Option<String>,
    /// Surfaces both OpenAPI 3.0 `nullable: true` and OpenAPI 3.1
    /// `type: [..., "null"]` uniformly. Lowered by the parser, not the
    /// derived deserializer.
    #[serde(default)]
    pub nullable: bool,
    pub description: Option<String>,
    #[serde(default)]
    pub properties: HashMap<String, JsonSchemaProperty>,
    #[serde(rename = "$ref")]
    pub schema_ref: Option<String>,
    pub items: Option<Box<JsonSchemaProperty>>,
    #[serde(default)]
    pub required: Vec<String>,
    /// JSON Schema composition branches at the component-schema root. Mirrors
    /// the same fields on [`JsonSchemaProperty`] so a top-level union like
    /// `Auth0Role: { oneOf: [...] }` is captured, not just composition nested
    /// inside a property. Not yet consumed by command generation.
    #[serde(default)]
    pub one_of: Vec<JsonSchemaProperty>,
    #[serde(default)]
    pub any_of: Vec<JsonSchemaProperty>,
    #[serde(default)]
    pub all_of: Vec<JsonSchemaProperty>,
    pub additional_properties: Option<Box<JsonSchemaProperty>>,
}

/// A property within a JSON Schema.
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct JsonSchemaProperty {
    #[serde(rename = "type")]
    pub prop_type: Option<String>,
    /// See [`JsonSchema::nullable`].
    #[serde(default)]
    pub nullable: bool,
    pub description: Option<String>,
    #[serde(rename = "$ref")]
    pub schema_ref: Option<String>,
    pub format: Option<String>,
    pub items: Option<Box<JsonSchemaProperty>>,
    #[serde(default)]
    pub properties: HashMap<String, JsonSchemaProperty>,
    /// Names of nested object properties that the source schema marks as
    /// required. Lowered from the OpenAPI `required: [...]` keyword on
    /// object-typed schemas. Empty when the source had no `required` list
    /// or when this property is not an object (e.g. scalar / array).
    /// Surfaced in `--schema` so agents constructing nested JSON bodies
    /// can tell which sub-fields the spec mandates.
    #[serde(default)]
    pub required: Vec<String>,
    #[serde(default)]
    pub read_only: bool,
    /// OpenAPI's standard `default:` keyword. Stored as a `serde_json::Value`
    /// (lowered from the raw YAML) so the wire type — number, boolean,
    /// object, etc. — survives into the agent-facing `--schema` output
    /// and is symmetric with [`MethodParameter::default_value`].
    pub default: Option<serde_json::Value>,
    #[serde(rename = "enum")]
    pub enum_values: Option<Vec<String>>,
    /// Inclusive numeric lower bound. Lowered by the parser so the OpenAPI
    /// 3.0 / 3.1 `exclusiveMinimum` divergence is resolved before reaching
    /// the IR.
    pub minimum: Option<f64>,
    /// Inclusive numeric upper bound. See `minimum` above.
    pub maximum: Option<f64>,
    /// Strict numeric lower bound. Lowered uniformly from both OpenAPI 3.0
    /// (`exclusiveMinimum: true` with paired `minimum`) and 3.1
    /// (`exclusiveMinimum: <number>`).
    pub exclusive_minimum: Option<f64>,
    /// Strict numeric upper bound. See `exclusive_minimum` above.
    pub exclusive_maximum: Option<f64>,
    /// Single example value (OpenAPI 3.0 `example` or 3.1 fallback).
    pub example: Option<serde_yaml::Value>,
    /// `examples` block, captured as raw YAML. Real-world specs use this
    /// field in three different shapes (3.1 array, lax-3.0 map keyed by
    /// example name, single value); the parser preserves all three.
    pub examples: Option<serde_yaml::Value>,
    /// JSON Schema composition branches. Lowered by the parser from
    /// `oneOf`. Empty when the source had no `oneOf` block.
    #[serde(default)]
    pub one_of: Vec<JsonSchemaProperty>,
    /// JSON Schema composition: `anyOf`.
    #[serde(default)]
    pub any_of: Vec<JsonSchemaProperty>,
    /// JSON Schema composition: `allOf`.
    #[serde(default)]
    pub all_of: Vec<JsonSchemaProperty>,
    pub additional_properties: Option<Box<JsonSchemaProperty>>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deserialize_rest_description() {
        let json = r#"{
            "name": "test",
            "version": "v1",
            "rootUrl": "https://api.example.com/",
            "servicePath": "",
            "resources": {
                "users": {
                    "methods": {
                        "list": {
                            "httpMethod": "GET",
                            "path": "/users"
                        }
                    }
                }
            }
        }"#;

        let doc: RestDescription = serde_json::from_str(json).unwrap();
        assert_eq!(doc.name, "test");
        assert_eq!(doc.version, "v1");

        let users = doc.resources.get("users").expect("users resource missing");
        let list = users.methods.get("list").expect("list method missing");
        assert_eq!(list.http_method, "GET");
    }

    #[test]
    fn test_deserialize_defaults() {
        let json = r#"{
            "name": "test",
            "version": "v1",
            "rootUrl": "https://api.example.com/"
        }"#;

        let doc: RestDescription = serde_json::from_str(json).unwrap();
        assert_eq!(doc.service_path, "");
        assert!(doc.resources.is_empty());
        assert!(doc.schemas.is_empty());
    }
}
