import { z } from "@hono/zod-openapi"
import { describe, expect, it } from "vitest"
import type { AppRouteConfig } from "./define-endpoint.ts"
import { type FieldSource, flattenRouteInputSchema, splitFlatInput } from "./flatten-input.ts"

const baseRoute = {
  method: "post",
  path: "/x",
  name: "test",
  description: "",
  responses: {},
} as const

// Builds a minimal AppRouteConfig with the given request shape. The fields not
// touched by `flattenRouteInputSchema` (responses, etc.) are filled with stubs.
const route = (request: AppRouteConfig["request"]): AppRouteConfig => ({ ...baseRoute, request }) as AppRouteConfig

describe("flattenRouteInputSchema", () => {
  it("returns an empty object schema with no sources for a route with no request parts", () => {
    const { schema, sources } = flattenRouteInputSchema(route(undefined))
    expect(schema.shape).toEqual({})
    expect(sources).toEqual({})
  })

  it("merges params into the flat shape with source 'param'", () => {
    const { schema, sources } = flattenRouteInputSchema(route({ params: z.object({ id: z.string() }) }))
    expect(Object.keys(schema.shape)).toEqual(["id"])
    expect(sources).toEqual({ id: "param" })
  })

  it("merges query into the flat shape with source 'query'", () => {
    const { schema, sources } = flattenRouteInputSchema(route({ query: z.object({ cursor: z.string().optional() }) }))
    expect(Object.keys(schema.shape)).toEqual(["cursor"])
    expect(sources).toEqual({ cursor: "query" })
  })

  it("merges a JSON object body into the flat shape with source 'body'", () => {
    const { schema, sources } = flattenRouteInputSchema(
      route({
        body: {
          content: { "application/json": { schema: z.object({ name: z.string() }) } },
          required: true,
        },
      }),
    )
    expect(Object.keys(schema.shape)).toEqual(["name"])
    expect(sources).toEqual({ name: "body" })
  })

  it("merges all three sources into a single flat shape", () => {
    const { schema, sources } = flattenRouteInputSchema(
      route({
        params: z.object({ id: z.string() }),
        query: z.object({ verbose: z.boolean().optional() }),
        body: {
          content: { "application/json": { schema: z.object({ name: z.string() }) } },
          required: true,
        },
      }),
    )
    expect(Object.keys(schema.shape).sort()).toEqual(["id", "name", "verbose"])
    expect(sources).toEqual({ id: "param", verbose: "query", name: "body" })
  })

  it("wraps a non-object body under a 'body' key with source 'wrapped-body'", () => {
    const union = z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("a"), valueA: z.string() }),
      z.object({ kind: z.literal("b"), valueB: z.number() }),
    ])
    const { schema, sources } = flattenRouteInputSchema(
      route({
        body: { content: { "application/json": { schema: union } }, required: true },
      }),
    )
    expect(Object.keys(schema.shape)).toEqual(["body"])
    expect(sources).toEqual({ body: "wrapped-body" })
  })

  it("throws on field-name collisions across sources", () => {
    expect(() =>
      flattenRouteInputSchema(
        route({
          params: z.object({ id: z.string() }),
          body: {
            content: { "application/json": { schema: z.object({ id: z.string() }) } },
            required: true,
          },
        }),
      ),
    ).toThrow(/collision on field "id"/)
  })

  it("throws on a 'body'-key collision when wrapping a non-object body", () => {
    const union = z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("a"), valueA: z.string() }),
      z.object({ kind: z.literal("b"), valueB: z.number() }),
    ])
    expect(() =>
      flattenRouteInputSchema(
        route({
          query: z.object({ body: z.string() }),
          body: { content: { "application/json": { schema: union } }, required: true },
        }),
      ),
    ).toThrow(/already has a "body" field/)
  })

  it("ignores non-JSON body content types", () => {
    const { schema, sources } = flattenRouteInputSchema(
      route({
        body: {
          content: { "multipart/form-data": { schema: z.object({ file: z.string() }) } },
          required: true,
        },
      }),
    )
    expect(Object.keys(schema.shape)).toEqual([])
    expect(sources).toEqual({})
  })
})

describe("splitFlatInput", () => {
  it("partitions flat input fields into params/query/body buckets by source", () => {
    const sources: Readonly<Record<string, FieldSource>> = {
      id: "param",
      cursor: "query",
      name: "body",
    }
    const result = splitFlatInput({ id: "abc", cursor: "next-page", name: "key-1" }, sources)
    expect(result.params).toEqual({ id: "abc" })
    expect(result.query).toEqual({ cursor: "next-page" })
    expect(result.body).toEqual({ name: "key-1" })
  })

  it("returns body undefined when there were no body-sourced fields (route with only params)", () => {
    const sources: Readonly<Record<string, FieldSource>> = { id: "param" }
    const result = splitFlatInput({ id: "abc" }, sources)
    expect(result.body).toBeUndefined()
  })

  it("hands back the wrapped body verbatim for routes with non-object bodies (wrapped-body source)", () => {
    // Mirrors flattenRouteInputSchema's wrapped-body behavior — discriminated
    // unions get nested under a `body` key, and splitFlatInput returns it as-is
    // so the dispatcher can JSON.stringify the original union value.
    const sources: Readonly<Record<string, FieldSource>> = { body: "wrapped-body" }
    const result = splitFlatInput({ body: { kind: "a", value: 1 } }, sources)
    expect(result.body).toEqual({ kind: "a", value: 1 })
  })

  it("silently drops fields whose source isn't in the map", () => {
    // Defensive — Zod validation upstream rejects unknown fields, but we still
    // shouldn't blow up if a stray field reaches the splitter.
    const sources: Readonly<Record<string, FieldSource>> = { id: "param" }
    const result = splitFlatInput({ id: "abc", stray: "drop-me" }, sources)
    expect(result.params).toEqual({ id: "abc" })
    expect(result.query).toEqual({})
    expect(result.body).toBeUndefined()
  })
})
