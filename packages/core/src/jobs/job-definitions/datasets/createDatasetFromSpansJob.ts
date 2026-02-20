import { Job } from 'bullmq'

import { SpanType } from '../../../constants'
import { unsafelyFindWorkspace } from '../../../data-access/workspaces'
import { unsafelyFindUserById } from '../../../queries/users/findById'
import { NotFoundError } from '../../../lib/errors'
import {
  DocumentVersionsRepository,
  SpansRepository,
} from '../../../repositories'
import { findOrCreateDataset } from '../../../services/datasets/findOrCreate'
import { updateDatasetFromSpans } from '../../../services/datasets/updateFromSpans'
import { queues } from '../../queues'
import { captureException } from '../../../utils/datadogCapture'
import { DatasetReadyMailer } from '../../../mailer/mailers/datasets/DatasetReadyMailer'

export type CreateDatasetFromSpansJobData = {
  name: string
  userId: string
  workspaceId: number
  projectId: number
  documentVersionId: number
  selectionMode: 'ALL' | 'ALL_EXCEPT' | 'PARTIAL'
  selectedSpanIdentifiers: Array<{ traceId: string; spanId: string }>
  excludedSpanIdentifiers: Array<{ traceId: string; spanId: string }>
}

export async function enqueueCreateDatasetFromSpansJob(
  data: CreateDatasetFromSpansJobData,
) {
  const { defaultQueue } = await queues()
  const jobId = `create-dataset-spans-${data.workspaceId}-${data.documentVersionId}-${Date.now()}`
  return defaultQueue.add('createDatasetFromSpansJob', data, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    jobId,
    deduplication: { id: jobId },
    removeOnComplete: true,
    removeOnFail: false,
  })
}

const FETCH_BATCH_SIZE = 500
const PROCESS_BATCH_SIZE = 100

async function* iterateSpanBatches({
  repo,
  projectId,
  documentUuid,
  excludedIds,
  selectionMode,
  selectedSpanIds,
}: {
  repo: SpansRepository
  projectId: number
  documentUuid: string
  excludedIds: Set<string>
  selectionMode: 'ALL' | 'ALL_EXCEPT' | 'PARTIAL'
  selectedSpanIds?: Set<string>
}): AsyncGenerator<Array<{ traceId: string; spanId: string }>> {
  let cursor: { startedAt: string; id: string } | undefined
  let batch: Array<{ traceId: string; spanId: string }> = []

  while (true) {
    const result = await repo.findByDocumentAndCommitLimited({
      projectId,
      documentUuid,
      types: [SpanType.Prompt],
      limit: FETCH_BATCH_SIZE,
      from: cursor,
    })

    if (result.error) {
      throw result.error
    }

    const { items, next } = result.value!

    for (const span of items) {
      const spanKey = `${span.traceId}:${span.id}`

      if (selectionMode === 'ALL_EXCEPT' && excludedIds.has(spanKey)) {
        continue
      }

      if (
        selectionMode === 'PARTIAL' &&
        selectedSpanIds &&
        !selectedSpanIds.has(spanKey)
      ) {
        continue
      }

      batch.push({ traceId: span.traceId, spanId: span.id })

      if (batch.length >= PROCESS_BATCH_SIZE) {
        yield batch
        batch = []
      }
    }

    if (!next) break
    cursor = next
  }

  if (batch.length > 0) {
    yield batch
  }
}

export const createDatasetFromSpansJob = async (
  job: Job<CreateDatasetFromSpansJobData>,
) => {
  try {
    const {
      name,
      userId,
      workspaceId,
      projectId,
      documentVersionId,
      selectionMode,
      selectedSpanIdentifiers,
      excludedSpanIdentifiers,
    } = job.data

    const workspace = await unsafelyFindWorkspace(workspaceId)
    if (!workspace) {
      throw new NotFoundError(`Workspace not found ${workspaceId}`)
    }

    const user = await unsafelyFindUserById({ id: userId })
    if (!user) {
      throw new NotFoundError(`User not found ${userId}`)
    }

    const documentRepo = new DocumentVersionsRepository(workspaceId)
    const documentResult = await documentRepo.getDocumentById(documentVersionId)
    if (documentResult.error) {
      throw documentResult.error
    }
    const document = documentResult.value

    const dataset = await findOrCreateDataset({
      name,
      author: user,
      workspace,
    }).then((r) => r.unwrap())

    const repo = new SpansRepository(workspaceId)

    const excludedIds = new Set(
      excludedSpanIdentifiers.map((id) => `${id.traceId}:${id.spanId}`),
    )

    const selectedSpanIds =
      selectionMode === 'PARTIAL'
        ? new Set(
            selectedSpanIdentifiers.map((id) => `${id.traceId}:${id.spanId}`),
          )
        : undefined

    let hasProcessedAny = false

    for await (const spanIdentifiers of iterateSpanBatches({
      repo,
      projectId,
      documentUuid: document.documentUuid,
      excludedIds,
      selectionMode,
      selectedSpanIds,
    })) {
      if (spanIdentifiers.length === 0) {
        continue
      }

      hasProcessedAny = true

      const result = await updateDatasetFromSpans({
        dataset,
        workspace,
        spanIdentifiers,
      })

      if (result.error) {
        throw result.error
      }
    }

    if (!hasProcessedAny) {
      return
    }

    const mailer = new DatasetReadyMailer(
      {
        datasetId: dataset.id,
        datasetName: dataset.name,
        user,
      },
      {
        to: user.email,
      },
    )
    await mailer.send()
  } catch (error) {
    captureException(error as Error)
    throw error
  }
}
