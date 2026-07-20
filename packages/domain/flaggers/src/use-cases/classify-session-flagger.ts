import { NotFoundError, OrganizationId, ProjectId, SessionId, TraceId } from "@domain/shared"
import { SessionRepository, SpanRepository } from "@domain/spans"
import { Effect } from "effect"
import {
  buildFlaggerSessionContext,
  computeFlaggerAnchorContentHash,
  type FlaggerSessionContext,
} from "../conversation.ts"
import { getFlaggerStrategy, isLlmCapableStrategy } from "../flagger-strategies/index.ts"
import type { FlaggerSlug } from "../flagger-strategies/types.ts"
import type { SessionHint } from "../hints/types.ts"
import { FlaggerRepository } from "../ports/flagger-repository.ts"
import { classifyConversationForFlaggerUseCase } from "./run-flagger.ts"

export interface ClassifySessionFlaggerInput {
  readonly organizationId: string
  readonly projectId: string
  readonly sessionId: string
  readonly flaggerSlug: string
  readonly hints?: readonly SessionHint[] | undefined
}

export type ClassifySessionFlaggerResult =
  | { readonly matched: false }
  | {
      readonly matched: true
      readonly feedback?: string | undefined
      readonly messageIndex?: number | undefined
      readonly contentHash: string
      readonly latestTraceId: string
      readonly sessionStartedAt: string
      readonly simulationId: string | null
    }

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
    return { matched: false } satisfies ClassifySessionFlaggerResult
  }

  const flaggerRepo = yield* FlaggerRepository
  const flagger = yield* flaggerRepo.findByProjectAndSlug({
    projectId: ProjectId(input.projectId),
    slug: input.flaggerSlug as FlaggerSlug,
  })
  if (!flagger || !flagger.enabled) {
    return { matched: false } satisfies ClassifySessionFlaggerResult
  }

  const context: FlaggerSessionContext | null = yield* loadFlaggerSessionContextUseCase(input).pipe(
    Effect.catchTag("NotFoundError", () =>
      Effect.annotateCurrentSpan("flagger.skipped", "session-not-found").pipe(Effect.as(null)),
    ),
  )
  if (context === null) {
    return { matched: false } satisfies ClassifySessionFlaggerResult
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

  if (!result.matched) {
    return { matched: false } satisfies ClassifySessionFlaggerResult
  }

  const contentHash = yield* computeFlaggerAnchorContentHash(context.conversation, result.messageIndex)
  const session = context.session

  return {
    matched: true,
    feedback: result.feedback,
    messageIndex: result.messageIndex,
    contentHash,
    latestTraceId: context.latestTraceId,
    sessionStartedAt: session.startTime.toISOString(),
    simulationId: session.simulationId === "" ? null : session.simulationId,
  } satisfies ClassifySessionFlaggerResult
})
