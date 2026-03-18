import { Data, Effect } from "effect"
import { hexDecode, hexEncode } from "./base64.ts"

export class CryptoError extends Data.TaggedError("CryptoError")<{
  readonly operation: string
  readonly cause: unknown
}> {}

const ALGORITHM = "AES-GCM"
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

/**
 * Hash a plaintext string using SHA-256.
 * Returns a hex-encoded hash suitable for indexed lookups.
 */
export const hashToken = (plaintext: string): Effect.Effect<string, CryptoError> =>
  Effect.tryPromise({
    try: async () => {
      const data = new TextEncoder().encode(plaintext)
      const hashBuffer = await crypto.subtle.digest("SHA-256", data)
      return hexEncode(new Uint8Array(hashBuffer))
    },
    catch: (cause) => new CryptoError({ operation: "hashToken", cause }),
  })

/**
 * Import a raw key buffer for AES-GCM operations.
 */
const importKey = (key: Uint8Array): Effect.Effect<CryptoKey, CryptoError> =>
  Effect.tryPromise({
    try: () => crypto.subtle.importKey("raw", key, { name: ALGORITHM }, false, ["encrypt", "decrypt"]),
    catch: (cause) => new CryptoError({ operation: "importKey", cause }),
  })

/**
 * Encrypt a plaintext string using AES-256-GCM.
 *
 * @param plaintext - The plaintext to encrypt
 * @param key - 32-byte encryption key as Uint8Array
 * @returns Encrypted string in format: iv:authTag:ciphertext (hex-encoded)
 */
export const encrypt = (plaintext: string, key: Uint8Array): Effect.Effect<string, CryptoError> =>
  Effect.gen(function* () {
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
    const cryptoKey = yield* importKey(key)
    const data = new TextEncoder().encode(plaintext)

    const encrypted = yield* Effect.tryPromise({
      try: () => crypto.subtle.encrypt({ name: ALGORITHM, iv, tagLength: AUTH_TAG_LENGTH * 8 }, cryptoKey, data),
      catch: (cause) => new CryptoError({ operation: "encrypt", cause }),
    })

    const encryptedBytes = new Uint8Array(encrypted)
    const ciphertext = encryptedBytes.slice(0, encryptedBytes.length - AUTH_TAG_LENGTH)
    const authTag = encryptedBytes.slice(encryptedBytes.length - AUTH_TAG_LENGTH)

    return `${hexEncode(iv)}:${hexEncode(authTag)}:${hexEncode(ciphertext)}`
  })

/**
 * Decrypt a string encrypted with AES-256-GCM.
 *
 * @param ciphertext - Encrypted string in format: iv:authTag:ciphertext (hex-encoded)
 * @param key - 32-byte encryption key as Uint8Array (same key used for encryption)
 * @returns The decrypted plaintext
 */
export const decrypt = (ciphertext: string, key: Uint8Array): Effect.Effect<string, CryptoError> =>
  Effect.gen(function* () {
    const parts = ciphertext.split(":")
    if (parts.length !== 3) {
      return yield* new CryptoError({ operation: "decrypt", cause: "Invalid ciphertext format" })
    }

    const [ivHex, authTagHex, encryptedHex] = parts
    if (ivHex === undefined || authTagHex === undefined || encryptedHex === undefined) {
      return yield* new CryptoError({ operation: "decrypt", cause: "Invalid ciphertext format" })
    }

    const iv = hexDecode(ivHex)
    const authTag = hexDecode(authTagHex)
    const encrypted = hexDecode(encryptedHex)

    if (iv.length !== IV_LENGTH) {
      return yield* new CryptoError({ operation: "decrypt", cause: "Invalid IV length" })
    }
    if (authTag.length !== AUTH_TAG_LENGTH) {
      return yield* new CryptoError({ operation: "decrypt", cause: "Invalid auth tag length" })
    }

    const cryptoKey = yield* importKey(key)

    const combined = new Uint8Array(encrypted.length + authTag.length)
    combined.set(encrypted)
    combined.set(authTag, encrypted.length)

    const decrypted = yield* Effect.tryPromise({
      try: () => crypto.subtle.decrypt({ name: ALGORITHM, iv, tagLength: AUTH_TAG_LENGTH * 8 }, cryptoKey, combined),
      catch: (cause) => new CryptoError({ operation: "decrypt", cause }),
    })

    return new TextDecoder().decode(decrypted)
  })
