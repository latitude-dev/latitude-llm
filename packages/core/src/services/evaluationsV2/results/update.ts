import { and, eq } from 'drizzle-orm'
import {
  EvaluationMetric,
  EvaluationResultV2,
  EvaluationResultValue,
  EvaluationType,
  Workspace,
} from '../../../browser'
import { database, Database } from '../../../client'
import { publisher } from '../../../events/publisher'
import { Result } from '../../../lib/Result'
import Transaction from '../../../lib/Transaction'
import { evaluationResultsV2 } from '../../../schema'

export async function updateEvaluationResultV2<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>(
  {
    uuid,
    value,
    workspace,
  }: {
    uuid: string
    value: EvaluationResultValue<T, M>
    workspace: Workspace
  },
  db: Database = database,
) {
  return await Transaction.call(async (tx) => {
    const result = (await tx
      .update(evaluationResultsV2)
      .set({ ...value, updatedAt: new Date() })
      .where(
        and(
          eq(evaluationResultsV2.workspaceId, workspace.id),
          eq(evaluationResultsV2.uuid, uuid),
        ),
      )
      .returning()
      .then((r) => r[0]!)) as EvaluationResultV2<T, M>

    await publisher.publishLater({
      type: 'evaluationResultV2Updated',
      data: {
        result: result,
        workspaceId: workspace.id,
      },
    })

    return Result.ok({ result })
  }, db)
}
