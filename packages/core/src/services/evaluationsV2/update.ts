import {
  Commit,
  EvaluationMetric,
  EvaluationOptions,
  EvaluationSettings,
  EvaluationType,
  EvaluationV2,
  Workspace,
} from '../../browser'
import { database, Database } from '../../client'
import { publisher } from '../../events/publisher'
import { assertCommitIsDraft } from '../../lib/assertCommitIsDraft'
import { compactObject } from '../../lib/compactObject'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { DocumentVersionsRepository } from '../../repositories'
import { evaluationVersions } from '../../schema'
import { validateEvaluationV2 } from './validate'

export async function updateEvaluationV2<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>(
  {
    evaluation,
    commit,
    settings,
    options,
    workspace,
  }: {
    evaluation: EvaluationV2<T, M>
    commit: Commit
    settings?: Partial<Omit<EvaluationSettings<T, M>, 'type' | 'metric'>>
    options?: Partial<EvaluationOptions>
    workspace: Workspace
  },
  db: Database = database,
) {
  //assertCommitIsDraft(commit).unwrap()

  const documentsRepository = new DocumentVersionsRepository(workspace.id, db)
  const document = await documentsRepository
    .getDocumentAtCommit({
      commitUuid: commit.uuid,
      documentUuid: evaluation.documentUuid,
    })
    .then((r) => r.unwrap())

  if (!settings) settings = {}
  settings = compactObject(settings)

  if (!options) options = {}
  options = compactObject(options)

  const { settings: vSettings, options: vOptions } = await validateEvaluationV2(
    {
      evaluation: evaluation,
      settings: { ...evaluation, ...settings },
      options: { ...evaluation, ...options },
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
    } as unknown as EvaluationV2<T, M>

    publisher.publishLater({
      type: 'evaluationV2Updated',
      data: {
        evaluation: evaluation,
        workspaceId: workspace.id,
      },
    })

    return Result.ok({ evaluation })
  }, db)
}
