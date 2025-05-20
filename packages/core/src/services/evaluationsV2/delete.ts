import { eq } from 'drizzle-orm'
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
import { EvaluationsV2Repository } from '../../repositories'
import { evaluationVersions } from '../../schema'
import Transaction from './../../lib/Transaction'

export async function deleteEvaluationV2<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
>(
  {
    evaluation,
    commit,
    workspace,
  }: {
    evaluation: EvaluationV2<T, M>
    commit: Commit
    workspace: Workspace
  },
  db: Database = database,
) {
  return await Transaction.call(async (tx) => {
    const repository = new EvaluationsV2Repository(workspace.id, tx)
    const existsAnotherVersion = await repository
      .existsAnotherVersion({
        commitId: commit.id,
        evaluationUuid: evaluation.uuid,
      })
      .then((r) => r.unwrap())

    if (existsAnotherVersion) {
      const result = await tx
        .insert(evaluationVersions)
        .values({
          ...evaluation,
          id: undefined,
          commitId: commit.id,
          deletedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            evaluationVersions.commitId,
            evaluationVersions.evaluationUuid,
          ],
          set: { deletedAt: new Date() },
        })
        .returning()
        .then((r) => r[0]!)

      evaluation = {
        ...result,
        uuid: result.evaluationUuid,
        versionId: result.id,
      } as unknown as EvaluationV2<T, M>
    } else {
      await tx
        .delete(evaluationVersions)
        .where(eq(evaluationVersions.id, evaluation.versionId))

      evaluation.deletedAt = new Date()
    }

    await publisher.publishLater({
      type: 'evaluationV2Deleted',
      data: {
        evaluation: evaluation,
        workspaceId: workspace.id,
      },
    })

    return Result.ok({ evaluation })
  }, db)
}
