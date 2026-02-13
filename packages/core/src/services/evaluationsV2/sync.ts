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

const COMPOSITE_BASE_NAME = 'Performance'

function generateCompositeName(existingNames: Set<string>): string {
  if (!existingNames.has(COMPOSITE_BASE_NAME)) return COMPOSITE_BASE_NAME

  let n = 1
  while (existingNames.has(`${COMPOSITE_BASE_NAME} (${n})`)) n++
  return `${COMPOSITE_BASE_NAME} (${n})`
}

function generateCompositeEvaluationSettings(
  evaluations: EvaluationV2[],
  name: string,
): CompositeSettings {
  return {
    name,
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
    name,
  }: {
    evaluations: EvaluationV2[]
    document: DocumentVersion
    commit: Commit
    workspace: Workspace
    name: string
  },
  transaction: Transaction,
): PromisedResult<CompositeTarget> {
  return await transaction.call(async () => {
    const createResult = await createEvaluationV2(
      {
        document,
        commit,
        settings: generateCompositeEvaluationSettings(evaluations, name),
        options: {
          evaluateLiveLogs: false,
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
    name,
  }: {
    compositeEvaluation: CompositeTarget
    evaluations: EvaluationV2[]
    commit: Commit
    workspace: Workspace
    name: string
  },
  transaction: Transaction,
): PromisedResult<CompositeTarget> {
  return await transaction.call(async () => {
    const updateResult = await updateEvaluationV2(
      {
        evaluation: compositeEvaluation,
        commit,
        workspace,
        settings: generateCompositeEvaluationSettings(evaluations, name),
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

    const evaluationsScope = new EvaluationsV2Repository(workspace.id, tx)
    const evaluationsResult = await evaluationsScope.listAtCommitByDocument({
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
    })
    if (evaluationsResult.error) return evaluationsResult
    let evaluations = evaluationsResult.unwrap()

    const compositeEvaluation = evaluations.find(
      (e) => e.uuid === document.mainEvaluationUuid,
    ) as CompositeTarget | undefined

    evaluations = evaluations.filter((e) => e.uuid !== document.mainEvaluationUuid) // prettier-ignore
    const issueEvaluations = evaluations.filter((e) => e.issueId !== null)

    const existingNames = new Set(evaluations.map((e) => e.name))
    const name = generateCompositeName(existingNames)

    if (issueEvaluations.length === 0) {
      // No issue evaluations and no composite eval, there is nothing to do.
      if (!compositeEvaluation) return Result.nil()

      // There is a composite eval, but no longer any issue evaluations, so we need to delete it.
      return deleteCompositeEvaluation(
        { target: compositeEvaluation, document, commit, workspace },
        transaction,
      )
    }

    if (!compositeEvaluation) {
      return createCompositeEvaluation(
        {
          evaluations: issueEvaluations,
          document,
          commit,
          workspace,
          name,
        },
        transaction,
      )
    }

    return updateCompositeEvaluation(
      {
        compositeEvaluation,
        evaluations: issueEvaluations,
        commit,
        workspace,
        name,
      },
      transaction,
    )
  })
}
