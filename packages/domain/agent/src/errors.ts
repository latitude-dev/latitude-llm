import { Data } from "effect"

export class AgentSessionNotFoundError extends Data.TaggedError("AgentSessionNotFoundError")<{
  readonly sessionId: string
}> {
  readonly httpStatus = 404
  readonly httpMessage = "Agent session not found"
}
