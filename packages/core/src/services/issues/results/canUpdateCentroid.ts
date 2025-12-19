import { eq, and, ne } from 'drizzle-orm'
import {
  EvaluationMetric,
  EvaluationResultV2,
  EvaluationType,
} from '../../../constants'
import { Issue } from '../../../schema/models/types/Issue'
import { Commit } from '../../../schema/models/types/Commit'
import { database } from '../../../client'
import { evaluationResultsV2 } from '../../../schema/models/evaluationResultsV2'
import { issueEvaluationResults } from '../../../schema/models/issueEvaluationResults'

async function containsResultsFromOtherCommits(
  {
    issue,
    commitId,
  }: {
    issue: Issue
    commitId: number
  },
  db = database,
) {
  const commitIds = await db
    .selectDistinct({ commitId: evaluationResultsV2.commitId })
    .from(issueEvaluationResults)
    .innerJoin(
      evaluationResultsV2,
      eq(issueEvaluationResults.evaluationResultId, evaluationResultsV2.id),
    )
    .where(
      and(
        eq(issueEvaluationResults.workspaceId, issue.workspaceId),
        eq(issueEvaluationResults.issueId, issue.id),
        ne(evaluationResultsV2.commitId, commitId),
      ),
    )
    .limit(1)

  return commitIds.length > 0
}
/**
 * Determines whether the issue centroid should be updated when adding or
 * removing a result.
 *
 * The centroid is only updated when:
 * 1. The embedding is provided
 * 2. The result is NOT from an experiment (experiment results should be added
 *    to issues, but not move the centroid)
 * 3. AND one of the following:
 *    - The commit is merged (live)
 *    - The issue is new (for add operations)
 *    - The issue has only received results from the same commit
 */
export async function canUpdateCentroid<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>({
  result,
  commit,
  issue,
  embedding,
  issueWasNew = false,
}: {
  result: EvaluationResultV2<T, M>
  commit: Commit
  issue: Issue
  embedding: number[] | undefined
  issueWasNew?: boolean
}): Promise<boolean> {
  if (!embedding) return false
  if (result.experimentId) return false
  if (commit.mergedAt || issueWasNew) return true

  const resultsFromOtherCommits = await containsResultsFromOtherCommits({
    issue,
    commitId: result.commitId,
  })

  return !resultsFromOtherCommits
}
