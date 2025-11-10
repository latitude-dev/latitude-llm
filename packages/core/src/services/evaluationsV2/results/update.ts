import { and, eq } from 'drizzle-orm'
import {
  EvaluationMetric,
  EvaluationResultV2,
  EvaluationResultValue,
  EvaluationType,
} from '../../../constants'
import { publisher } from '../../../events/publisher'
import { Result } from '../../../lib/Result'
import Transaction from '../../../lib/Transaction'
import { evaluationResultsV2 } from '../../../schema/models/evaluationResultsV2'
import { type Commit } from '../../../schema/models/types/Commit'
import { type Workspace } from '../../../schema/models/types/Workspace'

export async function updateEvaluationResultV2<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>(
  {
    workspace,
    commit,
    result: { uuid },
    value,
  }: {
    workspace: Workspace
    commit: Commit
    result: EvaluationResultV2<T, M>
    value: Partial<EvaluationResultValue<T, M>>
  },
  transaction = new Transaction(),
) {
  return await transaction.call(
    async (tx) => {
      const result = (await tx
        .update(evaluationResultsV2)
        .set({
          commitId: commit.id,
          ...value,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(evaluationResultsV2.workspaceId, workspace.id),
            eq(evaluationResultsV2.uuid, uuid),
          ),
        )
        .returning()
        .then((r) => r[0]!)) as EvaluationResultV2<T, M>

      return Result.ok({ result })
    },
    async ({ result }) => {
      await publisher.publishLater({
        type: 'evaluationResultV2Updated',
        data: {
          result: result,
          workspaceId: workspace.id,
        },
      })
    },
  )
}
