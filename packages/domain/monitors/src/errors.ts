import { Data } from "effect"

/**
 * A structurally-locked operation (delete, rename/description edit, alter the
 * alert set) was attempted on a system monitor. System monitors only allow
 * mute/unmute and editing an existing alert's configurable values.
 */
export class SystemMonitorForbiddenError extends Data.TaggedError("SystemMonitorForbiddenError")<{
  readonly monitorId: string
  readonly operation: string
}> {
  readonly httpStatus = 403
  get httpMessage() {
    return `System monitors cannot be ${this.operation}`
  }
}

/** The alert id targeted by `updateMonitorAlertUseCase` is not a live alert of the monitor. */
export class MonitorAlertNotFoundError extends Data.TaggedError("MonitorAlertNotFoundError")<{
  readonly monitorId: string
  readonly alertId: string
}> {
  readonly httpStatus = 404
  readonly httpMessage = "Monitor alert not found"
}

/**
 * A new condition's `kind` does not match the alert's `kind` (kind/source are
 * immutable — only configurable values may change), or the alert's kind has no
 * configurable values (`issue.new`, `issue.regressed`, `savedSearch.match`).
 */
export class AlertConditionMismatchError extends Data.TaggedError("AlertConditionMismatchError")<{
  readonly message: string
}> {
  readonly httpStatus = 400
  get httpMessage() {
    return this.message
  }
}
