import { type RepositoryError, toRepositoryError } from "@domain/shared"
import { parseEnv } from "@platform/env"
import { type CryptoError, decrypt, encrypt, hash } from "@repo/utils"
import { Effect } from "effect"

let encryptionKeyCache: Buffer | undefined

const VALID_HEX_32_BYTE_KEY = /^[0-9a-f]{64}$/i

/**
 * Resolves `LAT_MASTER_ENCRYPTION_KEY` material for the AES-256-GCM scheme
 * shared by every repository that encrypts secrets at rest (api keys, Slack
 * tokens, destination credentials): a 32-byte hex secret is used directly,
 * any other secret is derived via SHA-256.
 */
export const resolveEncryptionKey = (rawSecret: string): Effect.Effect<Buffer, CryptoError> => {
  const secret = rawSecret.trim()
  if (VALID_HEX_32_BYTE_KEY.test(secret)) {
    return Effect.succeed(Buffer.from(secret, "hex"))
  }
  return hash(secret).pipe(Effect.map((hashed) => Buffer.from(hashed, "hex")))
}

/** Resolves the master encryption key once per process and caches it. */
export const getEncryptionKey = () =>
  Effect.gen(function* () {
    if (encryptionKeyCache) return encryptionKeyCache
    const encryptionKeySecret = yield* parseEnv("LAT_MASTER_ENCRYPTION_KEY", "string")
    const key = yield* resolveEncryptionKey(encryptionKeySecret)
    encryptionKeyCache = key
    return key
  })

/** Encrypts a field for storage, mapping crypto failures to a `RepositoryError`. */
export const encryptField = (
  plaintext: string,
  key: Uint8Array,
  operation: string,
): Effect.Effect<string, RepositoryError> =>
  encrypt(plaintext, key).pipe(Effect.mapError((e) => toRepositoryError(e, operation)))

/** Decrypts a stored field, mapping crypto failures to a `RepositoryError`. */
export const decryptField = (
  ciphertext: string,
  key: Uint8Array,
  operation: string,
): Effect.Effect<string, RepositoryError> =>
  decrypt(ciphertext, key).pipe(Effect.mapError((e) => toRepositoryError(e, operation)))
