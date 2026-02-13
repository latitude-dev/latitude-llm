import { Job } from 'bullmq'
import { queues } from '../../queues'

export type BackfillClickhouseJobData = Record<string, never>

const WORKSPACE_IDS = [
  22717, 15194, 16707, 20049, 16197, 19257, 15541, 10230, 10343, 12534, 13132,
  1, 22389, 20728, 15301, 8620, 10332, 21070, 18900, 16848, 18155, 17307,
  14976, 19120, 16699, 13888, 15421, 22292, 12704, 10985, 21103, 21587, 17442,
  13807, 22933, 14633, 15004, 12350, 10581, 21514, 20121, 14247, 18576, 20448,
  13992, 16285, 10026, 10819, 10939, 22929, 14120,
]

export async function backfillClickhouseJob(
  _: Job<BackfillClickhouseJobData>,
) {
  const { maintenanceQueue } = await queues()

  for (const workspaceId of WORKSPACE_IDS) {
    await maintenanceQueue.add(
      'backfillSpansToClickhouseJob',
      { workspaceId },
      { attempts: 3 },
    )
    await maintenanceQueue.add(
      'backfillEvaluationResultsToClickhouseJob',
      { workspaceId },
      { attempts: 3 },
    )
  }
}
