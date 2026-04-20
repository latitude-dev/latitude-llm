import { parseEnv, parseEnvOptional } from "@platform/env"
import { Effect } from "effect"

export interface BullMqConfig {
  readonly host: string
  readonly port: number
  readonly password?: string
  readonly tls?: boolean
  readonly cluster?: boolean
}

export const loadBullMqConfig = () =>
  Effect.gen(function* () {
    const host = yield* parseEnv("LAT_BULLMQ_HOST", "string")
    const port = yield* parseEnv("LAT_BULLMQ_PORT", "number", 6380)
    const password = yield* parseEnvOptional("LAT_BULLMQ_PASSWORD", "string")
    const tls = yield* parseEnvOptional("LAT_REDIS_TLS", "boolean")
    const cluster = yield* parseEnvOptional("LAT_BULLMQ_CLUSTER", "boolean")

    return {
      host,
      port,
      ...(password ? { password } : {}),
      ...(tls ? { tls: true } : {}),
      ...(cluster ? { cluster: true } : {}),
    } satisfies BullMqConfig
  })
