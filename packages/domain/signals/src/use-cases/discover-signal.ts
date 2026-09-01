import { EvaluationRepository } from "@domain/evaluations"
import { WorkflowStarter, type WorkflowStarterShape } from "@domain/queue"
import { type Score, ScoreRepository, syncScoreAnalyticsUseCase } from "@domain/scores"
import { type RepositoryError, ScoreId, SignalId } from "@domain/shared"
import { Effect } from "effect"
import type { CheckEligibilityError } from "../errors.ts"
import { ScoreAlreadyOwnedBySignalError } from "../errors.ts"
import { SignalRepository } from "../ports/signal-repository.ts"
import { checkEligibilityUseCase } from "./check-eligibility.ts"

export interface DiscoverSignalInput {
  readonly organizationId: string
  readonly projectId: string
  readonly scoreId: string
  readonly signalId: string | null
}

type DiscoverSignalSkipReason = CheckEligibilityError["_tag"]

export type DiscoverSignalStartedWorkflow = "signalDiscoveryWorkflow" | "assignScoreToKnownSignalWorkflow"

export type DiscoverSignalResult =
  | {
      readonly action: "skipped"
      readonly reason: DiscoverSignalSkipReason
    }
  | {
      readonly action: "already-assigned"
      readonly signalId: string
    }
  | {
      readonly action: "workflow-started"
      readonly workflow: DiscoverSignalStartedWorkflow
      readonly scoreId: string
    }

export type DiscoverSignalError = RepositoryError | ScoreAlreadyOwnedBySignalError

const resolveKnownSignalId = ({ signalId, projectId }: { readonly signalId: string; readonly projectId: string }) =>
  Effect.gen(function* () {
    const signalRepository = yield* SignalRepository
    // Unpromoted signals included: a null here routes the score to
    // `signalDiscoveryWorkflow`, which would spawn a second signal for a cluster
    // that already exists instead of adding the evidence that promotes it.
    const issue = yield* signalRepository
      .findById(SignalId(signalId), { includeUnpromoted: true })
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))

    if (issue === null || issue.projectId !== projectId) {
      return null
    }

    return issue.id
  })

const resolveLinkedSignalId = (score: Score) =>
  Effect.gen(function* () {
    if (score.sourceType !== "evaluation") {
      return null
    }

    const evaluationRepository = yield* EvaluationRepository
    const evaluation = yield* evaluationRepository
      .findById(score.sourceId)
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))

    if (evaluation === null || evaluation.projectId !== score.projectId) {
      return null
    }

    return yield* resolveKnownSignalId({
      signalId: evaluation.signalId,
      projectId: score.projectId,
    })
  })

const startDiscoveryWorkflow = (workflowStarter: WorkflowStarterShape, input: DiscoverSignalInput) =>
  workflowStarter.start(
    "signalDiscoveryWorkflow",
    {
      organizationId: input.organizationId,
      projectId: input.projectId,
      scoreId: input.scoreId,
    },
    {
      workflowId: `issues:discovery:${input.scoreId}`,
    },
  )

const startAssignScoreToKnownSignalWorkflow = (
  workflowStarter: WorkflowStarterShape,
  input: DiscoverSignalInput,
  signalId: string,
) =>
  workflowStarter.start(
    "assignScoreToKnownSignalWorkflow",
    {
      organizationId: input.organizationId,
      projectId: input.projectId,
      scoreId: input.scoreId,
      signalId,
    },
    {
      workflowId: `issues:assign-known:${input.scoreId}`,
    },
  )

const loadAssignedScoreOrSkip = (scoreId: string) =>
  Effect.gen(function* () {
    const scoreRepository = yield* ScoreRepository
    const currentScore = yield* scoreRepository
      .findById(ScoreId(scoreId))
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))

    if (currentScore?.signalId != null) {
      return {
        action: "already-assigned",
        signalId: currentScore.signalId,
        score: currentScore,
      } as const
    }

    return yield* new ScoreAlreadyOwnedBySignalError({ scoreId })
  })

const asSkipped = (reason: DiscoverSignalSkipReason) =>
  Effect.succeed({
    action: "skipped",
    reason,
  } as const)

export const discoverSignalUseCase = Effect.fn("issues.discoverSignal")(function* (input: DiscoverSignalInput) {
  yield* Effect.annotateCurrentSpan("scoreId", input.scoreId)
  yield* Effect.annotateCurrentSpan("projectId", input.projectId)
  if (input.signalId !== null) {
    yield* Effect.annotateCurrentSpan("signalId", input.signalId)
  }
  const workflowStarter = yield* WorkflowStarter

  const eligibilityResult = yield* checkEligibilityUseCase(input).pipe(
    Effect.map((score) => ({ action: "ready", score }) as const),
    Effect.catchTag("ScoreAlreadyOwnedBySignalError", () => loadAssignedScoreOrSkip(input.scoreId)),
    Effect.catchTag("ScoreNotFoundForDiscoveryError", () => asSkipped("ScoreNotFoundForDiscoveryError")),
    Effect.catchTag("ScoreDiscoveryOrganizationMismatchError", () =>
      asSkipped("ScoreDiscoveryOrganizationMismatchError"),
    ),
    Effect.catchTag("ScoreDiscoveryProjectMismatchError", () => asSkipped("ScoreDiscoveryProjectMismatchError")),
    Effect.catchTag("DraftScoreNotEligibleForDiscoveryError", () =>
      asSkipped("DraftScoreNotEligibleForDiscoveryError"),
    ),
    Effect.catchTag("ErroredScoreNotEligibleForDiscoveryError", () =>
      asSkipped("ErroredScoreNotEligibleForDiscoveryError"),
    ),
    Effect.catchTag("MissingScoreFeedbackForDiscoveryError", () => asSkipped("MissingScoreFeedbackForDiscoveryError")),
    Effect.catchTag("PassedScoreNotEligibleForDiscoveryError", () =>
      asSkipped("PassedScoreNotEligibleForDiscoveryError"),
    ),
  )

  if (eligibilityResult.action === "skipped") {
    return eligibilityResult satisfies DiscoverSignalResult
  }

  if (eligibilityResult.action === "already-assigned") {
    yield* syncScoreAnalyticsUseCase({
      organizationId: input.organizationId,
      scoreId: input.scoreId,
    })

    return {
      action: "already-assigned",
      signalId: eligibilityResult.signalId,
    } satisfies DiscoverSignalResult
  }

  const score = eligibilityResult.score
  const selectedSignalId =
    input.signalId === null
      ? yield* resolveLinkedSignalId(score)
      : yield* resolveKnownSignalId({
          signalId: input.signalId,
          projectId: score.projectId,
        })

  if (selectedSignalId === null) {
    yield* startDiscoveryWorkflow(workflowStarter, input)
    return {
      action: "workflow-started",
      workflow: "signalDiscoveryWorkflow",
      scoreId: score.id,
    } satisfies DiscoverSignalResult
  }

  yield* startAssignScoreToKnownSignalWorkflow(workflowStarter, input, selectedSignalId)
  return {
    action: "workflow-started",
    workflow: "assignScoreToKnownSignalWorkflow",
    scoreId: score.id,
  } satisfies DiscoverSignalResult
})
