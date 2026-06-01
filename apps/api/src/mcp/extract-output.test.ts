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

  it("merges multiple 2xx object schemas into one, preserving shared fields as required", () => {
    // Mirrors the dataset export endpoint shape: 200 `ready` and 202 `queued`
    // share a discriminator (`status`) plus `rowCount`, but otherwise carry
    // disjoint fields. Both should be representable as a single MCP
    // `outputSchema` so agents can validate structuredContent for both
    // statuses and branch on the discriminator.
    const Ready = z.object({
      status: z.literal("ready"),
      rowCount: z.number().int(),
      downloadUrl: z.string(),
    })
    const Queued = z.object({
      status: z.literal("queued"),
      rowCount: z.number().int(),
      recipient: z.email(),
    })

    const out = extractOutputSchema(route({ 200: jsonResponse(Ready), 202: jsonResponse(Queued) }))
    expect(out?.schema).toBeDefined()

    // Both shapes parse successfully against the merged schema — that's
    // the property MCP `structuredContent` validation depends on.
    expect(out?.schema.safeParse({ status: "ready", rowCount: 2, downloadUrl: "https://x" }).success).toBe(true)
    expect(out?.schema.safeParse({ status: "queued", rowCount: 5001, recipient: "owner@acme.com" }).success).toBe(true)

    // The discriminator is required (in every variant). Omitting it fails.
    expect(out?.schema.safeParse({ rowCount: 2, downloadUrl: "https://x" }).success).toBe(false)

    // Variant-only fields are optional — a payload missing them parses fine
    // as long as the shared keys are present.
    expect(out?.schema.safeParse({ status: "ready", rowCount: 2 }).success).toBe(true)
    expect(out?.schema.safeParse({ status: "queued", rowCount: 5001 }).success).toBe(true)

    // Status outside the union of declared literals fails — the discriminator
    // is the union of every variant's `status`, not a free string.
    expect(out?.schema.safeParse({ status: "made_up", rowCount: 2 }).success).toBe(false)
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
