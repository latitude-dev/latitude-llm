import { base64urlDecode, base64urlEncode, encodeUtf8, toBuffer } from "@repo/utils"
import { Data, Effect } from "effect"

/**
 * HMAC-signed token for the notification-chart endpoint. Unlike
 * `signed-url-token`, this token has **no expiry**: emails are
 * long-lived and the recipient may open the message months after we
 * sent it, so we need URLs that stay valid indefinitely as long as
 * the underlying notification row is still around.
 *
 * The payload is just the `notificationId` (no expiry, no kind/version
 * — those would force us to mint a new URL when the renderer evolves,
 * which we don't want). The signature is HMAC-SHA256(secret,
 * notificationId).
 */

const ALGORITHM = "SHA-256"
const SEP = "."

export class SignedNotificationChartTokenError extends Data.TaggedError("SignedNotificationChartTokenError")<{
  readonly reason: "invalid_format" | "invalid_signature"
  readonly cause?: unknown
}> {}

const importHmacKey = (secret: string): Promise<CryptoKey> =>
  crypto.subtle.importKey("raw", encodeUtf8(secret), { name: "HMAC", hash: ALGORITHM }, false, ["sign", "verify"])

const hmacSign = async (key: CryptoKey, data: Uint8Array): Promise<Uint8Array> => {
  const signature = await crypto.subtle.sign("HMAC", key, toBuffer(data))
  return new Uint8Array(signature)
}

const hmacVerify = async (key: CryptoKey, signature: Uint8Array, data: Uint8Array): Promise<boolean> =>
  crypto.subtle.verify("HMAC", key, toBuffer(signature), toBuffer(data))

/**
 * Sign a notification chart token. Returns `${notificationIdB64url}.${sigB64url}`.
 */
export async function createSignedNotificationChartToken(notificationId: string, secret: string): Promise<string> {
  const idB64 = base64urlEncode(notificationId)
  const cryptoKey = await importHmacKey(secret)
  const sig = await hmacSign(cryptoKey, encodeUtf8(notificationId))
  return `${idB64}${SEP}${base64urlEncode(sig)}`
}

/**
 * Verify a notification chart token and return the embedded
 * `notificationId` on success.
 */
export function verifySignedNotificationChartToken(
  token: string,
  secret: string,
): Effect.Effect<string, SignedNotificationChartTokenError> {
  const idx = token.lastIndexOf(SEP)
  if (idx === -1) {
    return Effect.fail(new SignedNotificationChartTokenError({ reason: "invalid_format" }))
  }
  const idB64 = token.slice(0, idx)
  const sigB64 = token.slice(idx + 1)

  return Effect.try({
    try: () => new TextDecoder().decode(base64urlDecode(idB64)),
    catch: (e) => new SignedNotificationChartTokenError({ reason: "invalid_format", cause: e }),
  }).pipe(
    Effect.flatMap((notificationId) =>
      Effect.tryPromise({
        try: async () => {
          const cryptoKey = await importHmacKey(secret)
          const signature = base64urlDecode(sigB64)
          const valid = await hmacVerify(cryptoKey, signature, encodeUtf8(notificationId))
          return valid ? notificationId : null
        },
        catch: (e) => new SignedNotificationChartTokenError({ reason: "invalid_format", cause: e }),
      }).pipe(
        Effect.flatMap((id) =>
          id !== null
            ? Effect.succeed(id)
            : Effect.fail(new SignedNotificationChartTokenError({ reason: "invalid_signature" })),
        ),
      ),
    ),
  )
}
