import { type ScoreDraftClosedError, type ScoreDraftUpdateConflictError, writeScoreUseCase } from "@domain/scores"
import type { BadRequestError, RepositoryError } from "@domain/shared"
import type { TraceDetail } from "@domain/spans"
import { Effect } from "effect"
import {
  type DeterministicSystemMatch,
  detectEmptyResponseSystemQueue,
  detectOutputSchemaValidationSystemQueue,
  detectToolCallErrorsSystemQueue,
} from "../helpers.ts"

export interface RunDeterministicSystemMatchersInput {
  readonly trace: TraceDetail
}

export interface RunDeterministicSystemMatchersResult {
  readonly matchedSlugs: readonly string[]
}

export type RunDeterministicSystemMatchersError =
  | RepositoryError
  | BadRequestError
  | ScoreDraftClosedError
  | ScoreDraftUpdateConflictError

interface DeterministicMatcherEntry {
  readonly slug: string
  readonly detect: (trace: TraceDetail) => DeterministicSystemMatch
}

export const DETERMINISTIC_SYSTEM_MATCHERS: readonly DeterministicMatcherEntry[] = [
  { slug: "tool-call-errors", detect: detectToolCallErrorsSystemQueue },
  { slug: "output-schema-validation", detect: detectOutputSchemaValidationSystemQueue },
  { slug: "empty-response", detect: detectEmptyResponseSystemQueue },
]

/**
 * Runs the deterministic system matchers against a trace and writes a published,
 * system-authored annotation score for each match.
 *
 * The scores use `source="annotation"`, `sourceId="SYSTEM"`, `draftedAt=null`,
 * `annotatorId=null`, `passed=false`, so the `ScoreCreated` event makes them
 * immediately eligible for `issues:discovery` and the feedback text drives
 * clustering via embedding + BM25.
 */
export const runDeterministicSystemMatchersUseCase = Effect.fn("annotationQueues.runDeterministicSystemMatchers")(
  function* (input: RunDeterministicSystemMatchersInput) {
    const { trace } = input
    yield* Effect.annotateCurrentSpan("organizationId", trace.organizationId)
    yield* Effect.annotateCurrentSpan("projectId", trace.projectId)
    yield* Effect.annotateCurrentSpan("traceId", trace.traceId)

    const simulationId = trace.simulationId === "" ? null : trace.simulationId
    const matchedSlugs: string[] = []

    for (const { slug, detect } of DETERMINISTIC_SYSTEM_MATCHERS) {
      const result = detect(trace)
      if (!result.matched) continue

      yield* writeScoreUseCase({
        projectId: trace.projectId,
        source: "annotation",
        sourceId: "SYSTEM",
        sessionId: trace.sessionId,
        traceId: trace.traceId,
        spanId: null,
        simulationId,
        issueId: null,
        annotatorId: null,
        value: 0,
        passed: false,
        feedback: result.feedback,
        metadata: { rawFeedback: result.feedback },
        error: null,
        draftedAt: null,
      })

      matchedSlugs.push(slug)
    }

    return { matchedSlugs } satisfies RunDeterministicSystemMatchersResult
  },
)
