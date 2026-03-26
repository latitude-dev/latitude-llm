import { parseEnv, parseEnvOptional } from "@platform/env"
import { Effect } from "effect"

export interface TemporalConfig {
  readonly address: string
  readonly namespace: string
  readonly taskQueue: string
  readonly apiKey?: string
}

export function loadTemporalConfig(): TemporalConfig {
  const address = Effect.runSync(parseEnv("LAT_TEMPORAL_ADDRESS", "string"))
  const namespace = Effect.runSync(parseEnv("LAT_TEMPORAL_NAMESPACE", "string"))
  const taskQueue = Effect.runSync(parseEnv("LAT_TEMPORAL_TASK_QUEUE", "string"))
  const apiKey = Effect.runSync(parseEnvOptional("LAT_TEMPORAL_API_KEY", "string"))

  return {
    address,
    namespace,
    taskQueue,
    ...(apiKey !== undefined ? { apiKey } : {}),
  }
}
