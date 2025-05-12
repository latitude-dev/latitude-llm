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
import { compactObject } from '../../lib/compactObject'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { evaluationVersions } from '../../schema'
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
      settings: settings,
      options: options,
      document: document,
      commit: commit,
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
        evaluation: evaluation,
        workspaceId: workspace.id,
      },
    })

    return Result.ok({ evaluation })
  }, db)
}
