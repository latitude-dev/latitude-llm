import type { ScoreDraftClosedError, ScoreDraftUpdateConflictError } from "@domain/scores"
import { type BadRequestError, deterministicSampling, ProjectId, type RepositoryError, TraceId } from "@domain/shared"
import { Effect } from "effect"
import { computeFlaggerAnchorContentHash, type FlaggerSessionContext } from "../conversation.ts"
import {
  type FlaggerStrategy,
  type FlaggerSuppressor,
  getFlaggerStrategy,
  isLlmCapableStrategy,
  listFlaggerStrategySlugs,
  suppressorSlug,
} from "../flagger-strategies/index.ts"
import { shouldSkipUserCentricFlaggerForEmbeddedSamples } from "../embedded-samples.ts"
import { gatherSessionHintsUseCase } from "../hints/gatherers.ts"
import { isPositiveSessionHintKind, type SessionHint, type SessionHintKind } from "../hints/types.ts"
import { isReflagSuppressed } from "../reflag.ts"
import { loadFlaggerSessionContextUseCase } from "./classify-session-flagger.ts"
import { type FlaggerCacheEntry, getProjectFlaggersUseCase } from "./get-project-flaggers.ts"
import { upsertFlaggerAnnotationScore } from "./upsert-flagger-annotation-score.ts"

export interface ScreenSessionFlaggersInput {
  readonly organizationId: string
  readonly projectId: string
  readonly sessionId: string
  readonly analysisHash?: string | undefined // part of the sampling key, so each generation re-rolls
}

export type FlaggerClassificationReason = "hinted" | "sampled"

export type CheckFlaggerLlmRateLimit = (args: {
  readonly organizationId: string
  readonly flaggerSlug: string
  readonly reason: FlaggerClassificationReason
  readonly hasPositiveHints: boolean
}) => Effect.Effect<boolean>

export interface ScreenSessionFlaggersDeps {
  readonly checkRateLimit: CheckFlaggerLlmRateLimit
}

export type SessionFlaggerDroppedReason =
  | "missing-context"
  | "unmatched"
  | "sampled-out"
  | "rate-limited"
  | "disabled"
  | "missing-flagger"
  | "embedded-samples"

export type SessionFlaggerDecision =
  | { readonly slug: string; readonly action: "matched-issue" }
  | {
      readonly slug: string
      readonly action: "classify"
      readonly reason: FlaggerClassificationReason
      readonly hintKinds: readonly SessionHintKind[]
    }
  | {
      readonly slug: string
      readonly action: "dropped"
      readonly reason: SessionFlaggerDroppedReason
      readonly hinted?: boolean
      readonly hintKinds?: readonly SessionHintKind[]
    }
  | { readonly slug: string; readonly action: "suppressed"; readonly suppressedBy: string }
  | { readonly slug: string; readonly action: "failed" }

export interface FlaggerClassificationRequest {
  readonly flaggerId: string
  readonly flaggerSlug: string
  readonly reason: FlaggerClassificationReason
}

export interface ScreenSessionFlaggersResult {
  readonly skipped?: "session-not-found" | "reflag-suppressed"
  readonly decisions: readonly SessionFlaggerDecision[]
  readonly classifications: readonly FlaggerClassificationRequest[]
  readonly hints: readonly SessionHint[]
  readonly latestTraceId: string | null
}

export type ScreenSessionFlaggersError =
  | RepositoryError
  | BadRequestError
  | ScoreDraftClosedError
  | ScoreDraftUpdateConflictError

