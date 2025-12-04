import { BackgroundRunJobData } from '../jobs/job-definitions/runs/backgroundRunJob'
import { queues } from '../jobs/queues'
import { NotFoundError } from '../lib/errors'
import { Result } from '../lib/Result'
import { getRunByDocument } from '../services/runs/active/byDocument/get'

export async function unsafelyFindActiveRun(runUuid: string) {
  const { runsQueue } = await queues()
  const job = await runsQueue.getJob(runUuid)
  if (!job?.id) {
    return Result.error(
      new NotFoundError(`Active run job with uuid ${runUuid} not found`),
    )
  }

  const { workspaceId, projectId, documentUuid } =
    job.data as BackgroundRunJobData

  const getting = await getRunByDocument({
    workspaceId,
    projectId,
    documentUuid,
    runUuid,
  })
  if (getting.error) return Result.error(getting.error)
  const run = getting.value

  if (run.endedAt) {
    return Result.error(
      new NotFoundError(`Active run with uuid ${runUuid} not found`),
    )
  }

  return Result.ok({ ...run, projectId, workspaceId, documentUuid })
}
