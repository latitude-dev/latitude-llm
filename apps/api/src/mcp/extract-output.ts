import { z } from "@hono/zod-openapi"
import type { AppRouteConfig } from "./define-endpoint.ts"

export interface ExtractedOutput {
  /** Single Zod object holding all output fields, ready for an MCP tool's `outputSchema`. */
  readonly schema: z.ZodObject<z.ZodRawShape>
}

const isZodObject = (schema: unknown): schema is z.ZodObject<z.ZodRawShape> => schema instanceof z.ZodObject

/**
 * Picks the route's primary success response schema for use as the MCP tool's
 * `outputSchema`.
 *
 * Selection: the lowest 2xx status code whose content advertises a JSON object
 * schema. So a route declaring 200 + 201 prefers 200; a 204-only route returns
 * `undefined` because there's no response body to describe; a route with a
 * non-JSON or non-object body (text/plain, array body, discriminated union)
 * also returns `undefined` — the MCP SDK's `outputSchema` is constrained to
 * object shapes (it validates `structuredContent`, which is itself an object
 * per the MCP spec).
 *
 * Returning `undefined` rather than throwing keeps the manifest valid for
 * write endpoints whose acknowledgement carries no body and for tools whose
 * output isn't structured — they simply expose no `outputSchema`, matching
 * how the MCP spec treats it as optional.
 */
export const extractOutputSchema = (route: AppRouteConfig): ExtractedOutput | undefined => {
  const responses = route.responses
  if (!responses) return undefined

  const successCodes = Object.keys(responses)
    .map((code) => Number(code))
    .filter((code) => Number.isFinite(code) && code >= 200 && code < 300)
    .sort((a, b) => a - b)

  for (const code of successCodes) {
    // biome-ignore lint/suspicious/noExplicitAny: response config shapes vary by status code
    const response = (responses as Record<number, any>)[code]
    const schema = response?.content?.["application/json"]?.schema
    if (isZodObject(schema)) return { schema }
  }
  return undefined
}
