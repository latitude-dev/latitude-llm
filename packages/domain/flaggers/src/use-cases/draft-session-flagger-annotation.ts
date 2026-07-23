import {
  authorizeBillableAction,
  buildBillingIdempotencyKey,
  makeAIMeteringScope,
  NoCreditsRemainingError,
  provideAIMeteringScope,
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

    const billing = yield* authorizeBillableAction({
      organizationId,
      action: "llm-call",
      skipIfBlocked: true,
      idempotencyKey: buildBillingIdempotencyKey("llm-call", [
        input.organizationId,
        "flagger",
        input.flaggerSlug,
        input.sessionId,
        input.contentHash,
        "authorize",
      ]),
    })

    if (!billing.allowed) {
      return yield* Effect.fail(
        new NoCreditsRemainingError({
          organizationId,
          planSlug: billing.context.planSlug,
          action: "llm-call",
        }),
      )
    }

    const scoreId = generateId<"ScoreId">()

    // The classifier's feedback is normally final; the annotator is the fallback
    // for a match that somehow arrived without feedback text. Its LLM calls bill
    // at cost through the metering scope, keyed by the flagged anchor so a
    // retried workflow replays the same idempotency keys.
    let feedback = input.feedback
    let messageIndex = input.messageIndex
    if (feedback === undefined) {
      const meteringScope = yield* makeAIMeteringScope({
        organizationId,
        projectId,
        keyParts: ["flagger", input.flaggerSlug, input.sessionId, input.contentHash],
        context: billing.context,
        traceId: TraceId(input.latestTraceId),
      })
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
      }).pipe(provideAIMeteringScope(meteringScope))
      feedback = annotated.feedback
      messageIndex = annotated.messageIndex
    }

    return {
      status: "drafted",
      scoreId,
      feedback,
      ...(messageIndex !== undefined ? { messageIndex } : {}),
    } satisfies DraftSessionFlaggerAnnotationResult
  },
)
