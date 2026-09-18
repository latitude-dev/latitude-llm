import { OrganizationId, ProjectId, SessionId } from "@domain/shared"
import { hash } from "@repo/utils"
import { Effect } from "effect"
import {
  JEV_SHADOW_ENABLED,
  JEV_SHADOW_POLICY_VERSION,
  JEV_SHADOW_RETENTION_DAYS,
  JEV_SHADOW_STATE_BUILDER_VERSION,
} from "../constants.ts"
import type { FlaggerSessionContext } from "../conversation.ts"
import type { FlaggerScreeningDecision } from "../entities/flagger-screening-decision.ts"
import type { JevShadowDecision, JevShadowObservationStatus } from "../entities/jev-shadow-observation.ts"
import { getJevShadowStrategy } from "../jev-shadow-strategies.ts"
import {
  JevShadowDecisionProvider,
  type JevShadowProviderAuditMetadata,
  type JevShadowProviderFailureKind,
  type JevShadowQuestion,
} from "../ports/jev-shadow-decision-provider.ts"
import { JevShadowObservationRepository } from "../ports/jev-shadow-observation-repository.ts"

export interface RunJevShadowInput {
  readonly organizationId: string
  readonly projectId: string
  readonly sessionId: string
  readonly flaggerSlug: string
  readonly enabled?: boolean | undefined
  readonly screeningDecision?: FlaggerScreeningDecision | undefined
  readonly context: FlaggerSessionContext
  readonly workflowId: string
  readonly workflowRunId: string
  readonly activityId: string
  readonly activityAttempt: number
  readonly stateBuilderVersion?: string | undefined
  readonly stateTruncated?: boolean | undefined
  readonly policyVersion?: string | undefined
  readonly retentionDays?: number | undefined
}

export interface RunJevShadowResult {
  readonly advisoryDecision: JevShadowDecision
  readonly status: JevShadowObservationStatus
  readonly probability: number | null
  readonly observationId: string | null
  readonly observationSaved: boolean
}

const noOp = (status: JevShadowObservationStatus): RunJevShadowResult => ({
  advisoryDecision: "unknown",
  status,
  probability: null,
  observationId: null,
  observationSaved: false,
})

const unknownMetadata: JevShadowProviderAuditMetadata = {
  provider: "unknown",
  requestedModel: null,
  resolvedModel: null,
  latencyMs: null,
  inputTokens: null,
  outputTokens: null,
}

type ShadowEvaluation =
  | {
      readonly probability: number
      readonly advisoryDecision: "would-run" | "would-skip"
      readonly status: "success"
      readonly errorCategory: null
      readonly metadata: JevShadowProviderAuditMetadata
    }
  | {
      readonly probability: null
      readonly advisoryDecision: "unknown"
      readonly status: Exclude<
        JevShadowObservationStatus,
        "success" | "disabled" | "unsupported-slug" | "missing-selection"
      >
      readonly errorCategory: JevShadowProviderFailureKind
      readonly metadata: JevShadowProviderAuditMetadata
    }

