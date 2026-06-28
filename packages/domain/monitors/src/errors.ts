import { Data } from "effect"

export class SystemMonitorForbiddenError extends Data.TaggedError("SystemMonitorForbiddenError")<{
  readonly monitorId: string
  readonly operation: string
}> {
  readonly httpStatus = 403
  get httpMessage() {
    return `System monitors cannot be ${this.operation}`
  }
}