// The deterministic screening pass: runs on 100% of sessions after moments,
// writes `matched` scores directly, routes `hinted`/`sampled` to the LLM pass.
export const screenSessionFlaggersUseCase = Effect.fn("flaggers.screenSessionFlaggers")(function* (
  input: ScreenSessionFlaggersInput,
  deps: ScreenSessionFlaggersDeps,
) {
  yield* Effect.annotateCurrentSpan("organizationId", input.organizationId)
  yield* Effect.annotateCurrentSpan("projectId", input.projectId)
  yield* Effect.annotateCurrentSpan("sessionId", input.sessionId)

  const projectId = ProjectId(input.projectId)

  const context = yield* loadFlaggerSessionContextUseCase(input).pipe(
    Effect.catchTag("NotFoundError", () => Effect.succeed(null)),
  )

  if (context === null) {
    yield* Effect.annotateCurrentSpan("flaggers.skipped", "session-not-found")
    return {
      skipped: "session-not-found",
      decisions: [],
      classifications: [],
      hints: [],
      latestTraceId: null,
    } satisfies ScreenSessionFlaggersResult
  }

  const session = context.session

  // Recursion break: bounds flagger-on-flagger to a single level while still
  // letting the (unmarked) production flagger telemetry be flagged.
  if (isReflagSuppressed(session.tags)) {
    yield* Effect.annotateCurrentSpan("flaggers.skipped", "reflag-suppressed")
    return {
      skipped: "reflag-suppressed",
      decisions: [],
      classifications: [],
      hints: [],
      latestTraceId: null,
    } satisfies ScreenSessionFlaggersResult
  }

  const latestTraceId = context.latestTraceId

  const hints = yield* gatherSessionHintsUseCase({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    session,
    conversation: context.conversation,
  })
  const hasPositiveHints = hints.some((hint) => isPositiveSessionHintKind(hint.kind))

  const flaggers = yield* getProjectFlaggersUseCase({
    organizationId: input.organizationId,
    projectId,
  })
  const flaggerBySlug = new Map(flaggers.map((flagger) => [flagger.slug, flagger]))

  const slugs = listFlaggerStrategySlugs()
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

  const classifications: FlaggerClassificationRequest[] = []

  const runOne = (slug: string, suppressorDecisions: ReadonlyMap<string, SessionFlaggerDecision>) =>
    screenOneStrategy({
      slug,
      input,
      context,
      hints,
      hasPositiveHints,
      flagger: flaggerBySlug.get(slug) ?? null,
      deps,
      suppressorDecisions,
      classifications,
    }).pipe(
      Effect.catch((error) =>
        Effect.gen(function* () {
          yield* Effect.logError("Flagger screening strategy failed", {
            slug,
            organizationId: input.organizationId,
            projectId: input.projectId,
            sessionId: input.sessionId,
            error,
          })
          return { slug, action: "failed" } satisfies SessionFlaggerDecision
        }),
      ),
    )

  const phase1Decisions = yield* Effect.forEach(phase1Slugs, (slug) => runOne(slug, EMPTY_MAP), {
    concurrency: "unbounded",
  })

  const phase1DecisionBySlug = new Map(phase1Decisions.map((decision) => [decision.slug, decision]))

  const phase2Decisions = yield* Effect.forEach(phase2Slugs, (slug) => runOne(slug, phase1DecisionBySlug), {
    concurrency: "unbounded",
  })

  return {
    decisions: [...phase1Decisions, ...phase2Decisions],
    classifications,
    hints,
    latestTraceId,
  } satisfies ScreenSessionFlaggersResult
})

const EMPTY_MAP: ReadonlyMap<string, SessionFlaggerDecision> = new Map()

// A suppressor edge triggers on the suppressor's deterministic match, or on a
// hinted outcome (started or rate-limited) — restricted to the edge's
// `whenHintedBy` kinds when the suppressed strategy names them, so a weak
// escalation lead does not mute it.
const doesSuppressorTrigger = (suppressor: FlaggerSuppressor, decision: SessionFlaggerDecision): boolean => {
  if (decision.action === "matched-issue") return true

  const firedKinds =
    decision.action === "classify" && decision.reason === "hinted"
      ? decision.hintKinds
      : decision.action === "dropped" && decision.reason === "rate-limited" && decision.hinted === true
        ? (decision.hintKinds ?? [])
        : null
  if (firedKinds === null) return false

  if (typeof suppressor === "string") return true
  return firedKinds.some((kind) => suppressor.whenHintedBy.includes(kind))
}

interface ScreenOneStrategyInput {
  readonly slug: string
  readonly input: ScreenSessionFlaggersInput
  readonly context: FlaggerSessionContext
  readonly hints: readonly SessionHint[]
  readonly hasPositiveHints: boolean
  readonly flagger: FlaggerCacheEntry | null
  readonly deps: ScreenSessionFlaggersDeps
  readonly suppressorDecisions: ReadonlyMap<string, SessionFlaggerDecision>
  readonly classifications: FlaggerClassificationRequest[]
}

const strategyHintKindsFired = (
  strategy: FlaggerStrategy,
  hints: readonly SessionHint[],
): readonly SessionHintKind[] => {
  if (!strategy.hintKinds || strategy.hintKinds.length === 0) return []
  const wanted = new Set(strategy.hintKinds)
  const fired = new Set<SessionHintKind>()
  for (const hint of hints) {
    // Positive hints never trigger `hinted` — they only deprioritize sampling.
    if (wanted.has(hint.kind) && !isPositiveSessionHintKind(hint.kind)) fired.add(hint.kind)
  }
  return [...fired]
}

