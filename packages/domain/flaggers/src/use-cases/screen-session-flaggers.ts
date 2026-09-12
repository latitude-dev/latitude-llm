import type { ScoreDraftClosedError, ScoreDraftUpdateConflictError } from "@domain/scores"
import {
  type BadRequestError,
  deterministicSampling,
  OrganizationId,
  ProjectId,
  type RepositoryError,
  SessionId,
  TraceId,
} from "@domain/shared"
import { type CryptoError, hash } from "@repo/utils"
import { Effect } from "effect"
import { FLAGGER_SCREENING_ARTIFACT_VERSION, FLAGGER_SCREENING_RETENTION_DAYS } from "../constants.ts"
import { computeFlaggerAnchorContentHash, type FlaggerSessionContext } from "../conversation.ts"
import { flaggerSlugSchema } from "../entities/flagger.ts"
import type {
  FlaggerScreeningDecision,
  FlaggerScreeningOutcome,
  FlaggerScreeningSelection,
  FlaggerScreeningSelectionReason,
} from "../entities/flagger-screening-decision.ts"
import { isSafetySuiteSlug, SAFETY_SUITE_KEY, SAFETY_SUITE_SLUGS } from "../entities/safety-suite.ts"
import {
  type FlaggerStrategy,
  type FlaggerSuppressor,
  getFlaggerStrategy,
  isLlmCapableStrategy,
  listFlaggerStrategySlugs,
  readDeterministicFlaggerFindings,
  suppressorSlug,
} from "../flagger-strategies/index.ts"
import { gatherSessionHintsUseCase } from "../hints/gatherers.ts"
import { isPositiveSessionHintKind, type SessionHint, type SessionHintKind } from "../hints/types.ts"
import { FlaggerScreeningDecisionRepository } from "../ports/flagger-screening-decision-repository.ts"
import { isReflagSuppressed, isUserCentricReflagInapplicable } from "../reflag.ts"
import { loadFlaggerSessionContextUseCase } from "./classify-session-flagger.ts"
import { type FlaggerCacheEntry, getProjectFlaggersUseCase } from "./get-project-flaggers.ts"
import { upsertFlaggerAnnotationScore } from "./upsert-flagger-annotation-score.ts"

export interface ScreenSessionFlaggersInput {
  readonly organizationId: string
  readonly projectId: string
  readonly sessionId: string
  readonly analysisHash: string // part of the sampling key, so each generation re-rolls
  readonly attempt: number
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

/**
 * How a session entered or missed a flagger's examined population, when the
 * flagger's own sampling configuration is not the answer. A Safety suite member
 * is selected by the suite's draw, so it records the suite's mechanism and
 * probability rather than its own.
 */
export interface FlaggerSelectionEvidence {
  readonly reason: FlaggerScreeningSelectionReason
  readonly inclusionProbability: number
}

export type SessionFlaggerDecision =
  | { readonly slug: string; readonly action: "matched-issue" }
  | {
      readonly slug: string
      readonly action: "classify"
      readonly reason: FlaggerClassificationReason
      readonly hintKinds: readonly SessionHintKind[]
      readonly selection?: FlaggerSelectionEvidence
    }
  | {
      readonly slug: string
      readonly action: "dropped"
      readonly reason: SessionFlaggerDroppedReason
      readonly hinted?: boolean
      readonly hintKinds?: readonly SessionHintKind[]
      readonly selection?: FlaggerSelectionEvidence
    }
  | { readonly slug: string; readonly action: "suppressed"; readonly suppressedBy: string }
  | { readonly slug: string; readonly action: "failed" }

export interface FlaggerClassificationRequest {
  readonly flaggerId: string
  readonly flaggerSlug: string
  readonly reason: FlaggerClassificationReason
  readonly screeningSelection: FlaggerScreeningSelection
}

type PendingFlaggerClassificationRequest = Omit<FlaggerClassificationRequest, "screeningSelection">

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
  | CryptoError

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

  const classifications: PendingFlaggerClassificationRequest[] = []

  const safetySuite = yield* resolveSafetySuiteSelection({
    input,
    context,
    hints,
    hasPositiveHints,
    flaggerBySlug,
    deps,
  })

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
      safetySuite,
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

