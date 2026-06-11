import { Data } from "effect"

export const SCRIPT_LIMIT_KINDS = ["wall-clock", "cpu", "memory", "stack"] as const
export type ScriptLimitKind = (typeof SCRIPT_LIMIT_KINDS)[number]

/** Source does not compile — rejected at save time, never at run time. */
export class ScriptCompileError extends Data.TaggedError("ScriptCompileError")<{
  readonly message: string
}> {
  readonly httpStatus = 422
  get httpMessage() {
    return this.message
  }
}

/** The script threw — an errored run (for evaluations, an errored score). */
export class ScriptRuntimeError extends Data.TaggedError("ScriptRuntimeError")<{
  readonly message: string
  readonly cause?: unknown
}> {
  readonly httpStatus = 422
  get httpMessage() {
    return this.message
  }
}

/** CPU/memory/wall budget exhausted — errored run, counted against detector health. */
export class ScriptLimitExceededError extends Data.TaggedError("ScriptLimitExceededError")<{
  readonly limit: ScriptLimitKind
  readonly message: string
}> {
  readonly httpStatus = 422
  get httpMessage() {
    return this.message
  }
}

/** `llm()` or another host function failed — transient, retried per capability policy. */
export class HostCallError extends Data.TaggedError("HostCallError")<{
  readonly message: string
  readonly cause?: unknown
}> {
  readonly httpStatus = 502
  get httpMessage() {
    return this.message
  }
}

export type ScriptRunError = ScriptRuntimeError | ScriptLimitExceededError | HostCallError