const isHintedStrategy = (
  strategy: FlaggerStrategy,
  hints: readonly SessionHint[],
  context: FlaggerSessionContext,
  fired: readonly SessionHintKind[],
): boolean => {
  if (strategy.isHintedBy) return strategy.isHintedBy(hints, context.conversation)
  return fired.length > 0
}

const screenOneStrategy = (args: ScreenOneStrategyInput) =>
  Effect.gen(function* () {
    const strategy = getFlaggerStrategy(args.slug)
    if (!strategy) {
      return { slug: args.slug, action: "dropped", reason: "unmatched" } satisfies SessionFlaggerDecision
    }

    const flagger = args.flagger
    if (flagger === null) {
      return { slug: args.slug, action: "dropped", reason: "missing-flagger" } satisfies SessionFlaggerDecision
    }

    if (!flagger.enabled) {
      return { slug: args.slug, action: "dropped", reason: "disabled" } satisfies SessionFlaggerDecision
    }

    if (strategy.suppressedBy) {
      for (const suppressor of strategy.suppressedBy) {
        const slug = suppressorSlug(suppressor)
        const decision = args.suppressorDecisions.get(slug)
        if (decision && doesSuppressorTrigger(suppressor, decision)) {
          return {
            slug: args.slug,
            action: "suppressed",
            suppressedBy: slug,
          } satisfies SessionFlaggerDecision
        }
      }
    }

    if (!strategy.hasRequiredContext(args.context.conversation)) {
      return { slug: args.slug, action: "dropped", reason: "missing-context" } satisfies SessionFlaggerDecision
    }

    if (shouldSkipUserCentricFlaggerForEmbeddedSamples(strategy, args.context.conversation.tags)) {
      return { slug: args.slug, action: "dropped", reason: "embedded-samples" } satisfies SessionFlaggerDecision
    }

    const result = strategy.detectDeterministically
      ? strategy.detectDeterministically(args.context.conversation)
      : ({ kind: "unmatched" } as const)

    if (result.kind === "matched") {
      return yield* handleMatched(args, result.feedback, result.messageIndex)
    }

    return yield* handleUnmatched(args, flagger, strategy)
  })

const handleMatched = (args: ScreenOneStrategyInput, feedback: string, messageIndex?: number) =>
  Effect.gen(function* () {
    const session = args.context.session
    const contentHash = yield* computeFlaggerAnchorContentHash(args.context.conversation, messageIndex)

    yield* upsertFlaggerAnnotationScore({
      projectId: session.projectId,
      traceId: TraceId(args.context.latestTraceId),
      sessionId: session.sessionId,
      simulationId: session.simulationId === "" ? null : session.simulationId,
      feedback,
      flaggerSlug: args.slug,
      messageIndex,
      contentHash,
    })

    return { slug: args.slug, action: "matched-issue" } satisfies SessionFlaggerDecision
  })

const handleUnmatched = (args: ScreenOneStrategyInput, flagger: FlaggerCacheEntry, strategy: FlaggerStrategy) =>
  Effect.gen(function* () {
    if (!isLlmCapableStrategy(strategy)) {
      return { slug: args.slug, action: "dropped", reason: "unmatched" } satisfies SessionFlaggerDecision
    }

    const fired = strategyHintKindsFired(strategy, args.hints)
    const hinted = isHintedStrategy(strategy, args.hints, args.context, fired)

    if (!hinted) {
      const sampled = yield* Effect.promise(() =>
        deterministicSampling({
          sampling: flagger.sampling,
          keyParts: [
            args.input.organizationId,
            args.input.projectId,
            args.slug,
            args.input.sessionId,
            args.input.analysisHash ?? "",
          ],
        }),
      )

      if (!sampled) {
        return { slug: args.slug, action: "dropped", reason: "sampled-out" } satisfies SessionFlaggerDecision
      }
    }

    const reason: FlaggerClassificationReason = hinted ? "hinted" : "sampled"
    const allowed = yield* args.deps.checkRateLimit({
      organizationId: args.input.organizationId,
      flaggerSlug: args.slug,
      reason,
      hasPositiveHints: args.hasPositiveHints,
    })

    if (!allowed) {
      return {
        slug: args.slug,
        action: "dropped",
        reason: "rate-limited",
        hinted,
        ...(hinted ? { hintKinds: fired } : {}),
      } satisfies SessionFlaggerDecision
    }

    args.classifications.push({ flaggerId: flagger.flaggerId, flaggerSlug: args.slug, reason })

    return { slug: args.slug, action: "classify", reason, hintKinds: fired } satisfies SessionFlaggerDecision
  })
