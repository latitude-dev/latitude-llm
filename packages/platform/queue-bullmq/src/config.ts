import { parseEnv, parseEnvOptional } from "@platform/env"
import { Effect } from "effect"

export interface BullMqConfig {
  readonly host: string
  readonly port: number
  readonly password?: string
  readonly tls?: boolean
}

export const loadBullMqConfig = () =>
  Effect.gen(function* () {
    const host = yield* parseEnv("LAT_BULLMQ_HOST", "string")
    const port = yield* parseEnv("LAT_BULLMQ_PORT", "number", 6380)
    const password = yield* parseEnvOptional("LAT_BULLMQ_PASSWORD", "string")
    const tls = yield* parseEnvOptional("LAT_REDIS_TLS", "string")

    return {
      host,
      port,
      ...(password ? { password } : {}),
      ...(tls === "true" ? { tls: true } : {}),
    } satisfies BullMqConfig
  })
