import { base64urlDecode, base64urlEncode, encodeUtf8, toBuffer } from "@repo/utils"
import { Data, Effect } from "effect"

const ALGORITHM = "SHA-256"
const SEP = "."

class SignedExportTokenError extends Data.TaggedError("SignedExportTokenError")<{
  readonly reason: "invalid_format" | "invalid_payload" | "expired" | "invalid_signature"
  readonly cause?: unknown
}> {}

const importHmacKey = (secret: string): Promise<CryptoKey> =>
  crypto.subtle.importKey("raw", encodeUtf8(secret), { name: "HMAC", hash: ALGORITHM }, false, ["sign", "verify"])

const hmacSign = async (key: CryptoKey, data: Uint8Array): Promise<Uint8Array> => {
  const signature = await crypto.subtle.sign("HMAC", key, toBuffer(data))
  return new Uint8Array(signature)
}

const hmacVerify = async (key: CryptoKey, signature: Uint8Array, data: Uint8Array): Promise<boolean> => {
  return crypto.subtle.verify("HMAC", key, toBuffer(signature), toBuffer(data))
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
export async function createSignedExportToken(key: string, expiresInSeconds: number, secret: string): Promise<string> {
  const exp = Date.now() + expiresInSeconds * 1000
  const payload = JSON.stringify({ key, exp })
  const payloadB64 = base64urlEncode(payload)

  const cryptoKey = await importHmacKey(secret)
  const payloadBytes = encodeUtf8(payload)
  const sig = await hmacSign(cryptoKey, payloadBytes)
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
          Effect.tryPromise({
            try: async () => {
              const cryptoKey = await importHmacKey(secret)
              const signature = base64urlDecode(sigB64)
              const data = encodeUtf8(payloadStr)
              const valid = await hmacVerify(cryptoKey, signature, data)
              return valid ? payload.key : null
            },
            catch: (e) => new SignedExportTokenError({ reason: "invalid_format", cause: e }),
          }).pipe(
            Effect.flatMap((key) =>
              key ? Effect.succeed(key) : Effect.fail(new SignedExportTokenError({ reason: "invalid_signature" })),
            ),
          ),
        ),
      ),
    ),
  )
}
