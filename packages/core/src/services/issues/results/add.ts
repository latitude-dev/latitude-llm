import { isEqual } from 'date-fns'
import {
  EvaluationMetric,
  EvaluationResultSuccessValue,
  EvaluationType,
  ISSUE_JOBS_GENERATE_DETAILS_THROTTLE,
  ISSUE_JOBS_MAX_ATTEMPTS,
  ISSUE_JOBS_MERGE_COMMON_THROTTLE,
} from '../../../constants'
import { generateIssueDetailsJobKey } from '../../../jobs/job-definitions/issues/generateIssueDetailsJob'
import { mergeCommonIssuesJobKey } from '../../../jobs/job-definitions/issues/mergeCommonIssuesJob'
import { queues } from '../../../jobs/queues'
import { Result } from '../../../lib/Result'
import Transaction from '../../../lib/Transaction'
import { CommitsRepository, IssuesRepository } from '../../../repositories'
import { Issue } from '../../../schema/models/types/Issue'
import { type Workspace } from '../../../schema/models/types/Workspace'
import { type ResultWithEvaluationV2 } from '../../../schema/types'
import { getEvaluationMetricSpecification } from '../../evaluationsV2/specifications'
import { incrementIssueHistogram } from '../histograms/increment'
import { embedReason, updateCentroid } from '../shared'
import { updateIssue } from '../update'
import { validateResultForIssue } from './validate'
import { addIssueEvaluationResult } from '../../issueEvaluationResults/add'
import { canUpdateCentroid } from './canUpdateCentroid'

/**
 * No need to check for existing associations,
 * You need to make sure the result is not already assigned
 * to an issue before calling this service.
 */
export async function addResultToIssue<
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

  let issueWasNew = false

  const commitsRepository = new CommitsRepository(workspace.id)
  const getting = await commitsRepository.getCommitById(result.commitId)
  if (!Result.isOk(getting)) return getting
  const commit = getting.value

  if (!embedding) {
    const specification = getEvaluationMetricSpecification(evaluation)
    const reason = specification.resultReason(
      result as EvaluationResultSuccessValue<T, M>,
    )!

    const embedying = await embedReason(reason)
    if (!Result.isOk(embedying)) return embedying
    embedding = embedying.unwrap()
  }

  const shouldUpdateCentroid = await canUpdateCentroid({
    result,
    commit,
    issue,
    embedding,
    issueWasNew,
  })

  return await transaction.call(
    async (tx) => {
      const issuesRepository = new IssuesRepository(workspace.id, tx)
      const locking = await issuesRepository.lock({ id: issue.id })
      if (!Result.isOk(locking)) return locking

      const refreshing = await issuesRepository.find(issue.id)
      if (!Result.isOk(refreshing)) return refreshing
      issue = refreshing.value
      issueWasNew = isEqual(issue.createdAt, issue.updatedAt)

      // Note: revalidating the fresh issue after locking
      const validating = await validateResultForIssue(
        {
          result: { result, evaluation },
          issue: issue,
        },
        tx,
      )
      if (!Result.isOk(validating)) return validating

      let centroid = issue.centroid
      if (shouldUpdateCentroid) {
        centroid = updateCentroid(
          { ...issue.centroid, updatedAt: issue.updatedAt },
          {
            embedding: embedding!,
            type: evaluation.type,
            createdAt: result.createdAt,
          },
          'add',
          timestamp,
        )
      }

      // Create the issue-evaluation result association
      const adding = await addIssueEvaluationResult(
        {
          issue,
          evaluationResult: result,
          workspaceId: workspace.id,
        },
        transaction,
      )
      if (!Result.isOk(adding)) return adding

      const incrementing = await incrementIssueHistogram(
        { result, issue, commit, workspace },
        transaction,
      )
      if (!Result.isOk(incrementing)) return incrementing

      const histogram = incrementing.value.histogram
      const updatingis = await updateIssue(
        {
          ...(issueWasNew && {
            title: issue.title,
            description: issue.description,
          }),
          centroid: centroid,
          issue: issue,
        },
        transaction,
      )
      if (!Result.isOk(updatingis)) return updatingis

      issue = updatingis.value.issue

      return Result.ok({ issue, histogram, result })
    },
    async ({ issue }) => {
      const payload = { workspaceId: workspace.id, issueId: issue.id }
      const { issuesQueue } = await queues()

      if (!issueWasNew) {
        await issuesQueue.add('generateIssueDetailsJob', payload, {
          attempts: ISSUE_JOBS_MAX_ATTEMPTS,
          deduplication: {
            id: generateIssueDetailsJobKey(payload),
            ttl: ISSUE_JOBS_GENERATE_DETAILS_THROTTLE,
          },
        })
      }

      await issuesQueue.add('mergeCommonIssuesJob', payload, {
        attempts: ISSUE_JOBS_MAX_ATTEMPTS,
        deduplication: {
          id: mergeCommonIssuesJobKey(payload),
          ttl: ISSUE_JOBS_MERGE_COMMON_THROTTLE,
        },
      })
    },
  )
}
