import type { OpenAPIHono, RouteConfig, RouteHandler } from "@hono/zod-openapi"
import type { Env, MiddlewareHandler } from "hono"
import { honoPathToOpenApi } from "./normalize-path.ts"
import { registerEndpoint } from "./registry.ts"

/**
 * Internal route config shape used through the codebase. Extends `@hono/zod-openapi`'s
 * {@link RouteConfig} with the per-endpoint fields our MCP/OpenAPI machinery needs
 * (`name`, `annotations`), each documented inline below.
 *
 * `operationId` is dropped from the public surface — {@link defineApiEndpoint} sets it
 * from `name` internally, removing the foot-gun where the two could drift apart.
 *
 * `description` is already required by `RouteConfig`; we surface it explicitly so
 * MCP tool generation can rely on it (the tool description is taken verbatim).
 */
export type AppRouteConfig = Omit<RouteConfig, "operationId"> & {
  /**
   * camelCase identifier (e.g. `"listApiKeys"`). Drives both the OpenAPI
   * `operationId` and the MCP tool name, and is stripped before the route reaches
   * the OpenAPI generator. Required so MCP tool naming is deterministic and
   * discoverable from the same source as the HTTP route.
   */
  readonly name: string
  /**
   * MCP tool annotations (see {@link McpToolAnnotations}). Declared alongside the
   * other route fields and stripped before the route reaches the OpenAPI
   * generator, so it surfaces only in `mcp.json` / the live MCP transport — never
   * in `openapi.json`.
   */
  readonly annotations: McpToolAnnotations
}

/**
 * MCP tool annotations declared per endpoint. Maps to the MCP spec's
 * `ToolAnnotations`, but the tool `title` is intentionally omitted — it's
 * derived from the route's `summary`/`name` (see {@link collectToolDescriptors}),
 * so there's nothing to redefine here.
 *
 * `readOnlyHint` and `destructiveHint` are required: every tool author must
 * make an explicit call about whether the operation reads or writes, and
 * whether a write can destroy/overwrite existing data. The remaining hints are
 * optional and default to the MCP spec's behaviour when omitted.
 */
export interface McpToolAnnotations {
  /** `true` when the tool only reads — it never modifies organization data. */
  readonly readOnlyHint: boolean
  /** `true` when a write may delete or overwrite existing data. Meaningful only when `readOnlyHint` is `false`. */
  readonly destructiveHint: boolean
  /** `true` when repeating an identical call has no effect beyond the first. */
  readonly idempotentHint?: boolean
  /** `true` when the tool interacts with entities outside the caller's Latitude organization. */
  readonly openWorldHint?: boolean
}

/**
 * Result of {@link defineApiEndpoint}. Carries enough metadata for two consumers:
 *
 * - HTTP — {@link mountHttp} attaches the route + handler to an `OpenAPIHono` instance
 *   exactly the way `app.openapi(route, handler)` would today.
 * - MCP — `mountHttp` additionally registers the endpoint with the global MCP
 *   registry (when `tool === true`), carrying the `prefix` baked in at factory time.
 */
interface ApiEndpoint<R extends AppRouteConfig, E extends Env> {
  readonly route: R
  readonly handler: RouteHandler<R, E>
  /** Whether this endpoint should be exposed as an MCP tool. Defaults to `true`. */
  readonly tool: boolean
  /** Path prefix the endpoint will be mounted at — used to rebuild the dispatch URL. */
  readonly prefix: string
  /**
   * Mounts the route on `app`. Any `middlewares` are attached *to this exact
   * endpoint only* (method + path), so a per-endpoint rate-limit tier on
   * `GET /:id` doesn't fire on `DELETE /:id`. Implemented by passing them
   * through `createRoute({ middleware })` at mount time.
   */
  mountHttp(app: OpenAPIHono<E>, ...middlewares: ReadonlyArray<MiddlewareHandler>): void
}

/**
 * Type-erased view used by the registry. The registry only consumes route metadata
 * and the `prefix`, so erasing the route's response/handler types here keeps the
 * variance honest (different routes have different `RouteHandler<R, E>` shapes that
 * aren't mutually assignable, which would prevent storing them together).
 */
export interface AnyApiEndpoint {
  readonly route: AppRouteConfig
  readonly tool: boolean
  readonly prefix: string
  // biome-ignore lint/suspicious/noExplicitAny: type-erased registry view — see comment above
  mountHttp(app: OpenAPIHono<any>, ...middlewares: ReadonlyArray<MiddlewareHandler>): void
}

