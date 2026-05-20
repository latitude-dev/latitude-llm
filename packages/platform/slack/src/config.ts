import { type InvalidEnvValueError, parseEnvOptional } from "@platform/env"
import { Effect } from "effect"

export interface SlackConfig {
  readonly clientId: string
  readonly clientSecret: string
  readonly signingSecret: string
}

/**
 * Resolves the Slack app credentials from env. All three values are
 * required together — partial config returns `undefined` so callers can
 * cleanly disable Slack-dependent surfaces (the connect button, the
 * producer's route lookup, the events webhook).
 *
 * The signing secret is unused before Phase 4 (webhook verification) but
 * is loaded together with the OAuth credentials so the "is Slack
 * configured?" decision stays binary.
 */
export const loadSlackConfig: Effect.Effect<SlackConfig | undefined, InvalidEnvValueError> = Effect.gen(function* () {
  const clientId = yield* parseEnvOptional("LAT_SLACK_CLIENT_ID", "string")
  const clientSecret = yield* parseEnvOptional("LAT_SLACK_CLIENT_SECRET", "string")
  const signingSecret = yield* parseEnvOptional("LAT_SLACK_SIGNING_SECRET", "string")
  if (!clientId || !clientSecret || !signingSecret) return undefined
  return { clientId, clientSecret, signingSecret }
})
