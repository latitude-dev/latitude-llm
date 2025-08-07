import type {
  Commit,
  Dataset,
  DatasetRow,
  EvaluationMetric,
  EvaluationResultV2,
  EvaluationResultValue,
  EvaluationType,
  EvaluationV2,
  Experiment,
  ProviderLogDto,
  Workspace,
} from '../../../browser'
import { publisher } from '../../../events/publisher'
import { Result } from '../../../lib/Result'
import Transaction from '../../../lib/Transaction'
import { evaluationResultsV2 } from '../../../schema'

export async function createEvaluationResultV2<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>(
  {
    uuid,
    evaluation,
    providerLog,
    experiment,
    commit,
    dataset,
    datasetRow,
    value,
    usedForSuggestion,
    workspace,
  }: {
    uuid?: string
    evaluation: EvaluationV2<T, M>
    providerLog: ProviderLogDto
    commit: Commit
    experiment?: Experiment
    dataset?: Dataset
    datasetRow?: DatasetRow
    value: EvaluationResultValue<T, M>
    usedForSuggestion?: boolean
    workspace: Workspace
  },
  transaction = new Transaction(),
) {
  return await transaction.call(async (tx) => {
    const result = (await tx
      .insert(evaluationResultsV2)
      .values({
        uuid: uuid,
        workspaceId: workspace.id,
        commitId: commit.id,
        experimentId: experiment?.id,
        evaluationUuid: evaluation.uuid,
        datasetId: dataset?.id,
        evaluatedRowId: datasetRow?.id,
        evaluatedLogId: providerLog.id,
        ...value,
        usedForSuggestion: usedForSuggestion,
      })
      .returning()
      .then((r) => r[0]!)) as EvaluationResultV2<T, M>

    await publisher.publishLater({
      type: 'evaluationResultV2Created',
      data: {
        result: result,
        evaluation: evaluation,
        commit: commit,
        providerLog: providerLog,
        experiment: experiment,
        dataset: dataset,
        datasetRow: datasetRow,
        workspaceId: workspace.id,
      },
    })

    return Result.ok({ result })
  })
}
