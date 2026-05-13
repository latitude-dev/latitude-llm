import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { beforeEach, describe, expect, it } from "vitest"
import { defineApiEndpoint } from "./define-endpoint.ts"
import { collectToolDescriptors, resetEndpointRegistry } from "./registry.ts"

type TestEnv = { Variables: Record<string, never> }

const itemEndpoint = defineApiEndpoint<TestEnv>("/items")
const widgetEndpoint = defineApiEndpoint<TestEnv>("/widgets")

const ItemSchema = z.object({ id: z.string() })

const listItems = itemEndpoint({
  route: createRoute({
    method: "get",
    path: "/",
    name: "listItems",
    description: "List items",
    responses: {
      200: {
        content: { "application/json": { schema: z.object({ items: z.array(ItemSchema) }) } },
        description: "OK",
      },
    },
  }),
  handler: async (c) => c.json({ items: [] }, 200),
})

const getItem = itemEndpoint({
  route: createRoute({
    method: "get",
    path: "/{id}",
    name: "getItem",
    description: "Get one item",
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: { content: { "application/json": { schema: ItemSchema } }, description: "OK" },
    },
  }),
  handler: async (c) => c.json({ id: c.req.valid("param").id }, 200),
})

const deleteItem = itemEndpoint({
  route: createRoute({
    method: "delete",
    path: "/{id}",
    name: "deleteItem",
    description: "Delete one item",
    request: { params: z.object({ id: z.string() }) },
    responses: { 204: { description: "Deleted" } },
  }),
  handler: async (c) => c.body(null, 204),
})

const hiddenItem = itemEndpoint({
  route: createRoute({
    method: "get",
    path: "/internal",
    name: "internalOp",
    description: "HTTP-only — not an MCP tool",
    responses: { 200: { description: "OK" } },
  }),
  handler: async (c) => c.body(null, 200),
  tool: false,
})

const getWidget = widgetEndpoint({
  route: createRoute({
    method: "get",
    path: "/{id}",
    name: "getWidget",
    description: "Get a widget",
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: { content: { "application/json": { schema: ItemSchema } }, description: "OK" },
    },
  }),
  handler: async (c) => c.json({ id: c.req.valid("param").id }, 200),
})

describe("registry", () => {
  beforeEach(() => {
    resetEndpointRegistry()
  })

  describe("mountHttp registration", () => {
    it("registers tool-eligible endpoints with the MCP registry as they're mounted", () => {
      const sub = new OpenAPIHono<TestEnv>()
      listItems.mountHttp(sub)
      getItem.mountHttp(sub)

      const tools = collectToolDescriptors()
      expect(tools.map((t) => t.name)).toEqual(["listItems", "getItem"])
    })

    it("skips endpoints with `tool: false` from the MCP registry but still mounts their HTTP route", async () => {
      const sub = new OpenAPIHono<TestEnv>()
      listItems.mountHttp(sub)
      hiddenItem.mountHttp(sub)

      const tools = collectToolDescriptors()
      expect(tools.map((t) => t.name)).toEqual(["listItems"])

      // The HTTP route still works — wire the sub-app on a parent so we hit
      // the real path the inner endpoint declared (`/internal` on the
      // `/items` sub-app becomes `/items/internal`).
      const parent = new OpenAPIHono<TestEnv>()
      parent.route("/items", sub)
      const res = await parent.fetch(new Request("http://localhost/items/internal"))
      expect(res.status).toBe(200)
    })

    it("records the prefix from `defineApiEndpoint` on each registered descriptor", () => {
      const sub = new OpenAPIHono<TestEnv>()
      listItems.mountHttp(sub)
      getWidget.mountHttp(sub)

      const tools = collectToolDescriptors()
      expect(tools.find((t) => t.name === "listItems")?.routerPrefix).toBe("/items")
      expect(tools.find((t) => t.name === "getWidget")?.routerPrefix).toBe("/widgets")
    })
  })

  describe("resetEndpointRegistry", () => {
    it("clears all registered descriptors", () => {
      const sub = new OpenAPIHono<TestEnv>()
      listItems.mountHttp(sub)
      getItem.mountHttp(sub)
      expect(collectToolDescriptors()).toHaveLength(2)

      resetEndpointRegistry()
      expect(collectToolDescriptors()).toHaveLength(0)
    })
  })

  describe("collectToolDescriptors", () => {
    it("includes flattened input schema, output schema, and routing metadata", () => {
      const sub = new OpenAPIHono<TestEnv>()
      getItem.mountHttp(sub)

      const [tool] = collectToolDescriptors()
      expect(tool).toBeDefined()
      expect(tool?.name).toBe("getItem")
      expect(tool?.description).toBe("Get one item")
      expect(tool?.routerPrefix).toBe("/items")
      expect(tool?.pathTemplate).toBe("/{id}")
      expect(tool?.httpMethod).toBe("get")
      expect(tool && Object.keys(tool.input.schema.shape)).toEqual(["id"])
      expect(tool?.output).toBeTruthy()
    })

    it("returns undefined `output` for routes whose success response has no body (204)", () => {
      const sub = new OpenAPIHono<TestEnv>()
      deleteItem.mountHttp(sub)

      const [tool] = collectToolDescriptors()
      expect(tool?.output).toBeUndefined()
    })

    it("falls back to `name` when `summary` is absent", () => {
      const sub = new OpenAPIHono<TestEnv>()
      listItems.mountHttp(sub)

      const [tool] = collectToolDescriptors()
      // listItems has no `summary` set, so title falls back to `name`.
      expect(tool?.title).toBe("listItems")
    })
  })
})
