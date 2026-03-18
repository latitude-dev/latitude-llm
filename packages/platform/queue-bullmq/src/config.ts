import { parseEnv, parseEnvOptional } from "@platform/env"
import { Data, Effect } from "effect"

export class BullMqConfigError extends Data.TaggedError("BullMqConfigError")<{
  readonly message: string
}> {}

export interface BullMqConfig {
  readonly host: string
  readonly port: number
  readonly password: string | undefined
}

export const loadBullMqConfig = (): Effect.Effect<BullMqConfig, BullMqConfigError | Error> =>
  Effect.gen(function* () {
    const host = yield* parseEnv("LAT_BULLMQ_HOST", "string")
    const port = yield* parseEnv("LAT_BULLMQ_PORT", "number", 6380)
    const password = yield* parseEnvOptional("LAT_BULLMQ_PASSWORD", "string")

    return {
      host,
      port,
      password: password ?? undefined,
    }
  })
