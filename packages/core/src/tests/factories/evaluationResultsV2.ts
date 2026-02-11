import { eq } from 'drizzle-orm'
import { database } from '../../client'
import {
  DEFAULT_DATASET_LABEL,
  EvaluationMetric,
  EvaluationResultV2,
  EvaluationResultValue,
  EvaluationType,
  EvaluationV2,
  RuleEvaluationMetric,
  SpanType,
  SpanWithDetails,
} from '../../constants'
import { evaluationResultsV2 } from '../../schema/models/evaluationResultsV2'
import { type Commit } from '../../schema/models/types/Commit'
import { type Dataset } from '../../schema/models/types/Dataset'
import { type DatasetRow } from '../../schema/models/types/DatasetRow'
import { type Experiment } from '../../schema/models/types/Experiment'
import { type Workspace } from '../../schema/models/types/Workspace'
import { createEvaluationResultV2 as createEvaluationResultSvc } from '../../services/evaluationsV2/results/create'

type CreateEvaluationResultV2Args<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = {
  evaluation: EvaluationV2<T, M>
  span: SpanWithDetails<SpanType.Prompt>
  commit: Commit
  experiment?: Experiment
  dataset?: Dataset
  datasetLabel?: string
  datasetRow?: DatasetRow
  workspace: Workspace
  createdAt?: Date
} & Partial<EvaluationResultValue<T, M>>

// prettier-ignore
export async function createEvaluationResultV2(
  args: Omit<CreateEvaluationResultV2Args, keyof EvaluationResultValue>,
): Promise<EvaluationResultV2<EvaluationType.Rule, RuleEvaluationMetric.ExactMatch>>

// prettier-ignore
export async function createEvaluationResultV2<T extends EvaluationType, M extends EvaluationMetric<T>>(
  args: CreateEvaluationResultV2Args<T, M>
): Promise<EvaluationResultV2<T, M>>

export async function createEvaluationResultV2<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>(args: CreateEvaluationResultV2Args<T, M>): Promise<EvaluationResultV2<T, M>> {
  const { result } = await createEvaluationResultSvc({
    evaluation: args.evaluation,
    span: args.span,
    commit: args.commit,
    experiment: args.experiment,
    dataset: args.dataset,
    datasetRow: args.datasetRow,
    value: {
      score: args.score !== undefined ? args.score : 1,
      normalizedScore:
        args.normalizedScore !== undefined ? args.normalizedScore : 100,
      metadata:
        args.metadata !== undefined
          ? args.metadata
          : {
              configuration: args.evaluation.configuration,
              actualOutput: 'actual output',
              expectedOutput: 'expected output',
              datasetLabel: args.datasetLabel ?? DEFAULT_DATASET_LABEL,
            },
      hasPassed: args.hasPassed !== undefined ? args.hasPassed : true,
      error: args.error !== undefined ? args.error : null,
    } as EvaluationResultValue<T, M>,
    workspace: args.workspace,
  }).then((r) => r.unwrap())

  result.createdAt = args.createdAt ?? result.createdAt
  await database
    .update(evaluationResultsV2)
    .set({ createdAt: result.createdAt })
    .where(eq(evaluationResultsV2.id, result.id))

  return result as EvaluationResultV2<T, M>
}
