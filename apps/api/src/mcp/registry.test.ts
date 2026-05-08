import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { beforeEach, describe, expect, it } from "vitest"
import { defineApiEndpoint } from "./define-endpoint.ts"
import { collectToolDescriptors, mountWithMcp, resetEndpointRegistry } from "./registry.ts"

type TestEnv = { Variables: Record<string, never> }
const endpoint = defineApiEndpoint<TestEnv>()

const ItemSchema = z.object({ id: z.string() })

const listEp = endpoint({
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

const getEp = endpoint({
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

const deleteEp = endpoint({
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

const hiddenEp = endpoint({
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

describe("registry", () => {
  beforeEach(() => {
    resetEndpointRegistry()
  })

  describe("mountWithMcp", () => {
    it("mounts each endpoint's HTTP handler under the given prefix", async () => {
      const parent = new OpenAPIHono<TestEnv>()
      mountWithMcp(parent, "/items", [listEp, getEp])

      const listRes = await parent.fetch(new Request("http://localhost/items"))
      expect(listRes.status).toBe(200)

      const getRes = await parent.fetch(new Request("http://localhost/items/abc"))
      expect(getRes.status).toBe(200)
      expect(await getRes.json()).toEqual({ id: "abc" })
    })

    it("registers tool-eligible endpoints with the MCP registry", () => {
      const parent = new OpenAPIHono<TestEnv>()
      mountWithMcp(parent, "/items", [listEp, getEp])

      const tools = collectToolDescriptors()
      expect(tools.map((t) => t.name)).toEqual(["listItems", "getItem"])
    })

    it("skips endpoints with `tool: false` from the MCP registry but still mounts their HTTP route", async () => {
      const parent = new OpenAPIHono<TestEnv>()
      mountWithMcp(parent, "/items", [listEp, hiddenEp])

      const tools = collectToolDescriptors()
      expect(tools.map((t) => t.name)).toEqual(["listItems"])

      // The HTTP route still works.
      const res = await parent.fetch(new Request("http://localhost/items/internal"))
      expect(res.status).toBe(200)
    })

    it("records the prefix on each registered descriptor", () => {
      const parent = new OpenAPIHono<TestEnv>()
      mountWithMcp(parent, "/items", [listEp])
      mountWithMcp(parent, "/widgets", [getEp])

      const tools = collectToolDescriptors()
      expect(tools.find((t) => t.name === "listItems")?.routerPrefix).toBe("/items")
      expect(tools.find((t) => t.name === "getItem")?.routerPrefix).toBe("/widgets")
    })
  })

  describe("resetEndpointRegistry", () => {
    it("clears all registered descriptors", () => {
      const parent = new OpenAPIHono<TestEnv>()
      mountWithMcp(parent, "/items", [listEp, getEp])
      expect(collectToolDescriptors()).toHaveLength(2)

      resetEndpointRegistry()
      expect(collectToolDescriptors()).toHaveLength(0)
    })
  })

  describe("collectToolDescriptors", () => {
    it("includes flattened input schema, output schema, and routing metadata", () => {
      const parent = new OpenAPIHono<TestEnv>()
      mountWithMcp(parent, "/items", [getEp])

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

    it("returns null `output` for routes whose success response has no body (204)", () => {
      const parent = new OpenAPIHono<TestEnv>()
      mountWithMcp(parent, "/items", [deleteEp])

      const [tool] = collectToolDescriptors()
      expect(tool?.output).toBeNull()
    })

    it("falls back to `name` when `summary` is absent", () => {
      const parent = new OpenAPIHono<TestEnv>()
      mountWithMcp(parent, "/items", [listEp])

      const [tool] = collectToolDescriptors()
      // listEp has no `summary` set, so title falls back to `name`.
      expect(tool?.title).toBe("listItems")
    })
  })
})
