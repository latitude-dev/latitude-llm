import {
  EvaluationMetric,
  EvaluationResultV2,
  EvaluationResultValue,
  EvaluationType,
  EvaluationV2,
  Span,
} from '../../../constants'
import { publisher } from '../../../events/publisher'
import { Result } from '../../../lib/Result'
import Transaction from '../../../lib/Transaction'
import { evaluationResultsV2 } from '../../../schema/models/evaluationResultsV2'
import { type Commit } from '../../../schema/models/types/Commit'
import { type Dataset } from '../../../schema/models/types/Dataset'
import { type DatasetRow } from '../../../schema/models/types/DatasetRow'
import { type Experiment } from '../../../schema/models/types/Experiment'
import { type Workspace } from '../../../schema/models/types/Workspace'

export async function createEvaluationResultV2<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>(
  {
    uuid,
    evaluation,
    span,
    experiment,
    commit,
    dataset,
    datasetRow,
    value,
    usedForSuggestion,
    workspace,
    dry = false,
  }: {
    uuid?: string
    evaluation: EvaluationV2<T, M>
    span: Span
    commit: Commit
    experiment?: Experiment
    dataset?: Dataset
    datasetRow?: DatasetRow
    value: EvaluationResultValue<T, M>
    usedForSuggestion?: boolean
    workspace: Workspace
    dry?: boolean
  },
  transaction = new Transaction(),
) {
  const values = {
    uuid: uuid,
    workspaceId: workspace.id,
    commitId: commit.id,
    experimentId: experiment?.id,
    evaluationUuid: evaluation.uuid,
    datasetId: dataset?.id,
    evaluatedRowId: datasetRow?.id,
    evaluatedSpanId: span.id,
    evaluatedTraceId: span.traceId,
    ...value,
    usedForSuggestion: usedForSuggestion,
  }

  if (dry) {
    return Result.ok({ result: values as EvaluationResultV2<T, M> })
  }

  return await transaction.call(
    async (tx) => {
      const result = (await tx
        .insert(evaluationResultsV2)
        .values(values)
        .returning()
        .then((r) => r[0]!)) as EvaluationResultV2<T, M>

      return Result.ok({ result })
    },
    async ({ result }) => {
      if (dry) return

      await publisher.publishLater({
        type: 'evaluationResultV2Created',
        data: {
          result: result,
          evaluation: evaluation,
          commit: commit,
          experiment: experiment,
          dataset: dataset,
          datasetRow: datasetRow,
          workspaceId: workspace.id,
          spanId: span.id,
          traceId: span.traceId,
        },
      })
    },
  )
}
