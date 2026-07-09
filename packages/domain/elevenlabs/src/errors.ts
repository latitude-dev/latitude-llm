import { Data } from "effect"

export class ElevenlabsWebhookNotFoundError extends Data.TaggedError("ElevenlabsWebhookNotFoundError")<{
  readonly webhookToken?: string
  readonly projectId?: string
}> {}

export class InvalidElevenlabsWebhookPayloadError extends Data.TaggedError("InvalidElevenlabsWebhookPayloadError")<{
  readonly reason: "type" | "otlp"
}> {}
