import { FlowJob, JobsOptions } from 'bullmq'
import {
  FlowStep,
  FlowStepOrParallel,
  SequentialFlowOptions,
  BuildState,
} from './types'

/**
 * Creates a BullMQ FlowJob structure for sequential execution with optional parallel steps.
 *
 * Steps execute in array order. Use nested arrays for parallel execution:
 * - Single step: runs after previous step completes
 * - Array of steps: all run in parallel, next step waits for ALL to complete
 *
 * @example
 * // Execution: A → B → (C1 || C2 || C3) → D
 * createSequentialFlow({
 *   flowId: 'my-flow',
 *   steps: [
 *     { name: 'A', queue: Queues.defaultQueue, data: {} },
 *     { name: 'B', queue: Queues.defaultQueue, data: {} },
 *     [
 *       { name: 'C1', queue: Queues.defaultQueue, data: {} },
 *       { name: 'C2', queue: Queues.defaultQueue, data: {} },
 *       { name: 'C3', queue: Queues.defaultQueue, data: {} },
 *     ],
 *     { name: 'D', queue: Queues.defaultQueue, data: {} },
 *   ],
 * })
 */
export function createSequentialFlow<TData = unknown>(
  options: SequentialFlowOptions<TData>,
): FlowJob {
  const {
    flowId,
    steps,
    defaultOpts = {},
    continueOnChildFailure = false,
  } = options

  if (steps.length === 0) {
    throw new Error('Flow must have at least one step')
  }

  const lastStep = steps[steps.length - 1]!
  if (Array.isArray(lastStep)) {
    throw new Error(
      'Last step cannot be a parallel array - there must be a final step to wait for parallel jobs',
    )
  }

  return buildFlowTree(steps, flowId, defaultOpts, continueOnChildFailure)
}

function buildFlowTree(
  steps: FlowStepOrParallel[],
  flowId: string,
  defaultOpts: Omit<JobsOptions, 'parent'>,
  continueOnChildFailure: boolean,
): FlowJob {
  const lastStep = steps[steps.length - 1] as FlowStep
  const rootJob = stepToFlowJob(
    lastStep,
    flowId,
    steps.length - 1,
    0,
    defaultOpts,
    continueOnChildFailure,
  )

  let state: BuildState = {
    root: rootJob,
    leaves: [rootJob],
  }

  for (let i = steps.length - 2; i >= 0; i--) {
    const step = steps[i]!
    state = processStep(
      state,
      step,
      flowId,
      i,
      defaultOpts,
      continueOnChildFailure,
    )
  }

  return state.root
}

function processStep(
  state: BuildState,
  step: FlowStepOrParallel,
  flowId: string,
  stepIndex: number,
  defaultOpts: Omit<JobsOptions, 'parent'>,
  continueOnChildFailure: boolean,
): BuildState {
  const newLeaves: FlowJob[] = []

  if (Array.isArray(step)) {
    for (const leaf of state.leaves) {
      const parallelJobs = step.map((s, parallelIdx) =>
        stepToFlowJob(
          s,
          flowId,
          stepIndex,
          parallelIdx,
          defaultOpts,
          continueOnChildFailure,
        ),
      )
      leaf.children = [...(leaf.children ?? []), ...parallelJobs]
      newLeaves.push(...parallelJobs)
    }
  } else {
    for (const leaf of state.leaves) {
      const job = stepToFlowJob(
        step,
        flowId,
        stepIndex,
        0,
        defaultOpts,
        continueOnChildFailure,
      )
      leaf.children = [...(leaf.children ?? []), job]
      newLeaves.push(job)
    }
  }

  return { root: state.root, leaves: newLeaves }
}

function stepToFlowJob(
  step: FlowStep,
  flowId: string,
  stepIndex: number,
  parallelIdx: number,
  defaultOpts: Omit<JobsOptions, 'parent'>,
  continueOnChildFailure: boolean,
): FlowJob {
  const jobId =
    step.opts?.jobId ?? `${flowId}-${stepIndex}-${step.name}-${parallelIdx}`

  return {
    name: step.name,
    queueName: step.queue,
    data: step.data,
    opts: {
      ...defaultOpts,
      ...step.opts,
      jobId,
      ...(continueOnChildFailure && { continueParentOnFailure: true }),
    },
  }
}
