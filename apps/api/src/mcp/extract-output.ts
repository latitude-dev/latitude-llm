import type { z } from "@hono/zod-openapi"
import type { AppRouteConfig } from "./define-endpoint.ts"

/**
 * Picks the route's primary success response schema for use as the MCP tool's
 * `outputSchema`.
 *
 * Selection: the lowest 2xx status code whose content advertises a JSON schema. So
 * a route declaring 200 + 201 prefers 200; a 204-only route returns `null` because
 * there's no response body to describe. Routes with a primary success response that
 * omits `content` (e.g. `openApiNoContentResponses({...})` produces a `{ description }`
 * entry only) also return `null`.
 *
 * Returning `null` rather than throwing keeps the manifest valid for write
 * endpoints whose acknowledgement carries no body — those tools simply expose no
 * `outputSchema`, matching how the MCP spec treats it as optional.
 */
export const extractOutputSchema = (route: AppRouteConfig): z.ZodType | null => {
  const responses = route.responses
  if (!responses) return null

  const successCodes = Object.keys(responses)
    .map((code) => Number(code))
    .filter((code) => Number.isFinite(code) && code >= 200 && code < 300)
    .sort((a, b) => a - b)

  for (const code of successCodes) {
    // biome-ignore lint/suspicious/noExplicitAny: response config shapes vary by status code
    const response = (responses as Record<number, any>)[code]
    const schema = response?.content?.["application/json"]?.schema
    if (schema) return schema as z.ZodType
  }
  return null
}
