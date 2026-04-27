import type { QueuePublishError } from "@domain/queue"
import { type ScoreDraftClosedError, type ScoreDraftUpdateConflictError, writeScoreUseCase } from "@domain/scores"
import {
  type BadRequestError,
  deterministicSampling,
  OrganizationId,
  ProjectId,
  type RepositoryError,
  TraceId,
} from "@domain/shared"
import { type TraceDetail, TraceRepository } from "@domain/spans"
import { Effect } from "effect"

import {
  getQueueStrategy,
  isLlmCapableStrategy,
  listQueueStrategySlugs,
  type QueueStrategy,
} from "../flagger-strategies/index.ts"
import { type FlaggerCacheEntry, getProjectFlaggersUseCase } from "./get-project-flaggers.ts"

export interface ProcessFlaggersInput {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
}

export type FlaggerEnqueueReason = "sampled" | "ambiguous"

/**
 * Callback for enqueueing an LLM-classification workflow-start job.
 * The worker wires this to the `start-flagger-workflow` publisher.
 *
 * Failures must propagate (not be swallowed by the wiring) so the per-strategy
 * `runOne` catch can record `action: "failed"` for the affected slug. A
 * silently-swallowed publish would otherwise produce a misleading
 * `action: "enqueued"` decision for a trace that was never queued.
 */
export type EnqueueFlaggerWorkflowStart = (args: {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly flaggerId: string
  readonly flaggerSlug: string
  readonly reason: FlaggerEnqueueReason
}) => Effect.Effect<void, QueuePublishError>

/**
 * Callback for checking per-{org,slug} rate limits on ambiguous enqueues.
 * Returns `true` if the request is under the limit and should proceed.
 * The worker wires this to a Redis-backed limiter (fail-open).
 */
export type CheckAmbiguousRateLimit = (args: {
  readonly organizationId: string
  readonly flaggerSlug: string
}) => Effect.Effect<boolean>

export interface ProcessFlaggersDeps {
  readonly enqueueWorkflowStart: EnqueueFlaggerWorkflowStart
  readonly checkAmbiguousRateLimit: CheckAmbiguousRateLimit
}

export type StrategyDecision =
  | { readonly slug: string; readonly action: "matched-issue" }
  | { readonly slug: string; readonly action: "enqueued"; readonly reason: FlaggerEnqueueReason }
  | { readonly slug: string; readonly action: "dropped"; readonly reason: DroppedReason }
  | { readonly slug: string; readonly action: "suppressed"; readonly suppressedBy: string }
  | { readonly slug: string; readonly action: "failed" }

export type DroppedReason =
  | "missing-context"
  | "no-match"
  | "sampled-out"
  | "rate-limited"
  | "no-llm-capability"
  | "ambiguous-without-llm"
  | "disabled"
  | "missing-flagger"

export interface ProcessFlaggersResult {
  readonly decisions: readonly StrategyDecision[]
}

export type ProcessFlaggersError =
  | RepositoryError
  | BadRequestError
  | ScoreDraftClosedError
  | ScoreDraftUpdateConflictError

/**
 * Runs the deterministic detection phase of every registered flagger strategy
 * against a single trace and dispatches the outcomes:
 *
 *   matched    → write a flagger-authored published score directly
 *                (`source = "flagger"`, `sourceId = flagger.id`). Issue
 *                discovery picks it up via the `ScoreCreated` fan-out.
 *   no-match   → for LLM-capable strategies, apply per-strategy sampling
 *                from the flagger row. Sampled-in → enqueue
 *                `start-flagger-workflow` (reason: "sampled").
 *   ambiguous  → for LLM-capable strategies, check per-{org,slug} rate limit.
 *                Under limit → enqueue `start-flagger-workflow` (reason: "ambiguous").
 *
 * The per-project flagger row also gates the entire strategy: when
 * `flagger.enabled === false`, every branch short-circuits to a `disabled`
 * dropped decision. A missing flagger row is treated defensively (logged,
 * dropped) — provisioning runs on `ProjectCreated` so this only happens
 * when the registry adds a strategy without a backfill.
 *
 * Per-strategy failures are isolated: a broken detector for one strategy does
 * not affect the rest. The outer caller (the worker) is expected to swallow
 * errors from the outer load step too — losing a trace's flaggers is
 * preferable to redelivering the whole job.
 */
