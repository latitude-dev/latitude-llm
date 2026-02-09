import { Queue, Job } from 'bullmq'

import { queues } from '../../jobs/queues'
import { Queues } from '../../jobs/queues/types'
import { Result } from '../../lib/Result'

export type QueueStats = {
  name: string
  displayName: string
  active: number
  waiting: number
  delayed: number
  completed: number
  failed: number
  paused: number
  prioritized: number
}

export type QueueJobSummary = {
  jobName: string
  count: number
  workspaces: Record<number, number>
}

export type QueueDetail = {
  stats: QueueStats
  jobBreakdown: QueueJobSummary[]
}

export type JobInfo = {
  id: string
  name: string
  state: string
  data: Record<string, unknown>
  workspaceId: number | null
  progress: unknown
  attemptsMade: number
  failedReason?: string
  processedOn?: number
  finishedOn?: number
  timestamp: number
  delay: number
}

export type WorkspaceQueueUsage = {
  queueName: string
  displayName: string
  jobCounts: Record<string, number>
  total: number
}

const QUEUE_DISPLAY_NAMES: Record<string, string> = {
  [Queues.defaultQueue]: 'Default',
  [Queues.evaluationsQueue]: 'Evaluations',
  [Queues.eventHandlersQueue]: 'Event Handlers',
  [Queues.eventsQueue]: 'Events',
  [Queues.maintenanceQueue]: 'Maintenance',
  [Queues.notificationsQueue]: 'Notifications',
  [Queues.webhooksQueue]: 'Webhooks',
  [Queues.documentsQueue]: 'Documents',
  [Queues.tracingQueue]: 'Tracing',
  [Queues.latteQueue]: 'Latte (Copilot)',
  [Queues.runsQueue]: 'Runs',
  [Queues.issuesQueue]: 'Issues',
  [Queues.generateEvaluationsQueue]: 'Generate Evaluations',
  [Queues.optimizationsQueue]: 'Optimizations',
}

export async function getAllQueueStats() {
  const qs = await queues()
  const queueEntries = Object.entries(qs) as [string, Queue][]

  const stats: QueueStats[] = await Promise.all(
    queueEntries.map(async ([_, queue]) => {
      const counts = await queue.getJobCounts()
      return {
        name: queue.name,
        displayName: QUEUE_DISPLAY_NAMES[queue.name] ?? queue.name,
        active: counts.active ?? 0,
        waiting: counts.waiting ?? 0,
        delayed: counts.delayed ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        paused: counts.paused ?? 0,
        prioritized: counts.prioritized ?? 0,
      }
    }),
  )

  return Result.ok(stats)
}

export async function getQueueDetail({
  queueName,
  states = ['active', 'waiting', 'delayed', 'failed'],
}: {
  queueName: string
  states?: ('active' | 'waiting' | 'delayed' | 'completed' | 'failed')[]
}) {
  const queue = await findQueue(queueName)
  if (!queue) return Result.ok(null)

  const counts = await queue.getJobCounts()
  const stats: QueueStats = {
    name: queue.name,
    displayName: QUEUE_DISPLAY_NAMES[queue.name] ?? queue.name,
    active: counts.active ?? 0,
    waiting: counts.waiting ?? 0,
    delayed: counts.delayed ?? 0,
    completed: counts.completed ?? 0,
    failed: counts.failed ?? 0,
    paused: counts.paused ?? 0,
    prioritized: counts.prioritized ?? 0,
  }

  const jobs = await queue.getJobs(states, 0, 500)
  const jobBreakdown = buildJobBreakdown(jobs, queueName)

  return Result.ok({ stats, jobBreakdown } satisfies QueueDetail)
}

export async function getQueueJobs({
  queueName,
  state = 'active',
  start = 0,
  end = 50,
}: {
  queueName: string
  state?: 'active' | 'waiting' | 'delayed' | 'completed' | 'failed'
  start?: number
  end?: number
}) {
  const queue = await findQueue(queueName)
  if (!queue) return Result.ok([])

  const jobs = await queue.getJobs([state], start, end)

  const jobInfos: JobInfo[] = await Promise.all(
    jobs.map(async (job) => {
      const jobState = await job.getState()
      return {
        id: job.id!,
        name: job.name,
        state: jobState,
        data: job.data as Record<string, unknown>,
        workspaceId: extractWorkspaceId(job, queueName),
        progress: job.progress,
        attemptsMade: job.attemptsMade,
        failedReason: job.failedReason,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        timestamp: job.timestamp,
        delay: job.delay,
      }
    }),
  )

  return Result.ok(jobInfos)
}

export async function getWorkspaceQueueUsage({
  workspaceId,
}: {
  workspaceId: number
}) {
  const qs = await queues()
  const queueEntries = Object.entries(qs) as [string, Queue][]

  const usage: WorkspaceQueueUsage[] = []

  await Promise.all(
    queueEntries.map(async ([_, queue]) => {
      const jobs = await queue.getJobs(
        ['active', 'waiting', 'delayed'],
        0,
        1000,
      )

      const jobCounts: Record<string, number> = {}
      let total = 0

      for (const job of jobs) {
        const jobWorkspaceId = extractWorkspaceId(job, queue.name)
        if (jobWorkspaceId === workspaceId) {
          jobCounts[job.name] = (jobCounts[job.name] ?? 0) + 1
          total++
        }
      }

      if (total > 0) {
        usage.push({
          queueName: queue.name,
          displayName: QUEUE_DISPLAY_NAMES[queue.name] ?? queue.name,
          jobCounts,
          total,
        })
      }
    }),
  )

  return Result.ok(usage)
}

function extractWorkspaceId(job: Job, queueName: string): number | null {
  const data = job.data as Record<string, unknown>

  if (
    queueName === Queues.eventHandlersQueue ||
    queueName === Queues.eventsQueue
  ) {
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

function buildJobBreakdown(jobs: Job[], queueName: string): QueueJobSummary[] {
  const map = new Map<
    string,
    { count: number; workspaces: Record<number, number> }
  >()

  for (const job of jobs) {
    const entry = map.get(job.name) ?? { count: 0, workspaces: {} }
    entry.count++

    const wsId = extractWorkspaceId(job, queueName)
    if (wsId !== null) {
      entry.workspaces[wsId] = (entry.workspaces[wsId] ?? 0) + 1
    }

    map.set(job.name, entry)
  }

  return Array.from(map.entries())
    .map(([jobName, data]) => ({
      jobName,
      count: data.count,
      workspaces: data.workspaces,
    }))
    .sort((a, b) => b.count - a.count)
}

async function findQueue(queueName: string): Promise<Queue | null> {
  const qs = await queues()
  const allQueues = Object.values(qs) as Queue[]
  return allQueues.find((q) => q.name === queueName) ?? null
}
