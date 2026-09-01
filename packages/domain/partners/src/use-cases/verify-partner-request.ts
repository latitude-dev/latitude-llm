import { hash, verifyHmacSha256Hex } from "@repo/utils"
import { Data, Effect } from "effect"
import { PARTNER_SIGNATURE_TOLERANCE_SECONDS, PARTNER_SIGNATURE_VERSION } from "../constants.ts"
import { type Partner, type PartnerScope, partnerAllowsIp, partnerHasScope } from "../entities/partner.ts"

/**
 * Why a signed request was refused. Only `insufficient-scope` is safe to
 * distinguish to the caller (they have already proven identity); the boundary
 * collapses every other reason into one uniform 401 so the surface can't be
 * used to enumerate partner ids.
 */
export type PartnerVerificationFailureReason =
  | "partner-disabled"
  | "ip-not-allowed"
  | "missing-headers"
  | "malformed-signature"
  | "malformed-nonce"
  | "malformed-timestamp"
  | "stale-timestamp"
  | "bad-signature"
  | "insufficient-scope"

export class PartnerVerificationError extends Data.TaggedError("PartnerVerificationError")<{
  readonly reason: PartnerVerificationFailureReason
}> {}

export interface VerifyPartnerRequestInput {
  readonly partner: Partner
  readonly secret: string
  readonly requiredScope: PartnerScope
  /** Client address as the closest trusted proxy saw it. Only consulted when the partner has a non-empty allowlist. */
  readonly clientIp: string | undefined
  readonly method: string
  /** Full request path including the `/v1` prefix, without the query string. */
  readonly pathname: string
  readonly rawBody: string
  readonly timestampHeader: string | undefined
  readonly signatureHeader: string | undefined
  readonly nonceHeader: string | undefined
  readonly now?: Date
}

/**
 * `v1:<timestamp>:<METHOD>:<pathname>:<nonce>:<sha256hex(rawBody)>` — binds the
 * signature to the clock, the verb, the partner id in the path, the single-use
 * nonce, and the exact bytes of the body.
 *
 * The nonce has to be in here for the replay store to mean anything: signing
 * everything *but* the nonce would let a captured request be replayed inside the
 * timestamp window under a fresh nonce, which the store has never seen.
 */
export const buildPartnerStringToSign = (input: {
  readonly timestamp: string
  readonly method: string
  readonly pathname: string
  readonly nonce: string
  readonly bodyHash: string
}): string =>
  `${PARTNER_SIGNATURE_VERSION}:${input.timestamp}:${input.method.toUpperCase()}:${input.pathname}:${input.nonce}:${input.bodyHash}`

/** Colon-free so a nonce can't shift the field boundaries of the signed string, and bounded so it can't bloat the replay keyspace. */
const VALID_NONCE = /^[A-Za-z0-9_-]{8,200}$/

const SIGNATURE_PREFIX = `${PARTNER_SIGNATURE_VERSION}=`

export const verifyPartnerRequestUseCase = Effect.fn("partners.verifyPartnerRequest")(function* (
  input: VerifyPartnerRequestInput,
) {
  if (!input.partner.enabled) return yield* new PartnerVerificationError({ reason: "partner-disabled" })

  if (!partnerAllowsIp(input.partner, input.clientIp)) {
    return yield* new PartnerVerificationError({ reason: "ip-not-allowed" })
  }

  const timestampHeader = input.timestampHeader?.trim()
  const signatureHeader = input.signatureHeader?.trim()
  const nonceHeader = input.nonceHeader?.trim()
  if (!timestampHeader || !signatureHeader || !nonceHeader) {
    return yield* new PartnerVerificationError({ reason: "missing-headers" })
  }

  if (!VALID_NONCE.test(nonceHeader)) {
    return yield* new PartnerVerificationError({ reason: "malformed-nonce" })
  }

  if (!signatureHeader.startsWith(SIGNATURE_PREFIX)) {
    return yield* new PartnerVerificationError({ reason: "malformed-signature" })
  }
  const signatureHex = signatureHeader.slice(SIGNATURE_PREFIX.length)
  if (!/^[0-9a-f]{64}$/.test(signatureHex)) {
    return yield* new PartnerVerificationError({ reason: "malformed-signature" })
  }

  if (!/^\d{1,20}$/.test(timestampHeader)) {
    return yield* new PartnerVerificationError({ reason: "malformed-timestamp" })
  }
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000)
  if (Math.abs(nowSeconds - Number(timestampHeader)) > PARTNER_SIGNATURE_TOLERANCE_SECONDS) {
    return yield* new PartnerVerificationError({ reason: "stale-timestamp" })
  }

  const bodyHash = yield* hash(input.rawBody).pipe(Effect.orDie)
  const signatureValid = yield* verifyHmacSha256Hex({
    secret: input.secret,
    message: buildPartnerStringToSign({
      timestamp: timestampHeader,
      method: input.method,
      pathname: input.pathname,
      nonce: nonceHeader,
      bodyHash,
    }),
    signatureHex,
  })
  if (!signatureValid) return yield* new PartnerVerificationError({ reason: "bad-signature" })

  // Last, and the only refusal the caller is told apart: identity is already proven by here.
  if (!partnerHasScope(input.partner, input.requiredScope)) {
    return yield* new PartnerVerificationError({ reason: "insufficient-scope" })
  }
})
