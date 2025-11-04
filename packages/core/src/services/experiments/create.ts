import { SimulationSettings } from '@latitude-data/constants/simulation'
import { database } from '../../client'
import { EvaluationV2 } from '../../constants'
import { Result } from '../../lib/Result'
import Transaction, { PromisedResult } from '../../lib/Transaction'
import { BadRequestError, LatitudeError } from '../../lib/errors'
import { DatasetRowsRepository } from '../../repositories'
import { experiments } from '../../schema/models/experiments'
import { type Commit } from '../../schema/models/types/Commit'
import { type Dataset } from '../../schema/models/types/Dataset'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Experiment } from '../../schema/models/types/Experiment'
import { type Workspace } from '../../schema/models/types/Workspace'
import { scanDocumentContent } from '../documents'
import { assertEvaluationRequirements } from './assertRequirements'

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
    commit,
    document,
    customPrompt,
  }: {
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
    simulationSettings,
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
    simulationSettings: SimulationSettings
    workspace: Workspace
  },
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    const requirementsResult = assertEvaluationRequirements({
      evaluations,
      datasetLabels,
    })
    if (requirementsResult.error) return requirementsResult

    const promptMetadataResult = await getPromptMetadata(
      {
        commit,
        document,
        customPrompt,
      },
      tx,
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

    const datasetRowsScope = new DatasetRowsRepository(workspace.id, tx)
    const countResult = dataset
      ? await datasetRowsScope.getCountByDataset(dataset.id)
      : undefined
    const rowCount = countResult?.[0]?.count

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
          simulationSettings,
        },
      })
      .returning()

    if (!result.length) {
      throw new LatitudeError('Failed to create experiment')
    }

    return Result.ok(result[0]! as Experiment)
  })
}
