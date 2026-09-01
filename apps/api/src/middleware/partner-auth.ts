import {
  PARTNER_NONCE_HEADER,
  PARTNER_NONCE_TTL_SECONDS,
  PARTNER_SIGNATURE_HEADER,
  PARTNER_TIMESTAMP_HEADER,
  PartnerRepository,
  type PartnerScope,
  type PartnerVerificationFailureReason,
  verifyPartnerRequestUseCase,
} from "@domain/partners"
import { isValidId, PartnerId } from "@domain/shared"
import { PartnerRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Exit } from "effect"
import type { Context, MiddlewareHandler, Next } from "hono"
import { trustedClientIp } from "../utils/client-ip.ts"

const logger = createLogger("partner-auth")

type RefusalReason = PartnerVerificationFailureReason | "unknown-partner" | "replayed-nonce" | "lookup-failed"

/**
 * Claims a verified request's nonce, so the same signed request can't be sent twice.
 *
 * Only ever called *after* the signature verifies: the nonce is part of the signed
 * string, so reserving it earlier would let an unauthenticated caller burn a nonce
 * it can't sign for and turn the real request into a 401.
 *
 * Redis unreachable ⇒ accepted, like every limiter in the repo — the signed
 * timestamp still bounds replay, and an outage must not take the partner API down.
 */
const claimNonce = async (c: Context, partnerId: string): Promise<boolean> => {
  const nonce = c.req.header(PARTNER_NONCE_HEADER)?.trim()
  if (!nonce) return false

  try {
    const stored = await c
      .get("redis")
      .set(`org:system:partner:${partnerId}:nonce:${nonce}`, "1", "EX", PARTNER_NONCE_TTL_SECONDS, "NX")
    return stored === "OK"
  } catch {
    return true
  }
}

/**
 * Authenticates a request to the private partner API by HMAC signature.
 *
 * Every refusal before the scope check returns the same `401 {"error":
 * "unauthorized"}` — an unknown partner id must be indistinguishable from a bad
 * signature, or the surface becomes a partner-id oracle. The real reason is
 * logged (never the presented signature). Only the scope check gets a distinct
 * 403: by then the caller has already proven who they are.
 *
 * Runs on the tenant connection: `latitude.partners` is a global table with no
 * RLS, so `withPostgres`'s default `"system"` scope reads it without an
 * organization context.
 */
export const createPartnerAuthMiddleware = ({ requiredScope }: { requiredScope: PartnerScope }): MiddlewareHandler => {
  return async (c: Context, next: Next) => {
    const partnerIdParam = c.req.param("partnerId") ?? ""

    const refuse = (reason: RefusalReason) => {
      logger.warn("partner request refused", { partnerId: partnerIdParam, reason })
      if (reason === "insufficient-scope") return c.json({ error: "insufficient_scope" }, 403)
      return c.json({ error: "unauthorized" }, 401)
    }

    if (!isValidId(partnerIdParam)) return refuse("unknown-partner")
    const partnerId = PartnerId(partnerIdParam)

    const loaded = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const partners = yield* PartnerRepository
        return {
          partner: yield* partners.findById(partnerId),
          secret: yield* partners.findSecretById(partnerId),
        }
      }).pipe(withPostgres(PartnerRepositoryLive, c.get("postgresClient")), withTracing),
    )
    if (Exit.isFailure(loaded)) {
      const failure = loaded.cause.reasons.find((reason) => reason._tag === "Fail")
      return refuse(failure?.error._tag === "NotFoundError" ? "unknown-partner" : "lookup-failed")
    }

    // Hono caches the body on first read, so the route handler's own `c.req.text()` is free.
    const rawBody = await c.req.text()

    const verified = await Effect.runPromiseExit(
      verifyPartnerRequestUseCase({
        partner: loaded.value.partner,
        secret: loaded.value.secret,
        requiredScope,
        clientIp: trustedClientIp(c),
        method: c.req.method,
        pathname: new URL(c.req.url).pathname,
        rawBody,
        timestampHeader: c.req.header(PARTNER_TIMESTAMP_HEADER),
        signatureHeader: c.req.header(PARTNER_SIGNATURE_HEADER),
        nonceHeader: c.req.header(PARTNER_NONCE_HEADER),
      }).pipe(withTracing),
    )
    if (Exit.isFailure(verified)) {
      const failure = verified.cause.reasons.find((reason) => reason._tag === "Fail")
      return refuse(failure?.error.reason ?? "bad-signature")
    }

    if (!(await claimNonce(c, partnerId))) return refuse("replayed-nonce")

    c.set("partner", loaded.value.partner)
    await next()
  }
}
