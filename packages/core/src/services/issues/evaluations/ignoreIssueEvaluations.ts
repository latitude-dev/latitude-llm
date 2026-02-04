import { inArray, sql } from 'drizzle-orm'
import { EvaluationTriggerMode } from '../../../constants'
import { evaluationVersions } from '../../../schema/models/evaluationVersions'
import { Issue } from '../../../schema/models/types/Issue'
import { getEvaluationMetricSpecification } from '../../evaluationsV2/specifications'
import { database, Database } from '../../../client'
import { EvaluationsV2Repository } from '../../../repositories/evaluationsV2Repository'

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
      configuration: sql`${evaluationVersions.configuration} || jsonb_build_object('trigger', jsonb_build_object('mode', ${sql.raw(`'${EvaluationTriggerMode.Disabled}'`)}))`,
      updatedAt: now,
    })
    .where(inArray(evaluationVersions.id, ids))
}
