import { eq } from 'drizzle-orm'
import {
  Commit,
  DocumentVersion,
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
import { createEvaluationV2 as createEvaluationV2Fn } from '../../services/evaluationsV2/create'

type CreateEvaluationV2Args<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = {
  document: DocumentVersion
  commit: Commit
  workspace: Workspace
  createdAt?: Date
} & Partial<EvaluationSettings<T, M>> &
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
  const { evaluation } = await createEvaluationV2Fn({
    document: args.document,
    commit: args.commit,
    settings: {
      name: args.name ?? 'Evaluation',
      description: args.description ?? 'Description',
      type: args.type ?? EvaluationType.Rule,
      metric: args.metric ?? RuleEvaluationMetric.ExactMatch,
      configuration: args.configuration ?? {
        reverseScale: false,
        caseInsensitive: false,
      },
    },
    options: {
      evaluateLiveLogs: args.evaluateLiveLogs,
      enableSuggestions: args.enableSuggestions,
      autoApplySuggestions: args.autoApplySuggestions,
    },
    workspace: args.workspace,
  }).then((r) => r.unwrap())

  evaluation.createdAt = args.createdAt ?? evaluation.createdAt
  await database
    .update(evaluationVersions)
    .set({ createdAt: evaluation.createdAt })
    .where(eq(evaluationVersions.id, evaluation.versionId))

  return evaluation as EvaluationV2<T, M>
}
