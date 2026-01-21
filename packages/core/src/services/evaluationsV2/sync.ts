import { Database } from '../../client'
import {
  CompositeEvaluationMetric,
  EvaluationSettings,
  EvaluationType,
  EvaluationV2,
} from '../../constants'
import { Result, TypedResult } from '../../lib/Result'
import Transaction, { PromisedResult } from '../../lib/Transaction'
import {
  DocumentVersionsRepository,
  EvaluationsV2Repository,
} from '../../repositories'
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

type CompositeSettings = EvaluationSettings<
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

function generateCompositeEvaluationSettings(
  evaluations: EvaluationV2[],
): CompositeSettings {
  return {
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
      evaluationUuids: evaluations.map((evaluation) => evaluation.uuid),
      minThreshold: 75,
    },
  }
}

async function createCompositeEvaluation(
  {
    evaluations,
    document,
    commit,
    workspace,
  }: {
    evaluations: EvaluationV2[]
    document: DocumentVersion
    commit: Commit
    workspace: Workspace
  },
  transaction: Transaction,
): PromisedResult<CompositeTarget> {
  return await transaction.call(async () => {
    const createResult = await createEvaluationV2(
      {
        document,
        commit,
        settings: generateCompositeEvaluationSettings(evaluations),
        options: {
          evaluateLiveLogs: false,
          enableSuggestions: false,
          autoApplySuggestions: false,
        },
        workspace,
      },
      transaction,
    )

    if (createResult.error) return createResult
    const newComposite = createResult.unwrap().evaluation

    await updateDocumentUnsafe(
      { document, commit, data: { mainEvaluationUuid: newComposite.uuid } },
      transaction,
    )

    return Result.ok(newComposite)
  })
}

async function updateCompositeEvaluation(
  {
    compositeEvaluation,
    evaluations,
    commit,
    workspace,
  }: {
    compositeEvaluation: CompositeTarget
    evaluations: EvaluationV2[]
    commit: Commit
    workspace: Workspace
  },
  transaction: Transaction,
): PromisedResult<CompositeTarget> {
  return await transaction.call(async () => {
    const updateResult = await updateEvaluationV2(
      {
        evaluation: compositeEvaluation,
        commit,
        workspace,
        settings: generateCompositeEvaluationSettings(evaluations),
        force: true,
      },
      transaction,
    )

    if (updateResult.error) return updateResult
    const updatedComposite = updateResult.unwrap().evaluation
    return Result.ok(updatedComposite)
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

/**
 * Syncs the default composite evaluation for a document.
 *
 * This function manages the "Performance" composite evaluation that combines
 * all issue-linked evaluations for a document:
 *
 * - Finds all issue-related evaluations for a document in the commit
 * - If no issue-related evaluation exists, the default composite evaluation is removed
 * - Otherwise, if no default composite evaluation exists, a new one is created
 * - It updates the composite evaluation to include all issue-related evaluations
 */
export async function syncDefaultCompositeTarget(
  {
    document: inputDocument,
    commit,
    workspace,
  }: {
    document: DocumentVersion
    commit: Commit
    workspace: Workspace
  },
  transaction = new Transaction(),
): Promise<TypedResult<CompositeTarget | undefined>> {
  return await transaction.call(async (tx) => {
    // Fetch a fresh document to ensure we have the latest mainEvaluationUuid
    const documentsRepository = new DocumentVersionsRepository(workspace.id, tx)
    const documentResult = await documentsRepository.getDocumentAtCommit({
      projectId: commit.projectId,
      commitUuid: commit.uuid,
      documentUuid: inputDocument.documentUuid,
    })
    if (documentResult.error) return documentResult
    const document = documentResult.unwrap()

    // Get the default composite evaluation for the document
    const compositeEvalResult = await getCompositeTarget({
      document,
      commit,
      workspace,
      db: tx,
    })

    if (compositeEvalResult.error) return compositeEvalResult
    const compositeEvaluation = compositeEvalResult.unwrap()

    // Get the issue-related evaluations for the document
    const evaluationsScope = new EvaluationsV2Repository(workspace.id, tx)
    const evaluationsResult = await evaluationsScope.listAtCommitByDocument({
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
    })
    if (evaluationsResult.error) return evaluationsResult
    const evaluations = evaluationsResult.unwrap()

    const issueRelatedEvaluations = evaluations.filter(
      (evaluation) => evaluation.issueId !== null,
    )

    if (issueRelatedEvaluations.length === 0) {
      if (!compositeEvaluation) {
        // No issue evaluations and no composite eval, there is nothing to do.
        return Result.nil()
      }

      // There is a composite eval, but no longer any issue evaluations, so we need to delete it.
      return deleteCompositeEvaluation(
        {
          target: compositeEvaluation,
          document,
          commit,
          workspace,
        },
        transaction,
      )
    }

    if (!compositeEvaluation) {
      return createCompositeEvaluation(
        {
          evaluations: issueRelatedEvaluations,
          document,
          commit,
          workspace,
        },
        transaction,
      )
    }

    return updateCompositeEvaluation(
      {
        compositeEvaluation,
        evaluations: issueRelatedEvaluations,
        commit,
        workspace,
      },
      transaction,
    )
  })
}
