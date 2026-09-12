import {
  type FlaggerFindingKey,
  type FlaggerPath,
  type SafetyFindingKind,
  ScoreRepository,
  type ScoringArtifactVersion,
  writeScoreUseCase,
} from "@domain/scores"
import type { ProjectId, ScoreId, SessionId, TraceId } from "@domain/shared"
import { Effect } from "effect"
import { FLAGGER_DRAFT_DEFAULTS } from "../constants.ts"
import { writesSafetyAnnotation } from "../entities/safety-verdict.ts"

interface FlaggerScoreInput {
  readonly id?: ScoreId
  readonly projectId: ProjectId
  readonly traceId: TraceId
  readonly sessionId: string | null
  readonly simulationId: string | null
  readonly feedback: string
  readonly flaggerSlug: string
  readonly messageIndex?: number | undefined
  readonly contentHash?: string | undefined
  readonly flaggerFindingKey?: FlaggerFindingKey | undefined
  readonly flaggerPath?: FlaggerPath | undefined
  readonly scoringArtifactVersion?: ScoringArtifactVersion | undefined
  /** Session analysis generation this judgement belongs to. */
  readonly analysisHash?: string | undefined
  /** Absent for deterministic detections and cached generations — neither leaves a trace to grade. */
  readonly flaggerTraceId?: string | undefined
  readonly safetyFindingKind?: SafetyFindingKind | undefined
}

const flaggerScoreMetadata = (input: FlaggerScoreInput) => ({
  rawFeedback: input.feedback,
  flaggerSlug: input.flaggerSlug,
  ...(input.messageIndex !== undefined ? { messageIndex: input.messageIndex } : {}),
  ...(input.contentHash !== undefined ? { contentHash: input.contentHash } : {}),
  ...(input.flaggerTraceId !== undefined ? { flaggerTraceId: input.flaggerTraceId } : {}),
  ...(input.flaggerFindingKey !== undefined ? { flaggerFindingKey: input.flaggerFindingKey } : {}),
  ...(input.flaggerPath !== undefined ? { flaggerPath: input.flaggerPath } : {}),
  ...(input.scoringArtifactVersion !== undefined ? { scoringArtifactVersion: input.scoringArtifactVersion } : {}),
  ...(input.analysisHash !== undefined ? { analysisHash: input.analysisHash } : {}),
  ...(input.safetyFindingKind !== undefined ? { safetyFindingKind: input.safetyFindingKind } : {}),
})

type FlaggerScoreResult =
  | { readonly status: "existing"; readonly scoreId: string }
  | { readonly status: "written"; readonly scoreId: string }

// One published SYSTEM score per (projectId, sessionId, flaggerSlug, contentHash):
// the anchored content hash stays stable across re-screens and compaction
// renumbering, unlike feedback text or message indices.
export const findFlaggerAnnotationByAnchor = (input: {
  readonly projectId: ProjectId
  readonly sessionId: string
  readonly flaggerSlug: string
  readonly contentHash: string
}) =>
  Effect.gen(function* () {
    const scoreRepository = yield* ScoreRepository
    const published = yield* scoreRepository.listPublishedSystemAnnotationsBySession({
      projectId: input.projectId,
      sessionId: input.sessionId as SessionId,
      flaggerSlug: input.flaggerSlug,
    })

    return (
      published.find((score) => {
        const metadata = score.metadata as { flaggerSlug?: string; contentHash?: string } | null
        return metadata?.flaggerSlug === input.flaggerSlug && metadata?.contentHash === input.contentHash
      }) ?? null
    )
  })

/**
 * Dedups + writes the canonical flagger-authored annotation score. Shared by
 * the deterministic screening matched path and the LLM save path so they can't
 * drift. Two dedup layers: exact feedback per trace, then the content anchor
 * above (LLM feedback is nondeterministic across re-runs).
 */
export const upsertFlaggerAnnotationScore = (input: FlaggerScoreInput) =>
  Effect.gen(function* () {
    const scoreRepository = yield* ScoreRepository
    const existing = yield* scoreRepository.findPublishedSystemAnnotationByTraceAndFeedback({
      projectId: input.projectId,
      traceId: input.traceId,
      feedback: input.feedback,
    })

    if (existing !== null) {
      return { status: "existing", scoreId: existing.id } satisfies FlaggerScoreResult
    }

    if (input.contentHash && input.sessionId) {
      const anchored = yield* findFlaggerAnnotationByAnchor({
        projectId: input.projectId,
        sessionId: input.sessionId,
        flaggerSlug: input.flaggerSlug,
        contentHash: input.contentHash,
      })

      if (anchored !== null) {
        return { status: "existing", scoreId: anchored.id } satisfies FlaggerScoreResult
      }
    }

    const written = yield* writeScoreUseCase({
      ...(input.id !== undefined ? { id: input.id } : {}),
      projectId: input.projectId,
      sourceType: "annotation",
      sourceId: "SYSTEM",
      sessionId: input.sessionId,
      traceId: input.traceId,
      spanId: null,
      simulationId: input.simulationId,
      signalId: null,
      annotatorId: null,
      value: FLAGGER_DRAFT_DEFAULTS.value,
      passed: FLAGGER_DRAFT_DEFAULTS.passed,
      feedback: input.feedback,
      metadata: flaggerScoreMetadata(input),
      error: null,
      draftedAt: null,
    })

    return { status: "written", scoreId: written.id } satisfies FlaggerScoreResult
  })

