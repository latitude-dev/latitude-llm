import { AIMeteringScope } from "@domain/billing"
import { OrganizationId, ProjectId, SessionId } from "@domain/shared"
import { hash } from "@repo/utils"
import { Effect, Option } from "effect"
import {
  JEV_PRECLASSIFIER_ENABLED,
  JEV_PRECLASSIFIER_POLICY_VERSION,
  JEV_PRECLASSIFIER_RETENTION_DAYS,
  JEV_PRECLASSIFIER_STATE_BUILDER_VERSION,
} from "../constants.ts"
import type { FlaggerSessionContext } from "../conversation.ts"
import type { FlaggerScreeningSelectionReason } from "../entities/flagger-screening-decision.ts"
import type { JevPreclassifierObservation } from "../entities/jev-preclassifier-observation.ts"
import { isSafetySuiteSlug, SAFETY_SUITE_KEY } from "../entities/safety-suite.ts"
import { JEV_PRECLASSIFIER_STRATEGIES, type JevPreclassifierStrategy } from "../jev-preclassifier-strategies.ts"
import { JevPreclassifierObservationRepository } from "../ports/jev-preclassifier-observation-repository.ts"
import { JevShadowDecisionProvider, type JevShadowProviderResult } from "../ports/jev-shadow-decision-provider.ts"
import type { FlaggerCacheEntry } from "./get-project-flaggers.ts"
import type {
  CheckFlaggerLlmRateLimit,
  FlaggerSelectionEvidence,
  PendingFlaggerClassificationRequest,
  SessionFlaggerDecision,
} from "./screen-session-flaggers.ts"

export interface RunJevPreclassifierInput {
  readonly enabled?: boolean | undefined
  readonly organizationId: string
  readonly projectId: string
  readonly sessionId: string
  readonly analysisHash: string
  readonly context: FlaggerSessionContext
  readonly decisions: readonly SessionFlaggerDecision[]
  readonly classifications: readonly PendingFlaggerClassificationRequest[]
  readonly flaggerBySlug: ReadonlyMap<string, FlaggerCacheEntry>
  readonly hasPositiveHints: boolean
  readonly checkRateLimit: CheckFlaggerLlmRateLimit
  readonly workflowId: string
  readonly workflowRunId: string
  readonly activityId: string
  readonly activityAttempt: number
}

export interface RunJevPreclassifierResult {
  readonly decisions: readonly SessionFlaggerDecision[]
  readonly classifications: readonly PendingFlaggerClassificationRequest[]
}

const selectionReason = (decision: SessionFlaggerDecision): FlaggerScreeningSelectionReason => {
  if (decision.action === "matched-issue") return "deterministic"
  if (decision.action === "classify") {
    if (decision.reason === "hinted") return "hinted"
    if (decision.reason === "jev-preclassifier") return "jev-preclassifier"
    return "ordinary-sample"
  }
  if (decision.action === "dropped" && decision.reason === "rate-limited") return "rate-limited"
  if (decision.action === "dropped" && decision.reason === "sampled-out") return "ordinary-sample"
  return "skipped"
}

const screeningDecisionId = (input: RunJevPreclassifierInput, flaggerSlug: string) =>
  hash({
    namespace: "flagger-screening-decision-v1",
    organizationId: input.organizationId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    flaggerSlug,
    analysisHash: input.analysisHash,
  })

const observationId = (input: RunJevPreclassifierInput, flaggerSlug: string) =>
  hash({
    namespace: "flagger-jev-preclassifier-observation-v1",
    organizationId: input.organizationId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    flaggerSlug,
    analysisHash: input.analysisHash,
    workflowId: input.workflowId,
    workflowRunId: input.workflowRunId,
    activityId: input.activityId,
  })

const unknownResult: JevShadowProviderResult = {
  kind: "failure",
  errorCategory: "provider",
  provider: "unknown",
  requestedModel: null,
  resolvedModel: null,
  latencyMs: null,
  inputTokens: null,
  outputTokens: null,
}

const aboveThreshold = (probability: number | null, threshold: number) =>
  probability !== null && probability >= threshold

const isSampledOutDrop = (decision: SessionFlaggerDecision) =>
  decision.action === "dropped" && decision.reason === "sampled-out"

const withPropensityCorrection = (
  baseline: SessionFlaggerDecision,
  probability: number | null,
  threshold: number,
): SessionFlaggerDecision => {
  // Already examined (ordinary sample / hint / etc.) but Jev would also select
  // with certainty → union inclusion is 1. Update evidence only; do not enqueue
  // a duplicate classification.
  if (
    !aboveThreshold(probability, threshold) ||
    baseline.action !== "classify" ||
    baseline.selection?.inclusionProbability === 1
  ) {
    return baseline
  }
  const selection: FlaggerSelectionEvidence = {
    reason: baseline.selection?.reason ?? selectionReason(baseline),
    inclusionProbability: 1,
  }
  return { ...baseline, selection }
}

