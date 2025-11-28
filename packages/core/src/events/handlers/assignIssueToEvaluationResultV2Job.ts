import {
  EvaluationType,
  ISSUE_JOBS_DISCOVER_RESULT_DELAY,
  ISSUE_JOBS_MAX_ATTEMPTS,
} from '../../constants'
import { unsafelyFindWorkspace } from '../../data-access/workspaces'
import { discoverResultIssueJobKey } from '../../jobs/job-definitions/issues/discoverResultIssueJob'
import { queues } from '../../jobs/queues'
import { NotFoundError } from '../../lib/errors'
import { IssuesRepository } from '../../repositories'
import { assignEvaluationResultV2ToIssue } from '../../services/evaluationsV2/results/assign'
import { validateResultForIssue } from '../../services/issues/results/validate'
import { EvaluationResultV2CreatedEvent } from '../events'

export const assignIssueToEvaluationResultV2Job = async ({
  data: event,
}: {
  data: EvaluationResultV2CreatedEvent
}) => {
  const { workspaceId, result, evaluation } = event.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError(`Workspace not found ${workspaceId}`)

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
    // Note: failing silently because this job is executed for all
    // new results and most of them are not eligible for an issue!
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
