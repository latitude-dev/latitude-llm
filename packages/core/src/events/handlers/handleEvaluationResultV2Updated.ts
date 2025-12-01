import { EvaluationType, EvaluationV2 } from '../../constants'
import { unsafelyFindWorkspace } from '../../data-access/workspaces'
import { NotFoundError } from '../../lib/errors'
import {
  EvaluationResultsV2Repository,
  IssueEvaluationResultsRepository,
  IssuesRepository,
} from '../../repositories'
import { assignEvaluationResultV2ToIssue } from '../../services/evaluationsV2/results/assign'
import { unassignEvaluationResultV2FromIssue } from '../../services/evaluationsV2/results/unassign'
import { validateResultForIssue } from '../../services/issues/results/validate'
import { EvaluationResultV2UpdatedEvent } from '../events'
import { queues } from '../../jobs/queues'
import {
  ISSUE_JOBS_DISCOVER_RESULT_DELAY,
  ISSUE_JOBS_MAX_ATTEMPTS,
} from '../../constants'
import { discoverResultIssueJobKey } from '../../jobs/job-definitions/issues/discoverResultIssueJob'
import { Workspace } from '../../schema/models/types/Workspace'
import { EvaluationResultV2 } from '../../constants'

/**
 * Unassigns an evaluation result from its issue when it changes from failing to passing
 */
async function unassignResultFromIssueOnPass({
  workspace,
  result,
  evaluation,
}: {
  workspace: Workspace
  result: EvaluationResultV2
  evaluation: EvaluationV2
}) {
  const issueEvaluationResultsRepository = new IssueEvaluationResultsRepository(
    workspace.id,
  )
  const issueAssignment =
    await issueEvaluationResultsRepository.findLastActiveAssignedIssue({
      result,
    })

  if (!issueAssignment) return

  const issuesRepository = new IssuesRepository(workspace.id)
  const issue = await issuesRepository
    .find(issueAssignment.issueId)
    .then((r) => r.unwrap())

  // Get the full result with evaluation for unassignment
  const resultsRepository = new EvaluationResultsV2Repository(workspace.id)
  const fullResult = await resultsRepository
    .find(result.id)
    .then((r) => r.unwrap())

  await unassignEvaluationResultV2FromIssue({
    workspace,
    evaluation,
    result: fullResult,
    issue,
  }).then((r) => r.unwrap())
}

/**
 * Assigns an evaluation result to an issue when it changes from passing to failing
 */
async function assignResultToIssueOnFail({
  workspace,
  result,
  evaluation,
}: {
  workspace: Workspace
  result: EvaluationResultV2
  evaluation: EvaluationV2
}) {
  let issue
  if (evaluation.issueId) {
    const issuesRepository = new IssuesRepository(workspace.id)
    issue = await issuesRepository
      .find(evaluation.issueId)
      .then((r) => r.unwrap())
  }

  const validation = await validateResultForIssue({
    result: { result, evaluation },
    issue: issue,
    // Note: we leave a delay for human evaluations to
    // allow the user time to update the annotation
    skipReasonCheck: evaluation.type === EvaluationType.Human && !issue,
  })
  if (validation.error) {
    // Note: failing silently because not all results are eligible for an issue
    return
  }

  if (issue) {
    await assignEvaluationResultV2ToIssue({
      workspace,
      evaluation,
      result,
      issue,
    }).then((r) => r.unwrap())
  } else {
    const payload = { workspaceId: workspace.id, resultId: result.id }
    const { issuesQueue } = await queues()

    await issuesQueue.add('discoverResultIssueJob', payload, {
      attempts: ISSUE_JOBS_MAX_ATTEMPTS,
      deduplication: { id: discoverResultIssueJobKey(payload) },
      // Note: we leave a delay for human evaluations to
      // allow the user time to update the annotation
      delay:
        evaluation.type === EvaluationType.Human
          ? ISSUE_JOBS_DISCOVER_RESULT_DELAY
          : undefined,
    })
  }
}

/**
 * Handles evaluation result updates to manage issue assignments.
 *
 * When an evaluation result is updated (e.g., via HITL annotation):
 * - If it changed from failing to passing: unassign it from its issue
 * - If it changed from passing to failing: assign it to an issue
 */
export const handleEvaluationResultV2Updated = async ({
  data: event,
}: {
  data: EvaluationResultV2UpdatedEvent
}) => {
  const { workspaceId, result, previousHasPassed, evaluation } = event.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError(`Workspace not found ${workspaceId}`)

  const currentHasPassed = result.hasPassed

  if (previousHasPassed === currentHasPassed) return

  const wasFailing = previousHasPassed === false && currentHasPassed === true
  const wasPassing =
    (previousHasPassed === true || previousHasPassed === null) &&
    currentHasPassed === false

  if (wasFailing) {
    await unassignResultFromIssueOnPass({ workspace, result, evaluation })
  } else if (wasPassing) {
    await assignResultToIssueOnFail({ workspace, result, evaluation })
  }
}
