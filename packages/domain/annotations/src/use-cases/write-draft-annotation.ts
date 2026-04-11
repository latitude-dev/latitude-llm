import type { ScoreDraftClosedError, ScoreDraftUpdateConflictError } from "@domain/scores"
import type { BadRequestError, RepositoryError } from "@domain/shared"
import type { z } from "zod"
import { persistDraftAnnotationInputSchema } from "../helpers/annotation-draft-write-schema.ts"
import { writeAnnotation } from "../helpers/write-annotation.ts"

export { persistDraftAnnotationInputSchema }
export type WriteDraftAnnotationInput = z.input<typeof persistDraftAnnotationInputSchema>

export type PersistDraftAnnotationError =
  | RepositoryError
  | BadRequestError
  | ScoreDraftClosedError
  | ScoreDraftUpdateConflictError

/** Thin primitive: persist or update a **draft** annotation score (`draftedAt` set). */
export const writeDraftAnnotation = (input: WriteDraftAnnotationInput & { organizationId: string }) =>
  writeAnnotation(input, new Date())
