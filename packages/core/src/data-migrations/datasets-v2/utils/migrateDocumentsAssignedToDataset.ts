import { eq } from 'drizzle-orm'
import {
  Dataset,
  DatasetV2,
  LinkedDataset,
  LinkedDatasetRow,
  Workspace,
} from '../../../browser'
import { database } from '../../../client'
import { Result, Transaction } from '../../../lib'
import {
  DatasetRowsRepository,
  DocumentVersionsRepository,
} from '../../../repositories'
import { documentVersions } from '../../../schema'

type LinkedInfo = {
  documentId: number
  datasetId: number | null
  datasetV2Id: number | null
  linkedDataset: Record<number, LinkedDataset> | null
  linkedDatasetAndRow: Record<number, LinkedDatasetRow> | null
}
export async function getDocumentsGroupedByDatasetV1(
  {
    workspace,
  }: {
    workspace: Workspace
  },
  db = database,
) {
  const repo = new DocumentVersionsRepository(workspace.id)
  const docsByDataset = new Map<number, LinkedInfo[]>()
  const docs = await db
    .select({
      documentId: repo.scope.id,
      datasetId: repo.scope.datasetId,
      datasetV2Id: repo.scope.datasetV2Id,
      linkedDataset: repo.scope.linkedDataset,
      linkedDatasetAndRow: repo.scope.linkedDatasetAndRow,
    })
    .from(repo.scope)

  if (docs.length === 0) return docsByDataset

  const filtered = docs.filter((doc) => doc.linkedDataset !== null)

  const grouped = filtered.reduce<typeof docsByDataset>((acc, doc) => {
    const datasetId = doc.datasetId
    if (!datasetId) return acc

    const prevDocs = acc.get(datasetId) ?? []
    prevDocs.push(doc)
    acc.set(datasetId, prevDocs)
    return acc
  }, docsByDataset)

  return grouped
}

async function getDatasetV2Metadata({
  rowsRepo,
  dataset,
  datasetV1,
  linkedInfo,
}: {
  rowsRepo: DatasetRowsRepository
  dataset: DatasetV2
  datasetV1: Dataset
  linkedInfo: LinkedInfo
}) {
  if (!linkedInfo.linkedDataset) return undefined
  if (!linkedInfo.datasetId) return undefined
  if (datasetV1.id !== linkedInfo.datasetId) return undefined

  const info = linkedInfo.linkedDataset[linkedInfo.datasetId]

  if (!info) return undefined

  const metadata = linkedInfo.linkedDatasetAndRow?.[dataset.id] ?? {}

  // If already something in this metadata for this new dataset skip
  if (Object.keys(metadata).length > 0) return undefined

  const columns = dataset.columns.reduce(
    (acc, column) => {
      acc[column.name] = column.identifier
      return acc
    },
    {} as Record<string, string>,
  )

  const columnKeys = Object.keys(columns) as (keyof typeof columns)[]
  const mappedInputs: Record<string, string> = Object.fromEntries(
    Object.entries(info.mappedInputs)
      .map(([key, position]) => {
        const columnKey = columnKeys[position]
        if (!columnKey) {
          throw new Error(`Invalid position ${position} for key "${key}"`)
        }
        const columnIdentifier = columns[columnKey]
        if (!columnIdentifier) return undefined

        return [key, columns[columnKey]]
      })
      .filter((x) => x !== undefined),
  )

  const rowIndex = typeof info.rowIndex === 'number' ? info.rowIndex : -1
  const rows =
    rowIndex >= 0
      ? await rowsRepo.findByDatasetWithOffsetAndLimit({
          datasetId: dataset.id,
          offset: rowIndex,
          limit: 1,
        })
      : []

  const row = rows[0]
  return {
    documentId: linkedInfo.documentId,
    datasetV2Id: dataset.id,
    linkedDatasetRow: {
      ...metadata,
      [dataset.id]: {
        datasetRowId: row?.id ?? undefined,
        mappedInputs,
      },
    },
  }
}

export async function migrateDocumentsAssignedToDataset(
  {
    workspace,
    documents,
    dataset,
    datasetV1,
  }: {
    workspace: Workspace
    documents: LinkedInfo[]
    datasetV1: Dataset
    dataset: DatasetV2
  },
  db = database,
) {
  if (!dataset) return Result.ok([])
  if (!documents.length) return Result.ok([])

  const rowsRepo = new DatasetRowsRepository(workspace.id)
  const updateInfoData = documents.map((linkedInfo) =>
    getDatasetV2Metadata({ rowsRepo, dataset, datasetV1, linkedInfo }),
  )

  const updateInfoResults = await Promise.all(updateInfoData)

  const updateInfo = updateInfoResults.filter((info) => info !== undefined)
  const result = await Transaction.call(async (trx) => {
    for (const item of updateInfo) {
      await trx
        .update(documentVersions)
        .set({
          datasetV2Id: item.datasetV2Id,
          linkedDatasetAndRow: item.linkedDatasetRow,
        })
        .where(eq(documentVersions.id, item.documentId))
    }

    return Result.ok(updateInfo)
  }, db)

  return result
}
