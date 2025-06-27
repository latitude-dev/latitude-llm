import { Job } from 'bullmq'
import { SegmentBaggage } from '../../../browser'
import { unsafelyFindWorkspace } from '../../../data-access'
import { UnprocessableEntityError } from '../../../lib/errors'
import { ApiKeysRepository } from '../../../repositories'
import { processSegment } from '../../../services/tracing/segments/process'
import { captureException } from '../../../utils/workers/sentry'

export type ProcessSegmentJobData = {
  segment: SegmentBaggage
  next: SegmentBaggage[]
  apiKeyId: number
  workspaceId: number
}

export const processSegmentJob = async (job: Job<ProcessSegmentJobData>) => {
  const { segment, next, apiKeyId, workspaceId } = job.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) return

  const repository = new ApiKeysRepository(workspace.id)
  const finding = await repository.find(apiKeyId)
  if (finding.error) return
  const apiKey = finding.value

  const result = await processSegment({ segment, next, apiKey, workspace })
  if (result.error) {
    if (result.error instanceof UnprocessableEntityError) {
      captureException(result.error)
    } else throw result.error
  }
}
