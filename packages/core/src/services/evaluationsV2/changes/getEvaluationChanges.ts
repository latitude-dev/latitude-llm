import {
  ChangedEvaluation,
  ModifiedDocumentType,
} from '@latitude-data/constants'
import { type Commit } from '../../../schema/models/types/Commit'
import { type EvaluationV2 } from '@latitude-data/constants'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { Result } from '../../../lib/Result'
import Transaction, { PromisedResult } from '../../../lib/Transaction'
import {
  CommitsRepository,
  EvaluationsV2Repository,
} from '../../../repositories'

async function getDraftEvaluationChanges(
  { workspace, draft }: { workspace: Workspace; draft: Commit },
  transaction = new Transaction(),
): PromisedResult<ChangedEvaluation[]> {
  return transaction.call(async (tx) => {
    const evaluationsRepository = new EvaluationsV2Repository(workspace.id, tx)

    const currentCommitEvaluations =
      await evaluationsRepository.getChangesInCommit(draft)

    if (currentCommitEvaluations.error) {
      return Result.error(currentCommitEvaluations.error)
    }

    // For draft changes, we compare against the head evaluations
    const commitsRepository = new CommitsRepository(workspace.id, tx)
    const headCommit = await commitsRepository.getHeadCommit(draft.projectId)
    if (!headCommit) {
      // No head commit, all evaluations are new
      return Result.ok(
        evaluationChangesPresenter({
          currentCommitEvaluations: currentCommitEvaluations.value,
          previousCommitEvaluations: [],
        }),
      )
    }

    const headEvaluations =
      await evaluationsRepository.getChangesInCommit(headCommit)
    if (headEvaluations.error) {
      return Result.error(headEvaluations.error)
    }

    return Result.ok(
      evaluationChangesPresenter({
        currentCommitEvaluations: currentCommitEvaluations.value,
        previousCommitEvaluations: headEvaluations.value,
      }),
    )
  })
}

function getChangeType(
  changedEvaluation: EvaluationV2,
  previousCommitEvaluations: EvaluationV2[],
): ModifiedDocumentType {
  const previousEvaluation = previousCommitEvaluations.find(
    (evaluation) => evaluation.uuid === changedEvaluation.uuid,
  )

  if (!previousEvaluation) {
    return ModifiedDocumentType.Created
  }

  if (changedEvaluation.deletedAt) {
    return ModifiedDocumentType.Deleted
  }

  return ModifiedDocumentType.Updated
}

export function evaluationChangesPresenter({
  currentCommitEvaluations,
  previousCommitEvaluations,
}: {
  currentCommitEvaluations: EvaluationV2[]
  previousCommitEvaluations: EvaluationV2[]
}) {
  const changes = currentCommitEvaluations.map((changedEvaluation) => {
    return {
      evaluationUuid: changedEvaluation.uuid,
      documentUuid: changedEvaluation.documentUuid,
      name: changedEvaluation.name,
      type: changedEvaluation.type,
      changeType: getChangeType(changedEvaluation, previousCommitEvaluations),
      hasIssues: !!changedEvaluation.issueId,
    } satisfies ChangedEvaluation
  })

  // Sort by hasIssues (evaluations with issues first)
  return changes.sort((a, b) => {
    const aHasIssues = a.hasIssues ? 1 : 0
    const bHasIssues = b.hasIssues ? 1 : 0
    return bHasIssues - aHasIssues
  })
}

export async function getCommitEvaluationChanges(
  { workspace, commit }: { workspace: Workspace; commit: Commit },
  transaction = new Transaction(),
): PromisedResult<ChangedEvaluation[]> {
  return transaction.call(async (tx) => {
    if (!commit.mergedAt) {
      return getDraftEvaluationChanges(
        { workspace, draft: commit },
        transaction,
      )
    }

    const commitsRepository = new CommitsRepository(workspace.id, tx)
    const previousCommit = await commitsRepository.getPreviousCommit(commit)
    const evaluationsRepository = new EvaluationsV2Repository(workspace.id, tx)

    const currentCommitEvaluations =
      await evaluationsRepository.getChangesInCommit(commit)
    if (currentCommitEvaluations.error) {
      return Result.error(currentCommitEvaluations.error)
    }

    const previousCommitEvaluations = previousCommit
      ? await evaluationsRepository.getChangesInCommit(previousCommit)
      : Result.ok([])

    if (previousCommitEvaluations.error) {
      return Result.error(previousCommitEvaluations.error)
    }

    return Result.ok(
      evaluationChangesPresenter({
        currentCommitEvaluations: currentCommitEvaluations.value,
        previousCommitEvaluations: previousCommitEvaluations.value,
      }),
    )
  })
}
