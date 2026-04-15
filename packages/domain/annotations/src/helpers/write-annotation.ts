import { type AnnotationScore, writeScoreUseCase } from "@domain/scores"
import { OrganizationId } from "@domain/shared"
import { Effect } from "effect"
import type { z } from "zod"
import { anchorFromPersistDraftFlatFields, persistDraftAnnotationInputSchema } from "./annotation-draft-write-schema.ts"
import { buildAnnotationScoreMetadata } from "./build-annotation-score-metadata.ts"
import { resolveWriteAnnotationTraceContext } from "./resolve-write-annotation-trace-context.ts"

export const writeAnnotation = (
  input: z.input<typeof persistDraftAnnotationInputSchema> & { organizationId: string },
  draftedAt: Date | null,
) =>
  Effect.gen(function* () {
    const parsed = persistDraftAnnotationInputSchema.parse(input)

    const anchor = parsed.anchor ?? anchorFromPersistDraftFlatFields(parsed)

    const { sessionId, spanId } = yield* resolveWriteAnnotationTraceContext({
      organizationId: OrganizationId(input.organizationId),
      projectId: parsed.projectId,
      traceId: parsed.traceId,
      sessionId: parsed.sessionId,
      spanId: parsed.spanId,
      anchor,
    })

    const metadata = buildAnnotationScoreMetadata(parsed.feedback, anchor)

    const score = yield* writeScoreUseCase({
      id: parsed.id,
      projectId: parsed.projectId,
      source: "annotation",
      sourceId: parsed.sourceId,
      sessionId,
      traceId: parsed.traceId,
      spanId,
      simulationId: parsed.simulationId,
      issueId: parsed.issueId,
      annotatorId: parsed.annotatorId,
      value: parsed.value,
      passed: parsed.passed,
      feedback: parsed.feedback,
      metadata,
      error: null,
      draftedAt,
    })

    return score as AnnotationScore
  })
