import { Job } from 'bullmq'
import { setCancelJobFlag } from '../../lib/cancelJobs'

const REMOVABLE_STATES = [
  'completed',
  'failed',
  'delayed',
  'waiting',
  'waiting-children',
]
const NON_REMOVABLE_STATES = ['active', 'stalled']

export async function cancelJob(job: Job) {
  if (!job.id) {
    return
  }

  let state = await job.getState()

  try {
    if (REMOVABLE_STATES.includes(state)) await job.remove()
    else if (NON_REMOVABLE_STATES.includes(state))
      await setCancelJobFlag(job.id)
  } catch (_error) {
    // to catch potential race condition between getting the state and removing
    state = await job.getState()
    if (REMOVABLE_STATES.includes(state)) await job.remove()
    else if (NON_REMOVABLE_STATES.includes(state))
      await setCancelJobFlag(job.id)
  }
}
