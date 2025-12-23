import { env } from '@latitude-data/env'
import { Job } from 'bullmq'
import { unsafelyFindWorkspace } from '../../../data-access/workspaces'
import { publisher } from '../../../events/publisher'
import { AbortedError, NotFoundError } from '../../../lib/errors'
import { OptimizationsRepository } from '../../../repositories'
import { endOptimization } from '../../../services/optimizations/end'
import { startValidateOptimization } from '../../../services/optimizations/validate/start'
import { captureException } from '../../../utils/datadogCapture'

export type ValidateOptimizationJobData = {
  workspaceId: number
  optimizationId: number
}

export function validateOptimizationJobKey({
  workspaceId,
  optimizationId,
}: ValidateOptimizationJobData) {
  return `validateOptimizationJob-${workspaceId}-${optimizationId}`
}

export const validateOptimizationJob = async (
  job: Job<ValidateOptimizationJobData>,
) => {
  if (!env.LATITUDE_CLOUD) return // Avoid spamming errors locally

  const { workspaceId, optimizationId } = job.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError(`Workspace not found ${workspaceId}`)

  const optimizationsRepository = new OptimizationsRepository(workspaceId)
  const optimization = await optimizationsRepository
    .find(optimizationId)
    .then((r) => r.unwrap())

  const abortController = new AbortController()
  const cancelJob = ({ jobId }: { jobId: string }) => {
    if (jobId !== job.id) return
    abortController.abort()
  }
  publisher.subscribe('cancelJob', cancelJob)

  try {
    await startValidateOptimization({
      optimization: optimization,
      workspace: workspace,
      abortSignal: abortController.signal,
    }).then((r) => r.unwrap())
  } catch (error) {
    captureException(error as Error)

    // Note: the cancel service already ends the optimization
    if (!(error instanceof AbortedError)) {
      await endOptimization({
        error: (error as Error).message,
        optimization: optimization,
        workspace: workspace,
      }).then((r) => r.unwrap())
    }
  } finally {
    await publisher.unsubscribe('cancelJob', cancelJob)
  }
}
