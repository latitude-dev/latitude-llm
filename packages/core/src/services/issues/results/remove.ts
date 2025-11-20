import {
  EvaluationMetric,
  EvaluationResultSuccessValue,
  EvaluationType,
  ISSUE_JOBS_GENERATE_DETAILS_THROTTLE,
  ISSUE_JOBS_MAX_ATTEMPTS,
  ISSUE_JOBS_MERGE_COMMON_THROTTLE,
  IssueCentroid,
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
import { getEvaluationMetricSpecification } from '../../evaluationsV2/specifications'
import { deleteIssue } from '../delete'
import { decrementIssueHistogram } from '../histograms/decrement'
import { embedReason, updateCentroid } from '../shared'
import { updateIssue } from '../update'
import { containsResultsFromOtherCommits } from './add'
import { validateResultForIssue } from './validate'
import { removeIssueEvaluationResult } from '../../issueEvaluationResults/remove'

// TODO(AO): Add tests
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

  // Issue centroids' are only updated when the annotation is from a live
  // commit, it's a new issue, or the issue has only received annotations from
  // the same commit. This ensures the centroid is only updated when it makes
  // sense to do it.
  const canUpdateCentroid = commit.mergedAt
    ? true
    : !(await containsResultsFromOtherCommits({
        issue,
        commitId: result.commitId,
      }))

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

      let centroid: IssueCentroid | undefined
      if (canUpdateCentroid && embedding) {
        centroid = updateCentroid(
          { ...issue.centroid, updatedAt: issue.updatedAt },
          { embedding, type: evaluation.type, createdAt: result.createdAt },
          'remove',
          timestamp,
        )
      }

      const removing = await removeIssueEvaluationResult(
        {
          issue,
          evaluationResult: result,
          workspaceId: workspace.id,
        },
        transaction,
      )
      if (removing.error) {
        return Result.error(removing.error)
      }

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
            ttl: ISSUE_JOBS_GENERATE_DETAILS_THROTTLE,
          },
        })

        await issuesQueue.add('mergeCommonIssuesJob', payload, {
          attempts: ISSUE_JOBS_MAX_ATTEMPTS,
          deduplication: {
            id: mergeCommonIssuesJobKey(payload),
            ttl: ISSUE_JOBS_MERGE_COMMON_THROTTLE,
          },
        })
      }
    },
  )
}
