import { parseEnv, parseEnvOptional } from "@platform/env"
import { Data, Effect } from "effect"
import type { KafkaConfig } from "./types.ts"

export class KafkaSaslWithoutTlsError extends Data.TaggedError("KafkaSaslWithoutTlsError")<{
  readonly message: string
}> {}

export const loadKafkaConfig = (): Effect.Effect<KafkaConfig, KafkaSaslWithoutTlsError | Error> =>
  Effect.gen(function* () {
    const brokers = yield* parseEnv("LAT_KAFKA_BROKERS", "string")
    const clientId = yield* parseEnv("LAT_KAFKA_CLIENT_ID", "string")
    const groupId = yield* parseEnv("LAT_KAFKA_CONSUMER_GROUP_ID", "string")
    const eventsTopic = yield* parseEnv("LAT_KAFKA_EVENTS_TOPIC", "string")
    const dlqTopic = yield* parseEnv("LAT_KAFKA_DLQ_TOPIC", "string")

    // Optional: SSL/TLS encryption
    const ssl = yield* parseEnvOptional("LAT_KAFKA_SSL", "boolean")

    // Optional: SASL plain auth (only mechanism needed for internal Redpanda)
    const saslUsername = yield* parseEnvOptional("LAT_KAFKA_SASL_USERNAME", "string")
    const saslPassword = yield* parseEnvOptional("LAT_KAFKA_SASL_PASSWORD", "string")

    // Security: Enforce TLS when SASL is enabled in production
    const nodeEnv = process.env.NODE_ENV
    const hasSasl = saslUsername !== undefined && saslPassword !== undefined
    if (hasSasl && nodeEnv === "production" && ssl !== true) {
      return yield* new KafkaSaslWithoutTlsError({
        message: "LAT_KAFKA_SSL must be true in production when SASL authentication is configured",
      })
    }

    return {
      clientId,
      brokers: brokers.split(","),
      groupId,
      eventsTopic,
      dlqTopic,
      ssl,
      sasl:
        saslUsername && saslPassword
          ? { mechanism: "plain" as const, username: saslUsername, password: saslPassword }
          : undefined,
    }
  })
