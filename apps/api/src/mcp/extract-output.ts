import { z } from "@hono/zod-openapi"
import type { AppRouteConfig } from "./define-endpoint.ts"

export interface ExtractedOutput {
  /** Single Zod object holding all output fields, ready for an MCP tool's `outputSchema`. */
  readonly schema: z.ZodObject<z.ZodRawShape>
}

const isZodObject = (schema: unknown): schema is z.ZodObject<z.ZodRawShape> => schema instanceof z.ZodObject

/**
 * Derives the MCP tool's `outputSchema` from a route's success responses.
 *
 * Behaviour:
 * - Single 2xx JSON object response → use it directly.
 * - Multiple 2xx JSON object responses → merge them into one ZodObject whose
 *   fields are required if they appear in every variant, optional otherwise.
 *   Each field's type is the union of the per-variant types. Agents validate
 *   `structuredContent` against this merged schema and branch on the
 *   discriminator field (e.g. `status`) to know which optional fields are
 *   populated.
 * - 204-only routes, non-JSON content, and non-object body schemas (array /
 *   union / scalar) return `undefined`. The MCP SDK's `outputSchema` is
 *   constrained to object shapes (it validates `structuredContent`, which is
 *   itself an object per the MCP spec), so anything that can't be flattened
 *   into a `ZodObject` is skipped — the tool simply exposes no
 *   `outputSchema`, matching how the MCP spec treats it as optional.
 */
export const extractOutputSchema = (route: AppRouteConfig): ExtractedOutput | undefined => {
  const responses = route.responses
  if (!responses) return undefined

  const successCodes = Object.keys(responses)
    .map((code) => Number(code))
    .filter((code) => Number.isFinite(code) && code >= 200 && code < 300)
    .sort((a, b) => a - b)

  const objectSchemas: z.ZodObject<z.ZodRawShape>[] = []
  for (const code of successCodes) {
    // biome-ignore lint/suspicious/noExplicitAny: response config shapes vary by status code
    const response = (responses as Record<number, any>)[code]
    const schema = response?.content?.["application/json"]?.schema
    if (isZodObject(schema)) objectSchemas.push(schema)
  }

  if (objectSchemas.length === 0) return undefined
  if (objectSchemas.length === 1) {
    const only = objectSchemas[0]
    return only ? { schema: only } : undefined
  }
  return { schema: mergeObjectSchemas(objectSchemas) }
}

/**
 * Flattens N ZodObject schemas into one. A field present in every input is
 * preserved as required; a field present in only some inputs becomes
 * optional. Each field's type is the union of the per-variant declarations
 * for that field — so a `status: z.literal("ready")` from one schema and a
 * `status: z.literal("queued")` from another collapse into
 * `z.union([z.literal("ready"), z.literal("queued")])`.
 *
 * Agents validate `structuredContent` against the merged schema and use the
 * discriminator field to decide which optional fields are meaningful for a
 * given response.
 */
const mergeObjectSchemas = (schemas: readonly z.ZodObject<z.ZodRawShape>[]): z.ZodObject<z.ZodRawShape> => {
  const variantsByKey = new Map<string, z.ZodType[]>()
  const presenceByKey = new Map<string, number>()
  for (const s of schemas) {
    const shape = s.shape as Readonly<Record<string, z.ZodType>>
    for (const [key, fieldSchema] of Object.entries(shape)) {
      const variants = variantsByKey.get(key) ?? []
      variants.push(fieldSchema)
      variantsByKey.set(key, variants)
      presenceByKey.set(key, (presenceByKey.get(key) ?? 0) + 1)
    }
  }

  const merged: Record<string, z.ZodType> = {}
  for (const [key, variants] of variantsByKey) {
    const unioned =
      variants.length === 1
        ? (variants[0] as z.ZodType)
        : z.union(variants as unknown as [z.ZodType, z.ZodType, ...z.ZodType[]])
    const presentInAll = presenceByKey.get(key) === schemas.length
    merged[key] = presentInAll ? unioned : unioned.optional()
  }

  return z.object(merged)
}
