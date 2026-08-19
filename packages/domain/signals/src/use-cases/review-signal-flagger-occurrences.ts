import { type QueuePublishError, QueuePublisher } from "@domain/queue"
import { type AnnotationScore, ScoreRepository } from "@domain/scores"
import { ProjectId, type RepositoryError, SignalId, type SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { SIGNAL_FEEDBACK_OCCURRENCE_SAMPLE_LIMIT, SIGNAL_FEEDBACK_THROTTLE_MS } from "../constants.ts"
import { SignalRepository } from "../ports/signal-repository.ts"

export interface ReviewSignalFlaggerOccurrencesInput {
  readonly organizationId: string
  readonly projectId: string
  readonly signalId: string
}

export type ReviewSignalFlaggerOccurrencesResult =
  | { readonly action: "skipped"; readonly reason: "signal-not-found" | "not-graded" }
  | {
      readonly action: "fanned-out"
      readonly scanned: number
      readonly flaggerRows: number
      readonly withoutFlaggerTrace: number
      readonly published: number
    }

export type ReviewSignalFlaggerOccurrencesError = QueuePublishError | RepositoryError

interface FlaggerOccurrenceTarget {
  readonly flaggerTraceId: string
  readonly flaggerSlug: string
}

const toFlaggerOccurrenceTarget = (score: AnnotationScore): FlaggerOccurrenceTarget | null => {
  if (score.sourceId !== "SYSTEM") return null
  const { flaggerSlug, flaggerTraceId } = score.metadata
  if (flaggerSlug === undefined || flaggerTraceId === undefined) return null
  return { flaggerTraceId, flaggerSlug }
}

/**
 * Selection half of the feedback fan-out: turns one graded signal into one
 * grading job per flagger generation that detected it.
 *
 * The signal's own row is the source of truth for the verdict, so a stale event
 * payload can never carry a different one than the row holds. Rows predating the
 * flagger-trace pointer and deterministic detections have no generation to grade
 * and are counted rather than published.
 */
export const reviewSignalFlaggerOccurrencesUseCase = (
  input: ReviewSignalFlaggerOccurrencesInput,
): Effect.Effect<
  ReviewSignalFlaggerOccurrencesResult,
  ReviewSignalFlaggerOccurrencesError,
  QueuePublisher | ScoreRepository | SignalRepository | SqlClient
> =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("signalId", input.signalId)

    const projectId = ProjectId(input.projectId)
    const signalId = SignalId(input.signalId)
    const signalRepository = yield* SignalRepository
    const signal = yield* signalRepository
      .findById(signalId)
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))

    if (signal === null) {
      return { action: "skipped", reason: "signal-not-found" } as const
    }
    const verdict = signal.feedback
    if (verdict === null) {
      return { action: "skipped", reason: "not-graded" } as const
    }

    const scoreRepository = yield* ScoreRepository
    const occurrences = yield* scoreRepository.listBySignalId({
      projectId,
      signalId,
      source: "annotation",
      options: { limit: SIGNAL_FEEDBACK_OCCURRENCE_SAMPLE_LIMIT, draftMode: "exclude" },
    })

    const annotations = occurrences.items.filter((score): score is AnnotationScore => score.sourceType === "annotation")
    const flaggerRows = annotations.filter((score) => score.sourceId === "SYSTEM" && score.metadata.flaggerSlug)
    const targets = new Map<string, FlaggerOccurrenceTarget>()
    for (const score of flaggerRows) {
      const target = toFlaggerOccurrenceTarget(score)
      // Newest first, so the first row naming a trace is the one that keeps it.
      if (target !== null && !targets.has(target.flaggerTraceId)) targets.set(target.flaggerTraceId, target)
    }

    const publisher = yield* QueuePublisher
    yield* Effect.forEach(
      targets.values(),
      (target) =>
        publisher.publish(
          "issues",
          "reviewFlaggerOccurrence",
          {
            organizationId: input.organizationId,
            projectId: input.projectId,
            signalId: input.signalId,
            flaggerTraceId: target.flaggerTraceId,
            flaggerSlug: target.flaggerSlug,
            value: verdict.value,
            passed: verdict.passed,
            feedback: verdict.feedback,
          },
          {
            dedupeKey: `org:${input.organizationId}:issues:feedback-review:${input.signalId}:${target.flaggerTraceId}`,
            leadingThrottleMs: SIGNAL_FEEDBACK_THROTTLE_MS,
          },
        ),
      { concurrency: "unbounded", discard: true },
    )

    return {
      action: "fanned-out",
      scanned: occurrences.items.length,
      flaggerRows: flaggerRows.length,
      withoutFlaggerTrace: flaggerRows.filter((score) => score.metadata.flaggerTraceId === undefined).length,
      published: targets.size,
    } as const
  }).pipe(Effect.withSpan("issues.reviewSignalFlaggerOccurrences"))
