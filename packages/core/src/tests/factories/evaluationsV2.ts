import { faker } from '@faker-js/faker'
import { eq } from 'drizzle-orm'
import { database } from '../../client'
import {
  EvaluationMetric,
  EvaluationOptions,
  EvaluationSettings,
  EvaluationType,
  EvaluationV2,
  RuleEvaluationMetric,
} from '../../constants'
import { evaluationVersions } from '../../schema/models/evaluationVersions'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Workspace } from '../../schema/models/types/Workspace'
import { createEvaluationV2 as createEvaluationSvc } from '../../services/evaluationsV2/create'

type CreateEvaluationV2Args<
  T extends EvaluationType = EvaluationType,
  M extends EvaluationMetric<T> = EvaluationMetric<T>,
> = {
  document: DocumentVersion
  commit: Commit
  workspace: Workspace
  createdAt?: Date
  issueId?: number
} & Partial<EvaluationSettings<T, M>> &
  Partial<EvaluationOptions>

// prettier-ignore

export async function createEvaluationV2(
  args: Omit<CreateEvaluationV2Args, 'type' | 'metric' | 'configuration'>,
): Promise<EvaluationV2<EvaluationType.Rule, RuleEvaluationMetric.ExactMatch>>

// prettier-ignore

export async function createEvaluationV2<T extends EvaluationType, M extends EvaluationMetric<T>>(
  args: CreateEvaluationV2Args<T, M>
): Promise<EvaluationV2<T, M>>

export async function createEvaluationV2<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>(args: CreateEvaluationV2Args<T, M>): Promise<EvaluationV2<T, M>> {
  const { evaluation } = await createEvaluationSvc({
    document: args.document,
    commit: args.commit,
    settings: {
      name: args.name ?? `${faker.word.noun()}-${faker.string.uuid()}`,
      description: args.description ?? faker.lorem.sentence(),
      type: args.type ?? EvaluationType.Rule,
      metric: args.metric ?? RuleEvaluationMetric.ExactMatch,
      configuration: args.configuration ?? {
        reverseScale: false,
        actualOutput: {
          messageSelection: 'last',
          parsingFormat: 'string',
        },
        expectedOutput: {
          parsingFormat: 'string',
        },
        caseInsensitive: false,
      },
    },
    options: {
      evaluateLiveLogs: args.evaluateLiveLogs,
    },
    workspace: args.workspace,
    issueId: args.issueId,
  }).then((r) => r.unwrap())

  evaluation.createdAt = args.createdAt ?? evaluation.createdAt
  await database
    .update(evaluationVersions)
    .set({ createdAt: evaluation.createdAt })
    .where(eq(evaluationVersions.id, evaluation.versionId))

  return evaluation as EvaluationV2<T, M>
}
