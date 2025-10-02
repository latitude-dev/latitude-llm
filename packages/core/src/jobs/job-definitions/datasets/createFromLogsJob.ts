import { commits } from '../../../schema/models/commits'
import { documentLogs } from '../../../schema/models/documentLogs'
import { providerLogs } from '../../../schema/models/providerLogs'
import { Job } from 'bullmq'
import { DocumentLogFilterOptions } from '../../../constants'
import { unsafelyFindWorkspace } from '../../../data-access/workspaces'
import {
  DocumentVersionsRepository,
  UsersRepository,
} from '../../../repositories'
import { findOrCreateDataset } from '../../../services/datasets/findOrCreate'
import { CursorState } from '../documentLogs/downloadLogsJob'
import { database } from '../../../client'
import { and, desc, eq, isNull, lt, notInArray } from 'drizzle-orm'
import { buildLogsFilterSQLConditions } from '../../../services/documentLogs/logsFilterUtils'
import { updateDatasetFromLogs } from '../../../services/datasets/createFromLogs'
import { generateUUIDIdentifier } from '../../../lib/generateUUID'
import { queues } from '../../queues'

type CreateDatasetFromLogsJobProps = {
  name: string
  userId: string
  workspaceId: number
  documentVersionId: number
  selectionMode: 'ALL' | 'ALL_EXCEPT'
  selectedDocumentLogIds: number[]
  excludedDocumentLogIds: number[]
  filterOptions: DocumentLogFilterOptions
}

const BATCH_SIZE = 1000

export const createDatasetFromLogsJob = async (
  job: Job<CreateDatasetFromLogsJobProps>,
) => {
  const {
    name,
    userId,
    workspaceId,
    documentVersionId,
    selectionMode,
    excludedDocumentLogIds,
    filterOptions,
  } = job.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) {
    console.error(`Workspace not found: ${workspaceId}`)
    throw new Error('Workspace not found')
  }

  const repo = new UsersRepository(workspace.id)
  const author = await repo.find(userId).then((r) => r.unwrap())

  const docsRepo = new DocumentVersionsRepository(workspaceId)
  const document = await docsRepo
    .find(documentVersionId)
    .then((r) => r.unwrap())
  const dt = await findOrCreateDataset({
    name,
    author,
    workspace,
  }).then((r) => r.unwrap())

  const cursorState = new CursorState(job.id ?? generateUUIDIdentifier())
  let lastCreatedAt: Date | null = null
  let totalProcessed = 0
  lastCreatedAt = await cursorState.getCursor()

  while (true) {
    // Build the query with cursor-based pagination with distinct on
    // documentLogs.uuid to ensure we only get the latest provider log per
    // document log
    const results = await database
      .selectDistinctOn([documentLogs.uuid], {
        id: documentLogs.id,
        createdAt: documentLogs.createdAt,
      })
      .from(documentLogs)
      .innerJoin(
        providerLogs,
        eq(providerLogs.documentLogUuid, documentLogs.uuid),
      )
      .innerJoin(commits, eq(documentLogs.commitId, commits.id))
      .where(
        and(
          isNull(commits.deletedAt),
          eq(documentLogs.documentUuid, document.documentUuid),
          buildLogsFilterSQLConditions(filterOptions),
          selectionMode === 'ALL_EXCEPT'
            ? notInArray(documentLogs.id, excludedDocumentLogIds)
            : undefined,
          lastCreatedAt ? lt(documentLogs.createdAt, lastCreatedAt) : undefined,
        ),
      )
      .orderBy(documentLogs.uuid, desc(providerLogs.generatedAt))
      .limit(BATCH_SIZE)

    if (results.length === 0) {
      break
    }

    await updateDatasetFromLogs({
      dataset: dt,
      workspace,
      documentLogIds: results.map((r) => r.id),
    }).then((r) => r.unwrap())

    // Update cursor and save state
    lastCreatedAt = results[results.length - 1]!.createdAt
    await cursorState.setCursor(lastCreatedAt)
    totalProcessed += results.length

    // Update job progress
    const progress = Math.floor(
      (totalProcessed / (totalProcessed + BATCH_SIZE)) * 100,
    )
    await job.updateProgress(progress)

    if (results.length < BATCH_SIZE) {
      break
    }
  }

  const { defaultQueue } = await queues()
  defaultQueue.add('notifyClientOfDatasetUpdate', {
    userId: author.id,
    datasetId: dt.id,
    workspaceId: workspace.id,
  })
}