export const runJevShadowUseCase = Effect.fn("flaggers.runJevShadow")(function* (input: RunJevShadowInput) {
  yield* Effect.annotateCurrentSpan("flagger.organizationId", input.organizationId)
  yield* Effect.annotateCurrentSpan("flagger.projectId", input.projectId)
  yield* Effect.annotateCurrentSpan("flagger.sessionId", input.sessionId)
  yield* Effect.annotateCurrentSpan("flagger.flaggerSlug", input.flaggerSlug)

  if ((input.enabled ?? JEV_SHADOW_ENABLED) !== true) return noOp("disabled")

  const strategy = getJevShadowStrategy(input.flaggerSlug)
  if (strategy === null) return noOp("unsupported-slug")

  const screeningDecision = input.screeningDecision
  if (screeningDecision === undefined) return noOp("missing-selection")

  const state = { conversation: input.context.conversation }
  const stateHash = yield* hash(state).pipe(Effect.catch(() => Effect.succeed("0".repeat(64))))
  const observationId = yield* hash({
    namespace: "flagger-jev-shadow-observation-v1",
    organizationId: input.organizationId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    flaggerSlug: input.flaggerSlug,
    screeningDecisionId: screeningDecision.decisionId,
    workflowId: input.workflowId,
    workflowRunId: input.workflowRunId,
    activityId: input.activityId,
  }).pipe(Effect.catch(() => Effect.succeed("0".repeat(64))))

  const evaluation = yield* evaluateShadow({ question: strategy.question, threshold: strategy.threshold, state })
  const repository = yield* JevShadowObservationRepository
  const saved = yield* repository
    .save({
      observationId,
      organizationId: OrganizationId(input.organizationId),
      projectId: ProjectId(input.projectId),
      sessionId: SessionId(input.sessionId),
      flaggerSlug: input.flaggerSlug,
      screeningDecisionId: screeningDecision.decisionId,
      analysisHash: screeningDecision.analysisHash,
      scoringArtifactVersion: screeningDecision.scoringArtifactVersion,
      screeningAttempt: screeningDecision.attempt,
      screeningVersion: screeningDecision.version,
      workflowId: input.workflowId,
      workflowRunId: input.workflowRunId,
      activityId: input.activityId,
      activityAttempt: input.activityAttempt,
      stateHash,
      stateBuilderVersion: input.stateBuilderVersion ?? JEV_SHADOW_STATE_BUILDER_VERSION,
      stateTruncated: input.stateTruncated ?? false,
      provider: evaluation.metadata.provider,
      requestedModel: evaluation.metadata.requestedModel,
      resolvedModel: evaluation.metadata.resolvedModel,
      questionVersion: strategy.question.version,
      policyVersion: input.policyVersion ?? JEV_SHADOW_POLICY_VERSION,
      threshold: strategy.threshold,
      probability: evaluation.probability,
      advisoryDecision: evaluation.advisoryDecision,
      status: evaluation.status,
      errorCategory: evaluation.errorCategory,
      latencyMs: evaluation.metadata.latencyMs,
      inputTokens: evaluation.metadata.inputTokens,
      outputTokens: evaluation.metadata.outputTokens,
      selectionReason: screeningDecision.reason,
      selectionProbability: screeningDecision.inclusionProbability ?? null,
      observedAt: new Date(),
      retentionDays: input.retentionDays ?? JEV_SHADOW_RETENTION_DAYS,
    })
    .pipe(
      Effect.as(true),
      Effect.catch(() => Effect.succeed(false)),
    )

  return { ...evaluation, observationId, observationSaved: saved } satisfies RunJevShadowResult
})

const evaluateShadow = (args: {
  readonly question: JevShadowQuestion
  readonly threshold: number
  readonly state: { readonly conversation: FlaggerSessionContext["conversation"] }
}) =>
  Effect.gen(function* () {
    const provider = yield* JevShadowDecisionProvider
    const result = yield* provider
      .decide({ question: args.question, state: args.state })
      .pipe(
        Effect.catch(() =>
          Effect.succeed({ kind: "failure" as const, errorCategory: "provider" as const, ...unknownMetadata }),
        ),
      )

    if (result.kind === "failure") {
      return unknown(result.errorCategory, result)
    }

    return {
      probability: result.probability,
      advisoryDecision: result.probability >= args.threshold ? ("would-run" as const) : ("would-skip" as const),
      status: "success" as const,
      errorCategory: null,
      metadata: result,
    } satisfies ShadowEvaluation
  })

const unknown = (
  errorCategory: JevShadowProviderFailureKind,
  metadata: JevShadowProviderAuditMetadata,
): ShadowEvaluation => {
  const status =
    errorCategory === "timeout"
      ? "timeout"
      : errorCategory === "authentication"
        ? "authentication"
        : errorCategory === "rate-limit"
          ? "rate-limited"
          : errorCategory === "malformed-response"
            ? "malformed-response"
            : "provider-failure"
  return { probability: null, advisoryDecision: "unknown", status, errorCategory, metadata }
}
