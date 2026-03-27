import { AICredentialError, AICredentials } from "@domain/ai"
import { parseEnv } from "@platform/env"
import { Effect, Layer } from "effect"

/**
 * Maps provider names to their environment variable names.
 * Unknown providers use the convention LAT_{PROVIDER}_API_KEY.
 */
const PROVIDER_ENV_KEYS: Record<string, string> = {
  anthropic: "LAT_ANTHROPIC_API_KEY",
}

const getEnvKey = (provider: string): string =>
  PROVIDER_ENV_KEYS[provider] ?? `LAT_${provider.toUpperCase().replace(/-/g, "_")}_API_KEY`

const LATITUDE_PROVIDERS = {
  anthropic: "anthropic",
} as const

type LatitudeProvider = (typeof LATITUDE_PROVIDERS)[keyof typeof LATITUDE_PROVIDERS]

/**
 * Latitude-managed credential resolution from environment variables.
 *
 * Reads API keys from LAT_{PROVIDER}_API_KEY env vars.
 * Future BYOK support would add a second resolution strategy
 * that checks org/project settings before falling back here.
 */
export const AICredentialsLive = Layer.succeed(AICredentials, {
  getApiKey: (provider: LatitudeProvider) => {
    const envKey = getEnvKey(provider)
    return Effect.try({
      try: () => Effect.runSync(parseEnv(envKey, "string")),
      catch: () =>
        new AICredentialError({
          provider,
          message: `Missing API key for provider "${provider}": set ${envKey}`,
        }),
    })
  },
})
