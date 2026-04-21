import { Effect } from "effect"
import type { z } from "zod"
import type { persistDraftAnnotationInputSchema } from "../helpers/annotation-draft-write-schema.ts"
import { writeAnnotation } from "../helpers/write-annotation.ts"

type WritePublishedAnnotationInput = z.input<typeof persistDraftAnnotationInputSchema>

/**
 * Thin primitive: persist a **published** annotation score (`draftedAt = null`).
 *
 * Emits `ScoreCreated` with `status: "published"` inside the same transaction, so
 * issue discovery and analytics sync pick it up immediately rather than waiting
 * for the debounced `annotation-scores:publish` task used by human-editable drafts.
 */
export const writePublishedAnnotationUseCase = (input: WritePublishedAnnotationInput & { organizationId: string }) =>
  writeAnnotation(input, null).pipe(Effect.withSpan("annotations.writePublishedAnnotation"))
