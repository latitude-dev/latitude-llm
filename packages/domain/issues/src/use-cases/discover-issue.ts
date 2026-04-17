import { EvaluationRepository } from "@domain/evaluations"
import { WorkflowStarter, type WorkflowStarterShape } from "@domain/queue"
import { type Score, ScoreRepository, syncScoreAnalyticsUseCase } from "@domain/scores"
import { IssueId, type RepositoryError, ScoreId } from "@domain/shared"
import { Effect } from "effect"
import type { CheckEligibilityError } from "../errors.ts"
import { ScoreAlreadyOwnedByIssueError } from "../errors.ts"
import { IssueRepository } from "../ports/issue-repository.ts"
import { checkEligibilityUseCase } from "./check-eligibility.ts"
import { syncIssueProjectionsUseCase } from "./sync-projections.ts"

export interface DiscoverIssueInput {
  readonly organizationId: string
  readonly projectId: string
  readonly scoreId: string
  readonly issueId: string | null
}

type DiscoverIssueSkipReason = CheckEligibilityError["_tag"]

export type DiscoverIssueStartedWorkflow = "issueDiscoveryWorkflow" | "assignScoreToKnownIssueWorkflow"

export type DiscoverIssueResult =
  | {
      readonly action: "skipped"
      readonly reason: DiscoverIssueSkipReason
    }
  | {
      readonly action: "already-assigned"
      readonly issueId: string
    }
  | {
      readonly action: "workflow-started"
      readonly workflow: DiscoverIssueStartedWorkflow
      readonly scoreId: string
    }

export type DiscoverIssueError = RepositoryError | ScoreAlreadyOwnedByIssueError

const resolveKnownIssueId = ({ issueId, projectId }: { readonly issueId: string; readonly projectId: string }) =>
  Effect.gen(function* () {
    const issueRepository = yield* IssueRepository
    const issue = yield* issueRepository
      .findById(IssueId(issueId))
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))

    if (issue === null || issue.projectId !== projectId) {
      return null
    }

    return issue.id
  })

const resolveLinkedIssueId = (score: Score) =>
  Effect.gen(function* () {
    if (score.source !== "evaluation") {
      return null
    }

    const evaluationRepository = yield* EvaluationRepository
    const evaluation = yield* evaluationRepository
      .findById(score.sourceId)
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))

    if (evaluation === null || evaluation.projectId !== score.projectId) {
      return null
    }

    return yield* resolveKnownIssueId({
      issueId: evaluation.issueId,
      projectId: score.projectId,
    })
  })

const startDiscoveryWorkflow = (workflowStarter: WorkflowStarterShape, input: DiscoverIssueInput) =>
  workflowStarter.start(
    "issueDiscoveryWorkflow",
    {
      organizationId: input.organizationId,
      projectId: input.projectId,
      scoreId: input.scoreId,
    },
    {
      workflowId: `issues:discovery:${input.scoreId}`,
    },
  )

const startAssignScoreToKnownIssueWorkflow = (
  workflowStarter: WorkflowStarterShape,
  input: DiscoverIssueInput,
  issueId: string,
) =>
  workflowStarter.start(
    "assignScoreToKnownIssueWorkflow",
    {
      organizationId: input.organizationId,
      projectId: input.projectId,
      scoreId: input.scoreId,
      issueId,
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

    if (currentScore?.issueId != null) {
      return {
        action: "already-assigned",
        issueId: currentScore.issueId,
        score: currentScore,
      } as const
    }

    return yield* new ScoreAlreadyOwnedByIssueError({ scoreId })
  })

const asSkipped = (reason: DiscoverIssueSkipReason) =>
  Effect.succeed({
    action: "skipped",
    reason,
  } as const)

export const discoverIssueUseCase = Effect.fn("issues.discoverIssue")(function* (input: DiscoverIssueInput) {
    yield* Effect.annotateCurrentSpan("scoreId", input.scoreId)
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)
    if (input.issueId !== null) {
      yield* Effect.annotateCurrentSpan("issueId", input.issueId)
    }
    const workflowStarter = yield* WorkflowStarter

    const eligibilityResult = yield* checkEligibilityUseCase(input).pipe(
      Effect.map((score) => ({ action: "ready", score }) as const),
      Effect.catchTag("ScoreAlreadyOwnedByIssueError", () => loadAssignedScoreOrSkip(input.scoreId)),
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
      Effect.catchTag("MissingScoreFeedbackForDiscoveryError", () =>
        asSkipped("MissingScoreFeedbackForDiscoveryError"),
      ),
      Effect.catchTag("PassedScoreNotEligibleForDiscoveryError", () =>
        asSkipped("PassedScoreNotEligibleForDiscoveryError"),
      ),
    )

    if (eligibilityResult.action === "skipped") {
      return eligibilityResult satisfies DiscoverIssueResult
    }

    if (eligibilityResult.action === "already-assigned") {
      yield* syncIssueProjectionsUseCase({
        organizationId: input.organizationId,
        issueId: eligibilityResult.issueId,
      })
      yield* syncScoreAnalyticsUseCase({
        organizationId: input.organizationId,
        scoreId: input.scoreId,
      })

      return {
        action: "already-assigned",
        issueId: eligibilityResult.issueId,
      } satisfies DiscoverIssueResult
    }

    const score = eligibilityResult.score
    const selectedIssueId =
      input.issueId === null
        ? yield* resolveLinkedIssueId(score)
        : yield* resolveKnownIssueId({
            issueId: input.issueId,
            projectId: score.projectId,
          })

    if (selectedIssueId === null) {
      yield* startDiscoveryWorkflow(workflowStarter, input)
      return {
        action: "workflow-started",
        workflow: "issueDiscoveryWorkflow",
        scoreId: score.id,
      } satisfies DiscoverIssueResult
    }

    yield* startAssignScoreToKnownIssueWorkflow(workflowStarter, input, selectedIssueId)
    return {
      action: "workflow-started",
      workflow: "assignScoreToKnownIssueWorkflow",
      scoreId: score.id,
    } satisfies DiscoverIssueResult
  })
