import {
  Commit,
  EvaluationConfiguration,
  EvaluationMetric,
  EvaluationOptions,
  EvaluationSettings,
  EvaluationType,
  EvaluationV2,
  Workspace,
} from '../../browser'
import { database, Database } from '../../client'
import { compactObject, Result, Transaction } from '../../lib'
import { assertCommitIsDraft } from '../../lib/assertCommitIsDraft'
import { evaluationVersions } from '../../schema'
import { pingProjectUpdate } from '../projects'
import { validateEvaluationV2 } from './validate'

export async function updateEvaluationV2<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
  C extends EvaluationConfiguration<M> = EvaluationConfiguration<M>,
>(
  {
    evaluation,
    commit,
    settings,
    options,
    workspace,
  }: {
    evaluation: EvaluationV2<T, M, C>
    commit: Commit
    settings?: Partial<Omit<EvaluationSettings<T, M, C>, 'type' | 'metric'>>
    options?: Partial<EvaluationOptions>
    workspace: Workspace
  },
  db: Database = database,
) {
  assertCommitIsDraft(commit).unwrap()

  if (!settings) settings = {}
  settings = compactObject(settings)

  if (!options) options = {}
  options = compactObject(options)

  const { settings: vSettings, options: vOptions } = await validateEvaluationV2(
    {
      evaluation: evaluation,
      commit: commit,
      settings: { ...evaluation, ...settings },
      options: { ...evaluation, ...options },
      workspace: workspace,
    },
    db,
  ).then((r) => r.unwrap())
  settings = vSettings
  options = vOptions

  return await Transaction.call(async (tx) => {
    const result = await tx
      .insert(evaluationVersions)
      .values({
        ...evaluation,
        id: undefined,
        commitId: commit.id,
        ...settings,
        ...options,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          evaluationVersions.commitId,
          evaluationVersions.evaluationUuid,
        ],
        set: { ...settings, ...options, updatedAt: new Date() },
      })
      .returning()
      .then((r) => r[0]!)

    evaluation = {
      ...result,
      uuid: result.evaluationUuid,
      versionId: result.id,
    } as unknown as EvaluationV2<T, M, C>

    await pingProjectUpdate({ projectId: commit.projectId }, tx).then((r) =>
      r.unwrap(),
    )

    return Result.ok({ evaluation })
  }, db)
}
