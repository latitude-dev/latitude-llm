import { Dataset, Experiment } from '../../browser'
import { Commit, DocumentVersion, EvaluationV2, Workspace } from '../../browser'
import { database, Database } from '../../client'
import { scanDocumentContent } from '../documents'
import { experiments } from '../../schema'
import { DatasetRowsRepository } from '../../repositories'
import { assertEvaluationRequirements } from './assertRequirements'
import Transaction, { PromisedResult } from '../../lib/Transaction'
import { Result } from '../../lib/Result'
import { BadRequestError, LatitudeError } from '../../lib/errors'

function calculateSelectedRangeCount({
  firstIndex,
  lastIndex,
  totalCount,
}: {
  firstIndex: number
  lastIndex?: number
  totalCount?: number
}): number {
  const firstRow = Math.max(0, firstIndex)
  const lastRow = Math.min(
    totalCount ?? Infinity, // upper limit
    lastIndex ?? totalCount ?? firstIndex, // lower limit
  )
  return lastRow - firstRow + 1 // +1 because both first and last rows are inclusive
}

async function getPromptMetadata(
  {
    workspace,
    commit,
    document,
    customPrompt,
  }: {
    workspace: Workspace
    commit: Commit
    document: DocumentVersion
    customPrompt?: string // Prompt can be different than the current one
  },
  db = database,
): PromisedResult<{
  resolvedPrompt: string
  promptHash: string
  parameters: string[]
}> {
  const metadata = await scanDocumentContent(
    {
      workspaceId: workspace.id,
      document: {
        ...document,
        content: customPrompt ?? document.content,
      },
      commit,
    },
    db,
  )

  if (metadata.error) {
    return Result.error(metadata.error)
  }
  const { resolvedPrompt, hash, parameters } = metadata.value
  return Result.ok({
    resolvedPrompt,
    promptHash: hash,
    parameters: Array.from(parameters),
  })
}

export async function createExperiment(
  {
    name,
    document,
    commit,
    evaluations,
    customPrompt,
    dataset,
    parametersMap,
    datasetLabels,
    fromRow = 0,
    toRow,
    workspace,
  }: {
    name: string
    commit: Commit
    evaluations: EvaluationV2[]
    document: DocumentVersion
    customPrompt?: string // Prompt can be different than the current one (for drafts, or tweaked experiments)
    dataset?: Dataset
    parametersMap: Record<string, number>
    datasetLabels: Record<string, string>
    fromRow?: number
    toRow?: number
    workspace: Workspace
  },
  db: Database = database,
) {
  const requirementsResult = assertEvaluationRequirements({
    evaluations,
    datasetLabels,
  })
  if (requirementsResult.error) return requirementsResult

  const promptMetadataResult = await getPromptMetadata(
    {
      workspace,
      commit,
      document,
      customPrompt,
    },
    db,
  )

  if (promptMetadataResult.error) {
    return Result.error(new LatitudeError(promptMetadataResult.error.message))
  }
  const promptMetadata = promptMetadataResult.unwrap()

  if (!!promptMetadata.parameters.length && !dataset) {
    return Result.error(
      new BadRequestError(
        'A dataset is required when the prompt contains parameters',
      ),
    )
  }

  const datasetRowsScope = new DatasetRowsRepository(workspace.id, db)
  const countResult = dataset
    ? await datasetRowsScope.getCountByDataset(dataset.id)
    : undefined
  const rowCount = countResult?.[0]?.count

  return Transaction.call(async (tx) => {
    const result = await tx
      .insert(experiments)
      .values({
        name,
        workspaceId: workspace.id,
        commitId: commit.id,
        documentUuid: document.documentUuid,
        evaluationUuids: evaluations.map((e) => e.uuid),
        datasetId: dataset?.id,
        metadata: {
          prompt: promptMetadata.resolvedPrompt,
          promptHash: promptMetadata.promptHash,
          parametersMap,
          datasetLabels,
          fromRow: fromRow,
          toRow: toRow ?? rowCount,
          count: calculateSelectedRangeCount({
            firstIndex: fromRow,
            lastIndex: toRow,
            totalCount: rowCount,
          }),
        },
      })
      .returning()

    if (!result.length) {
      throw new LatitudeError('Failed to create experiment')
    }

    return Result.ok(result[0]! as Experiment)
  }, db)
}
