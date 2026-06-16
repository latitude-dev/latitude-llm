import { InvalidEnvValueError, parseEnv, parseEnvOptional } from "@platform/env"
import { Effect } from "effect"

export interface TemporalConfig {
  readonly address: string
  readonly namespace: string
  readonly taskQueue: string
  readonly apiKey?: string
  readonly maxConcurrentActivityTaskExecutions?: number
}

const parsePositiveIntegerOptional = (name: string) =>
  Effect.runSync(
    parseEnvOptional(name, "number").pipe(
      Effect.flatMap((value) => {
        if (value === undefined) return Effect.succeed(undefined)
        if (Number.isInteger(value) && value > 0) return Effect.succeed(value)
        return Effect.fail(new InvalidEnvValueError({ name, expectedType: "number", value: String(value) }))
      }),
    ),
  )

export function loadTemporalConfig(): TemporalConfig {
  const address = Effect.runSync(parseEnv("LAT_TEMPORAL_ADDRESS", "string"))
  const namespace = Effect.runSync(parseEnv("LAT_TEMPORAL_NAMESPACE", "string"))
  const taskQueue = Effect.runSync(parseEnv("LAT_TEMPORAL_TASK_QUEUE", "string"))
  const apiKey = Effect.runSync(parseEnvOptional("LAT_TEMPORAL_API_KEY", "string"))
  const maxConcurrentActivityTaskExecutions = parsePositiveIntegerOptional("LAT_TEMPORAL_MAX_CONCURRENT_ACTIVITY_TASKS")

  return {
    address,
    namespace,
    taskQueue,
    ...(apiKey !== undefined ? { apiKey } : {}),
    ...(maxConcurrentActivityTaskExecutions !== undefined ? { maxConcurrentActivityTaskExecutions } : {}),
  }
}
