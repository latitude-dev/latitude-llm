import { PartnerId } from "@domain/shared"
import { hash, hmacSha256Hex } from "@repo/utils"
import { Cause, Effect, Exit } from "effect"
import { describe, expect, it } from "vitest"
import { PARTNER_SIGNATURE_TOLERANCE_SECONDS } from "../constants.ts"
import { createPartner } from "../entities/partner.ts"
import {
  buildPartnerStringToSign,
  type PartnerVerificationError,
  type PartnerVerificationFailureReason,
  verifyPartnerRequestUseCase,
} from "./verify-partner-request.ts"

const SECRET = "0".repeat(64)
const NOW = new Date("2026-08-26T12:00:00Z")
const METHOD = "POST"
const PATHNAME = "/v1/private/partners/aaaaaaaaaaaaaaaaaaaaaaaa/accounts"
const BODY = JSON.stringify({ email: "founder@longitude.example", organizationName: "Courtesy" })
const NONCE = "e0b9c1d2-3f4a-4b5c-8d6e-7f8091a2b3c4"

const partner = createPartner({
  id: PartnerId("a".repeat(24)),
  name: "Longitude",
  redirectUrls: ["https://longitude.example/oauth/callback"],
  scopes: ["accounts:provision"],
})

const sign = async (
  overrides: {
    readonly secret?: string
    readonly timestamp?: number
    readonly method?: string
    readonly pathname?: string
    readonly nonce?: string
    readonly body?: string
  } = {},
) => {
  const timestamp = String(overrides.timestamp ?? Math.floor(NOW.getTime() / 1000))
  const bodyHash = await Effect.runPromise(hash(overrides.body ?? BODY))
  const signature = await Effect.runPromise(
    hmacSha256Hex(
      overrides.secret ?? SECRET,
      buildPartnerStringToSign({
        timestamp,
        method: overrides.method ?? METHOD,
        pathname: overrides.pathname ?? PATHNAME,
        nonce: overrides.nonce ?? NONCE,
        bodyHash,
      }),
    ),
  )
  return { timestamp, signatureHeader: `v1=${signature}` }
}

const verify = (input: {
  readonly timestampHeader: string | undefined
  readonly signatureHeader: string | undefined
  readonly method?: string
  readonly pathname?: string
  readonly rawBody?: string
  readonly secret?: string
  readonly clientIp?: string | undefined
  readonly nonceHeader?: string | undefined
  readonly partnerOverrides?: Partial<Parameters<typeof createPartner>[0]>
}) =>
  Effect.runPromiseExit(
    verifyPartnerRequestUseCase({
      partner: input.partnerOverrides
        ? createPartner({
            id: partner.id,
            name: "Longitude",
            redirectUrls: ["https://longitude.example/oauth/callback"],
            scopes: ["accounts:provision"],
            ...input.partnerOverrides,
          })
        : partner,
      secret: input.secret ?? SECRET,
      requiredScope: "accounts:provision",
      clientIp: input.clientIp,
      method: input.method ?? METHOD,
      pathname: input.pathname ?? PATHNAME,
      rawBody: input.rawBody ?? BODY,
      timestampHeader: input.timestampHeader,
      signatureHeader: input.signatureHeader,
      nonceHeader: "nonceHeader" in input ? input.nonceHeader : NONCE,
      now: NOW,
    }),
  )

const failureReason = (
  exit: Exit.Exit<void, PartnerVerificationError>,
): PartnerVerificationFailureReason | undefined =>
  Exit.isFailure(exit) ? exit.cause.reasons.find(Cause.isFailReason)?.error.reason : undefined

