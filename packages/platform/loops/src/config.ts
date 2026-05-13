import { type InvalidEnvValueError, parseEnvOptional } from "@platform/env"
import { Effect } from "effect"

export interface LoopsConfig {
  readonly apiKey: string
}

/**
 * Resolves Loops config from env. Returns `undefined` when no API key is set
 * so the integration cleanly no-ops in local dev / self-hosted deployments
 * that don't sync contacts to Loops.
 */
export const loadLoopsConfig: Effect.Effect<LoopsConfig | undefined, InvalidEnvValueError> = Effect.gen(function* () {
  const apiKey = yield* parseEnvOptional("LAT_LOOPS_API_KEY", "string")
  if (!apiKey) return undefined
  return { apiKey }
})
