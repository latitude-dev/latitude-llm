import type { OpenAPIHono, RouteConfig, RouteHandler } from "@hono/zod-openapi"
import type { Env } from "hono"

/**
 * Internal route config shape used through the codebase. Extends `@hono/zod-openapi`'s
 * {@link RouteConfig} with one required field:
 *
 * - `name` — camelCase identifier (e.g. `"listApiKeys"`). Drives both the OpenAPI
 *   `operationId` and the MCP tool name. Required so MCP tool naming is deterministic
 *   and discoverable from the same source as the HTTP route.
 *
 * `operationId` is dropped from the public surface — {@link defineApiEndpoint} sets it
 * from `name` internally, removing the foot-gun where the two could drift apart.
 *
 * `description` is already required by `RouteConfig`; we surface it explicitly so
 * MCP tool generation can rely on it (the tool description is taken verbatim).
 */
export type AppRouteConfig = Omit<RouteConfig, "operationId"> & {
  readonly name: string
}

/**
 * Result of {@link defineApiEndpoint}. Carries enough metadata for two consumers:
 *
 * - HTTP — {@link mountHttp} attaches the route + handler to an `OpenAPIHono` instance
 *   exactly the way `app.openapi(route, handler)` would today.
 * - MCP — {@link tool}, `route.name`, and the request schemas drive tool generation
 *   in {@link ./registry.ts}.
 */
interface ApiEndpoint<R extends AppRouteConfig, E extends Env> {
  readonly route: R
  readonly handler: RouteHandler<R, E>
  /** Whether this endpoint should be exposed as an MCP tool. Defaults to `true`. */
  readonly tool: boolean
  mountHttp(app: OpenAPIHono<E>): void
}

/**
 * Type-erased view used by the registry. The registry only consumes route metadata
 * and `mountHttp`, so erasing the route's response/handler types here keeps the
 * variance honest (different routes have different `RouteHandler<R, E>` shapes that
 * aren't mutually assignable, which would prevent storing them together).
 */
export interface AnyApiEndpoint {
  readonly route: AppRouteConfig
  readonly tool: boolean
  // biome-ignore lint/suspicious/noExplicitAny: type-erased registry view — see comment above
  mountHttp(app: OpenAPIHono<any>): void
}

/**
 * Returns a factory bound to a specific Hono `Env`. The factory turns a route +
 * handler into an {@link ApiEndpoint} that can be served as both an HTTP route and
 * an MCP tool.
 *
 * The two-step shape (`defineApiEndpoint<E>()(args)`) exists because TypeScript
 * can't partially-infer one type argument while accepting another explicitly: we
 * need the caller to specify `Env` (which depends on which sub-app the endpoint
 * will mount under — e.g. `OrganizationScopedEnv` for `/api-keys`,
 * `ProjectScopedEnv` for `/projects/{slug}/scores`) while letting the route shape
 * `R` infer from `args.route`. The outer call fixes `E`; the inner call infers `R`.
 *
 * @example
 * ```ts
 * const apiKeysEndpoint = defineApiEndpoint<OrganizationScopedEnv>()
 *
 * const listApiKeys = apiKeysEndpoint({
 *   route: createRoute({
 *     method: "get",
 *     path: "/",
 *     name: "listApiKeys",
 *     description: "List all API keys for the organization.",
 *     responses: { 200: jsonResponse(ListSchema, "OK") },
 *   }),
 *   handler: async (c) => c.json({ items: [] }, 200),
 * })
 * ```
 */
export const defineApiEndpoint =
  <E extends Env>() =>
  <R extends AppRouteConfig>(args: {
    route: R
    handler: RouteHandler<R, E>
    /** Set to `false` to keep the endpoint HTTP-only (no MCP tool). Defaults to `true`. */
    tool?: boolean
  }): ApiEndpoint<R, E> => {
    const { route, handler, tool = true } = args
    // Strip `name` from what reaches the OpenAPI generator (non-standard field) and
    // set `operationId` from it, so a single source of truth (`name`) drives both
    // the OpenAPI spec and the MCP tool registry.
    const { name, ...rest } = route
    const routeForHono = { ...rest, operationId: name } as unknown as R
    return {
      route,
      handler,
      tool,
      mountHttp(app) {
        // Cast through `any` because OpenAPIHono.openapi is parameterised on a
        // concrete RouteConfig, not our AppRouteConfig superset. The runtime call
        // is identical to `app.openapi(route, handler)`.
        // biome-ignore lint/suspicious/noExplicitAny: see comment above
        ;(app as any).openapi(routeForHono, handler)
      },
    }
  }
