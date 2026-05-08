import { z } from "@hono/zod-openapi"

/**
 * Pagination shape used by every paginated list endpoint in the API. We pass a
 * unique `name` because Fern needs each instantiation to be a named OpenAPI
 * component (otherwise the generator inlines anonymous types and the SDK fails
 * to typecheck on case-sensitive filesystems).
 *
 * ```ts
 * const PaginatedTraces = Paginated(TraceSchema, "PaginatedTraces")
 * ```
 *
 * The cursor is opaque from the caller's perspective — repositories serialize
 * their own `(sortValue, id)` tuples behind the scenes.
 *
 * @public Public API surface for the API expansion plan; consumed by list
 * route definitions in subsequent PRs. Marked `@public` so knip doesn't flag
 * it as unused while it's waiting for its first consumer.
 */
export const Paginated = <T extends z.ZodType>(item: T, name: string) =>
  z
    .object({
      items: z.array(item).openapi({ description: "Page of items, in the requested sort order." }),
      nextCursor: z.string().nullable().openapi({
        description:
          "Opaque cursor for fetching the next page. `null` when there are no more pages. Pass it back in `cursor` to continue.",
      }),
      hasMore: z.boolean().openapi({
        description: "`true` when there is at least one more page after this one.",
      }),
    })
    .openapi(name)

/**
 * Standard query-string params for paginated endpoints. Endpoints with
 * additional filter/search params should compose with this via `.merge`.
 *
 * @public Public API surface for the API expansion plan; consumed by list
 * route definitions in subsequent PRs. Marked `@public` so knip doesn't flag
 * it as unused while it's waiting for its first consumer.
 */
export const PaginatedQueryParamsSchema = z.object({
  cursor: z.string().optional().openapi({
    description: "Opaque cursor returned in a previous response's `nextCursor`. Omit on the first page.",
  }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(200)
    .default(50)
    .openapi({ description: "Page size. Defaults to 50; max 200." }),
})
