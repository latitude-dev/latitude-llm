import { NotFoundError, OrganizationId, ProjectId, SessionId, TraceId } from "@domain/shared"
import { SessionRepository, SpanRepository } from "@domain/spans"
import { Effect } from "effect"
import { FLAGGER_SCORING_ARTIFACT_VERSION } from "../constants.ts"
import {
  buildFlaggerSessionContext,
  computeFlaggerAnchorContentHash,
  type FlaggerSessionContext,
} from "../conversation.ts"
import { getFlaggerStrategy, isLlmCapableStrategy } from "../flagger-strategies/index.ts"
import type { FlaggerSlug } from "../flagger-strategies/types.ts"
import type { SessionHint } from "../hints/types.ts"
import { FlaggerRepository } from "../ports/flagger-repository.ts"
import { isUserCentricReflagInapplicable } from "../reflag.ts"
import { classifyConversationForFlaggerUseCase } from "./run-flagger.ts"

export interface ClassifySessionFlaggerInput {
  readonly organizationId: string
  readonly projectId: string
  readonly sessionId: string
  readonly flaggerSlug: string
  readonly hints?: readonly SessionHint[] | undefined
}

/**
 * Everything a persisted judgement needs beyond the outcome itself. Shared by
 * the negative annotation path and by a verdict flagger's positive result,
 * which is a published score with no annotation to draft.
 */
export interface JudgedSessionAnchors {
  readonly feedback?: string | undefined
  readonly messageIndex?: number | undefined
  /** Latitude trace of the classification generation, so the saved score can point back at the decision. */
  readonly flaggerTraceId?: string | undefined
  readonly contentHash: string
  readonly latestTraceId: string
  readonly sessionStartedAt: string
  readonly simulationId: string | null
  readonly scoringArtifactVersion: string
}

/**
 * `matched` stays the annotation discriminant: it is true only when there is a
 * negative annotation to draft and publish. `outcome` carries the finer
 * screening vocabulary, so a verdict flagger's `success` is a real judgement
 * with anchors even though it writes no annotation.
 */
export type ClassifySessionFlaggerResult =
  | {
      readonly matched: false
      readonly outcome: "unmatched" | "indeterminate" | "notApplicable"
    }
  | ({ readonly matched: false; readonly outcome: "success" } & JudgedSessionAnchors)
  | ({ readonly matched: true; readonly outcome: "matched" | "failure" } & JudgedSessionAnchors)

// Fails NotFoundError when the session is missing or has no traces: the scores
// CH sync stores trace_id as FixedString(32), so a fabricated non-trace anchor
// would poison the write path.
export const loadFlaggerSessionContextUseCase = Effect.fn("flaggers.loadFlaggerSessionContext")(function* (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly sessionId: string
}) {
  const organizationId = OrganizationId(input.organizationId)
  const projectId = ProjectId(input.projectId)

  const sessionRepository = yield* SessionRepository
  const session = yield* sessionRepository.findBySessionId({
    organizationId,
    projectId,
    sessionId: SessionId(input.sessionId),
  })

  const fallbackTraceId = session.traceIds[session.traceIds.length - 1]
  if (fallbackTraceId === undefined) {
    return yield* new NotFoundError({ entity: "SessionTraces", id: input.sessionId })
  }

  const latestTraceId =
    session.traceIds.length === 1
      ? fallbackTraceId
      : yield* Effect.gen(function* () {
          const spanRepository = yield* SpanRepository
          return yield* spanRepository
            .findLatestOutputTraceId({ organizationId, projectId, traceIds: session.traceIds.map(TraceId) })
            .pipe(
              Effect.map((latest) => latest ?? fallbackTraceId),
              Effect.catch(() => Effect.succeed(fallbackTraceId)),
            )
        })

  return buildFlaggerSessionContext(session, latestTraceId)
})

