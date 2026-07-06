import type { OpenAPIHono, RouteConfig, RouteHandler } from "@hono/zod-openapi"
import type { Env, MiddlewareHandler } from "hono"
import { type ExecuteFn, executeToHandler } from "./execute.ts"
import { honoPathToOpenApi } from "./normalize-path.ts"
import { registerOperation } from "./registry.ts"

/**
 * Internal route config shape used through the codebase. Extends `@hono/zod-openapi`'s
 * {@link RouteConfig} with the per-operation fields our MCP/OpenAPI machinery needs
 * (`name`, `annotations`, `group`, `sdkMethod`), each documented inline below.
 *
 * `operationId` is dropped from the public surface — {@link defineOperation} sets it
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
  /**
   * SDK group the operation belongs to (e.g. `"tools"`). Renamed in place to the
   * `x-fern-sdk-group-name` OpenAPI extension — emitted operation key order
   * follows declaration order, so declare it right after `tags` where the
   * extension lands today. Doubles as the selector for internal agent toolsets.
   */
  readonly group?: string
  /**
   * SDK method name inside {@link AppRouteConfig.group} (e.g. `"list"`). Renamed
   * in place to the `x-fern-sdk-method-name` OpenAPI extension. Declare it right
   * after `group`.
   */
  readonly sdkMethod?: string
}

/**
 * MCP tool annotations declared per operation. Maps to the MCP spec's
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
 * Org-scoped rate-limit tier applied to the operation's HTTP mount. Transport
 * policy only — never emitted to `openapi.json` / `mcp.json` — which is why it
 * lives on the operation args, not inside the route config. The HTTP app maps
 * tiers to concrete middleware (see `mountOperationModules`).
 */
export type RateLimitTier = "low" | "medium" | "high" | "ultra" | "max"

/**
 * Result of {@link defineOperation}. Carries enough metadata for three consumers:
 *
 * - HTTP — {@link mountHttp} attaches the route + handler to an `OpenAPIHono` instance
 *   exactly the way `app.openapi(route, handler)` would today.
 * - MCP — `mountHttp` additionally registers the operation with the global MCP
 *   registry (when `tool === true`), carrying the `prefix` baked in at factory time.
 * - In-process callers (internal agent toolsets) — `execute`, when the operation is
 *   declared execute-form, runs the business logic directly with an
 *   `OperationContext`, no HTTP involved.
 */
interface Operation<R extends AppRouteConfig, E extends Env> {
  readonly route: R
  readonly handler: RouteHandler<R, E>
  /** Transport-neutral implementation; present only for execute-form operations. */
  readonly execute?: ExecuteFn<R>
  /** Whether this operation should be exposed as an MCP tool. Defaults to `true`. */
  readonly tool: boolean
  /** Rate-limit tier the HTTP mount applies. Required once all modules declare it. */
  readonly rateLimitTier?: RateLimitTier
  /** Path prefix the operation will be mounted at — used to rebuild the dispatch URL. */
  readonly prefix: string
  /**
   * Mounts the route on `app`. Any `middlewares` are attached *to this exact
   * operation only* (method + path), so a per-operation rate-limit tier on
   * `GET /:id` doesn't fire on `DELETE /:id`. Implemented by passing them
   * through `createRoute({ middleware })` at mount time.
   */
  mountHttp(app: OpenAPIHono<E>, ...middlewares: ReadonlyArray<MiddlewareHandler>): void
}

/**
 * Type-erased view used by the registry and toolset selection. The registry only
 * consumes route metadata and the `prefix`; toolsets additionally consume
 * `execute`. Erasing the route's response/handler types here keeps the variance
 * honest (different routes have different `RouteHandler<R, E>` shapes that
 * aren't mutually assignable, which would prevent storing them together).
 */
export interface AnyOperation {
  readonly route: AppRouteConfig
  readonly tool: boolean
  readonly prefix: string
  readonly rateLimitTier?: RateLimitTier
  // biome-ignore lint/suspicious/noExplicitAny: type-erased registry view — see comment above
  readonly execute?: (input: any, ctx: any) => any
  // biome-ignore lint/suspicious/noExplicitAny: type-erased registry view — see comment above
  mountHttp(app: OpenAPIHono<any>, ...middlewares: ReadonlyArray<MiddlewareHandler>): void
}

type OperationArgs<R extends AppRouteConfig, E extends Env> = {
  route: R
  /** Set to `false` to keep the operation HTTP-only (no MCP tool). Defaults to `true`. */
  tool?: boolean
  /** Rate-limit tier applied at HTTP mount time. Required once all modules declare it. */
  rateLimitTier?: RateLimitTier
} & (
  | {
      /** Hono handler form — legacy; convert to `execute` opportunistically. */
      handler: RouteHandler<R, E>
      execute?: never
    }
  | {
      /** Transport-neutral form — the HTTP handler is generated by {@link executeToHandler}. */
      execute: ExecuteFn<R>
      handler?: never
    }
)

