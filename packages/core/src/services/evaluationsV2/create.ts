import {
  Commit,
  DocumentVersion,
  EvaluationMetric,
  EvaluationOptions,
  EvaluationSettings,
  EvaluationType,
  EvaluationV2,
  Workspace,
} from '../../browser'
import { database, Database } from '../../client'
import { publisher } from '../../events/publisher'
import { compactObject, Result, Transaction } from '../../lib'
import { evaluationVersions } from '../../schema'
import { pingProjectUpdate } from '../projects'
import { validateEvaluationV2 } from './validate'

export async function createEvaluationV2<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>(
  {
    document,
    commit,
    settings,
    options,
    workspace,
  }: {
    document: DocumentVersion
    commit: Commit
    settings: EvaluationSettings<T, M>
    options?: Partial<EvaluationOptions>
    workspace: Workspace
  },
  db: Database = database,
) {
  if (!options) options = {}
  options = compactObject(options)

  const { settings: vSettings, options: vOptions } = await validateEvaluationV2(
    {
      document: document,
      commit: commit,
      settings: settings,
      options: options,
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
        workspaceId: workspace.id,
        commitId: commit.id,
        documentUuid: document.documentUuid,
        ...settings,
        ...options,
      })
      .returning()
      .then((r) => r[0]!)

    const evaluation = {
      ...result,
      uuid: result.evaluationUuid,
      versionId: result.id,
    } as unknown as EvaluationV2<T, M>

    await publisher.publishLater({
      type: 'evaluationV2Created',
      data: {
        workspaceId: workspace.id,
        evaluation: evaluation,
      },
    })

    await pingProjectUpdate({ projectId: commit.projectId }, tx).then((r) =>
      r.unwrap(),
    )

    return Result.ok({ evaluation })
  }, db)
}
