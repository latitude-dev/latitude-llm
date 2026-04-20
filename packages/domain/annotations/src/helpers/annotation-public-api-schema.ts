import { filterSetSchema, traceIdSchema } from "@domain/shared"
import { z } from "zod"
import { persistDraftAnnotationInputSchema } from "./annotation-draft-write-schema.ts"

/**
 * Discriminated union identifying the target trace for a public-API annotation
 * write.
 *
 * - `{ by: "id", id }` — exact trace id lookup.
 * - `{ by: "filters", filters }` — resolve a single trace from a `FilterSet`.
 *
 * The filter path exists for callers (including our own SDK) that do not have
 * the raw OpenTelemetry trace id at hand but can identify the trace via
 * attributes such as `attributes.scoreId` or `metadata.userId`.
 */
const traceRefSchema = z.discriminatedUnion("by", [
  z.object({ by: z.literal("id"), id: traceIdSchema }),
  z.object({ by: z.literal("filters"), filters: filterSetSchema }),
])

export type TraceRef = z.infer<typeof traceRefSchema>

/**
 * Public-API annotation submission payload.
 *
 * Reuses `persistDraftAnnotationInputSchema` for all annotator-authored score
 * fields (value, passed, feedback, anchor fields, optional `id`) but replaces
 * the flat `traceId` with the `trace` discriminated union and adds the
 * `draft` opt-in (default `false` = publish immediately).
 *
 * `projectId` comes from the URL and `sourceId` is always forced to `"API"` by
 * the route handler, so both are stripped from the accepted body.
 */
export const submitApiAnnotationInputSchema = persistDraftAnnotationInputSchema
  .omit({ projectId: true, sourceId: true, traceId: true })
  .extend({
    trace: traceRefSchema,
    draft: z.boolean().default(false),
  })
