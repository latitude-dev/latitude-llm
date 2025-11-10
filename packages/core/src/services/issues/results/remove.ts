import {
  EvaluationMetric,
  EvaluationResultSuccessValue,
  EvaluationType,
  ISSUE_JOBS_GENERATE_DETAILS_DEBOUNCE,
  ISSUE_JOBS_MAX_ATTEMPTS,
  ISSUE_JOBS_MERGE_COMMON_DEBOUNCE,
} from '../../../constants'
import { generateIssueDetailsJobKey } from '../../../jobs/job-definitions/issues/generateIssueDetailsJob'
import { mergeCommonIssuesJobKey } from '../../../jobs/job-definitions/issues/mergeCommonIssuesJob'
import { queues } from '../../../jobs/queues'
import { Result } from '../../../lib/Result'
import Transaction from '../../../lib/Transaction'
import {
  CommitsRepository,
  IssueHistogramsRepository,
  IssuesRepository,
} from '../../../repositories'
import { Issue } from '../../../schema/models/types/Issue'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { type ResultWithEvaluationV2 } from '../../../schema/types'
import { updateEvaluationResultV2 } from '../../evaluationsV2/results/update'
import { getEvaluationMetricSpecification } from '../../evaluationsV2/specifications'
import { deleteIssue } from '../delete'
import { decrementIssueHistogram } from '../histograms/decrement'
import { embedReason, updateCentroid } from '../shared'
import { updateIssue } from '../update'
import { validateResultForIssue } from './validate'

// TODO(AO): IMPORTANT! Evaluation results from draft versions
// should not modify issues that appeared in production. If the
// issue only appeared in draft versions its okay
export async function removeResultFromIssue<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>(
  {
    result: { result, evaluation, embedding },
    issue,
    workspace,
  }: {
    result: ResultWithEvaluationV2<T, M> & { embedding?: number[] }
    issue: Issue
    workspace: Workspace
  },
  transaction = new Transaction(),
) {
  // Note: is very important to reuse the same
  // timestamp for all centroid operations!
  const timestamp = new Date()

  let issueWasLast = false

  const validating = await validateResultForIssue({
    result: { result, evaluation },
    issue: issue,
    skipBelongsCheck: true,
  })
  if (validating.error) {
    return Result.error(validating.error)
  }

  const commitsRepository = new CommitsRepository(workspace.id)
  const getting = await commitsRepository.getCommitById(result.commitId)
  if (getting.error) {
    return Result.error(getting.error)
  }
  const commit = getting.value

  if (!embedding) {
    const specification = getEvaluationMetricSpecification(evaluation)
    const reason = specification.resultReason(
      result as EvaluationResultSuccessValue<T, M>,
    )!

    const embedying = await embedReason(reason)
    if (embedying.error) {
      return Result.error(embedying.error)
    }
    embedding = embedying.value
  }

  return await transaction.call(
    async (tx) => {
      const issuesRepository = new IssuesRepository(workspace.id, tx)
      const locking = await issuesRepository.lock({ id: issue.id })
      if (locking.error) {
        return Result.error(locking.error)
      }

      const refreshing = await issuesRepository.find(issue.id)
      if (refreshing.error) {
        return Result.error(refreshing.error)
      }
      issue = refreshing.value

      // Note: revalidating the fresh issue after locking
      const validating = await validateResultForIssue(
        {
          result: { result, evaluation },
          issue: issue,
          skipBelongsCheck: true,
        },
        tx,
      )
      if (validating.error) {
        return Result.error(validating.error)
      }

      const centroid = updateCentroid(
        { ...issue.centroid, updatedAt: issue.updatedAt },
        { embedding, type: evaluation.type, createdAt: result.createdAt },
        'remove',
        timestamp,
      )

      const updatingre = await updateEvaluationResultV2(
        { issue: null, result, commit, workspace },
        transaction,
      )
      if (updatingre.error) {
        return Result.error(updatingre.error)
      }
      result = updatingre.value.result

      const decrementing = await decrementIssueHistogram(
        { result, issue, commit, workspace },
        transaction,
      )
      if (decrementing.error) {
        return Result.error(decrementing.error)
      }
      const histogram = decrementing.value.histogram

      const histogramsRepository = new IssueHistogramsRepository(
        workspace.id,
        tx,
      )
      const searching = await histogramsRepository.hasOccurrences({
        issueId: issue.id,
      })
      if (searching.error) {
        return Result.error(searching.error)
      }
      issueWasLast = !searching.value

      if (issueWasLast) {
        const deleting = await deleteIssue({ issue }, transaction)
        if (deleting.error) {
          return Result.error(deleting.error)
        }
        issue = deleting.value.issue
      } else {
        const updating = await updateIssue({ centroid, issue }, transaction)
        if (updating.error) {
          return Result.error(updating.error)
        }
        issue = updating.value.issue
      }

      return Result.ok({ issue, histogram, result })
    },
    async ({ issue }) => {
      if (!issueWasLast) {
        const payload = { workspaceId: workspace.id, issueId: issue.id }
        const { issuesQueue } = await queues()

        await issuesQueue.add('generateIssueDetailsJob', payload, {
          attempts: ISSUE_JOBS_MAX_ATTEMPTS,
          deduplication: {
            id: generateIssueDetailsJobKey(payload),
            ttl: ISSUE_JOBS_GENERATE_DETAILS_DEBOUNCE,
          },
        })

        await issuesQueue.add('mergeCommonIssuesJob', payload, {
          attempts: ISSUE_JOBS_MAX_ATTEMPTS,
          deduplication: {
            id: mergeCommonIssuesJobKey(payload),
            ttl: ISSUE_JOBS_MERGE_COMMON_DEBOUNCE,
          },
        })
      }
    },
  )
}