describe("verifyPartnerRequestUseCase", () => {
  it("accepts a correctly signed request", async () => {
    const { timestamp, signatureHeader } = await sign()

    const exit = await verify({ timestampHeader: timestamp, signatureHeader })

    expect(Exit.isSuccess(exit)).toBe(true)
  })

  it("accepts a timestamp at the edge of the tolerance window, either side", async () => {
    const nowSeconds = Math.floor(NOW.getTime() / 1000)

    for (const offset of [-PARTNER_SIGNATURE_TOLERANCE_SECONDS, PARTNER_SIGNATURE_TOLERANCE_SECONDS]) {
      const { timestamp, signatureHeader } = await sign({ timestamp: nowSeconds + offset })
      expect(Exit.isSuccess(await verify({ timestampHeader: timestamp, signatureHeader }))).toBe(true)
    }
  })

  it("rejects a timestamp one second outside the window, either side", async () => {
    const nowSeconds = Math.floor(NOW.getTime() / 1000)

    for (const offset of [-PARTNER_SIGNATURE_TOLERANCE_SECONDS - 1, PARTNER_SIGNATURE_TOLERANCE_SECONDS + 1]) {
      const { timestamp, signatureHeader } = await sign({ timestamp: nowSeconds + offset })
      expect(failureReason(await verify({ timestampHeader: timestamp, signatureHeader }))).toBe("stale-timestamp")
    }
  })

  it("rejects a signature made with the wrong secret", async () => {
    const { timestamp, signatureHeader } = await sign({ secret: "f".repeat(64) })

    expect(failureReason(await verify({ timestampHeader: timestamp, signatureHeader }))).toBe("bad-signature")
  })

  it("rejects the old secret once the partner has rotated", async () => {
    const { timestamp, signatureHeader } = await sign({ secret: "old-secret" })

    expect(failureReason(await verify({ timestampHeader: timestamp, signatureHeader, secret: "new-secret" }))).toBe(
      "bad-signature",
    )
  })

  it("rejects a tampered body, path or method", async () => {
    const { timestamp, signatureHeader } = await sign()

    expect(failureReason(await verify({ timestampHeader: timestamp, signatureHeader, rawBody: `${BODY} ` }))).toBe(
      "bad-signature",
    )
    expect(
      failureReason(
        await verify({ timestampHeader: timestamp, signatureHeader, pathname: "/v1/private/partners/x/accounts" }),
      ),
    ).toBe("bad-signature")
    expect(failureReason(await verify({ timestampHeader: timestamp, signatureHeader, method: "PUT" }))).toBe(
      "bad-signature",
    )
  })

  it("treats the method as case-insensitive so Hono's casing doesn't matter", async () => {
    const { timestamp, signatureHeader } = await sign({ method: "post" })

    expect(Exit.isSuccess(await verify({ timestampHeader: timestamp, signatureHeader, method: "POST" }))).toBe(true)
  })

  it("rejects missing headers", async () => {
    const { timestamp, signatureHeader } = await sign()

    expect(failureReason(await verify({ timestampHeader: undefined, signatureHeader }))).toBe("missing-headers")
    expect(failureReason(await verify({ timestampHeader: timestamp, signatureHeader: undefined }))).toBe(
      "missing-headers",
    )
  })

  it("rejects malformed signature headers", async () => {
    const { timestamp, signatureHeader } = await sign()
    const bareHex = signatureHeader.slice("v1=".length)

    for (const header of [
      bareHex,
      `v2=${bareHex}`,
      "v1=nothex",
      `v1=${bareHex.slice(0, 63)}`,
      `v1=${bareHex.toUpperCase()}`,
    ]) {
      expect(failureReason(await verify({ timestampHeader: timestamp, signatureHeader: header }))).toBe(
        "malformed-signature",
      )
    }
  })

  it("rejects a malformed timestamp", async () => {
    const { signatureHeader } = await sign()

    for (const header of ["not-a-number", "-1", "12.5", ""]) {
      const reason = failureReason(await verify({ timestampHeader: header, signatureHeader }))
      expect(reason === "malformed-timestamp" || reason === "missing-headers").toBe(true)
    }
  })

  it("rejects a disabled partner before looking at anything else", async () => {
    const { timestamp, signatureHeader } = await sign()

    expect(
      failureReason(
        await verify({ timestampHeader: timestamp, signatureHeader, partnerOverrides: { enabled: false } }),
      ),
    ).toBe("partner-disabled")
  })

  it("accepts any IP when the partner has no allowlist", async () => {
    const { timestamp, signatureHeader } = await sign()

    for (const ip of ["203.0.113.7", undefined]) {
      expect(Exit.isSuccess(await verify({ timestampHeader: timestamp, signatureHeader, clientIp: ip }))).toBe(true)
    }
  })

  it("enforces a non-empty allowlist before looking at the signature", async () => {
    const { timestamp, signatureHeader } = await sign()
    const partnerOverrides = { allowedIps: ["203.0.113.0/24", "2001:db8::/32"] }

    for (const ip of ["203.0.113.7", "203.0.113.255", "2001:db8:abcd::1", "::ffff:203.0.113.7"]) {
      expect(
        Exit.isSuccess(await verify({ timestampHeader: timestamp, signatureHeader, clientIp: ip, partnerOverrides })),
        ip,
      ).toBe(true)
    }

    for (const ip of ["198.51.100.4", "203.0.114.1", "2001:db9::1", "garbage", undefined]) {
      expect(
        failureReason(await verify({ timestampHeader: timestamp, signatureHeader, clientIp: ip, partnerOverrides })),
        String(ip),
      ).toBe("ip-not-allowed")
    }

    // A correct IP with a bad signature still fails on the signature, not the allowlist.
    expect(
      failureReason(
        await verify({
          timestampHeader: timestamp,
          signatureHeader,
          clientIp: "203.0.113.7",
          secret: "wrong",
          partnerOverrides,
        }),
      ),
    ).toBe("bad-signature")
  })

  it("rejects a partner missing the required scope, only after the signature checks out", async () => {
    const { timestamp, signatureHeader } = await sign()

    expect(
      failureReason(await verify({ timestampHeader: timestamp, signatureHeader, partnerOverrides: { scopes: [] } })),
    ).toBe("insufficient-scope")
    // A bad signature on a scopeless partner must still read as a signature failure, not a scope one.
    expect(
      failureReason(
        await verify({
          timestampHeader: timestamp,
          signatureHeader,
          secret: "wrong",
          partnerOverrides: { scopes: [] },
        }),
      ),
    ).toBe("bad-signature")
  })

  it("rejects a request that omits the nonce", async () => {
    const { timestamp, signatureHeader } = await sign()

    expect(
      await failureReason(await verify({ timestampHeader: timestamp, signatureHeader, nonceHeader: undefined })),
    ).toBe("missing-headers")
  })

  it("rejects a nonce that could shift the signed string's field boundaries, or bloat the replay keyspace", async () => {
    for (const nonce of ["has:colon:inside", "with space", "short", "x".repeat(201)]) {
      const { timestamp, signatureHeader } = await sign({ nonce })
      expect(
        await failureReason(await verify({ timestampHeader: timestamp, signatureHeader, nonceHeader: nonce })),
      ).toBe("malformed-nonce")
    }
  })

  it("refuses a captured request replayed under a fresh nonce", async () => {
    // The whole point of signing the nonce. Without it the signature stays valid when the
    // nonce changes, so the replay store never sees a repeat and never rejects anything.
    const { timestamp, signatureHeader } = await sign()

    expect(Exit.isSuccess(await verify({ timestampHeader: timestamp, signatureHeader }))).toBe(true)
    expect(
      await failureReason(
        await verify({
          timestampHeader: timestamp,
          signatureHeader,
          nonceHeader: "f1e2d3c4-b5a6-4798-8a9b-0c1d2e3f4a5b",
        }),
      ),
    ).toBe("bad-signature")
  })
})
