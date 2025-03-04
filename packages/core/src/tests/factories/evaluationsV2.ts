import { eq } from 'drizzle-orm'
import {
  Commit,
  DocumentVersion,
  EvaluationCondition,
  EvaluationConfiguration,
  EvaluationMetric,
  EvaluationOptions,
  EvaluationSettings,
  EvaluationType,
  EvaluationV2,
  RuleEvaluationMetric,
  Workspace,
} from '../../browser'
import { database } from '../../client'
import { evaluationVersions } from '../../schema'
import * as services from '../../services/evaluationsV2'

type CreateEvaluationV2Args<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
  C extends EvaluationConfiguration<M> = EvaluationConfiguration<M>,
> = {
  document: DocumentVersion
  commit: Commit
  workspace: Workspace
  createdAt?: Date
} & Partial<EvaluationSettings<T, M, C>> &
  Partial<EvaluationOptions>

// prettier-ignore
// eslint-disable-next-line no-redeclare
export async function createEvaluationV2(
  args: Omit<CreateEvaluationV2Args, 'type' | 'metric' | 'configuration'>,
): Promise<EvaluationV2<EvaluationType.Rule, RuleEvaluationMetric.ExactMatch>>

// prettier-ignore
// eslint-disable-next-line no-redeclare
export async function createEvaluationV2<T extends EvaluationType, M extends EvaluationMetric<T>>(
  args: CreateEvaluationV2Args<T, M>
): Promise<EvaluationV2<T, M>>

// eslint-disable-next-line no-redeclare
export async function createEvaluationV2<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>(args: CreateEvaluationV2Args<T, M>): Promise<EvaluationV2<T, M>> {
  const { evaluation } = await services
    .createEvaluationV2({
      document: args.document,
      commit: args.commit,
      settings: {
        name: args.name ?? 'Evaluation',
        description: args.description ?? 'Description',
        type: args.type ?? EvaluationType.Rule,
        metric: args.metric ?? RuleEvaluationMetric.ExactMatch,
        condition: args.condition ?? EvaluationCondition.Greater,
        threshold: args.threshold ?? 50,
        configuration: args.configuration ?? { DatasetLabel: 'expected' },
      },
      options: {
        live: args.live,
        enableSuggestions: args.enableSuggestions,
        autoApplySuggestions: args.autoApplySuggestions,
      },
      workspace: args.workspace,
    })
    .then((r) => r.unwrap())

  evaluation.createdAt = args.createdAt ?? evaluation.createdAt
  await database
    .update(evaluationVersions)
    .set({ createdAt: evaluation.createdAt })
    .where(eq(evaluationVersions.id, evaluation.versionId))

  return evaluation as EvaluationV2<T, M>
}
