import { z } from "@hono/zod-openapi"
import { describe, expect, it } from "vitest"
import type { AppRouteConfig } from "./define-endpoint.ts"
import { flattenRouteInputSchema } from "./flatten-input.ts"

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
