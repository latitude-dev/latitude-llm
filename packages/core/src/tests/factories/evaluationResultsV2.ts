import { eq } from 'drizzle-orm'
import {
  type Commit,
  type Dataset,
  type DatasetRow,
  DEFAULT_DATASET_LABEL,
  type EvaluationMetric,
  type EvaluationResultV2,
  type EvaluationResultValue,
  type EvaluationType,
  type EvaluationV2,
  type Experiment,
  type ProviderLog,
  type ProviderLogDto,
  type RuleEvaluationMetric,
  type Workspace,
} from '../../browser'
import { database } from '../../client'
import { evaluationResultsV2 } from '../../schema'
import { createEvaluationResultV2 as createEvaluationResultSvc } from '../../services/evaluationsV2/results/create'
import serializeProviderLog from '../../services/providerLogs/serialize'

type CreateEvaluationResultV2Args<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = {
  evaluation: EvaluationV2<T, M>
  providerLog: ProviderLog | ProviderLogDto
  commit: Commit
  experiment?: Experiment
  dataset?: Dataset
  datasetLabel?: string
  datasetRow?: DatasetRow
  usedForSuggestion?: boolean
  workspace: Workspace
  createdAt?: Date
} & Partial<EvaluationResultValue<T, M>>

export async function createEvaluationResultV2(
  args: Omit<CreateEvaluationResultV2Args, keyof EvaluationResultValue>,
): Promise<EvaluationResultV2<EvaluationType.Rule, RuleEvaluationMetric.ExactMatch>>

export async function createEvaluationResultV2<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>(args: CreateEvaluationResultV2Args<T, M>): Promise<EvaluationResultV2<T, M>>

export async function createEvaluationResultV2<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>(args: CreateEvaluationResultV2Args<T, M>): Promise<EvaluationResultV2<T, M>> {
  const { result } = await createEvaluationResultSvc({
    evaluation: args.evaluation,
    providerLog:
      'response' in args.providerLog ? args.providerLog : serializeProviderLog(args.providerLog),
    commit: args.commit,
    experiment: args.experiment,
    dataset: args.dataset,
    datasetRow: args.datasetRow,
    value: {
      score: args.score ?? 1,
      normalizedScore: args.normalizedScore ?? 100,
      metadata: args.metadata ?? {
        configuration: args.evaluation.configuration,
        actualOutput: 'actual output',
        expectedOutput: 'expected output',
        datasetLabel: args.datasetLabel ?? DEFAULT_DATASET_LABEL,
      },
      hasPassed: args.hasPassed ?? true,
      error: args.error ?? null,
    } as EvaluationResultValue<T, M>,
    usedForSuggestion: args.usedForSuggestion,
    workspace: args.workspace,
  }).then((r) => r.unwrap())

  result.createdAt = args.createdAt ?? result.createdAt
  await database
    .update(evaluationResultsV2)
    .set({ createdAt: result.createdAt })
    .where(eq(evaluationResultsV2.id, result.id))

  return result as EvaluationResultV2<T, M>
}
