import type { Job } from 'bullmq'
import {
  type SegmentBaggage,
  type SegmentWithDetails,
  type SpanWithDetails,
  TRACING_JOBS_DELAY_BETWEEN_CONFLICTS,
  TRACING_JOBS_MAX_ATTEMPTS,
} from '../../../browser'
import { unsafelyFindWorkspace } from '../../../data-access'
import { ConflictError, UnprocessableEntityError } from '../../../lib/errors'
import { hashContent as hash } from '../../../lib/hashContent'
import { ApiKeysRepository } from '../../../repositories'
import { processSegment } from '../../../services/tracing/segments/process'
import { captureException } from '../../../utils/workers/sentry'
import { tracingQueue } from '../../queues'

export type ProcessSegmentJobData = {
  segment: SegmentBaggage
  chain: SegmentBaggage[]
  childId: string
  childType: 'span' | 'segment'
  traceId: string
  apiKeyId: number
  workspaceId: number
}

export function processSegmentJobKey(
  data: ProcessSegmentJobData,
  child: SpanWithDetails | SegmentWithDetails,
) {
  const state = hash(JSON.stringify({ data, child }))
  return `processSegmentJob-${state}`
}

export const processSegmentJob = async (job: Job<ProcessSegmentJobData>) => {
  const { segment, chain, childId, childType, traceId, apiKeyId, workspaceId } = job.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) {
    captureException(new UnprocessableEntityError('Workspace not found'))
    return
  }

  const repository = new ApiKeysRepository(workspace.id)
  const finding = await repository.find(apiKeyId)
  if (finding.error) {
    captureException(finding.error)
    return
  }
  const apiKey = finding.value

  const result = await processSegment({
    segment: segment,
    chain: chain,
    childId: childId,
    childType: childType,
    traceId: traceId,
    apiKey: apiKey,
    workspace: workspace,
  })
  if (result.error) {
    if (result.error instanceof UnprocessableEntityError) {
      captureException(result.error)
    } else if (result.error instanceof ConflictError) {
      const parts = job.deduplicationId!.split('-')
      const retries = Number(parts.at(-1) ?? 0)
      const idempotencyKey = `${parts.slice(0, -1).join('-')}-${Number.isNaN(retries) ? 0 : retries + 1}`
      await tracingQueue.add('processSegmentJob', job.data, {
        attempts: TRACING_JOBS_MAX_ATTEMPTS,
        delay: TRACING_JOBS_DELAY_BETWEEN_CONFLICTS(),
        deduplication: { id: idempotencyKey },
      })
    } else throw result.error
  }
}
