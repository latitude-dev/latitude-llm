import { Effect } from "effect"
import type { WorkflowTerminatorShape } from "../index.ts"

export interface TerminatedWorkflow {
  readonly workflowId: string
  readonly reason: string | undefined
}

export interface FakeWorkflowTerminatorHandle {
  readonly terminator: WorkflowTerminatorShape
  /** Every terminate call in order. */
  readonly terminated: TerminatedWorkflow[]
}

/** In-memory {@link WorkflowTerminatorShape} that records terminations instead of calling Temporal. */
export function createFakeWorkflowTerminator(): FakeWorkflowTerminatorHandle {
  const terminated: TerminatedWorkflow[] = []
  return {
    terminated,
    terminator: {
      terminate: (workflowId, reason) =>
        Effect.sync(() => {
          terminated.push({ workflowId, reason })
        }),
    },
  }
}
