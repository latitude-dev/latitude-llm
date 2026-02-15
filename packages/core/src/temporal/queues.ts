export type QueueConfig = {
  maxConcurrentActivities: number
  maxConcurrentWorkflows: number
}

export const TEMPORAL_QUEUES = {
  main: {
    maxConcurrentActivities: 50,
    maxConcurrentWorkflows: 50,
  },
  runs: {
    maxConcurrentActivities: 100,
    maxConcurrentWorkflows: 100,
  },
  evaluations: {
    maxConcurrentActivities: 100,
    maxConcurrentWorkflows: 100,
  },
  events: {
    maxConcurrentActivities: 100,
    maxConcurrentWorkflows: 100,
  },
  tracing: {
    maxConcurrentActivities: 25,
    maxConcurrentWorkflows: 25,
  },
  maintenance: {
    maxConcurrentActivities: 5,
    maxConcurrentWorkflows: 5,
  },
} as const

export type TemporalQueue = keyof typeof TEMPORAL_QUEUES
