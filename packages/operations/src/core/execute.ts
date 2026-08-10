import type { RouteHandler, z } from "@hono/zod-openapi"
import { Effect } from "effect"
import type { ContextVariableMap, Env } from "hono"
import type { OperationContext } from "./context.ts"
import type { AppRouteConfig } from "./define-operation.ts"

type RequestConfig<R extends AppRouteConfig> = NonNullable<R["request"]>

type JsonBodySchema<R extends AppRouteConfig> = "body" extends keyof RequestConfig<R>
  ? RequestConfig<R>["body"] extends { content: { "application/json": { schema: infer S extends z.ZodType } } }
    ? S
    : never
  : never

/**
 * Structured, pre-validated input for an execute-form operation, derived from
 * the route's request schemas. Only the sections the route declares are
 * present — a GET with query params gets `{ params, query }`, a POST body
 * endpoint gets `{ params?, body }`, and so on. The flat MCP shape converts to
 * this via `splitFlatInput`.
 */
export type OperationInput<R extends AppRouteConfig> = ("params" extends keyof RequestConfig<R>
  ? RequestConfig<R>["params"] extends z.ZodType
    ? { readonly params: z.output<RequestConfig<R>["params"]> }
    : unknown
  : unknown) &
  ("query" extends keyof RequestConfig<R>
    ? RequestConfig<R>["query"] extends z.ZodType
      ? { readonly query: z.output<RequestConfig<R>["query"]> }
      : unknown
    : unknown) &
  ([JsonBodySchema<R>] extends [never] ? unknown : { readonly body: z.output<JsonBodySchema<R>> })

/**
 * Discriminated union over the route's declared response statuses. JSON
 * responses carry a schema-typed `body`; no-content responses (204) carry only
 * `status`. Literal status inference requires literal response keys — use
 * `typedResponses` (not the type-erased `openApiResponses`) on execute-form
 * routes.
 */
export type OperationOutput<R extends AppRouteConfig> = {
  [S in Extract<keyof R["responses"], number>]: R["responses"][S] extends {
    content: { "application/json": { schema: infer T extends z.ZodType } }
  }
    ? { readonly status: S; readonly body: z.output<T> }
    : { readonly status: S }
}[Extract<keyof R["responses"], number>]

/**
 * Transport-neutral implementation of an operation. Runs as an Effect with all
 * dependencies passed in via {@link OperationContext} — the implementation owns
 * its full layer pipe (`withPostgres`/`withClickHouse`/`withTracing`/…) exactly
 * as the Hono handlers do today. Domain failures left in the error channel
 * reject the HTTP adapter's `runPromise` and reach `honoErrorHandler`
 * unchanged; declared non-2xx variants are returned in the success channel.
 */
export type ExecuteFn<R extends AppRouteConfig> = (
  input: OperationInput<R>,
  ctx: OperationContext,
) => Effect.Effect<OperationOutput<R>, unknown, never>

interface HandlerContext {
  readonly req: { valid: (target: "param" | "query" | "json") => unknown }
  get<K extends keyof ContextVariableMap>(key: K): ContextVariableMap[K]
  json(body: unknown, status: number): Response
  body(body: null, status: number): Response
}

/**
 * Wraps an {@link ExecuteFn} into the Hono handler the OpenAPI generator mounts.
 * Validation stays at the transport edge (zod-openapi validators populate
 * `c.req.valid`), context comes from the middleware-set variables, and effect
 * failures re-throw so `honoErrorHandler` maps them exactly as it does for
 * handler-form operations. The casts are contained here by construction from `R`.
 */
export const executeToHandler = <R extends AppRouteConfig, E extends Env>(
  route: R,
  execute: ExecuteFn<R>,
): RouteHandler<R, E> =>
  (async (c: HandlerContext) => {
    const input = {
      ...(route.request?.params !== undefined ? { params: c.req.valid("param") } : {}),
      ...(route.request?.query !== undefined ? { query: c.req.valid("query") } : {}),
      ...(route.request?.body?.content?.["application/json"] !== undefined ? { body: c.req.valid("json") } : {}),
    } as OperationInput<R>
    const organization = c.get("organization")
    const auth = c.get("auth")
    if (organization === undefined || auth === undefined) {
      throw new Error(`Operation "${route.name}" executed outside the organization-scoped middleware chain`)
    }
    const ctx: OperationContext = {
      organization,
      auth,
      postgresClient: c.get("postgresClient"),
      clickhouse: c.get("clickhouse"),
      redis: c.get("redis"),
      queuePublisher: c.get("queuePublisher"),
      workflowStarter: c.get("workflowStarter"),
      workflowQuerier: c.get("workflowQuerier"),
      storageDisk: c.get("storageDisk"),
      importSourceAdapters: c.get("importSourceAdapters"),
    }
    const result = (await Effect.runPromise(execute(input, ctx))) as { status: number; body?: unknown }
    return result.body !== undefined ? c.json(result.body, result.status) : c.body(null, result.status)
  }) as unknown as RouteHandler<R, E>
