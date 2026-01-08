import {
  CompositeEvaluationMetric,
  EvaluationMetric,
  EvaluationType,
  EvaluationV2,
} from '../../constants'
import { Database } from '../../client'
import { Result, TypedResult } from '../../lib/Result'
import Transaction, { PromisedResult } from '../../lib/Transaction'
import { EvaluationsV2Repository } from '../../repositories'
import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Workspace } from '../../schema/models/types/Workspace'
import { updateDocumentUnsafe } from '../documents/updateUnsafe'
import { createEvaluationV2 } from './create'
import { deleteEvaluationV2 } from './delete'
import { updateEvaluationV2 } from './update'

type CompositeTarget = EvaluationV2<
  EvaluationType.Composite,
  CompositeEvaluationMetric.Average
>

async function getCompositeTarget({
  document,
  commit,
  workspace,
  db,
}: {
  document: DocumentVersion
  commit: Commit
  workspace: Workspace
  db: Database
}): PromisedResult<CompositeTarget | undefined> {
  if (!document.mainEvaluationUuid) {
    return Result.ok(undefined)
  }

  const repository = new EvaluationsV2Repository(workspace.id, db)
  const result = await repository.getAtCommitByDocument({
    projectId: commit.projectId,
    commitUuid: commit.uuid,
    documentUuid: document.documentUuid,
    evaluationUuid: document.mainEvaluationUuid,
  })

  if (result.error) return Result.error(result.error)

  return Result.ok(result.value as CompositeTarget | undefined)
}

async function createCompositeEvaluation<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>(
  {
    evaluation,
    document,
    commit,
    workspace,
  }: {
    evaluation: EvaluationV2<T, M>
    document: DocumentVersion
    commit: Commit
    workspace: Workspace
  },
  transaction: Transaction,
): PromisedResult<CompositeTarget> {
  return await transaction.call(async () => {
    const creating = await createEvaluationV2(
      {
        document,
        commit,
        settings: {
          name: 'Performance',
          description: 'Measures the overall performance',
          type: EvaluationType.Composite,
          metric: CompositeEvaluationMetric.Average,
          configuration: {
            reverseScale: false,
            actualOutput: {
              messageSelection: 'last',
              parsingFormat: 'string',
            },
            expectedOutput: {
              parsingFormat: 'string',
            },
            evaluationUuids: [evaluation.uuid],
            minThreshold: 75,
          },
        },
        options: {
          evaluateLiveLogs: false,
          enableSuggestions: false,
          autoApplySuggestions: false,
        },
        workspace,
      },
      transaction,
    )

    if (creating.error) return Result.error(creating.error)

    const newComposite = creating.value.evaluation

    await updateDocumentUnsafe(
      { document, commit, data: { mainEvaluationUuid: newComposite.uuid } },
      transaction,
    )

    return Result.ok(newComposite)
  })
}

async function deleteCompositeEvaluation(
  {
    target,
    document,
    commit,
    workspace,
  }: {
    target: CompositeTarget
    document: DocumentVersion
    commit: Commit
    workspace: Workspace
  },
  transaction: Transaction,
): PromisedResult<undefined> {
  return await transaction.call(async () => {
    const deleting = await deleteEvaluationV2(
      { evaluation: target, commit, workspace },
      transaction,
    )

    if (deleting.error) return Result.error(deleting.error)

    await updateDocumentUnsafe(
      { document, commit, data: { mainEvaluationUuid: null } },
      transaction,
    )

    return Result.nil()
  })
}

async function removeFromComposite<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>(
  {
    evaluation,
    target,
    commit,
    workspace,
  }: {
    evaluation: EvaluationV2<T, M>
    target: CompositeTarget
    commit: Commit
    workspace: Workspace
  },
  transaction: Transaction,
): PromisedResult<CompositeTarget> {
  const newEvaluationUuids = target.configuration.evaluationUuids.filter(
    (uuid) => uuid !== evaluation.uuid,
  )

  const updating = await updateEvaluationV2(
    {
      evaluation: target,
      commit,
      workspace,
      settings: {
        configuration: {
          ...target.configuration,
          evaluationUuids: newEvaluationUuids,
        },
      },
    },
    transaction,
  )

  if (updating.error) return updating

  return Result.ok(updating.value.evaluation)
}

async function addToComposite<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>(
  {
    evaluation,
    target,
    commit,
    workspace,
  }: {
    evaluation: EvaluationV2<T, M>
    target: CompositeTarget
    commit: Commit
    workspace: Workspace
  },
  transaction: Transaction,
): PromisedResult<CompositeTarget> {
  const newEvaluationUuids = [
    ...target.configuration.evaluationUuids,
    evaluation.uuid,
  ]

  const updating = await updateEvaluationV2(
    {
      evaluation: target,
      commit,
      workspace,
      settings: {
        configuration: {
          ...target.configuration,
          evaluationUuids: newEvaluationUuids,
        },
      },
    },
    transaction,
  )

  if (updating.error) return updating

  return Result.ok(updating.value.evaluation)
}

/**
 * Syncs the default composite evaluation for a document.
 *
 * This function manages the "Performance" composite evaluation that combines
 * all issue-linked evaluations for a document:
 *
 * - CREATE: When no composite exists and evaluation has an issue → create composite
 * - ADD: When composite exists and evaluation has an issue → add to composite
 * - REMOVE: When evaluation loses its issue → remove from composite
 * - DELETE: When removing the last evaluation from composite → delete composite
 *   and clear mainEvaluationUuid on document.
 */
export async function syncDefaultCompositeTarget<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>(
  {
    evaluation,
    issueId,
    document,
    commit,
    workspace,
  }: {
    evaluation: EvaluationV2<T, M>
    issueId: number | null
    document: DocumentVersion
    commit: Commit
    workspace: Workspace
  },
  transaction = new Transaction(),
): Promise<TypedResult<CompositeTarget | undefined>> {
  const hasIssue = issueId !== null

  return await transaction.call(async (tx) => {
    const targetResult = await getCompositeTarget({
      document,
      commit,
      workspace,
      db: tx,
    })

    if (targetResult.error) return targetResult

    const target = targetResult.value
    const included = !!target?.configuration.evaluationUuids.includes(
      evaluation.uuid,
    )

    // No composite exists
    if (!target) {
      if (!hasIssue) return Result.nil()

      return createCompositeEvaluation(
        { evaluation, document, commit, workspace },
        transaction,
      )
    }

    // Composite exists and evaluation is included
    if (included) {
      if (hasIssue) return Result.nil()

      const isLastOne = target.configuration.evaluationUuids.length === 1
      if (isLastOne) {
        return deleteCompositeEvaluation(
          { target, document, commit, workspace },
          transaction,
        )
      }

      return removeFromComposite(
        { evaluation, target, commit, workspace },
        transaction,
      )
    }

    // Composite exists but evaluation is not included
    if (!hasIssue) return Result.nil()

    return addToComposite(
      { evaluation, target, commit, workspace },
      transaction,
    )
  })
}
