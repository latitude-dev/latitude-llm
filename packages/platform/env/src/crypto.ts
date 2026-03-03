import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto"
import { Effect } from "effect"
import { parseEnv } from "./index.ts"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12

export interface ValueCrypto {
  readonly encrypt: (plaintext: string) => string
  readonly decrypt: (encrypted: string) => string
  readonly hash: (plaintext: string) => string
}

export const parseBase64UrlKey = (envName: string, encoded: string): Buffer => {
  const key = Buffer.from(encoded, "base64url")

  if (key.length !== 32) {
    throw new Error(`${envName} must be a 32-byte base64url-encoded key`)
  }

  return key
}

export const createValueCrypto = (params: {
  readonly encryptionKey: Buffer
  readonly hashKey: Buffer
  readonly version?: string
}): ValueCrypto => {
  const version = params.version ?? "v1"

  return {
    encrypt: (plaintext: string): string => {
      const iv = randomBytes(IV_LENGTH)
      const cipher = createCipheriv(ALGORITHM, params.encryptionKey, iv)
      const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
      const authTag = cipher.getAuthTag()

      return `${version}.${iv.toString("base64url")}.${authTag.toString("base64url")}.${encrypted.toString("base64url")}`
    },
    decrypt: (encrypted: string): string => {
      const [encryptedVersion, ivEncoded, authTagEncoded, ciphertextEncoded] = encrypted.split(".")

      if (!encryptedVersion || !ivEncoded || !authTagEncoded || !ciphertextEncoded || encryptedVersion !== version) {
        throw new Error("Invalid encrypted value format")
      }

      const iv = Buffer.from(ivEncoded, "base64url")
      const authTag = Buffer.from(authTagEncoded, "base64url")
      const ciphertext = Buffer.from(ciphertextEncoded, "base64url")

      const decipher = createDecipheriv(ALGORITHM, params.encryptionKey, iv)
      decipher.setAuthTag(authTag)

      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
      return decrypted.toString("utf8")
    },
    hash: (plaintext: string): string => {
      return createHmac("sha256", params.hashKey).update(plaintext).digest("hex")
    },
  }
}

export const createValueCryptoFromEnv = (params: {
  readonly env: NodeJS.ProcessEnv
  readonly encryptionKeyVar: string
  readonly hashKeyVar: string
  readonly fallbackKey?: string
  readonly version?: string
}): ValueCrypto => {
  const encryptionKey = Effect.runSync(parseEnv(params.env[params.encryptionKeyVar], "string", params.fallbackKey))
  const hashKey = Effect.runSync(parseEnv(params.env[params.hashKeyVar], "string", params.fallbackKey))

  const cryptoParams = {
    encryptionKey: parseBase64UrlKey(params.encryptionKeyVar, encryptionKey),
    hashKey: parseBase64UrlKey(params.hashKeyVar, hashKey),
  }

  if (params.version) {
    return createValueCrypto({
      ...cryptoParams,
      version: params.version,
    })
  }

  return createValueCrypto(cryptoParams)
}
