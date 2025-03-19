import { eq } from 'drizzle-orm'
import {
  Commit,
  EvaluationMetric,
  EvaluationResultV2,
  EvaluationResultValue,
  EvaluationType,
  EvaluationV2,
  ProviderLog,
  RuleEvaluationMetric,
  Workspace,
} from '../../browser'
import { database } from '../../client'
import { evaluationResultsV2 } from '../../schema'
import * as services from '../../services/evaluationsV2'

type CreateEvaluationResultV2Args<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = {
  evaluation: EvaluationV2<T, M>
  providerLog: ProviderLog
  commit: Commit
  usedForSuggestion?: boolean
  workspace: Workspace
  createdAt?: Date
} & Partial<EvaluationResultValue<T, M>>

// prettier-ignore
// eslint-disable-next-line no-redeclare
export async function createEvaluationResultV2(
  args: Omit<CreateEvaluationResultV2Args, keyof EvaluationResultValue>,
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
  const { result } = await services
    .createEvaluationResultV2({
      evaluation: args.evaluation,
      providerLog: args.providerLog,
      commit: args.commit,
      value: {
        score: args.score ?? 1,
        normalizedScore: args.normalizedScore ?? 100,
        metadata: args.metadata ?? {},
        hasPassed: args.hasPassed ?? true,
        error: args.error ?? null,
      } as EvaluationResultValue<T, M>,
      usedForSuggestion: args.usedForSuggestion,
      workspace: args.workspace,
    })
    .then((r) => r.unwrap())

  result.createdAt = args.createdAt ?? result.createdAt
  await database
    .update(evaluationResultsV2)
    .set({ createdAt: result.createdAt })
    .where(eq(evaluationResultsV2.id, result.id))

  return result as EvaluationResultV2<T, M>
}