  const decisions = [...phase1Decisions, ...phase2Decisions]
  const screeningDecisions = yield* Effect.forEach(decisions, (decision) =>
    buildInitialScreeningDecision({
      input,
      decision,
      flagger: flaggerBySlug.get(decision.slug) ?? null,
    }),
  )
  const screeningDecisionRepository = yield* FlaggerScreeningDecisionRepository
  yield* screeningDecisionRepository.saveMany(screeningDecisions)

  const classificationRequests = classifications.map((classification) => ({
    ...classification,
    screeningSelection: toSelection(findScreeningDecision(screeningDecisions, classification.flaggerSlug)),
  }))

  return {
    decisions,
    classifications: classificationRequests,
    hints,
    latestTraceId,
  } satisfies ScreenSessionFlaggersResult
})

const EMPTY_MAP: ReadonlyMap<string, SessionFlaggerDecision> = new Map()

/**
 * The Safety suite's one selection for this session and analysis generation.
 *
 * Resolved before any member is screened, because both the draw and the rate
 * limit have to answer once: a per-slug draw would make the joint examined
 * population the product of two rates, and a per-slug limiter could admit one
 * member and drop the other, spending a model call on a session the estimator
 * must then discard as unexamined.
 */
interface SafetySuiteSelection {
  readonly selected: boolean
  readonly rateLimited: boolean
  readonly hinted: boolean
  readonly inclusionProbability: number
}

interface ResolveSafetySuiteSelectionInput {
  readonly input: ScreenSessionFlaggersInput
  readonly context: FlaggerSessionContext
  readonly hints: readonly SessionHint[]
  readonly hasPositiveHints: boolean
  readonly flaggerBySlug: ReadonlyMap<string, FlaggerCacheEntry>
  readonly deps: ScreenSessionFlaggersDeps
}

const isSafetySuiteMemberEligible = (slug: string, args: ResolveSafetySuiteSelectionInput): boolean => {
  const strategy = getFlaggerStrategy(slug)
  const flagger = args.flaggerBySlug.get(slug)
  if (!strategy || !flagger?.enabled) return false
  if (isUserCentricReflagInapplicable(args.context.conversation.tags, strategy.classifiesAssistantResponseOnly)) {
    return false
  }
  return strategy.hasRequiredContext(args.context.conversation)
}

const resolveSafetySuiteSelection = (args: ResolveSafetySuiteSelectionInput) =>
  Effect.gen(function* () {
    const members = SAFETY_SUITE_SLUGS.filter((slug) => isSafetySuiteMemberEligible(slug, args))
    if (members.length === 0) return null

    // The lowest configured rate is the only one every member satisfies, so a
    // project that turns one detector down turns the whole suite down with it.
    const sampling = Math.min(...members.map((slug) => args.flaggerBySlug.get(slug)?.sampling ?? 0))
    const hinted = members.some((slug) => {
      const strategy = getFlaggerStrategy(slug)
      if (!strategy) return false
      return isHintedStrategy(strategy, args.hints, args.context, strategyHintKindsFired(strategy, args.hints))
    })

    if (!hinted) {
      const sampled = yield* Effect.promise(() =>
        deterministicSampling({
          sampling,
          keyParts: [
            args.input.organizationId,
            args.input.projectId,
            SAFETY_SUITE_KEY,
            args.input.sessionId,
            args.input.analysisHash,
          ],
        }),
      )
      if (!sampled) {
        return {
          selected: false,
          rateLimited: false,
          hinted: false,
          inclusionProbability: sampling / 100,
        } satisfies SafetySuiteSelection
      }
    }

    const allowed = yield* args.deps.checkRateLimit({
      organizationId: args.input.organizationId,
      flaggerSlug: SAFETY_SUITE_KEY,
      reason: hinted ? "hinted" : "sampled",
      hasPositiveHints: args.hasPositiveHints,
    })

    return {
      selected: true,
      rateLimited: !allowed,
      hinted,
      inclusionProbability: hinted ? 1 : sampling / 100,
    } satisfies SafetySuiteSelection
  })

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
  readonly classifications: PendingFlaggerClassificationRequest[]
  readonly safetySuite: SafetySuiteSelection | null
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

    if (
      isUserCentricReflagInapplicable(args.context.conversation.tags, strategy.classifiesAssistantResponseOnly) ||
      !strategy.hasRequiredContext(args.context.conversation)
    ) {
      return { slug: args.slug, action: "dropped", reason: "missing-context" } satisfies SessionFlaggerDecision
    }

    if (strategy.readDeterministically) {
      const read = yield* readDeterministicFlaggerFindings(strategy, {
        scope: {
          organizationId: OrganizationId(args.input.organizationId),
          projectId: args.context.session.projectId,
          sessionId: args.context.session.sessionId,
        },
        conversation: args.context.conversation,
      })

      if (!read.readable) {
        return { slug: args.slug, action: "dropped", reason: "missing-context" } satisfies SessionFlaggerDecision
      }

      const finding = strategy.selectDeterministicDiscoveryFinding
        ? strategy.selectDeterministicDiscoveryFinding(read.findings)
        : (read.findings[0] ?? null)

      if (finding) {
        return yield* handleMatched(
          args,
          finding.feedback,
          "messageIndex" in finding ? finding.messageIndex : undefined,
          finding.findingKey,
        )
      }

      return yield* handleUnmatched(args, flagger, strategy)
    }

    const result = strategy.detectDeterministically?.(args.context.conversation) ?? ({ kind: "unmatched" } as const)

    if (result.kind === "matched") {
      return yield* handleMatched(args, result.feedback, result.messageIndex)
    }

    return yield* handleUnmatched(args, flagger, strategy)
  })