/**
 * Returns a factory bound to a specific Hono `Env` and mount prefix. Endpoints
 * created by the factory know where they'll be mounted on the parent router, so
 * {@link mountHttp} simultaneously serves the HTTP route AND registers the
 * endpoint with the MCP registry under that prefix — no separate
 * "mount + register" helper at the parent.
 *
 * The prefix MUST match the path the resulting sub-app is later mounted at via
 * `parent.route(prefix, subApp)`. The route file is expected to export the
 * prefix as a constant (e.g. `export const apiKeysPath = "/api-keys"`) and pass
 * it both here and to the parent — so the value is declared once.
 *
 * Accepts either Hono-style `:param` syntax or OpenAPI-style `{param}` syntax;
 * the registry stores the OpenAPI form so the dispatcher only has to substitute
 * one placeholder shape. This lets route files declare a single Hono-form
 * constant (`/projects/:projectSlug/annotations`) usable both at the parent
 * mount and here.
 *
 * The two-step shape (`defineApiEndpoint<E>(prefix)(args)`) exists because
 * TypeScript can't partially-infer one type argument while accepting another
 * explicitly: we need the caller to specify `Env` (which depends on which
 * sub-app the endpoint will mount under — e.g. `OrganizationScopedEnv` for
 * `/api-keys`, `ProjectScopedEnv` for `/projects/{slug}/scores`) while letting
 * the route shape `R` infer from `args.route`. The outer call fixes `E` and
 * captures the prefix; the inner call infers `R`.
 *
 * @example
 * ```ts
 * export const apiKeysPath = "/api-keys"
 * const apiKeyEndpoint = defineApiEndpoint<OrganizationScopedEnv>(apiKeysPath)
 *
 * const listApiKeys = apiKeyEndpoint({
 *   route: createRoute({
 *     method: "get",
 *     path: "/",
 *     name: "listApiKeys",
 *     description: "List all API keys for the organization.",
 *     annotations: { readOnlyHint: true, destructiveHint: false },
 *     responses: { 200: jsonResponse(ListSchema, "OK") },
 *   }),
 *   handler: async (c) => c.json({ items: [] }, 200),
 * })
 *
 * export const createApiKeysRoutes = () => {
 *   const app = new OpenAPIHono<OrganizationScopedEnv>()
 *   for (const ep of [listApiKeys, ...]) ep.mountHttp(app)
 *   return app
 * }
 * ```
 */
export const defineApiEndpoint =
  <E extends Env>(prefix: string) =>
  <R extends AppRouteConfig>(args: {
    route: R
    handler: RouteHandler<R, E>
    /** Set to `false` to keep the endpoint HTTP-only (no MCP tool). Defaults to `true`. */
    tool?: boolean
  }): ApiEndpoint<R, E> => {
    const { route, handler, tool = true } = args
    // Strip `name` and `annotations` from what reaches the OpenAPI generator (both
    // are non-standard fields the generator would otherwise spread into the
    // operation), and set `operationId` from `name`, so a single source of truth
    // (`name`) drives both the OpenAPI spec and the MCP tool registry.
    const { name, annotations: _annotations, ...rest } = route
    const routeForHono = { ...rest, operationId: name } as unknown as R
    // Canonicalize the mount prefix to OpenAPI form (`{param}`) for the registry —
    // the dispatcher in server.ts only knows how to substitute that shape. Hono's
    // `parent.route(prefix, …)` happily accepts either form.
    const normalizedPrefix = honoPathToOpenApi(prefix)
    const endpoint: ApiEndpoint<R, E> = {
      route,
      handler,
      tool,
      prefix: normalizedPrefix,
      mountHttp(app, ...middlewares) {
        // Per-endpoint middleware rides on the OpenAPIHono route config's
        // `middleware` field — Hono pulls it out and registers it scoped to
        // this exact (method, path) pair, unlike `app.use(path, mw)` which
        // matches every method on the path.
        const routeWithMiddleware =
          middlewares.length > 0 ? ({ ...routeForHono, middleware: middlewares } as unknown as R) : routeForHono
        // Cast through `any` because OpenAPIHono.openapi is parameterised on a
        // concrete RouteConfig, not our AppRouteConfig superset. The runtime
        // call is identical to `app.openapi(route, handler)`.
        // biome-ignore lint/suspicious/noExplicitAny: see comment above
        ;(app as any).openapi(routeWithMiddleware, handler)
        if (tool) registerEndpoint(endpoint as unknown as AnyApiEndpoint)
      },
    }
    return endpoint
  }