export const processFlaggersUseCase = Effect.fn("annotationQueues.processFlaggers")(function* (
  input: ProcessFlaggersInput,
  deps: ProcessFlaggersDeps,
) {
  yield* Effect.annotateCurrentSpan("organizationId", input.organizationId)
  yield* Effect.annotateCurrentSpan("projectId", input.projectId)
  yield* Effect.annotateCurrentSpan("traceId", input.traceId)

  const traceRepository = yield* TraceRepository
  const trace = yield* traceRepository.findByTraceId({
    organizationId: OrganizationId(input.organizationId),
    projectId: ProjectId(input.projectId),
    traceId: TraceId(input.traceId),
  })

  const flaggers = yield* getProjectFlaggersUseCase({
    organizationId: input.organizationId,
    projectId: ProjectId(input.projectId),
  })
  const flaggerBySlug = new Map(flaggers.map((flagger) => [flagger.slug, flagger]))

  const slugs = listQueueStrategySlugs()
  const phase1Slugs: string[] = []
  const phase2Slugs: string[] = []
  for (const slug of slugs) {
    const strategy = getQueueStrategy(slug)
    if (strategy?.suppressedBy && strategy.suppressedBy.length > 0) {
      phase2Slugs.push(slug)
    } else {
      phase1Slugs.push(slug)
    }
  }

  const runOne = (slug: string, suppressorMatchedSlugs: ReadonlySet<string>) =>
    processOneStrategy({
      slug,
      trace,
      flagger: flaggerBySlug.get(slug) ?? null,
      organizationId: input.organizationId,
      projectId: input.projectId,
      traceId: input.traceId,
      deps,
      suppressorMatchedSlugs,
    }).pipe(
      Effect.catch((error) =>
        Effect.gen(function* () {
          yield* Effect.logError("Flagger strategy failed", {
            slug,
            organizationId: input.organizationId,
            projectId: input.projectId,
            traceId: input.traceId,
            error,
          })
          return { slug, action: "failed" } satisfies StrategyDecision
        }),
      ),
    )

  const phase1Decisions = yield* Effect.forEach(phase1Slugs, (slug) => runOne(slug, EMPTY_SET), {
    concurrency: "unbounded",
  })

  const phase1MatchedSlugs = new Set(phase1Decisions.filter((d) => d.action === "matched-issue").map((d) => d.slug))

  const phase2Decisions = yield* Effect.forEach(phase2Slugs, (slug) => runOne(slug, phase1MatchedSlugs), {
    concurrency: "unbounded",
  })

  return {
    decisions: [...phase1Decisions, ...phase2Decisions],
  } satisfies ProcessFlaggersResult
})

const EMPTY_SET: ReadonlySet<string> = new Set()

interface ProcessOneStrategyInput {
  readonly slug: string
  readonly trace: TraceDetail
  readonly flagger: FlaggerCacheEntry | null
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly deps: ProcessFlaggersDeps
  readonly suppressorMatchedSlugs: ReadonlySet<string>
}