const handleMatched = (args: ScreenOneStrategyInput, feedback: string, messageIndex?: number, findingKey?: string) =>
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
      analysisHash: args.input.analysisHash,
      ...(findingKey !== undefined ? { flaggerFindingKey: findingKey, flaggerPath: "deterministic" } : {}),
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

    if (isSafetySuiteSlug(args.slug) && args.safetySuite) {
      return handleSafetySuiteMember(args, flagger, args.safetySuite, hinted, fired)
    }

    if (!hinted) {
      const sampled = yield* Effect.promise(() =>
        deterministicSampling({
          sampling: flagger.sampling,
          keyParts: [
            args.input.organizationId,
            args.input.projectId,
            args.slug,
            args.input.sessionId,
            args.input.analysisHash,
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

/**
 * Applies the suite's one selection to one of its members.
 *
 * Whether this member was hinted stays its own: a session hinted only for
 * personal data must not make the jailbreaking decision look injection-hinted,
 * because that is what mutes the refusal detector. A member the suite carried
 * along was still examined with certainty, which is what `uniform-sample`
 * means, so it records that rather than an ordinary sample it never drew.
 */
const handleSafetySuiteMember = (
  args: ScreenOneStrategyInput,
  flagger: FlaggerCacheEntry,
  suite: SafetySuiteSelection,
  hinted: boolean,
  fired: readonly SessionHintKind[],
): SessionFlaggerDecision => {
  const selection: FlaggerSelectionEvidence = {
    reason: hinted ? "hinted" : suite.hinted ? "uniform-sample" : "ordinary-sample",
    inclusionProbability: suite.inclusionProbability,
  }

  if (!suite.selected) {
    return { slug: args.slug, action: "dropped", reason: "sampled-out", selection }
  }

  if (suite.rateLimited) {
    return {
      slug: args.slug,
      action: "dropped",
      reason: "rate-limited",
      hinted,
      ...(hinted ? { hintKinds: fired } : {}),
      selection: { ...selection, reason: "rate-limited" },
    }
  }

  const reason: FlaggerClassificationReason = hinted ? "hinted" : "sampled"
  args.classifications.push({ flaggerId: flagger.flaggerId, flaggerSlug: args.slug, reason })

  return { slug: args.slug, action: "classify", reason, hintKinds: fired, selection }
}

interface BuildInitialScreeningDecisionInput {
  readonly input: ScreenSessionFlaggersInput
  readonly decision: SessionFlaggerDecision
  readonly flagger: FlaggerCacheEntry | null
}

const toSelection = ({
  attempt: _attempt,
  version: _version,
  outcome: _outcome,
  createdAt: _createdAt,
  ...selection
}: FlaggerScreeningDecision): FlaggerScreeningSelection => selection

const findScreeningDecision = (decisions: readonly FlaggerScreeningDecision[], flaggerSlug: string) => {
  const decision = decisions.find((candidate) => candidate.flaggerSlug === flaggerSlug)
  if (!decision) throw new Error(`Missing screening decision for ${flaggerSlug}`)
  return decision
}

const selectionFacts = (
  decision: SessionFlaggerDecision,
  flagger: FlaggerCacheEntry | null,
): {
  readonly selected: boolean
  readonly reason: FlaggerScreeningSelectionReason
  readonly inclusionProbability?: number | undefined
  readonly hintKinds: readonly SessionHintKind[]
  readonly outcome?: FlaggerScreeningOutcome | undefined
} => {
  if (decision.action === "matched-issue") {
    return { selected: true, reason: "deterministic", inclusionProbability: 1, hintKinds: [], outcome: "matched" }
  }
  if (decision.action === "classify") {
    return {
      selected: true,
      reason: decision.selection?.reason ?? (decision.reason === "hinted" ? "hinted" : "ordinary-sample"),
      inclusionProbability:
        decision.selection?.inclusionProbability ?? (decision.reason === "hinted" ? 1 : (flagger?.sampling ?? 0) / 100),
      hintKinds: decision.hintKinds,
    }
  }
  if (decision.action === "suppressed") {
    return { selected: false, reason: "skipped", hintKinds: [] }
  }
  if (decision.action === "failed") {
    return { selected: true, reason: "deterministic", inclusionProbability: 1, hintKinds: [], outcome: "error" }
  }
  if (decision.reason === "sampled-out") {
    return {
      selected: false,
      reason: decision.selection?.reason ?? "ordinary-sample",
      inclusionProbability: decision.selection?.inclusionProbability ?? (flagger?.sampling ?? 0) / 100,
      hintKinds: [],
    }
  }
  if (decision.reason === "rate-limited") {
    return {
      selected: false,
      reason: "rate-limited",
      inclusionProbability:
        decision.selection?.inclusionProbability ?? (decision.hinted === true ? 1 : (flagger?.sampling ?? 0) / 100),
      hintKinds: decision.hintKinds ?? [],
    }
  }
  const strategy = getFlaggerStrategy(decision.slug)
  if (decision.reason === "unmatched" && strategy && !isLlmCapableStrategy(strategy)) {
    return { selected: true, reason: "deterministic", inclusionProbability: 1, hintKinds: [], outcome: "unmatched" }
  }
  // A detector that could never have judged this session is not applicable to
  // it, which is different from the policy skip `skipped` names. It also lets a
  // Safety suite complete on the member that could read the session.
  if (decision.reason === "missing-context") {
    return { selected: false, reason: "skipped", hintKinds: [], outcome: "notApplicable" }
  }
  return { selected: false, reason: "skipped", hintKinds: [] }
}

const buildInitialScreeningDecision = Effect.fn("flaggers.buildInitialScreeningDecision")(function* (
  args: BuildInitialScreeningDecisionInput,
) {
  const decisionId = yield* hash({
    namespace: "flagger-screening-decision-v1",
    organizationId: args.input.organizationId,
    projectId: args.input.projectId,
    sessionId: args.input.sessionId,
    flaggerSlug: args.decision.slug,
    analysisHash: args.input.analysisHash,
  })

  return {
    decisionId,
    organizationId: OrganizationId(args.input.organizationId),
    projectId: ProjectId(args.input.projectId),
    sessionId: SessionId(args.input.sessionId),
    flaggerSlug: flaggerSlugSchema.parse(args.decision.slug),
    analysisHash: args.input.analysisHash,
    scoringArtifactVersion: FLAGGER_SCREENING_ARTIFACT_VERSION,
    attempt: args.input.attempt,
    version: 1,
    ...selectionFacts(args.decision, args.flagger),
    createdAt: new Date(),
    retentionDays: FLAGGER_SCREENING_RETENTION_DAYS,
  } satisfies FlaggerScreeningDecision
})
