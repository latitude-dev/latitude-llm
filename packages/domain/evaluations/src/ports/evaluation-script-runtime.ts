import type { GenerateTelemetryCapture } from "@domain/ai"
import { Context, type Effect } from "effect"
import type { EvaluationExecutionError } from "../errors.ts"
import type {
  EvaluationConversationMessage,
  EvaluationIssueContext,
  EvaluationScriptExecution,
} from "../runtime/evaluation-execution.ts"

export interface EvaluationRuntimeMetadata {
  readonly duration: number
  readonly usage: {
    readonly input: number
    readonly output: number
    readonly reasoning: number
    readonly cacheRead: number
    readonly cacheWrite: number
  }
  readonly cost: number
  readonly turns: number
  readonly traceId?: string | null | undefined
  readonly sessionId?: string | null | undefined
  readonly spanId?: string | null | undefined
  readonly simulationId?: string | null | undefined
}

export interface ExecuteEvaluationScriptRuntimeInput {
  readonly script: string
  readonly conversation: readonly EvaluationConversationMessage[]
  readonly metadata: EvaluationRuntimeMetadata
  readonly issue: EvaluationIssueContext
  readonly telemetry?: GenerateTelemetryCapture
}

export interface EvaluationScriptRuntimeShape {
  readonly execute: (
    input: ExecuteEvaluationScriptRuntimeInput,
  ) => Effect.Effect<EvaluationScriptExecution, EvaluationExecutionError>
  readonly compile: (script: string) => Effect.Effect<void, EvaluationExecutionError>
}

export class EvaluationScriptRuntime extends Context.Service<EvaluationScriptRuntime, EvaluationScriptRuntimeShape>()(
  "@domain/evaluations/EvaluationScriptRuntime",
) {}