/**
 * Returns a factory bound to a specific Hono `Env` and mount prefix. Operations
 * created by the factory know where they'll be mounted on the parent router, so
 * {@link mountHttp} simultaneously serves the HTTP route AND registers the
 * operation with the MCP registry under that prefix — no separate
 * "mount + register" helper at the parent.
 *
 * The prefix MUST match the path the resulting sub-app is later mounted at via
 * `parent.route(prefix, subApp)`. The module is expected to export the
 * prefix as a constant (e.g. `export const apiKeysPath = "/api-keys"`) and pass
 * it both here and to the parent — so the value is declared once.
 *
 * Accepts either Hono-style `:param` syntax or OpenAPI-style `{param}` syntax;
 * the registry stores the OpenAPI form so the dispatcher only has to substitute
 * one placeholder shape. This lets modules declare a single Hono-form
 * constant (`/projects/:projectSlug/annotations`) usable both at the parent
 * mount and here.
 *
 * The two-step shape (`defineOperation<E>(prefix)(args)`) exists because
 * TypeScript can't partially-infer one type argument while accepting another
 * explicitly: we need the caller to specify `Env` (which depends on which
 * sub-app the operation will mount under — e.g. `OrganizationScopedEnv` for
 * `/api-keys`, `ProjectScopedEnv` for `/projects/{slug}/scores`) while letting
 * the route shape `R` infer from `args.route`. The outer call fixes `E` and
 * captures the prefix; the inner call infers `R`.
 *
 * @example
 * ```ts
 * export const apiKeysPath = "/api-keys"
 * const apiKeyOperation = defineOperation<OrganizationScopedEnv>(apiKeysPath)
 *
 * const listApiKeys = apiKeyOperation({
 *   route: createRoute({
 *     method: "get",
 *     path: "/",
 *     name: "listApiKeys",
 *     group: "apiKeys",
 *     sdkMethod: "list",
 *     description: "List all API keys for the organization.",
 *     annotations: { readOnlyHint: true, destructiveHint: false },
 *     responses: { 200: jsonResponse(ListSchema, "OK") },
 *   }),
 *   rateLimitTier: "low",
 *   execute: (_input, _ctx) => Effect.succeed({ status: 200, body: { items: [] } }),
 * })
 * ```
 */
export const defineOperation =
  <E extends Env>(prefix: string) =>
  <R extends AppRouteConfig>(args: OperationArgs<R, E>): Operation<R, E> => {
    const { route, tool = true, rateLimitTier } = args
    const handler = args.execute !== undefined ? executeToHandler<R, E>(route, args.execute) : args.handler
    if (handler === undefined) throw new Error(`Operation "${route.name}" must declare either handler or execute`)
    // Build the config handed to the OpenAPI generator as an order-preserving
    // transform: `name`/`annotations` are stripped (non-standard fields the
    // generator would otherwise spread into the operation), `group`/`sdkMethod`
    // are renamed in place to their x-fern extensions (emitted key order follows
    // declaration order, and the checked-in openapi.json is diffed byte-for-byte
    // in CI), and `operationId` is appended from `name` so a single source of
    // truth drives both the OpenAPI spec and the MCP tool registry.
    const routeForHono = Object.fromEntries([
      ...Object.entries(route).flatMap(([key, value]): ReadonlyArray<readonly [string, unknown]> => {
        if (key === "name" || key === "annotations") return []
        if (key === "group") return [["x-fern-sdk-group-name", value]]
        if (key === "sdkMethod") return [["x-fern-sdk-method-name", value]]
        return [[key, value]]
      }),
      ["operationId", route.name],
    ]) as unknown as R
    // Canonicalize the mount prefix to OpenAPI form (`{param}`) for the registry —
    // the MCP dispatcher only knows how to substitute that shape. Hono's
    // `parent.route(prefix, …)` happily accepts either form.
    const normalizedPrefix = honoPathToOpenApi(prefix)
    const operation: Operation<R, E> = {
      route,
      handler,
      tool,
      prefix: normalizedPrefix,
      ...(args.execute !== undefined ? { execute: args.execute } : {}),
      ...(rateLimitTier !== undefined ? { rateLimitTier } : {}),
      mountHttp(app, ...middlewares) {
        // Per-operation middleware rides on the OpenAPIHono route config's
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
        if (tool) registerOperation(operation as unknown as AnyOperation)
      },
    }
    return operation
  }
