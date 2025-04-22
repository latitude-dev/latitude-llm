import {
  Commit,
  EvaluationMetric,
  EvaluationType,
  EvaluationV2,
  Workspace,
} from '../../browser'
import { database, Database } from '../../client'
import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { evaluationVersions } from '../../schema'

export async function toggleLiveModeV2<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>(
  {
    evaluation,
    commit,
    live,
    workspace,
  }: {
    evaluation: EvaluationV2<T, M>
    commit: Commit
    live: boolean
    workspace: Workspace
  },
  db: Database = database,
) {
  return await Transaction.call(async (tx) => {
    const result = await tx
      .insert(evaluationVersions)
      .values({
        ...evaluation,
        id: undefined,
        commitId: commit.id,
        evaluateLiveLogs: live,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          evaluationVersions.commitId,
          evaluationVersions.evaluationUuid,
        ],
        set: { evaluateLiveLogs: live, updatedAt: new Date() },
      })
      .returning()
      .then((r) => r[0]!)

    const updatedEvaluation = {
      ...result,
      uuid: result.evaluationUuid,
      versionId: result.id,
    } as unknown as EvaluationV2<T, M>

    publisher.publishLater({
      type: 'evaluationV2Updated',
      data: {
        evaluation: updatedEvaluation,
        workspaceId: workspace.id,
      },
    })

    return Result.ok({ evaluation: updatedEvaluation })
  }, db)
}
