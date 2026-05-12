import { z } from "@hono/zod-openapi"
import { describe, expect, it } from "vitest"
import type { AppRouteConfig } from "./define-endpoint.ts"
import { extractOutputSchema } from "./extract-output.ts"

const route = (responses: AppRouteConfig["responses"]): AppRouteConfig =>
  ({
    method: "get",
    path: "/x",
    name: "test",
    description: "",
    responses,
  }) as AppRouteConfig

const jsonResponse = (schema: z.ZodType, description = "OK") => ({
  content: { "application/json": { schema } },
  description,
})

describe("extractOutputSchema", () => {
  it("returns the 200 response schema when it exists", () => {
    const ItemSchema = z.object({ id: z.string() })
    const out = extractOutputSchema(route({ 200: jsonResponse(ItemSchema) }))
    expect(out?.schema).toBe(ItemSchema)
  })

  it("returns the 201 response schema when only 201 is defined", () => {
    const ItemSchema = z.object({ id: z.string() })
    const out = extractOutputSchema(route({ 201: jsonResponse(ItemSchema) }))
    expect(out?.schema).toBe(ItemSchema)
  })

  it("prefers the lowest 2xx with an object JSON schema (200 over 201)", () => {
    const Two00 = z.object({ kind: z.literal("ok") })
    const Two01 = z.object({ kind: z.literal("created") })
    const out = extractOutputSchema(route({ 200: jsonResponse(Two00), 201: jsonResponse(Two01) }))
    expect(out?.schema).toBe(Two00)
  })

  it("returns undefined for a 204-only route (no body)", () => {
    const out = extractOutputSchema(route({ 204: { description: "No Content" } }))
    expect(out).toBeUndefined()
  })

  it("returns undefined when no responses are defined", () => {
    const out = extractOutputSchema(route({}))
    expect(out).toBeUndefined()
  })

  it("returns undefined when the only success response advertises a non-JSON content type", () => {
    const out = extractOutputSchema(
      route({
        200: { content: { "text/plain": { schema: z.string() } }, description: "OK" },
      }),
    )
    expect(out).toBeUndefined()
  })

  it("returns undefined when the success response schema is not a ZodObject", () => {
    // MCP `outputSchema` is constrained to object shapes — array / union / scalar
    // bodies can't surface as structured output and are skipped here so the SDK
    // doesn't get a schema it can't validate `structuredContent` against.
    const out = extractOutputSchema(route({ 200: jsonResponse(z.array(z.string())) }))
    expect(out).toBeUndefined()
  })

  it("ignores 4xx/5xx responses", () => {
    const ErrorSchema = z.object({ error: z.string() })
    const out = extractOutputSchema(
      route({
        400: jsonResponse(ErrorSchema, "Bad Request"),
        500: jsonResponse(ErrorSchema, "Server Error"),
      }),
    )
    expect(out).toBeUndefined()
  })

  it("falls through 200 to 201 when 200 has no JSON content", () => {
    const Two01 = z.object({ id: z.string() })
    const out = extractOutputSchema(
      route({
        200: { content: { "text/plain": { schema: z.string() } }, description: "OK" },
        201: jsonResponse(Two01),
      }),
    )
    expect(out?.schema).toBe(Two01)
  })
})