const buildJevGateIn = (args: { readonly strategy: JevPreclassifierStrategy; readonly flagger: FlaggerCacheEntry }) => {
  const selection: FlaggerSelectionEvidence = {
    reason: "jev-preclassifier",
    inclusionProbability: 1,
  }
  return {
    decision: {
      slug: args.strategy.slug,
      action: "classify" as const,
      reason: "jev-preclassifier" as const,
      hintKinds: [],
      selection,
    } satisfies SessionFlaggerDecision,
    classification: {
      flaggerId: args.flagger.flaggerId,
      flaggerSlug: args.strategy.slug,
      reason: "jev-preclassifier" as const,
    } satisfies PendingFlaggerClassificationRequest,
  }
}

const isGateCandidate = (args: {
  readonly input: RunJevPreclassifierInput
  readonly strategy: JevPreclassifierStrategy
  readonly baseline: SessionFlaggerDecision
  readonly probability: number | null
}) => {
  const { input, strategy, baseline, probability } = args
  if (!aboveThreshold(probability, strategy.threshold) || !isSampledOutDrop(baseline)) return false
  return input.flaggerBySlug.get(strategy.slug)?.enabled === true
}

const checkJevRateLimit = (input: RunJevPreclassifierInput, flaggerSlug: string) =>
  input.checkRateLimit({
    organizationId: input.organizationId,
    flaggerSlug,
    reason: "jev-preclassifier",
    hasPositiveHints: input.hasPositiveHints,
  })

const preclassifierDecision = (probability: number | null, threshold: number) => {
  if (probability === null) return "unknown" as const
  return probability >= threshold ? ("gated-in" as const) : ("below-threshold" as const)
}

type StrategyEvaluation = {
  readonly index: number
  readonly strategy: JevPreclassifierStrategy
  readonly baseline: SessionFlaggerDecision
  readonly decision: SessionFlaggerDecision
  readonly classification: PendingFlaggerClassificationRequest | null
  readonly observation: JevPreclassifierObservation
  readonly gateCandidate: boolean
}

const prepareStrategy = (args: {
  readonly input: RunJevPreclassifierInput
  readonly strategy: JevPreclassifierStrategy
  readonly result: JevShadowProviderResult
  readonly stateHash: string
}) =>
  Effect.gen(function* () {
    const { input, strategy, result, stateHash } = args
    const index = input.decisions.findIndex((decision) => decision.slug === strategy.slug)
    const baseline = input.decisions[index]
    if (index < 0 || !baseline) return null

    const probability = result.kind === "success" ? result.probability : null
    const decision = withPropensityCorrection(baseline, probability, strategy.threshold)
    const gateCandidate = isGateCandidate({ input, strategy, baseline, probability })
    const observation: JevPreclassifierObservation = {
      observationId: yield* observationId(input, strategy.slug),
      organizationId: OrganizationId(input.organizationId),
      projectId: ProjectId(input.projectId),
      sessionId: SessionId(input.sessionId),
      flaggerSlug: strategy.slug,
      screeningDecisionId: yield* screeningDecisionId(input, strategy.slug),
      analysisHash: input.analysisHash,
      workflowId: input.workflowId,
      workflowRunId: input.workflowRunId,
      activityId: input.activityId,
      activityAttempt: input.activityAttempt,
      stateHash,
      stateBuilderVersion: JEV_PRECLASSIFIER_STATE_BUILDER_VERSION,
      provider: result.provider,
      requestedModel: result.requestedModel,
      resolvedModel: result.resolvedModel,
      questionVersion: strategy.question.version,
      policyVersion: JEV_PRECLASSIFIER_POLICY_VERSION,
      threshold: strategy.threshold,
      probability,
      decision: preclassifierDecision(probability, strategy.threshold),
      errorCategory: result.kind === "failure" ? result.errorCategory : null,
      latencyMs: result.latencyMs,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      classifyAdded: false,
      selectionReason: selectionReason(decision),
      observedAt: new Date(),
      retentionDays: JEV_PRECLASSIFIER_RETENTION_DAYS,
    }
    return {
      index,
      strategy,
      baseline,
      decision,
      classification: null,
      observation,
      gateCandidate,
    } satisfies StrategyEvaluation
  })

const applyGate = (evaluation: StrategyEvaluation, input: RunJevPreclassifierInput): StrategyEvaluation => {
  const flagger = input.flaggerBySlug.get(evaluation.strategy.slug)
  if (!flagger?.enabled) return evaluation
  const gated = buildJevGateIn({ strategy: evaluation.strategy, flagger })
  return {
    ...evaluation,
    decision: gated.decision,
    classification: gated.classification,
    observation: {
      ...evaluation.observation,
      classifyAdded: true,
      selectionReason: "jev-preclassifier",
    },
  }
}

