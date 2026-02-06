import { Queue, Job } from 'bullmq'

import { queues } from '../../jobs/queues'
import { Queues } from '../../jobs/queues/types'
import { Result } from '../../lib/Result'

export async function drainQueue({ queueName }: { queueName: string }) {
  const queue = await findQueue(queueName)
  if (!queue) return Result.ok({ drained: false })

  await queue.drain()
  return Result.ok({ drained: true })
}

export async function removeWorkspaceJobs({
  workspaceId,
  queueName,
}: {
  workspaceId: number
  queueName?: string
}) {
  const qs = await queues()
  const queueList = queueName
    ? [await findQueue(queueName)].filter(Boolean) as Queue[]
    : (Object.values(qs) as Queue[])

  let totalRemoved = 0

  for (const queue of queueList) {
    const jobs = await queue.getJobs(['waiting', 'delayed'], 0, 5000)
    const removable = jobs.filter((job) => {
      const wsId = extractWorkspaceId(job, queue.name)
      return wsId === workspaceId
    })

    for (const job of removable) {
      try {
        await job.remove()
        totalRemoved++
      } catch {
        // Job may have been picked up by a worker already
      }
    }
  }

  return Result.ok({ removed: totalRemoved })
}

function extractWorkspaceId(job: Job, queueName: string): number | null {
  const data = job.data as Record<string, unknown>

  if (queueName === Queues.eventHandlersQueue || queueName === Queues.eventsQueue) {
    const eventData = data.data as Record<string, unknown> | undefined
    if (eventData && typeof eventData.workspaceId === 'number') {
      return eventData.workspaceId
    }
  }

  if (typeof data.workspaceId === 'number') {
    return data.workspaceId
  }

  return null
}

async function findQueue(queueName: string): Promise<Queue | null> {
  const qs = await queues()
  const allQueues = Object.values(qs) as Queue[]
  return allQueues.find((q) => q.name === queueName) ?? null
}
