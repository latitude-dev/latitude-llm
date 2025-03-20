import { Workspace } from '../../../browser'
import { diskFactory, DiskWrapper } from '../../../lib'
import { DatasetsRepository } from '../../../repositories'
import { database } from '../../../client'

import debuglog from '../../../lib/debug'
import { getWorkspaceCreator } from './getWorkspaceCreator'
import { createDatasetAndRows } from './createDatasetAndRows'
import { getDocumentsGroupedByDatasetV1 } from './migrateDocumentsAssignedToDataset'
import { migrateDocumentsAssignedToDataset } from './migrateDocumentsAssignedToDataset'

type GroupedResults = {
  errors: string[]
  migratedDatasets: {
    datasetV1: {
      id: number
      name: string
      rowCount: number | undefined
    }
    datasetV2:
      | {
          id: number
          name: string
          rowCount: number
          documents: Awaited<
            ReturnType<typeof migrateDocumentsAssignedToDataset>
          >['value']
        }
      | undefined
  }[]
}

export type MigratedWorkspaceDatasetsToV2Result = {
  workspaceId: number
  errors: GroupedResults['errors']
  migratedDatasets?: GroupedResults['migratedDatasets']
}

const isTest = process.env.NODE_ENV === 'test'

export async function migrateWorkspaceDatasetsToV2(
  {
    workspace,
    disk = diskFactory(),
  }: {
    workspace: Workspace
    disk?: DiskWrapper
  },
  db = database,
) {
  const workspaceCreatorResult = await getWorkspaceCreator(workspace)
  if (workspaceCreatorResult.error) {
    return {
      workspaceId: workspace.id,
      errors: [workspaceCreatorResult.error.message],
    }
  }
  const defaultAuthorUser = workspaceCreatorResult.value
  const repo = new DatasetsRepository(workspace.id, db)
  const allDatasets = await repo.findAll().then((r) => r.unwrap())
  const docsGroupedByDataset = await getDocumentsGroupedByDatasetV1(
    {
      workspace,
    },
    db,
  )

  if (!isTest) {
    debuglog(
      `${allDatasets.length} datasets found in workspace ${workspace.id}`,
    )
    debuglog('Starting migration...')
  }

  const allResult = allDatasets.map(async (datasetV1) => {
    const createResult = await createDatasetAndRows(
      {
        workspace,
        defaultAuthorUser,
        datasetV1,
        disk,
      },
      db,
    )

    const docs = docsGroupedByDataset.get(datasetV1.id)
    const dataset = createResult.migrationResult.datasetV2?.model

    if (
      !docs ||
      docs.length === 0 ||
      !dataset ||
      createResult.errors.length > 0
    ) {
      if (createResult.errors.length > 0 && !isTest) {
        debuglog('Errors creating dataset and rows: ', createResult.errors)
      }

      return createResult
    }

    const updatedDocumentsResult = await migrateDocumentsAssignedToDataset({
      workspace,
      documents: docs,
      datasetV1,
      dataset,
    })

    if (updatedDocumentsResult.error) {
      debuglog('Error migrating documents: ', updatedDocumentsResult.error)
      return {
        ...createResult,
        migrationResult: {
          ...createResult.migrationResult,
          datasetV2: {
            model: dataset,
            rowCount: createResult.migrationResult.datasetV2?.rowCount ?? 0,
            documents: [],
          },
        },
        errors: [...createResult.errors, updatedDocumentsResult.error.message],
      }
    }

    const updatedDocuments = updatedDocumentsResult.value
    if (updatedDocuments.length === 0) return createResult

    return {
      ...createResult,
      migrationResult: {
        ...createResult.migrationResult,
        datasetV2: {
          model: dataset,
          rowCount: createResult.migrationResult.datasetV2?.rowCount ?? 0,
          documents: updatedDocuments,
        },
      },
    }
  })

  const results = await Promise.all(allResult)

  debuglog(`Migration finished for workspace ${workspace.id}!`)
  const errors = results.reduce((acc, result) => {
    acc += result.errors.length
    return acc
  }, 0)
  debuglog(`Errors: ${errors} found`)
  const datasetsV2Created = results.reduce((acc, result) => {
    acc += result.migrationResult.datasetV2 ? 1 : 0
    return acc
  }, 0)

  debuglog(
    `Datasets V2 created: ${datasetsV2Created}, the workspace has ${allDatasets.length} datasets.`,
  )

  const aggregatedResults = results.reduce(
    (acc, result) => {
      acc.errors.push(...result.errors)
      const datasetModel = result.migrationResult.datasetV2?.model
      const documents = result.migrationResult.datasetV2?.documents ?? []
      const rowCount = result.migrationResult.datasetV2?.rowCount ?? 0
      acc.migratedDatasets.push({
        datasetV1: {
          id: result.migrationResult.datasetV1.model.id,
          name: result.migrationResult.datasetV1.model.name,
          rowCount: result.migrationResult.datasetV1.rowCount,
        },
        datasetV2: datasetModel
          ? {
              id: datasetModel.id,
              name: datasetModel.name,
              rowCount,
              documents,
            }
          : undefined,
      })
      return acc
    },
    { errors: [], migratedDatasets: [] } as GroupedResults,
  )

  return {
    workspaceId: workspace.id,
    errors: aggregatedResults.errors,
    migratedDatasets: aggregatedResults.migratedDatasets,
  }
}
