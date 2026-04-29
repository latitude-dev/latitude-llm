import type { QueuePublishError } from "@domain/queue"
import type { ScoreDraftClosedError, ScoreDraftUpdateConflictError } from "@domain/scores"
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
  type FlaggerStrategy,
  getFlaggerStrategy,
  isLlmCapableStrategy,
  listFlaggerStrategySlugs,
} from "../flagger-strategies/index.ts"
import { type FlaggerCacheEntry, getProjectFlaggersUseCase } from "./get-project-flaggers.ts"
import { upsertFlaggerAnnotationScore } from "./upsert-flagger-annotation-score.ts"

export interface ProcessFlaggersInput {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
}

export type FlaggerEnqueueReason = "sampled" | "ambiguous"

export type EnqueueFlaggerWorkflowStart = (args: {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly flaggerId: string
  readonly flaggerSlug: string
  readonly reason: FlaggerEnqueueReason
}) => Effect.Effect<void, QueuePublishError>

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

export const processFlaggersUseCase = Effect.fn("flaggers.processFlaggers")(function* (
  input: ProcessFlaggersInput,
  deps: ProcessFlaggersDeps,
) {
  yield* Effect.annotateCurrentSpan("organizationId", input.organizationId)
  yield* Effect.annotateCurrentSpan("projectId", input.projectId)
  yield* Effect.annotateCurrentSpan("traceId", input.traceId)

  const traceRepository = yield* TraceRepository
  const slugs = listFlaggerStrategySlugs()

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

  const phase1Slugs: string[] = []
  const phase2Slugs: string[] = []
  for (const slug of slugs) {
    const strategy = getFlaggerStrategy(slug)
    if (strategy?.suppressedBy && strategy.suppressedBy.length > 0) {
      phase2Slugs.push(slug)
    } else {
      phase1Slugs.push(slug)
    }
  }

  const runOne = (slug: string, suppressorTriggeredSlugs: ReadonlySet<string>) =>
    processOneStrategy({
      slug,
      trace,
      flagger: flaggerBySlug.get(slug) ?? null,
      organizationId: input.organizationId,
      projectId: input.projectId,
      traceId: input.traceId,
      deps,
      suppressorTriggeredSlugs,
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

  const phase1SuppressorSlugs = new Set(phase1Decisions.filter(isSuppressingDecision).map((decision) => decision.slug))

  const phase2Decisions = yield* Effect.forEach(phase2Slugs, (slug) => runOne(slug, phase1SuppressorSlugs), {
    concurrency: "unbounded",
  })

  return {
    decisions: [...phase1Decisions, ...phase2Decisions],
  } satisfies ProcessFlaggersResult
})

const EMPTY_SET: ReadonlySet<string> = new Set()

const isSuppressingDecision = (decision: StrategyDecision): boolean => {
  if (decision.action === "matched-issue") return true
  if (decision.action === "enqueued" && decision.reason === "ambiguous") return true
  if (decision.action !== "dropped") return false

  return decision.reason === "rate-limited" || decision.reason === "ambiguous-without-llm"
}

interface ProcessOneStrategyInput {
  readonly slug: string
  readonly trace: TraceDetail
  readonly flagger: FlaggerCacheEntry | null
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly deps: ProcessFlaggersDeps
  readonly suppressorTriggeredSlugs: ReadonlySet<string>
}

const processOneStrategy = (input: ProcessOneStrategyInput) =>
  Effect.gen(function* () {
    const strategy = getFlaggerStrategy(input.slug)
    if (!strategy) {
      return { slug: input.slug, action: "dropped", reason: "no-match" } satisfies StrategyDecision
    }

    const flagger = input.flagger
    if (flagger === null) {
      return { slug: input.slug, action: "dropped", reason: "missing-flagger" } satisfies StrategyDecision
    }

    if (!flagger.enabled) {
      return { slug: input.slug, action: "dropped", reason: "disabled" } satisfies StrategyDecision
    }

    if (strategy.suppressedBy) {
      for (const suppressor of strategy.suppressedBy) {
        if (input.suppressorTriggeredSlugs.has(suppressor)) {
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
        return yield* handleMatched(input, result.feedback)
      case "no-match":
        return yield* handleNoMatch(input, flagger, strategy)
      case "ambiguous":
        return yield* handleAmbiguous(input, flagger, strategy)
    }
  })

const handleMatched = (input: ProcessOneStrategyInput, feedback: string) =>
  Effect.gen(function* () {
    const simulationId = input.trace.simulationId === "" ? null : input.trace.simulationId

    yield* upsertFlaggerAnnotationScore({
      projectId: input.trace.projectId,
      traceId: input.trace.traceId,
      sessionId: input.trace.sessionId,
      simulationId,
      feedback,
    })

    return { slug: input.slug, action: "matched-issue" } satisfies StrategyDecision
  })

const handleNoMatch = (input: ProcessOneStrategyInput, flagger: FlaggerCacheEntry, strategy: FlaggerStrategy) =>
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

const handleAmbiguous = (input: ProcessOneStrategyInput, flagger: FlaggerCacheEntry, strategy: FlaggerStrategy) =>
  Effect.gen(function* () {
    if (!isLlmCapableStrategy(strategy)) {
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
