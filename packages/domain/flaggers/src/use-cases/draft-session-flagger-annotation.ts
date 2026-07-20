import {
  authorizeBillableAction,
  buildBillingIdempotencyKey,
  NoCreditsRemainingError,
  recordBillableActionUseCase,
} from "@domain/billing"
import { generateId, OrganizationId, ProjectId, type ScoreId, TraceId } from "@domain/shared"
import { Effect } from "effect"
import { loadFlaggerSessionContextUseCase } from "./classify-session-flagger.ts"
import { annotateConversationForFlaggerUseCase } from "./run-flagger-annotator.ts"
import { findFlaggerAnnotationByAnchor } from "./upsert-flagger-annotation-score.ts"

export interface DraftSessionFlaggerAnnotationInput {
  readonly organizationId: string
  readonly projectId: string
  readonly sessionId: string
  readonly flaggerSlug: string
  readonly contentHash: string
  readonly latestTraceId: string
  readonly feedback?: string | undefined
  readonly messageIndex?: number | undefined
}

export type DraftSessionFlaggerAnnotationResult =
  | { readonly status: "duplicate"; readonly scoreId: string }
  | {
      readonly status: "drafted"
      readonly scoreId: ScoreId
      readonly feedback: string
      readonly messageIndex?: number | undefined
    }

// The anchor dedup runs BEFORE billing authorization so a re-detected issue is
// never charged for a scan that would then no-op the write.
export const draftSessionFlaggerAnnotationWithBillingUseCase = Effect.fn("flaggers.draftSessionFlaggerAnnotation")(
  function* (input: DraftSessionFlaggerAnnotationInput) {
    yield* Effect.annotateCurrentSpan("flagger.organizationId", input.organizationId)
    yield* Effect.annotateCurrentSpan("flagger.projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("flagger.sessionId", input.sessionId)
    yield* Effect.annotateCurrentSpan("flagger.flaggerSlug", input.flaggerSlug)

    const organizationId = OrganizationId(input.organizationId)
    const projectId = ProjectId(input.projectId)

    const existing = yield* findFlaggerAnnotationByAnchor({
      projectId,
      sessionId: input.sessionId,
      flaggerSlug: input.flaggerSlug,
      contentHash: input.contentHash,
    })
    if (existing !== null) {
      yield* Effect.annotateCurrentSpan("flagger.duplicateAnchor", true)
      return { status: "duplicate", scoreId: existing.id } satisfies DraftSessionFlaggerAnnotationResult
    }

    const idempotencyKey = buildBillingIdempotencyKey("flagger-scan", [
      input.organizationId,
      input.flaggerSlug,
      input.sessionId,
      input.contentHash,
    ])

    const billing = yield* authorizeBillableAction({
      organizationId,
      action: "flagger-scan",
      skipIfBlocked: true,
      idempotencyKey,
    })

    if (!billing.allowed) {
      return yield* Effect.fail(
        new NoCreditsRemainingError({
          organizationId,
          planSlug: billing.context.planSlug,
          action: "flagger-scan",
        }),
      )
    }

    const scoreId = generateId<"ScoreId">()

    // The classifier's feedback is normally final; the annotator is the fallback
    // for a match that somehow arrived without feedback text.
    let feedback = input.feedback
    let messageIndex = input.messageIndex
    if (feedback === undefined) {
      const context = yield* loadFlaggerSessionContextUseCase(input)
      const annotated = yield* annotateConversationForFlaggerUseCase({
        organizationId: input.organizationId,
        projectId: input.projectId,
        flaggerSlug: input.flaggerSlug,
        scoreId,
        conversation: context.conversation,
        summary: {
          durationNs: context.session.durationNs,
          spanCount: context.session.spanCount,
          errorCount: context.session.errorCount,
        },
        sessionId: input.sessionId,
        traceId: context.latestTraceId,
      })
      feedback = annotated.feedback
      messageIndex = annotated.messageIndex
    }

    yield* recordBillableActionUseCase({
      organizationId,
      projectId,
      action: "flagger-scan",
      idempotencyKey,
      context: billing.context,
      traceId: TraceId(input.latestTraceId),
      metadata: {
        flaggerSlug: input.flaggerSlug,
        sessionId: input.sessionId,
        traceId: input.latestTraceId,
      },
    })

    return {
      status: "drafted",
      scoreId,
      feedback,
      ...(messageIndex !== undefined ? { messageIndex } : {}),
    } satisfies DraftSessionFlaggerAnnotationResult
  },
)
