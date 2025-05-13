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
    options = {},
    workspace,
    createdAt = new Date(),
    updatedAt = new Date(),
  }: {
    document: DocumentVersion
    commit: Commit
    settings: EvaluationSettings<T, M>
    options?: Partial<EvaluationOptions>
    createdAt?: Date
    updatedAt?: Date
    workspace: Workspace
  },
  db: Database = database,
) {
  options = compactObject(options)

  const validateResult = await validateEvaluationV2(
    { mode: 'create', settings, options, document, commit, workspace },
    db,
  )

  if (validateResult.error) return validateResult

  const validate = validateResult.value

  return await Transaction.call(async (tx) => {
    const result = await tx
      .insert(evaluationVersions)
      .values({
        workspaceId: workspace.id,
        commitId: commit.id,
        documentUuid: document.documentUuid,
        ...validate.settings,
        ...validate.options,
        createdAt,
        updatedAt,
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
