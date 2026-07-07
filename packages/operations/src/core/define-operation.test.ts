import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { beforeEach, describe, expect, it } from "vitest"
import { defineOperation } from "./define-operation.ts"
import { resetOperationRegistry } from "./registry.ts"

type TestEnv = { Variables: Record<string, never> }

// `mountHttp` pushes tool-eligible endpoints into the module-global MCP
// registry as a side effect. Reset between tests so nothing accumulates from
// previous cases or sibling test files.
beforeEach(() => {
  resetOperationRegistry()
})

const endpoint = defineOperation<TestEnv>("/test")

describe("defineOperation", () => {
  it("returns the original route untouched (preserves `name`)", () => {
    const ep = endpoint({
      route: createRoute({
        method: "get",
        path: "/foo",
        name: "fooThing",
        group: "test",
        sdkMethod: "fooThing",
        description: "Get a foo",
        responses: {
          200: {
            content: { "application/json": { schema: z.object({ ok: z.boolean() }) } },
            description: "OK",
          },
        },
      }),
      access: "read-only",
      handler: async (c) => c.json({ ok: true }, 200),
    })
    expect(ep.route.name).toBe("fooThing")
    expect(ep.route.description).toBe("Get a foo")
  })

  it("defaults `tool` to true when not specified", () => {
    const ep = endpoint({
      route: createRoute({
        method: "get",
        path: "/x",
        name: "x",
        group: "test",
        sdkMethod: "x",
        description: "x",
        responses: { 200: { description: "OK" } },
      }),
      access: "read-only",
      handler: async (c) => c.body(null, 200),
    })
    expect(ep.tool).toBe(true)
  })

  it("respects `tool: false`", () => {
    const ep = endpoint({
      route: createRoute({
        method: "get",
        path: "/x",
        name: "x",
        group: "test",
        sdkMethod: "x",
        description: "x",
        responses: { 200: { description: "OK" } },
      }),
      access: "read-only",
      handler: async (c) => c.body(null, 200),
      tool: false,
    })
    expect(ep.tool).toBe(false)
  })

  it("mountHttp registers the route on a Hono app and the OpenAPI spec uses `name` as `operationId`", () => {
    const ep = endpoint({
      route: createRoute({
        method: "post",
        path: "/items",
        name: "createItem",
        group: "test",
        sdkMethod: "createItem",
        description: "Create",
        request: {
          body: {
            content: { "application/json": { schema: z.object({ value: z.string() }) } },
            required: true,
          },
        },
        responses: {
          200: {
            content: { "application/json": { schema: z.object({ id: z.string() }) } },
            description: "OK",
          },
        },
      }),
      access: "write",
      handler: async (c) => c.json({ id: "abc" }, 200),
    })

    const app = new OpenAPIHono<TestEnv>()
    ep.mountHttp(app)

    const spec = app.getOpenAPI31Document({ openapi: "3.1.0", info: { title: "t", version: "0" } })
    expect(spec.paths?.["/items"]?.post?.operationId).toBe("createItem")
    // `name` and `annotations` are internal-only and must NOT leak into the OpenAPI spec.
    const operation = spec.paths?.["/items"]?.post as Record<string, unknown> | undefined
    expect(operation?.name).toBeUndefined()
    expect(operation?.annotations).toBeUndefined()
  })

  it("renames group/sdkMethod to x-fern extensions in place, preserving key order", () => {
    const ep = endpoint({
      route: createRoute({
        method: "get",
        path: "/grouped",
        name: "listGrouped",
        tags: ["Grouped"],
        group: "grouped",
        sdkMethod: "list",
        summary: "List grouped",
        description: "List",
        responses: {
          200: {
            content: { "application/json": { schema: z.object({ ok: z.boolean() }) } },
            description: "OK",
          },
        },
      }),
      access: "read-only",
      handler: async (c) => c.json({ ok: true }, 200),
    })

    const app = new OpenAPIHono<TestEnv>()
    ep.mountHttp(app)

    const spec = app.getOpenAPI31Document({ openapi: "3.1.0", info: { title: "t", version: "0" } })
    const operation = spec.paths?.["/grouped"]?.get as Record<string, unknown>
    expect(operation["x-fern-sdk-group-name"]).toBe("grouped")
    expect(operation["x-fern-sdk-method-name"]).toBe("list")
    expect(operation.group).toBeUndefined()
    expect(operation.sdkMethod).toBeUndefined()
    // Emitted key order follows declaration order — the extensions must land
    // exactly where `group`/`sdkMethod` were declared (right after `tags`).
    const keys = Object.keys(operation)
    expect(keys.indexOf("x-fern-sdk-group-name")).toBe(keys.indexOf("tags") + 1)
    expect(keys.indexOf("x-fern-sdk-method-name")).toBe(keys.indexOf("tags") + 2)
  })

  it("carries rateLimitTier through to the operation", () => {
    const ep = endpoint({
      route: createRoute({
        method: "get",
        path: "/x",
        name: "x",
        group: "test",
        sdkMethod: "x",
        description: "x",
        responses: { 200: { description: "OK" } },
      }),
      access: "read-only",
      handler: async (c) => c.body(null, 200),
      rateLimitTier: "ultra",
    })
    expect(ep.rateLimitTier).toBe("ultra")
  })

  it("mountHttp wires a working handler that responds to fetch", async () => {
    const ep = endpoint({
      route: createRoute({
        method: "get",
        path: "/echo/{id}",
        name: "echo",
        group: "test",
        sdkMethod: "echo",
        description: "Echo id",
        request: { params: z.object({ id: z.string() }) },
        responses: {
          200: {
            content: { "application/json": { schema: z.object({ id: z.string() }) } },
            description: "OK",
          },
        },
      }),
      access: "read-only",
      handler: async (c) => c.json({ id: c.req.valid("param").id }, 200),
    })

    const app = new OpenAPIHono<TestEnv>()
    ep.mountHttp(app)

    const res = await app.fetch(new Request("http://localhost/echo/42"))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: "42" })
  })
})
