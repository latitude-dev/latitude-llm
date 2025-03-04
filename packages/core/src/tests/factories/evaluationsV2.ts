import { eq } from 'drizzle-orm'
import {
  Commit,
  DocumentVersion,
  EvaluationCondition,
  EvaluationConfiguration,
  EvaluationMetric,
  EvaluationType,
  EvaluationV2,
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
  commit: Commit
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
  createdAt?: Date
}

// prettier-ignore
export async function createEvaluationV2(
  args: Omit<CreateEvaluationV2Args, 'type' | 'metric' | 'configuration'>,
): Promise<EvaluationV2<EvaluationType.Rule, RuleEvaluationMetric.ExactMatch>>

// prettier-ignore
export async function createEvaluationV2<T extends EvaluationType, M extends EvaluationMetric<T>>(
  args: CreateEvaluationV2Args<T, M>
): Promise<EvaluationV2<T, M>>

// prettier-ignore
export async function createEvaluationV2<T extends EvaluationType, M extends EvaluationMetric<T>>(
  args: CreateEvaluationV2Args<T, M>
): Promise<EvaluationV2<T, M>> { 
  // TODO: Use create service

  const {
    document,
    commit,
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
    createdAt,
  } = args

  const result = await database
    .insert(evaluationVersions)
    .values({
      workspaceId: workspace.id,
      commitId: commit.id,
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
      ...(createdAt && { createdAt }),
    })
    .returning()

  const evaluation = result[0]!

  return {
    ...evaluation,
    uuid: evaluation.evaluationUuid,
    versionId: evaluation.id,
  } as unknown as EvaluationV2<T, M>
}

export async function deleteEvaluationV2({
  evaluation,
}: {
  evaluation: EvaluationV2
}): Promise<void> {
  // TODO: Use delete service

  await database
    .delete(evaluationVersions)
    .where(eq(evaluationVersions.id, evaluation.versionId))
}
