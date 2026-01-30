import { JobsOptions, FlowJob } from 'bullmq'
import { Queues } from '../queues/types'

/**
 * A single step in a flow with type-safe data
 */
export type FlowStep<TData = unknown> = {
  name: string
  queue: Queues
  data: TData
  opts?: Omit<JobsOptions, 'parent'>
}

/**
 * A step can be either a single step or an array of parallel steps
 */
export type FlowStepOrParallel<TData = unknown> =
  | FlowStep<TData>
  | FlowStep<TData>[]

/**
 * Options for creating a sequential flow
 */
export type SequentialFlowOptions<TData = unknown> = {
  flowId: string
  steps: FlowStepOrParallel<TData>[]
  defaultOpts?: Omit<JobsOptions, 'parent'>
  continueOnChildFailure?: boolean
}

/**
 * Result of enqueueing a flow
 */
export type EnqueuedFlow = {
  flowJobId: string
  rootJobId: string
}

/**
 * Internal state for building the flow tree
 */
export type BuildState = {
  root: FlowJob
  leaves: FlowJob[]
}
