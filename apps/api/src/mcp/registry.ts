import type { AnyApiEndpoint } from "./define-endpoint.ts"
import { type ExtractedOutput, extractOutputSchema } from "./extract-output.ts"
import { type FlatInput, flattenRouteInputSchema } from "./flatten-input.ts"

/**
 * Global registry of MCP-eligible endpoints. Populated lazily from
 * {@link defineApiEndpoint}-produced endpoints when their `mountHttp` is called
 * during route assembly — the endpoint carries the mount prefix baked in by
 * the factory, so the registry doesn't need to know it separately.
 *
 * Module-global so the per-request MCP dispatcher can read a snapshot at
 * tool-call time without threading it through Hono's context. Reset by
 * {@link resetEndpointRegistry} between test runs.
 */
const endpointRegistry: AnyApiEndpoint[] = []

/**
 * Adds `endpoint` to the global MCP registry. Called from
 * `ApiEndpoint.mountHttp` when the endpoint is tool-eligible (`tool === true`).
 * Idempotency is the caller's responsibility — tests that re-run
 * `registerRoutes` against the same app should `resetEndpointRegistry` first.
 */
export const registerEndpoint = (endpoint: AnyApiEndpoint): void => {
  endpointRegistry.push(endpoint)
}

/**
 * Drops every registered endpoint. Used by the test harness (`setupTestApi`)
 * so multiple test files in the same vitest worker don't accumulate stale
 * entries across `registerRoutes` calls. Production boot doesn't call it —
 * `registerRoutes` runs once per process, so the registry starts empty
 * either way.
 *
 * @public — only consumed by test files which knip doesn't traverse, so we
 * mark it explicitly to stop knip flagging it as unused.
 */
export const resetEndpointRegistry = (): void => {
  endpointRegistry.length = 0
}

/**
 * Descriptor used to emit `apps/api/mcp.json` and to register tools on the
 * per-request `McpServer` instance.
 */
interface ToolDescriptor {
  /** camelCase tool identifier — matches the route's `name`. */
  readonly name: string
  /** Human-readable title; falls back to the route's `summary` and finally `name`. */
  readonly title: string
  /** Tool description, taken from the route's `description`. */
  readonly description: string
  /** Flattened Zod input schema + per-field source map for HTTP dispatch. */
  readonly input: FlatInput
  /**
   * Object Zod schema for the route's primary 2xx JSON response. Omitted for routes
   * whose success response carries no body (204), no JSON content, or a non-object
   * shape. Maps to the MCP tool's optional `outputSchema`.
   */
  readonly output?: ExtractedOutput | undefined
  /** Path prefix the route's sub-app was mounted at, used to rebuild the dispatch URL. */
  readonly routerPrefix: string
  /** Path template inside the sub-app (OpenAPI `{name}` placeholder syntax). */
  readonly pathTemplate: string
  /** HTTP method, lowercased (e.g. `"get"`, `"post"`). */
  readonly httpMethod: string
}

/**
 * Walks the populated registry and returns one {@link ToolDescriptor} per registered
 * endpoint. Throws on flatten collisions (see {@link flattenRouteInputSchema}) so
 * route configuration mistakes surface at boot, not on a tool call.
 */
export const collectToolDescriptors = (): ToolDescriptor[] =>
  endpointRegistry.map(({ route, prefix }) => {
    return {
      name: route.name,
      title: route.summary ?? route.name,
      description: route.description ?? "",
      input: flattenRouteInputSchema(route),
      output: extractOutputSchema(route),
      routerPrefix: prefix,
      pathTemplate: route.path,
      httpMethod: route.method.toLowerCase(),
    }
  })
