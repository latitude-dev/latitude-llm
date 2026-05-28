import { randomBytes } from "node:crypto"
import {
  OrganizationId,
  type OrganizationId as OrganizationIdType,
  UserId,
  type UserId as UserIdType,
} from "@domain/shared"
import { createLogger } from "@repo/observability"
import { z } from "zod"

/**
 * CSRF state for the Slack OAuth handshake.
 *
 * The state token is the secret: a 256-bit random value with the
 * organization + user bound to it on Redis. On callback we verify
 * existence + atomically delete (single-use) so a leaked state cannot
 * be replayed.
 *
 * Key shape is `slack:oauth-state:${state}` — deliberately **not**
 * `org:${organizationId}:...`. At callback time we don't know the
 * organization until we read the payload, so the key must be keyed
 * on the state alone. The token is opaque (32 random bytes hex) so
 * org-scoping in the key buys nothing.
 *
 * TTL is 10 minutes — long enough for a user to complete the Slack
 * approval screen, short enough that a forgotten flow doesn't linger.
 */

const logger = createLogger("slack-oauth-state")

const STATE_TTL_SECONDS = 60 * 10
const STATE_BYTES = 32

const KEY_PREFIX = "slack:oauth-state:"
const buildKey = (state: string): string => `${KEY_PREFIX}${state}`

/**
 * Minimal Redis surface this helper depends on. Production callers
 * pass `getRedisClient()`; tests pass an in-memory fake (see
 * `slack-oauth-state.test.ts`).
 */
export interface SlackOAuthStateRedis {
  set(key: string, value: string, mode: "EX", ttlSeconds: number): Promise<unknown>
  getdel(key: string): Promise<string | null>
}

const RETURN_TO_MAX_LENGTH = 512

// Reject anything not safe to feed verbatim into the callback's `Location` header.
export const validateReturnTo = (input: string | null | undefined): string | null => {
  if (typeof input !== "string") return null
  if (input.length === 0 || input.length > RETURN_TO_MAX_LENGTH) return null
  if (!input.startsWith("/")) return null
  if (input.startsWith("//") || input.startsWith("/\\")) return null
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f) return null
  }
  if (input.includes("#")) return null
  if (!input.startsWith("/projects/")) return null
  return input
}

const statePayloadSchema = z.object({
  organizationId: z.string().min(1),
  userId: z.string().min(1),
  createdAt: z.iso.datetime(),
  returnTo: z.string().optional(),
})

interface SlackOAuthStatePayload {
  readonly organizationId: OrganizationIdType
  readonly userId: UserIdType
  readonly createdAt: Date
  readonly returnTo: string | null
}

export const generateSlackOAuthState = async (input: {
  readonly redis: SlackOAuthStateRedis
  readonly organizationId: OrganizationIdType
  readonly userId: UserIdType
  readonly returnTo?: string | null
}): Promise<string> => {
  const state = randomBytes(STATE_BYTES).toString("hex")
  const validatedReturnTo = input.returnTo == null ? null : validateReturnTo(input.returnTo)
  const payload = JSON.stringify({
    organizationId: input.organizationId,
    userId: input.userId,
    createdAt: new Date().toISOString(),
    ...(validatedReturnTo === null ? {} : { returnTo: validatedReturnTo }),
  })
  await input.redis.set(buildKey(state), payload, "EX", STATE_TTL_SECONDS)
  return state
}

/**
 * Atomically read the state payload and delete the key so the token
 * cannot be replayed. Uses Redis `GETDEL` (single command, atomic
 * since Redis 6.2) — a pipelined `GET`+`DEL` would not prevent two
 * concurrent callbacks from both reading the value before either
 * delete lands. Returns `null` for missing, expired, or malformed
 * entries.
 *
 * Errors from Redis are logged and surface as `null` (treat as "no
 * such state"). Failing closed is the right default for CSRF — if we
 * can't verify, we reject.
 */
export const consumeSlackOAuthState = async (input: {
  readonly redis: SlackOAuthStateRedis
  readonly state: string
}): Promise<SlackOAuthStatePayload | null> => {
  const key = buildKey(input.state)

  let raw: string | null = null
  try {
    raw = await input.redis.getdel(key)
  } catch (cause) {
    logger.warn("slack oauth state redis getdel failed", cause)
    return null
  }

  if (raw === null) return null

  let payloadJson: unknown
  try {
    payloadJson = JSON.parse(raw)
  } catch {
    logger.warn("slack oauth state payload was not valid JSON")
    return null
  }

  const parsed = statePayloadSchema.safeParse(payloadJson)
  if (!parsed.success) {
    logger.warn("slack oauth state payload failed schema validation", parsed.error)
    return null
  }

  // Re-validate in case the Redis record was written outside this module.
  const validatedReturnTo = parsed.data.returnTo == null ? null : validateReturnTo(parsed.data.returnTo)

  return {
    organizationId: OrganizationId(parsed.data.organizationId),
    userId: UserId(parsed.data.userId),
    createdAt: new Date(parsed.data.createdAt),
    returnTo: validatedReturnTo,
  }
}
