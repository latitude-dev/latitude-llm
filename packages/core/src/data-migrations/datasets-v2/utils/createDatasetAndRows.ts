import { eq } from 'drizzle-orm'
import { users } from '../../../schema'
import { Dataset, DatasetV2, User, Workspace } from '../../../browser'
import { database } from '../../../client'
import { DiskWrapper } from '../../../lib'
import {
  createDataset,
  getCsvAndBuildColumns,
} from '../../../services/datasetsV2/create'
import { createRowsFromUploadedDataset } from '../../../services/datasetRows/createRowsFromUploadedDataset'

async function findAuthorUser(
  {
    defaultAuthorUser,
    datasetV1,
  }: {
    defaultAuthorUser: User
    datasetV1: Dataset
  },
  db = database,
) {
  if (!datasetV1.authorId) return defaultAuthorUser

  const authorUser = await db.query.users.findFirst({
    where: eq(users.id, datasetV1.authorId),
  })
  return authorUser ?? defaultAuthorUser
}

export type DatasetMigratingRowsResult = {
  workspace: Workspace
  datasetV1: {
    model: Dataset
    rowCount: number
  }
  datasetV2:
    | {
        model: DatasetV2
        rowCount: number
        documents: []
      }
    | undefined
}
export type CreateDatasetAndRowsResponse = {
  migrationResult: DatasetMigratingRowsResult
  errors: string[]
}

export async function createDatasetAndRows(
  {
    workspace,
    defaultAuthorUser,
    datasetV1,
    disk,
  }: {
    workspace: Workspace
    defaultAuthorUser: User
    datasetV1: Dataset
    disk: DiskWrapper
  },
  db = database,
): Promise<CreateDatasetAndRowsResponse> {
  const fileDisk = disk.file(datasetV1.fileKey)
  const fileExists = await fileDisk.exists()
  let baseResponse = {
    workspace,
    datasetV1: {
      model: datasetV1,
      rowCount: datasetV1.fileMetadata.rowCount,
    },
    datasetV2: undefined,
  }
  if (!fileExists) {
    return {
      migrationResult: baseResponse,
      errors: [
        `File does not exist on Dataset V1: ${datasetV1.id} on Workspace: ${workspace.id}`,
      ],
    }
  }

  const file = await fileDisk.get()
  const author = await findAuthorUser({ defaultAuthorUser, datasetV1 }, db)
  const columnsResult = await getCsvAndBuildColumns({
    file,
    csvDelimiter: datasetV1.csvDelimiter,
  })

  if (columnsResult.error) {
    return {
      migrationResult: baseResponse,
      errors: [
        `Error creating columns for dataset V1 ${datasetV1.id}: ${columnsResult.error.message}`,
      ],
    }
  }

  const columns = columnsResult.value

  if (!columns || columns.length <= 0) {
    return {
      migrationResult: baseResponse,
      errors: [
        `Error creating columns for dataset V1 ${datasetV1.id}: Columns are empty`,
      ],
    }
  }

  const datasetResult = await createDataset(
    {
      workspace,
      author,
      data: {
        name: datasetV1.name,
        columns,
      },
    },
    db,
  )

  if (datasetResult.error) {
    return {
      migrationResult: baseResponse,
      errors: [
        `Error creating dataset V2 for dataset V1 ${datasetV1.id}: ${datasetResult.error.message}`,
      ],
    }
  }

  const dataset = datasetResult.value
  let errors: string[] = []
  const result = await createRowsFromUploadedDataset(
    {
      event: {
        type: 'datasetUploaded',
        data: {
          workspaceId: workspace.id,
          userEmail: author.email,
          datasetId: dataset.id,
          fileKey: datasetV1.fileKey,
          csvDelimiter: datasetV1.csvDelimiter,
        },
      },
      disk,
      deleteFile: false, // We want to keep the file in the old Dataset
      onError: (error) => {
        errors.push(
          `Error inserting batch of rows in DatasetV2 ${dataset.id}: ${error.message}`,
        )
      },
    },
    db,
  )

  if (result.error) {
    return {
      migrationResult: {
        ...baseResponse,
        datasetV2: {
          model: dataset,
          rowCount: 0,
          documents: [],
        },
      },
      errors: [
        ...errors,
        `Error on service createRowsFromUploadedDataset for datasetV2: ${dataset.id}: ${result.error.message}`,
      ],
    }
  }

  const rowCount = result.value.rowCount
  return {
    migrationResult: {
      ...baseResponse,
      datasetV2: {
        model: dataset,
        rowCount: rowCount,
        documents: [],
      },
    },
    errors,
  }
}
