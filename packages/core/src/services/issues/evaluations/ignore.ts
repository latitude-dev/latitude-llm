import { inArray } from 'drizzle-orm'
import { evaluationVersions } from '../../../schema/models/evaluationVersions'
import { Issue } from '../../../schema/models/types/Issue'
import { getEvaluationMetricSpecification } from '../../evaluationsV2/specifications'
import { database, Database } from '../../../client'
import { EvaluationsV2Repository } from '../../../repositories/evaluationsV2Repository'

/**
 * Sets ignoredAt and disables live evaluation for evaluations associated with an issue
 * that support live evaluation.
 */
export async function ignoreIssueEvaluations(
  { issue }: { issue: Issue },
  db: Database = database,
) {
  const repo = new EvaluationsV2Repository(issue.workspaceId, db)
  const allEvaluations = await repo.getByIssue(issue.id)

  if (allEvaluations.length === 0) return

  const liveEvaluations = allEvaluations.filter((evaluation) => {
    const evalV2 = {
      ...evaluation,
      uuid: evaluation.evaluationUuid,
      versionId: evaluation.id,
    }
    const metricSpec = getEvaluationMetricSpecification(evalV2)
    return metricSpec.supportsLiveEvaluation
  })

  if (liveEvaluations.length === 0) return

  const now = new Date()
  const ids = liveEvaluations.map((e) => e.id)

  await db
    .update(evaluationVersions)
    .set({
      ignoredAt: now,
      evaluateLiveLogs: false,
      updatedAt: now,
    })
    .where(inArray(evaluationVersions.id, ids))
}
