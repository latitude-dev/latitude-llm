import { OpenAPIHono, type z } from "@hono/zod-openapi"
import type { Env } from "hono"
import type { AnyApiEndpoint } from "./define-endpoint.ts"
import { extractOutputSchema } from "./extract-output.ts"
import { type FlatInput, flattenRouteInputSchema } from "./flatten-input.ts"

/**
 * One entry in the global endpoint registry. The `prefix` is the path prefix the
 * endpoint's containing sub-app was mounted at on the parent router (e.g.
 * `"/api-keys"` or `"/projects/:projectSlug/scores"`), so the full request path is
 * `prefix + endpoint.route.path`. The MCP dispatcher (M2) uses this to rebuild the
 * inner `app.fetch()` URL when invoking a tool.
 */
interface RegistryEntry {
  readonly prefix: string
  readonly endpoint: AnyApiEndpoint
}

// Module-global; reset by `resetEndpointRegistry` at the top of `registerRoutes` so
// multiple `registerRoutes` calls (tests, emit script) don't accumulate stale rows.
const endpointRegistry: RegistryEntry[] = []

/**
 * Mounts an array of endpoints under `prefix` on the parent router and registers
 * each MCP-eligible one with the global tool registry.
 *
 * Caller responsibility: middleware that should run only on this prefix (e.g.
 * project-context resolution for `/projects/:projectSlug/...`) should be applied to
 * the sub-app *before* this call by passing it via `subApp`.
 *
 * Why a single helper instead of separate `routes.route(prefix, sub)` +
 * `registerMcpEndpoints(prefix, endpoints)` calls: it stops the prefix string from
 * drifting between the HTTP mount and the MCP descriptor.
 */
export const mountWithMcp = <ParentEnv extends Env, SubEnv extends Env>(
  parent: OpenAPIHono<ParentEnv>,
  prefix: string,
  endpoints: readonly AnyApiEndpoint[],
  subApp?: OpenAPIHono<SubEnv>,
): void => {
  // biome-ignore lint/suspicious/noExplicitAny: env variance — sub-apps carry richer Variables than parent
  const sub = (subApp ?? new OpenAPIHono<SubEnv>()) as OpenAPIHono<any>
  for (const ep of endpoints) {
    ep.mountHttp(sub)
    if (ep.tool) {
      endpointRegistry.push({ prefix, endpoint: ep })
    }
  }
  // biome-ignore lint/suspicious/noExplicitAny: parent.route accepts any sub-app at runtime
  ;(parent as OpenAPIHono<any>).route(prefix, sub)
}

/**
 * Drops every registered endpoint. Used by the test harness (`setupTestApi`) so
 * multiple test files in the same vitest worker don't accumulate stale entries
 * across `registerRoutes` calls. Production boot doesn't call it — `registerRoutes`
 * runs once per process, so the registry starts empty either way.
 */
export const resetEndpointRegistry = (): void => {
  endpointRegistry.length = 0
}

/**
 * Descriptor used to emit `apps/api/mcp.json` and (in M2) to register tools on the
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
   * Zod schema for the route's primary 2xx response, or `null` for routes whose
   * success response carries no body (204) or no JSON content. Maps to the MCP
   * tool's optional `outputSchema`.
   */
  readonly output: z.ZodType | null
  /** Path prefix the route's sub-app was mounted at, used to rebuild the dispatch URL. */
  readonly routerPrefix: string
  /** Path template inside the sub-app (OpenAPI `{name}` placeholder syntax). */
  readonly pathTemplate: string
  /** HTTP method, lowercased (e.g. `"get"`, `"post"`). */
  readonly httpMethod: string
}

/**
 * Walks the populated registry and returns one {@link ToolDescriptor} per tool-eligible
 * endpoint. Throws on flatten collisions (see {@link flattenRouteInputSchema}) so
 * route configuration mistakes surface at boot, not on a tool call.
 */
export const collectToolDescriptors = (): ToolDescriptor[] =>
  endpointRegistry.map(({ prefix, endpoint }) => {
    const { route } = endpoint
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
