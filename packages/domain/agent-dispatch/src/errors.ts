import { Data } from "effect"
import type { DispatchErrorCategory } from "./entities/agent-dispatch.ts"

export class DispatchAdapterError extends Data.TaggedError("DispatchAdapterError")<{
  readonly reason: DispatchErrorCategory
  readonly retryAfterSec?: number
  readonly cause?: unknown
}> {
  override get message() {
    return `Agent dispatch adapter failed (${this.reason})`
  }
}

export class AgentDispatchConfigNotFoundError extends Data.TaggedError("AgentDispatchConfigNotFoundError")<{
  readonly configId: string
}> {
  override get message() {
    return `Agent dispatch config not found: ${this.configId}`
  }
}

export class AgentDispatchIntegrationConflictError extends Data.TaggedError("AgentDispatchIntegrationConflictError")<{
  readonly kind: string
  readonly vendorAccountId: string
}> {
  readonly httpStatus = 409
  get httpMessage() {
    return "This integration target is already connected to another Latitude organization"
  }
}