const processOneStrategy = (input: ProcessOneStrategyInput) =>
  Effect.gen(function* () {
    const strategy = getQueueStrategy(input.slug)
    if (!strategy) {
      return { slug: input.slug, action: "dropped", reason: "no-match" } satisfies StrategyDecision
    }

    const flagger = input.flagger
    if (flagger === null) {
      yield* Effect.logWarning("Missing flagger row for registered strategy — dropping", {
        slug: input.slug,
        organizationId: input.organizationId,
        projectId: input.projectId,
        traceId: input.traceId,
      })
      return { slug: input.slug, action: "dropped", reason: "missing-flagger" } satisfies StrategyDecision
    }

    if (!flagger.enabled) {
      return { slug: input.slug, action: "dropped", reason: "disabled" } satisfies StrategyDecision
    }

    if (strategy.suppressedBy) {
      for (const suppressor of strategy.suppressedBy) {
        if (input.suppressorMatchedSlugs.has(suppressor)) {
          return {
            slug: input.slug,
            action: "suppressed",
            suppressedBy: suppressor,
          } satisfies StrategyDecision
        }
      }
    }

    if (!strategy.hasRequiredContext(input.trace)) {
      return { slug: input.slug, action: "dropped", reason: "missing-context" } satisfies StrategyDecision
    }

    const result = strategy.detectDeterministically
      ? strategy.detectDeterministically(input.trace)
      : ({ kind: "no-match" } as const)

    switch (result.kind) {
      case "matched":
        return yield* handleMatched(input, flagger, result.feedback)
      case "no-match":
        return yield* handleNoMatch(input, flagger, strategy)
      case "ambiguous":
        return yield* handleAmbiguous(input, flagger, strategy)
    }
  })

const handleMatched = (input: ProcessOneStrategyInput, flagger: FlaggerCacheEntry, feedback: string) =>
  Effect.gen(function* () {
    const simulationId = input.trace.simulationId === "" ? null : input.trace.simulationId

    yield* writeScoreUseCase({
      projectId: input.trace.projectId,
      source: "flagger",
      sourceId: flagger.flaggerId,
      sessionId: input.trace.sessionId,
      traceId: input.trace.traceId,
      spanId: null,
      simulationId,
      issueId: null,
      annotatorId: null,
      value: 0,
      passed: false,
      feedback,
      metadata: { rawFeedback: feedback },
      error: null,
      draftedAt: null,
    })

    return { slug: input.slug, action: "matched-issue" } satisfies StrategyDecision
  })

const handleNoMatch = (input: ProcessOneStrategyInput, flagger: FlaggerCacheEntry, strategy: QueueStrategy) =>
  Effect.gen(function* () {
    if (!isLlmCapableStrategy(strategy)) {
      return { slug: input.slug, action: "dropped", reason: "no-match" } satisfies StrategyDecision
    }

    const sampled = yield* Effect.promise(() =>
      deterministicSampling({
        sampling: flagger.sampling,
        keyParts: [input.organizationId, input.projectId, input.slug, input.traceId],
      }),
    )

    if (!sampled) {
      return { slug: input.slug, action: "dropped", reason: "sampled-out" } satisfies StrategyDecision
    }

    yield* input.deps.enqueueWorkflowStart({
      organizationId: input.organizationId,
      projectId: input.projectId,
      traceId: input.traceId,
      flaggerId: flagger.flaggerId,
      flaggerSlug: input.slug,
      reason: "sampled",
    })

    return { slug: input.slug, action: "enqueued", reason: "sampled" } satisfies StrategyDecision
  })

const handleAmbiguous = (input: ProcessOneStrategyInput, flagger: FlaggerCacheEntry, strategy: QueueStrategy) =>
  Effect.gen(function* () {
    if (!isLlmCapableStrategy(strategy)) {
      yield* Effect.logWarning("Ambiguous detection from non-LLM-capable strategy — dropping", {
        slug: input.slug,
        organizationId: input.organizationId,
        traceId: input.traceId,
      })
      return { slug: input.slug, action: "dropped", reason: "ambiguous-without-llm" } satisfies StrategyDecision
    }

    const allowed = yield* input.deps.checkAmbiguousRateLimit({
      organizationId: input.organizationId,
      flaggerSlug: input.slug,
    })

    if (!allowed) {
      return { slug: input.slug, action: "dropped", reason: "rate-limited" } satisfies StrategyDecision
    }

    yield* input.deps.enqueueWorkflowStart({
      organizationId: input.organizationId,
      projectId: input.projectId,
      traceId: input.traceId,
      flaggerId: flagger.flaggerId,
      flaggerSlug: input.slug,
      reason: "ambiguous",
    })

    return { slug: input.slug, action: "enqueued", reason: "ambiguous" } satisfies StrategyDecision
  })
