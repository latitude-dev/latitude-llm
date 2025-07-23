import { Job } from 'bullmq'
import {
  SPAN_PROCESSING_STORAGE_KEY,
  SpanProcessingData,
} from '../../../browser'
import { unsafelyFindWorkspace } from '../../../data-access'
import { diskFactory } from '../../../lib/disk'
import { UnprocessableEntityError } from '../../../lib/errors'
import { ApiKeysRepository } from '../../../repositories'
import { processSpan } from '../../../services/tracing/spans/process'
import { captureException } from '../../../utils/workers/sentry'

export type ProcessSpanJobData = {
  processingId: string
  apiKeyId: number
  workspaceId: number
}

export function processSpanJobKey({ processingId }: ProcessSpanJobData) {
  return `processSpanJob-${processingId}`
}

export const processSpanJob = async (job: Job<ProcessSpanJobData>) => {
  const { processingId, apiKeyId, workspaceId } = job.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) return

  const repository = new ApiKeysRepository(workspace.id)
  const finding = await repository.find(apiKeyId)
  if (finding.error) return
  const apiKey = finding.value

  const disk = diskFactory('private')
  const key = SPAN_PROCESSING_STORAGE_KEY(processingId)
  let data
  try {
    const payload = await disk.get(key)
    data = JSON.parse(payload) as SpanProcessingData
  } catch { return } // prettier-ignore
  const { span, scope } = data

  const result = await processSpan({ span, scope, apiKey, workspace })
  if (result.error) {
    if (result.error instanceof UnprocessableEntityError) {
      captureException(result.error)
    } else throw result.error
  }

  try {
    await disk.delete(key)
  } catch { return } // prettier-ignore
}
