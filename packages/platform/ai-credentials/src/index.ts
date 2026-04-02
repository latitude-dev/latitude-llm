import { AICredentialError, AICredentials } from "@domain/ai"
import { parseEnv } from "@platform/env"
import { Effect, Layer } from "effect"

/**
 * Maps provider names to their environment variable names.
 * Unknown providers use the convention LAT_{PROVIDER}_API_KEY.
 */
const PROVIDER_ENV_KEYS: Record<string, string> = {
  anthropic: "LAT_ANTHROPIC_API_KEY",
  openai: "LAT_OPENAI_API_KEY",
}

const getEnvKey = (provider: string): string =>
  PROVIDER_ENV_KEYS[provider] ?? `LAT_${provider.toUpperCase().replace(/-/g, "_")}_API_KEY`

/**
 * Providers supported by Latitude-managed env credentials.
 * Used by `@platform/ai-vercel` and callers that must align with `getApiKey`.
 */
export const LATITUDE_AI_PROVIDERS = {
  anthropic: "anthropic",
  openai: "openai",
} as const

export type LatitudeAiProvider = (typeof LATITUDE_AI_PROVIDERS)[keyof typeof LATITUDE_AI_PROVIDERS]

export function isLatitudeAiProvider(provider: string): provider is LatitudeAiProvider {
  return (Object.values(LATITUDE_AI_PROVIDERS) as string[]).includes(provider)
}

/**
 * Latitude-managed credential resolution from environment variables.
 *
 * Reads API keys from LAT_{PROVIDER}_API_KEY env vars.
 * Future BYOK support would add a second resolution strategy
 * that checks org/project settings before falling back here.
 */
export const AICredentialsLive = Layer.succeed(AICredentials, {
  getApiKey: (provider: string) => {
    if (!isLatitudeAiProvider(provider)) {
      return Effect.fail(
        new AICredentialError({
          provider,
          message: `Unsupported AI provider "${provider}" for Latitude-managed credentials`,
        }),
      )
    }
    const envKey = getEnvKey(provider)
    return Effect.mapError(
      parseEnv(envKey, "string"),
      () =>
        new AICredentialError({
          provider,
          message: `Missing API key for provider "${provider}": set ${envKey}`,
        }),
    )
  },
})
