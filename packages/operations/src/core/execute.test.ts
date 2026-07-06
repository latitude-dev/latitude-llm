import type { Organization } from "@domain/organizations"
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { Effect } from "effect"
import { beforeEach, describe, expect, it } from "vitest"
import type { AuthContext, OrganizationScopedEnv } from "../types.ts"
import type { OperationContext } from "./context.ts"
import { defineOperation } from "./define-operation.ts"
import { resetOperationRegistry } from "./registry.ts"

const stubOrganization = { id: "org-1", name: "Acme" } as unknown as Organization
const stubAuth = { method: "api-key", userId: "api-key:k1", organizationId: "org-1" } as unknown as AuthContext

const contextVars: Record<string, unknown> = {
  organization: stubOrganization,
  auth: stubAuth,
  postgresClient: { tag: "postgres" },
  clickhouse: { tag: "clickhouse" },
  redis: { tag: "redis" },
  queuePublisher: { tag: "queue" },
  workflowStarter: { tag: "workflow-starter" },
  workflowQuerier: { tag: "workflow-querier" },
  storageDisk: { tag: "storage" },
}

const buildApp = (vars: Record<string, unknown> = contextVars) => {
  const app = new OpenAPIHono<OrganizationScopedEnv>()
  app.use("*", async (c, next) => {
    for (const [key, value] of Object.entries(vars)) c.set(key as never, value as never)
    await next()
  })
  return app
}

beforeEach(() => {
  resetOperationRegistry()
})

const operation = defineOperation<OrganizationScopedEnv>("/widgets")

describe("executeToHandler", () => {
  it("assembles params + query into the input and encodes the JSON success response", async () => {
    let seen: unknown
    const op = operation({
      route: createRoute({
        method: "get",
        path: "/{id}",
        name: "getWidget",
        group: "test",
        sdkMethod: "getWidget",
        description: "Get a widget",
        annotations: { readOnlyHint: true, destructiveHint: false },
        request: {
          params: z.object({ id: z.string() }),
          query: z.object({ limit: z.coerce.number().optional() }),
        },
        responses: {
          200: {
            content: { "application/json": { schema: z.object({ id: z.string(), limit: z.number() }) } },
            description: "OK",
          },
        },
      }),
      execute: (input) => {
        seen = input
        return Effect.succeed({ status: 200, body: { id: input.params.id, limit: input.query.limit ?? 10 } } as const)
      },
    })
    const app = buildApp()
    op.mountHttp(app)

    const res = await app.fetch(new Request("http://localhost/w1?limit=5"))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: "w1", limit: 5 })
    expect(seen).toEqual({ params: { id: "w1" }, query: { limit: 5 } })
  })

  it("passes the validated JSON body and supports declared non-2xx variants", async () => {
    const op = operation({
      route: createRoute({
        method: "post",
        path: "/",
        name: "createWidget",
        group: "test",
        sdkMethod: "createWidget",
        description: "Create a widget",
        annotations: { readOnlyHint: false, destructiveHint: false },
        request: {
          body: { content: { "application/json": { schema: z.object({ name: z.string() }) } }, required: true },
        },
        responses: {
          201: { content: { "application/json": { schema: z.object({ name: z.string() }) } }, description: "Created" },
          400: { content: { "application/json": { schema: z.object({ error: z.string() }) } }, description: "Invalid" },
        },
      }),
      execute: (input) =>
        Effect.succeed(
          input.body.name === "bad"
            ? ({ status: 400, body: { error: "bad name" } } as const)
            : ({ status: 201, body: { name: input.body.name } } as const),
        ),
    })
    const app = buildApp()
    op.mountHttp(app)

    const post = (name: string) =>
      app.fetch(
        new Request("http://localhost/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        }),
      )

    const created = await post("ok")
    expect(created.status).toBe(201)
    expect(await created.json()).toEqual({ name: "ok" })

    const invalid = await post("bad")
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toEqual({ error: "bad name" })
  })

  it("encodes body-less variants as empty responses", async () => {
    const op = operation({
      route: createRoute({
        method: "delete",
        path: "/{id}",
        name: "deleteWidget",
        group: "test",
        sdkMethod: "deleteWidget",
        description: "Delete a widget",
        annotations: { readOnlyHint: false, destructiveHint: true },
        request: { params: z.object({ id: z.string() }) },
        responses: { 204: { description: "Deleted" } },
      }),
      execute: () => Effect.succeed({ status: 204 } as const),
    })
    const app = buildApp()
    op.mountHttp(app)

    const res = await app.fetch(new Request("http://localhost/w1", { method: "DELETE" }))
    expect(res.status).toBe(204)
    expect(await res.text()).toBe("")
  })

  it("builds the OperationContext from the middleware-set variables", async () => {
    let seen: OperationContext | undefined
    const op = operation({
      route: createRoute({
        method: "get",
        path: "/",
        name: "listWidgets",
        group: "test",
        sdkMethod: "listWidgets",
        description: "List widgets",
        annotations: { readOnlyHint: true, destructiveHint: false },
        responses: { 200: { content: { "application/json": { schema: z.object({}) } }, description: "OK" } },
      }),
      execute: (_input, ctx) => {
        seen = ctx
        return Effect.succeed({ status: 200, body: {} } as const)
      },
    })
    const app = buildApp()
    op.mountHttp(app)

    await app.fetch(new Request("http://localhost/"))
    expect(seen?.organization).toBe(stubOrganization)
    expect(seen?.auth).toBe(stubAuth)
    expect(seen?.postgresClient).toEqual({ tag: "postgres" })
    expect(seen?.clickhouse).toEqual({ tag: "clickhouse" })
    expect(seen?.storageDisk).toEqual({ tag: "storage" })
  })

  it("re-throws effect failures so the app-level error handler maps them", async () => {
    const op = operation({
      route: createRoute({
        method: "get",
        path: "/",
        name: "failWidget",
        group: "test",
        sdkMethod: "failWidget",
        description: "Fail",
        annotations: { readOnlyHint: true, destructiveHint: false },
        responses: { 200: { content: { "application/json": { schema: z.object({}) } }, description: "OK" } },
      }),
      execute: () => Effect.fail(new Error("domain failure")),
    })
    const app = buildApp()
    let caught: unknown
    app.onError((err, c) => {
      caught = err
      return c.json({ error: "mapped" }, 500)
    })
    op.mountHttp(app)

    const res = await app.fetch(new Request("http://localhost/"))
    expect(res.status).toBe(500)
    expect(String(caught)).toContain("domain failure")
  })

  it("throws when executed outside the organization-scoped middleware chain", async () => {
    const op = operation({
      route: createRoute({
        method: "get",
        path: "/",
        name: "unscopedWidget",
        group: "test",
        sdkMethod: "unscopedWidget",
        description: "Unscoped",
        annotations: { readOnlyHint: true, destructiveHint: false },
        responses: { 200: { content: { "application/json": { schema: z.object({}) } }, description: "OK" } },
      }),
      execute: () => Effect.succeed({ status: 200, body: {} } as const),
    })
    const { organization: _org, ...withoutOrganization } = contextVars
    const app = buildApp(withoutOrganization)
    let caught: unknown
    app.onError((err, c) => {
      caught = err
      return c.json({ error: "mapped" }, 500)
    })
    op.mountHttp(app)

    const res = await app.fetch(new Request("http://localhost/"))
    expect(res.status).toBe(500)
    expect(String(caught)).toContain("organization-scoped middleware")
  })
})
