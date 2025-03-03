import {
  DocumentVersion,
  EvaluationCondition,
  EvaluationConfiguration,
  EvaluationMetric,
  EvaluationType,
  EvaluationV2,
  RuleEvaluationExactMatchConfiguration,
  RuleEvaluationMetric,
  Workspace,
} from '../../browser'
import { database } from '../../client'
import { evaluationVersions } from '../../schema'

type CreateEvaluationV2Args<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
  C extends EvaluationConfiguration<M> = EvaluationConfiguration<M>,
> = {
  document: DocumentVersion
  workspace: Workspace
  name?: string
  description?: string
  type?: T
  metric?: M
  condition?: EvaluationCondition
  threshold?: number
  configuration?: C
  live?: boolean
  enableSuggestions?: boolean
  autoApplySuggestions?: boolean
}

// prettier-ignore
export async function createEvaluationV2(
  args: Omit<CreateEvaluationV2Args, 'type' | 'metric' | 'configuration'>,
): Promise<EvaluationV2<EvaluationType.Rule, RuleEvaluationMetric.ExactMatch, RuleEvaluationExactMatchConfiguration>>

// prettier-ignore
export async function createEvaluationV2<T extends EvaluationType, M extends EvaluationMetric<T>, C extends EvaluationConfiguration<M>>(
  args: CreateEvaluationV2Args<T, M, C>
): Promise<EvaluationV2<T, M, C>>

export async function createEvaluationV2<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
  C extends EvaluationConfiguration<M>,
>(args: CreateEvaluationV2Args<T, M, C>): Promise<EvaluationV2<T, M, C>> {
  const {
    document,
    workspace,
    name = 'Evaluation',
    description = 'Description',
    type = EvaluationType.Rule,
    metric = RuleEvaluationMetric.ExactMatch,
    condition = EvaluationCondition.Greater,
    threshold = 50,
    configuration = { DatasetLabel: 'expected' },
    live,
    enableSuggestions,
    autoApplySuggestions,
  } = args

  const result = await database
    .insert(evaluationVersions)
    .values({
      workspaceId: workspace.id,
      commitId: document.commitId,
      documentUuid: document.documentUuid,
      name,
      description,
      type,
      metric,
      condition,
      threshold,
      configuration,
      live,
      enableSuggestions,
      autoApplySuggestions,
    })
    .returning()

  const evaluation = result[0]!

  return {
    ...evaluation,
    uuid: evaluation.evaluationUuid,
    versionId: evaluation.id,
  } as unknown as EvaluationV2<T, M, C>
}
