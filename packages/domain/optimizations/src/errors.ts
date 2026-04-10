import { Data } from "effect"

export class OptimizationError extends Data.TaggedError("OptimizationError")<{
  readonly message: string
  readonly cause?: unknown
}> {
  readonly httpStatus = 500
  readonly httpMessage = "Optimization failed"
}

export class OptimizationTransportError extends Data.TaggedError("OptimizationTransportError")<{
  readonly operation: string
  readonly cause: unknown
}> {
  readonly httpStatus = 502
  readonly httpMessage = "Optimization transport failed"
}

export class OptimizationProtocolError extends Data.TaggedError("OptimizationProtocolError")<{
  readonly message: string
  readonly cause?: unknown
}> {
  readonly httpStatus = 500
  readonly httpMessage = "Optimization protocol failed"
}

export class OptimizationAbortedError extends Data.TaggedError("OptimizationAbortedError")<{
  readonly reason?: string
}> {
  readonly httpStatus = 408
  readonly httpMessage = "Optimization aborted"
}
