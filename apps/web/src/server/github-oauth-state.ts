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
 * CSRF state for the GitHub App install handshake. Keyed on the opaque nonce
 * alone (`github:install-state:${nonce}`) — not org-prefixed — because the
 * setup callback only carries the nonce, `installation_id` and `code`; the org
 * is unknown until the payload is read back (mirrors the Slack OAuth state).
 * TTL 10 minutes; GETDEL makes consumption single-use.
 */

const logger = createLogger("github-oauth-state")

const STATE_TTL_SECONDS = 60 * 10
const STATE_BYTES = 32

const KEY_PREFIX = "github:install-state:"
const buildKey = (state: string): string => `${KEY_PREFIX}${state}`

/** Minimal Redis surface: production passes `getRedisClient()`; tests pass an in-memory fake. */
export interface GithubInstallStateRedis {
  set(key: string, value: string, mode: "EX", ttlSeconds: number): Promise<unknown>
  getdel(key: string): Promise<string | null>
}

const statePayloadSchema = z.object({
  organizationId: z.string().min(1),
  userId: z.string().min(1),
  createdAt: z.iso.datetime(),
})

interface GithubInstallStatePayload {
  readonly organizationId: OrganizationIdType
  readonly userId: UserIdType
  readonly createdAt: Date
}

export const generateGithubInstallState = async (input: {
  readonly redis: GithubInstallStateRedis
  readonly organizationId: OrganizationIdType
  readonly userId: UserIdType
}): Promise<string> => {
  const state = randomBytes(STATE_BYTES).toString("hex")
  const payload = JSON.stringify({
    organizationId: input.organizationId,
    userId: input.userId,
    createdAt: new Date().toISOString(),
  })
  await input.redis.set(buildKey(state), payload, "EX", STATE_TTL_SECONDS)
  return state
}

/** Atomically reads + deletes the state (Redis GETDEL) so the nonce cannot be replayed. Fails closed on any error. */
export const consumeGithubInstallState = async (input: {
  readonly redis: GithubInstallStateRedis
  readonly state: string
}): Promise<GithubInstallStatePayload | null> => {
  let raw: string | null = null
  try {
    raw = await input.redis.getdel(buildKey(input.state))
  } catch (cause) {
    logger.warn("github install state redis getdel failed", cause)
    return null
  }
  if (raw === null) return null

  let payloadJson: unknown
  try {
    payloadJson = JSON.parse(raw)
  } catch {
    logger.warn("github install state payload was not valid JSON")
    return null
  }

  const parsed = statePayloadSchema.safeParse(payloadJson)
  if (!parsed.success) {
    logger.warn("github install state payload failed schema validation", parsed.error)
    return null
  }

  return {
    organizationId: OrganizationId(parsed.data.organizationId),
    userId: UserId(parsed.data.userId),
    createdAt: new Date(parsed.data.createdAt),
  }
}