/**
 * One verdict per (project, session, flagger, analysis generation).
 *
 * Verdict flaggers re-judge the whole session every generation, so they cannot
 * use the anchor dedup above: that key deliberately survives re-screens, and a
 * judge citing the same message twice would make the second generation's
 * verdict look like a duplicate of the first. A session that succeeded, gained
 * turns, and then failed must record both.
 */
const findFlaggerVerdictByGeneration = (input: {
  readonly projectId: ProjectId
  readonly sessionId: string
  readonly flaggerSlug: string
  readonly analysisHash: string
}) =>
  Effect.gen(function* () {
    const scoreRepository = yield* ScoreRepository
    const published = yield* scoreRepository.listPublishedSystemAnnotationsBySession({
      projectId: input.projectId,
      sessionId: input.sessionId as SessionId,
      flaggerSlug: input.flaggerSlug,
    })

    return (
      published.find((score) => {
        const metadata = score.metadata as { flaggerSlug?: string; analysisHash?: string } | null
        return metadata?.flaggerSlug === input.flaggerSlug && metadata?.analysisHash === input.analysisHash
      }) ?? null
    )
  })

export interface UpsertFlaggerVerdictScoreInput extends FlaggerScoreInput {
  readonly sessionId: string
  readonly analysisHash: string
  readonly verdict: "success" | "failure"
}

/**
 * Writes a verdict flagger's published SYSTEM score. A `success` is a passed
 * score, which signal discovery already rejects, so a positive reference
 * verdict never opens a signal.
 */
export const upsertFlaggerVerdictScore = (input: UpsertFlaggerVerdictScoreInput) =>
  Effect.gen(function* () {
    const existing = yield* findFlaggerVerdictByGeneration({
      projectId: input.projectId,
      sessionId: input.sessionId,
      flaggerSlug: input.flaggerSlug,
      analysisHash: input.analysisHash,
    })

    if (existing !== null) {
      return { status: "existing", scoreId: existing.id } satisfies FlaggerScoreResult
    }

    const passed = input.verdict === "success"
    const written = yield* writeScoreUseCase({
      projectId: input.projectId,
      sourceType: "annotation",
      sourceId: "SYSTEM",
      sessionId: input.sessionId,
      traceId: input.traceId,
      spanId: null,
      simulationId: input.simulationId,
      signalId: null,
      annotatorId: null,
      value: passed ? 1 : 0,
      passed,
      feedback: input.feedback,
      metadata: flaggerScoreMetadata(input),
      error: null,
      draftedAt: null,
    })

    return { status: "written", scoreId: written.id } satisfies FlaggerScoreResult
  })

/**
 * One Safety score per project, session, flagger, and finding kind.
 *
 * Neither existing rule fits. The anchor rule survives re-screens, so a session
 * whose finding escalated from an attempt to a confirmed compliance would keep
 * only the attempt. The per-generation rule would write the same jailbreak
 * attempt again every time the session is re-analysed, duplicating the card and
 * the signal occurrence. The finding kind is the fact, it is monotone within a
 * session, and an escalation is genuinely new information, so it is the
 * identity. `analysisHash` stays on the score as provenance rather than as the
 * key.
 */
const findSafetyFindingByKind = (input: {
  readonly projectId: ProjectId
  readonly sessionId: string
  readonly flaggerSlug: string
  readonly safetyFindingKind: SafetyFindingKind
}) =>
  Effect.gen(function* () {
    const scoreRepository = yield* ScoreRepository
    const published = yield* scoreRepository.listPublishedSystemAnnotationsBySession({
      projectId: input.projectId,
      sessionId: input.sessionId as SessionId,
      flaggerSlug: input.flaggerSlug,
    })

    return (
      published.find((score) => {
        const metadata = score.metadata as { flaggerSlug?: string; safetyFindingKind?: string } | null
        return metadata?.flaggerSlug === input.flaggerSlug && metadata?.safetyFindingKind === input.safetyFindingKind
      }) ?? null
    )
  })

export interface UpsertSafetyFindingScoreInput extends FlaggerScoreInput {
  readonly sessionId: string
  readonly safetyFindingKind: SafetyFindingKind
}

/**
 * Writes a Safety detector's structured finding.
 *
 * The finding kind decides the polarity: exposure the detector already
 * annotated and confirmed harm fail, while a successful defense and
 * user-authored personal data pass. A passed score is already rejected by
 * signal discovery and excluded from the annotation list, so neither opens a
 * signal nor shows up as a card nobody wrote.
 */
export const upsertSafetyFindingScore = (input: UpsertSafetyFindingScoreInput) =>
  Effect.gen(function* () {
    const existing = yield* findSafetyFindingByKind({
      projectId: input.projectId,
      sessionId: input.sessionId,
      flaggerSlug: input.flaggerSlug,
      safetyFindingKind: input.safetyFindingKind,
    })

    if (existing !== null) {
      return { status: "existing", scoreId: existing.id } satisfies FlaggerScoreResult
    }

    const passed = !writesSafetyAnnotation(input.safetyFindingKind)
    const written = yield* writeScoreUseCase({
      projectId: input.projectId,
      sourceType: "annotation",
      sourceId: "SYSTEM",
      sessionId: input.sessionId,
      traceId: input.traceId,
      spanId: null,
      simulationId: input.simulationId,
      signalId: null,
      annotatorId: null,
      value: passed ? 1 : 0,
      passed,
      feedback: input.feedback,
      metadata: flaggerScoreMetadata(input),
      error: null,
      draftedAt: null,
    })

    return { status: "written", scoreId: written.id } satisfies FlaggerScoreResult
  })
