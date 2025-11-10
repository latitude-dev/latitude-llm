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
import type {
  ExperimentDatasetSource,
  ExperimentLogsSource,
  ExperimentManualSource,
} from '@latitude-data/constants/experiments'

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

// Input type for the service - includes Dataset object (resolved from datasetId by caller)
type CreateExperimentInput =
  | (Omit<ExperimentDatasetSource, 'datasetId'> & { dataset: Dataset })
  | ExperimentLogsSource
  | ExperimentManualSource

export async function createExperiment(
  {
    name,
    document,
    commit,
    evaluations,
    customPrompt,
    parametersPopulation,
    simulationSettings,
    workspace,
  }: {
    name: string
    commit: Commit
    evaluations: EvaluationV2[]
    document: DocumentVersion
    customPrompt?: string // Prompt can be different than the current one (for drafts, or tweaked experiments)
    parametersPopulation: CreateExperimentInput
    simulationSettings: SimulationSettings
    workspace: Workspace
  },
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    // Extract datasetLabels based on source type
    const datasetLabels =
      parametersPopulation.source === 'dataset'
        ? parametersPopulation.datasetLabels
        : {}

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

    // Validation for parameters
    if (
      !!promptMetadata.parameters.length &&
      parametersPopulation.source !== 'dataset' &&
      parametersPopulation.source !== 'logs'
    ) {
      return Result.error(
        new BadRequestError(
          'A dataset or logs count is required when the prompt contains parameters',
        ),
      )
    }

    // Build the final parametersSource based on input type
    let parametersSource
    let count
    let datasetId: number | undefined = undefined

    if (parametersPopulation.source === 'logs') {
      // Logs source
      parametersSource = parametersPopulation
      count = parametersPopulation.count
    } else if (parametersPopulation.source === 'dataset') {
      // Dataset source - need to resolve datasetId from dataset and handle row count
      const { dataset, fromRow, toRow, datasetLabels, parametersMap } =
        parametersPopulation
      const datasetRowsScope = new DatasetRowsRepository(workspace.id, tx)
      const countResult = await datasetRowsScope.getCountByDataset(dataset.id)
      const rowCount = countResult?.[0]?.count

      datasetId = dataset.id

      parametersSource = {
        source: 'dataset' as const,
        datasetId: dataset.id,
        fromRow,
        toRow: toRow ?? rowCount ?? 0,
        datasetLabels,
        parametersMap,
      }
      count = calculateSelectedRangeCount({
        firstIndex: fromRow,
        lastIndex: toRow,
        totalCount: rowCount,
      })
    } else {
      // Manual source
      parametersSource = parametersPopulation
      count = parametersPopulation.count
    }

    const result = await tx
      .insert(experiments)
      .values({
        name,
        workspaceId: workspace.id,
        commitId: commit.id,
        documentUuid: document.documentUuid,
        evaluationUuids: evaluations.map((e) => e.uuid),
        datasetId,
        metadata: {
          prompt: promptMetadata.resolvedPrompt,
          promptHash: promptMetadata.promptHash,
          count,
          parametersSource,
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
