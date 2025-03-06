import {
  Commit,
  EvaluationMetric,
  EvaluationResultMetadata,
  EvaluationResultV2,
  EvaluationType,
  EvaluationV2,
  ProviderLog,
  RuleEvaluationMetric,
  Workspace,
} from '../../browser'
import { database } from '../../client'
import { evaluationResultsV2 } from '../../schema'

type CreateEvaluationResultV2Args<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
  R extends EvaluationResultMetadata<M> = EvaluationResultMetadata<M>,
> = {
  evaluation: EvaluationV2<T, M>
  providerLog: ProviderLog
  commit: Commit
  workspace: Workspace
  score?: number
  metadata?: R
  usedForSuggestion?: boolean
  createdAt?: Date
}

// prettier-ignore
// eslint-disable-next-line no-redeclare
export async function createEvaluationResultV2(
  args: Omit<CreateEvaluationResultV2Args, 'metadata'>,
): Promise<EvaluationResultV2<EvaluationType.Rule, RuleEvaluationMetric.ExactMatch>>

// prettier-ignore
// eslint-disable-next-line no-redeclare
export async function createEvaluationResultV2<T extends EvaluationType, M extends EvaluationMetric<T>>(
  args: CreateEvaluationResultV2Args<T, M>
): Promise<EvaluationResultV2<T, M>>

// eslint-disable-next-line no-redeclare
export async function createEvaluationResultV2<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>(args: CreateEvaluationResultV2Args<T, M>): Promise<EvaluationResultV2<T, M>> {
  // TODO: Use create service

  const {
    evaluation,
    providerLog,
    commit,
    workspace,
    score = 75,
    metadata = {},
    usedForSuggestion,
    createdAt,
  } = args

  const result = await database
    .insert(evaluationResultsV2)
    .values({
      workspaceId: workspace.id,
      commitId: commit.id,
      evaluationUuid: evaluation.uuid,
      evaluatedLogId: providerLog.id,
      score: score,
      metadata: metadata,
      usedForSuggestion: usedForSuggestion,
      ...(createdAt && { createdAt }),
    })
    .returning()

  return result[0]! as unknown as EvaluationResultV2<T, M>
}