// The LLM classification pass for one session×flagger; a confirmed match
// carries the content anchor the draft/save steps dedup and bill against.
export const classifySessionFlaggerUseCase = Effect.fn("flaggers.classifySessionFlagger")(function* (
  input: ClassifySessionFlaggerInput,
) {
  yield* Effect.annotateCurrentSpan("flagger.organizationId", input.organizationId)
  yield* Effect.annotateCurrentSpan("flagger.projectId", input.projectId)
  yield* Effect.annotateCurrentSpan("flagger.sessionId", input.sessionId)
  yield* Effect.annotateCurrentSpan("flagger.flaggerSlug", input.flaggerSlug)

  const strategy = getFlaggerStrategy(input.flaggerSlug)
  if (!strategy || !isLlmCapableStrategy(strategy)) {
    return { matched: false, outcome: "notApplicable" } satisfies ClassifySessionFlaggerResult
  }

  const flaggerRepo = yield* FlaggerRepository
  const flagger = yield* flaggerRepo.findByProjectAndSlug({
    projectId: ProjectId(input.projectId),
    slug: input.flaggerSlug as FlaggerSlug,
  })
  if (!flagger || !flagger.enabled) {
    return { matched: false, outcome: "notApplicable" } satisfies ClassifySessionFlaggerResult
  }

  const context: FlaggerSessionContext | null = yield* loadFlaggerSessionContextUseCase(input).pipe(
    Effect.catchTag("NotFoundError", () =>
      Effect.annotateCurrentSpan("flagger.skipped", "session-not-found").pipe(Effect.as(null)),
    ),
  )
  if (context === null) {
    return { matched: false, outcome: "indeterminate" } satisfies ClassifySessionFlaggerResult
  }

  if (isUserCentricReflagInapplicable(context.conversation.tags, strategy.classifiesAssistantResponseOnly)) {
    yield* Effect.annotateCurrentSpan("flagger.skipped", "not-applicable")
    return { matched: false, outcome: "notApplicable" } satisfies ClassifySessionFlaggerResult
  }

  if (!strategy.hasRequiredContext(context.conversation)) {
    yield* Effect.annotateCurrentSpan("flagger.skipped", "missing-context")
    return { matched: false, outcome: "indeterminate" } satisfies ClassifySessionFlaggerResult
  }

  const result = yield* classifyConversationForFlaggerUseCase({
    organizationId: input.organizationId,
    projectId: input.projectId,
    flaggerSlug: input.flaggerSlug,
    conversation: context.conversation,
    sessionId: input.sessionId,
    traceId: context.latestTraceId,
    hints: input.hints,
  })

  // A verdict flagger's `success` needs the same anchors as a match: it
  // persists a passed score. `indeterminate` and `notApplicable` persist
  // nothing and stay coverage decisions.
  if (result.verdict === "indeterminate" || result.verdict === "notApplicable") {
    return { matched: false, outcome: result.verdict } satisfies ClassifySessionFlaggerResult
  }

  if (!result.matched && result.verdict === undefined) {
    return {
      matched: false,
      outcome: result.classificationOutcome ?? "unmatched",
    } satisfies ClassifySessionFlaggerResult
  }

  const contentHash = yield* computeFlaggerAnchorContentHash(context.conversation, result.messageIndex)
  const session = context.session
  const anchors = {
    feedback: result.feedback,
    messageIndex: result.messageIndex,
    flaggerTraceId: result.flaggerTraceId,
    contentHash,
    latestTraceId: context.latestTraceId,
    sessionStartedAt: session.startTime.toISOString(),
    simulationId: session.simulationId === "" ? null : session.simulationId,
    scoringArtifactVersion: FLAGGER_SCORING_ARTIFACT_VERSION,
  } satisfies JudgedSessionAnchors

  if (result.verdict === "success") {
    return { matched: false, outcome: "success", ...anchors } satisfies ClassifySessionFlaggerResult
  }

  return {
    matched: true,
    outcome: result.verdict === "failure" ? "failure" : "matched",
    ...anchors,
  } satisfies ClassifySessionFlaggerResult
})
