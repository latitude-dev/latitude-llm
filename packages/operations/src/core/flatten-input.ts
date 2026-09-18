import { z } from "@hono/zod-openapi"
import type { AppRouteConfig } from "./define-operation.ts"

/**
 * Where a flat input field came from. Used by the MCP dispatcher (in M2) to put each
 * field back where the underlying HTTP route expects it.
 */
export type FieldSource = "param" | "query" | "body" | "wrapped-body"

export interface FlatInput {
  /** Single Zod object holding all input fields, ready for an MCP tool's `inputSchema`. */
  readonly schema: z.ZodObject<z.ZodRawShape>
  /** Per-field source map, used by `splitFlatInput` to reconstruct the HTTP request. */
  readonly sources: Readonly<Record<string, FieldSource>>
}

const isZodObject = (schema: unknown): schema is z.ZodObject<z.ZodRawShape> => schema instanceof z.ZodObject

const mergeShape = (
  routeName: string,
  shape: Record<string, z.ZodType>,
  sources: Record<string, FieldSource>,
  source: FieldSource,
  partShape: Readonly<Record<string, z.ZodType>>,
) => {
  for (const [key, value] of Object.entries(partShape)) {
    if (key in shape) {
      throw new Error(
        `MCP tool flatten collision on field "${key}" for route "${routeName}": source "${sources[key]}" already provided this field; "${source}" tried to overwrite it. Rename one of the fields.`,
      )
    }
    shape[key] = value
    sources[key] = source
  }
}

const mergeJsonBodySchema = (
  routeName: string,
  bodySchema: unknown,
  shape: Record<string, z.ZodType>,
  sources: Record<string, FieldSource>,
) => {
  if (!bodySchema) return
  if (isZodObject(bodySchema)) {
    mergeShape(routeName, shape, sources, "body", bodySchema.shape as Readonly<Record<string, z.ZodType>>)
    return
  }
  // Non-object body (discriminated union, array, …) — preserve discriminator
  // semantics by keeping the whole body under a single property.
  if ("body" in shape) {
    throw new Error(
      `MCP tool flatten collision: route "${routeName}" already has a "body" field but the request body is non-object and would need to wrap under "body". Rename the existing field.`,
    )
  }
  shape.body = bodySchema as z.ZodType
  sources.body = "wrapped-body"
}

/**
 * Flattens a route's `request.params + request.query + request.body` into a single Zod
 * object schema for use as an MCP tool's input schema.
 *
 * - Params and query fields are taken from their respective `ZodObject` shapes.
 * - JSON body: if the body schema is a `ZodObject`, its shape is merged in. Otherwise
 *   (e.g. a discriminated union or array body) the entire body is kept under a
 *   `body` property — non-object bodies can't be flattened without losing the union
 *   discriminator that drives validation.
 *
 * Throws if two sources contribute a field with the same name. Collisions are a
 * configuration error, not a runtime error — they're caught at boot when the route
 * registry is built.
 */
export const flattenRouteInputSchema = (route: AppRouteConfig): FlatInput => {
  // `z.ZodRawShape` is a `Readonly<Record<...>>` in zod 4, so the accumulator uses
  // a plain mutable record and is widened back to `ZodRawShape` at the call to
  // `z.object(...)`.
  const shape: Record<string, z.ZodType> = {}
  const sources: Record<string, FieldSource> = {}

  if (route.request?.params && isZodObject(route.request.params)) {
    mergeShape(route.name, shape, sources, "param", route.request.params.shape as Readonly<Record<string, z.ZodType>>)
  }
  if (route.request?.query && isZodObject(route.request.query)) {
    mergeShape(route.name, shape, sources, "query", route.request.query.shape as Readonly<Record<string, z.ZodType>>)
  }

  const body = route.request?.body
  if (body && "content" in body && body.content) {
    mergeJsonBodySchema(route.name, body.content["application/json"]?.schema, shape, sources)
  }

  return {
    schema: z.object(shape),
    sources,
  }
}

/**
 * Reverse of {@link flattenRouteInputSchema}: splits a flat input object back
 * into the `{ params, query, body }` shape Hono's `app.fetch()` expects when
 * the MCP server dispatches a tool call.
 *
 * `body` is a single object whose fields came from the route's JSON body.
 * For routes whose body was wrapped (non-object body — discriminated union /
 * array), `body` is whatever was under the `body` field of the flat input.
 */
export const splitFlatInput = (
  input: Record<string, unknown>,
  sources: Readonly<Record<string, FieldSource>>,
): {
  readonly params: Record<string, unknown>
  readonly query: Record<string, unknown>
  readonly body: Record<string, unknown> | unknown
} => {
  const params: Record<string, unknown> = {}
  const query: Record<string, unknown> = {}
  const body: Record<string, unknown> = {}
  let wrappedBody: unknown
  let hasWrappedBody = false

  const routeHasObjectBody = Object.values(sources).some((s) => s === "body")
  const routeHasWrappedBody = Object.values(sources).some((s) => s === "wrapped-body")

  for (const [key, value] of Object.entries(input)) {
    const source = sources[key]
    switch (source) {
      case "param":
        params[key] = value
        break
      case "query":
        query[key] = value
        break
      case "body":
        body[key] = value
        break
      case "wrapped-body":
        wrappedBody = value
        hasWrappedBody = true
        break
      // Field present in input but not in `sources` — silently dropped. Zod
      // validation upstream should have rejected this; ignoring is fine.
    }
  }

  return {
    params,
    query,
    body: routeHasWrappedBody ? (hasWrappedBody ? wrappedBody : undefined) : routeHasObjectBody ? body : undefined,
  }
}
