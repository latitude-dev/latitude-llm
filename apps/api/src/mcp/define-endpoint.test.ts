import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { beforeEach, describe, expect, it } from "vitest"
import { defineApiEndpoint } from "./define-endpoint.ts"
import { resetEndpointRegistry } from "./registry.ts"

type TestEnv = { Variables: Record<string, never> }

// `mountHttp` pushes tool-eligible endpoints into the module-global MCP
// registry as a side effect. Reset between tests so nothing accumulates from
// previous cases or sibling test files.
beforeEach(() => {
  resetEndpointRegistry()
})

const endpoint = defineApiEndpoint<TestEnv>("/test")

describe("defineApiEndpoint", () => {
  it("returns the original route untouched (preserves `name`)", () => {
    const ep = endpoint({
      route: createRoute({
        method: "get",
        path: "/foo",
        name: "fooThing",
        description: "Get a foo",
        responses: {
          200: {
            content: { "application/json": { schema: z.object({ ok: z.boolean() }) } },
            description: "OK",
          },
        },
      }),
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
        description: "x",
        responses: { 200: { description: "OK" } },
      }),
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
        description: "x",
        responses: { 200: { description: "OK" } },
      }),
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
      handler: async (c) => c.json({ id: "abc" }, 200),
    })

    const app = new OpenAPIHono<TestEnv>()
    ep.mountHttp(app)

    const spec = app.getOpenAPI31Document({ openapi: "3.1.0", info: { title: "t", version: "0" } })
    expect(spec.paths?.["/items"]?.post?.operationId).toBe("createItem")
    // `name` is internal-only and must NOT leak into the OpenAPI spec.
    expect((spec.paths?.["/items"]?.post as Record<string, unknown> | undefined)?.name).toBeUndefined()
  })

  it("mountHttp wires a working handler that responds to fetch", async () => {
    const ep = endpoint({
      route: createRoute({
        method: "get",
        path: "/echo/{id}",
        name: "echo",
        description: "Echo id",
        request: { params: z.object({ id: z.string() }) },
        responses: {
          200: {
            content: { "application/json": { schema: z.object({ id: z.string() }) } },
            description: "OK",
          },
        },
      }),
      handler: async (c) => c.json({ id: c.req.valid("param").id }, 200),
    })

    const app = new OpenAPIHono<TestEnv>()
    ep.mountHttp(app)

    const res = await app.fetch(new Request("http://localhost/echo/42"))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: "42" })
  })
})
