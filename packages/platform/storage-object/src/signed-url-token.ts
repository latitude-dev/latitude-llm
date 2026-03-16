import { createHmac } from "node:crypto"
import { Data, Effect } from "effect"

const ALGORITHM = "sha256"
const SEP = "."

class SignedExportTokenError extends Data.TaggedError("SignedExportTokenError")<{
  readonly reason: "invalid_format" | "invalid_payload" | "expired" | "invalid_signature"
  readonly cause?: unknown
}> {}

function base64urlEncode(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data
  return Buffer.from(bytes).toString("base64url")
}

function base64urlDecode(str: string): Uint8Array {
  return new Uint8Array(Buffer.from(str, "base64url"))
}

function parsePayload(payloadStr: string): Effect.Effect<{ key: string; exp: number }, SignedExportTokenError> {
  return Effect.try({
    try: () => JSON.parse(payloadStr) as unknown,
    catch: (e) => new SignedExportTokenError({ reason: "invalid_payload", cause: e }),
  }).pipe(
    Effect.flatMap((raw) => {
      if (
        raw !== null &&
        typeof raw === "object" &&
        typeof (raw as { key?: unknown }).key === "string" &&
        typeof (raw as { exp?: unknown }).exp === "number"
      ) {
        return Effect.succeed({ key: (raw as { key: string }).key, exp: (raw as { exp: number }).exp })
      }
      return Effect.fail(new SignedExportTokenError({ reason: "invalid_payload" }))
    }),
  )
}

/**
 * Creates a signed token for export download URLs (FS driver).
 * Payload: { key, exp } (exp = expiry timestamp ms). Signature: HMAC-SHA256(secret, payload).
 */
export function createSignedExportToken(key: string, expiresInSeconds: number, secret: string): string {
  const exp = Date.now() + expiresInSeconds * 1000
  const payload = JSON.stringify({ key, exp })
  const payloadB64 = base64urlEncode(payload)
  const sig = createHmac(ALGORITHM, secret).update(payload).digest()
  const sigB64 = base64urlEncode(sig)
  return `${payloadB64}${SEP}${sigB64}`
}

/**
 * Verifies a signed export token and returns the storage key if valid.
 */
export function verifySignedExportToken(token: string, secret: string): Effect.Effect<string, SignedExportTokenError> {
  const idx = token.lastIndexOf(SEP)
  if (idx === -1) {
    return Effect.fail(new SignedExportTokenError({ reason: "invalid_format" }))
  }
  const payloadB64 = token.slice(0, idx)
  const sigB64 = token.slice(idx + 1)

  return Effect.try({
    try: () => new TextDecoder().decode(base64urlDecode(payloadB64)),
    catch: (e) => new SignedExportTokenError({ reason: "invalid_format", cause: e }),
  }).pipe(
    Effect.flatMap((payloadStr) =>
      parsePayload(payloadStr).pipe(
        Effect.flatMap((payload) =>
          Date.now() > payload.exp
            ? Effect.fail(new SignedExportTokenError({ reason: "expired" }))
            : Effect.succeed({ payload, payloadStr }),
        ),
        Effect.flatMap(({ payload, payloadStr }) =>
          Effect.try({
            try: () => base64urlDecode(sigB64),
            catch: (e) => new SignedExportTokenError({ reason: "invalid_format", cause: e }),
          }).pipe(
            Effect.flatMap((actualSig) => {
              const expectedSig = createHmac(ALGORITHM, secret).update(payloadStr).digest()
              const valid = expectedSig.length === actualSig.length && expectedSig.every((b, i) => b === actualSig[i])
              return valid
                ? Effect.succeed(payload.key)
                : Effect.fail(new SignedExportTokenError({ reason: "invalid_signature" }))
            }),
          ),
        ),
      ),
    ),
  )
}