const resolveGates = (args: {
  readonly input: RunJevPreclassifierInput
  readonly evaluations: readonly (StrategyEvaluation | null)[]
}) =>
  Effect.gen(function* () {
    const { input, evaluations } = args
    const prepared = evaluations.filter((evaluation): evaluation is StrategyEvaluation => evaluation !== null)

    // Safety suite members share one draw and one rate-limit bucket. Gating only
    // a subset would leave the suite incomplete and burn budget the Safety
    // estimator must then discard — so admit all sampled-out enabled members
    // together under SAFETY_SUITE_KEY, and only when every one of them clears
    // the Jev threshold.
    const suitePrepared = prepared.filter((evaluation) => isSafetySuiteSlug(evaluation.strategy.slug))
    const suiteSampledOutEnabled = suitePrepared.filter((evaluation) => {
      if (!isSampledOutDrop(evaluation.baseline)) return false
      return input.flaggerBySlug.get(evaluation.strategy.slug)?.enabled === true
    })
    const suiteCandidates = suitePrepared.filter((evaluation) => evaluation.gateCandidate)
    const suiteGateSlugs = new Set<string>()
    if (suiteCandidates.length > 0 && suiteCandidates.length === suiteSampledOutEnabled.length) {
      const allowed = yield* checkJevRateLimit(input, SAFETY_SUITE_KEY)
      if (allowed) {
        for (const evaluation of suiteCandidates) suiteGateSlugs.add(evaluation.strategy.slug)
      }
    }

    const nonSuiteCandidates = prepared.filter(
      (evaluation) => evaluation.gateCandidate && !isSafetySuiteSlug(evaluation.strategy.slug),
    )
    const nonSuiteGateSlugs = new Set<string>()
    for (const evaluation of nonSuiteCandidates) {
      const allowed = yield* checkJevRateLimit(input, evaluation.strategy.slug)
      if (allowed) nonSuiteGateSlugs.add(evaluation.strategy.slug)
    }

    return prepared.map((evaluation) => {
      if (suiteGateSlugs.has(evaluation.strategy.slug) || nonSuiteGateSlugs.has(evaluation.strategy.slug)) {
        return applyGate(evaluation, input)
      }
      return evaluation
    })
  })

const meterJevPreclassifierCall = (results: Readonly<Record<string, JevShadowProviderResult>>) =>
  Effect.gen(function* () {
    const scope = yield* Effect.serviceOption(AIMeteringScope)
    if (Option.isNone(scope)) return

    // One HTTP decideMany → one llm-call. Usage is duplicated onto each question
    // result from the same response; pick any typesafe-ai sample for metadata.
    const sample = Object.values(results).find((result) => result.provider === "typesafe-ai")
    if (sample === undefined) return

    yield* scope.value.record({
      action: "llm-call",
      metadata: {
        provider: sample.provider,
        model: sample.resolvedModel ?? sample.requestedModel,
        pricing: "flat-fallback",
        source: "jev-preclassifier",
        ...(sample.inputTokens !== null ? { tokensInput: sample.inputTokens } : {}),
        ...(sample.outputTokens !== null ? { tokensOutput: sample.outputTokens } : {}),
      },
    })
  })

export const runJevPreclassifierUseCase = Effect.fn("flaggers.runJevPreclassifier")(function* (
  input: RunJevPreclassifierInput,
) {
  if ((input.enabled ?? JEV_PRECLASSIFIER_ENABLED) !== true) {
    return { decisions: input.decisions, classifications: input.classifications } satisfies RunJevPreclassifierResult
  }

  const provider = yield* JevShadowDecisionProvider
  const repository = yield* JevPreclassifierObservationRepository
  const strategies = Object.values(JEV_PRECLASSIFIER_STRATEGIES)
  const state = { conversation: input.context.conversation }
  const stateHash = yield* hash(state)
  const emptyResults: Readonly<Record<string, JevShadowProviderResult>> = {}
  const results: Readonly<Record<string, JevShadowProviderResult>> = yield* (
    provider.decideMany
      ? provider.decideMany({ questions: strategies.map((strategy) => strategy.question), state })
      : Effect.succeed(emptyResults)
  ).pipe(Effect.catch(() => Effect.succeed(emptyResults)))

  yield* meterJevPreclassifierCall(results)

  const decisions = [...input.decisions]
  const classifications = [...input.classifications]
  const prepared = yield* Effect.forEach(strategies, (strategy) =>
    prepareStrategy({
      input,
      strategy,
      result: results[strategy.question.id] ?? unknownResult,
      stateHash,
    }),
  )
  const evaluations = yield* resolveGates({ input, evaluations: prepared })
  const observations: JevPreclassifierObservation[] = []
  for (const evaluation of evaluations) {
    decisions[evaluation.index] = evaluation.decision
    if (evaluation.classification) classifications.push(evaluation.classification)
    observations.push(evaluation.observation)
  }

  yield* repository.saveMany(observations)
  return { decisions, classifications } satisfies RunJevPreclassifierResult
})
