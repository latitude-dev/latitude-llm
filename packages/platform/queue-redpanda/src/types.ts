import { Data } from "effect"

export class KafkaClientError extends Data.TaggedError("KafkaClientError")<{
  readonly cause: unknown
}> {}

export interface KafkaConfig {
  readonly clientId: string
  readonly brokers: string[]
  readonly groupId: string
  readonly ssl: boolean | undefined
  readonly sasl: { readonly mechanism: "plain"; readonly username: string; readonly password: string } | undefined
}
