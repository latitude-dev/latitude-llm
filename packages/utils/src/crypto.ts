import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

/**
 * Hash a plaintext string using SHA-256.
 * Returns a hex-encoded hash suitable for indexed lookups.
 */
export function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex")
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 *
 * @param plaintext - The plaintext to encrypt
 * @param key - 32-byte encryption key
 * @returns Encrypted string in format: iv:authTag:ciphertext (hex-encoded)
 */
export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`
}

/**
 * Decrypt a string encrypted with AES-256-GCM.
 *
 * @param ciphertext - Encrypted string in format: iv:authTag:ciphertext (hex-encoded)
 * @param key - 32-byte encryption key (same key used for encryption)
 * @returns The decrypted plaintext
 */
export function decrypt(ciphertext: string, key: Buffer): string {
  const parts = ciphertext.split(":")
  if (parts.length !== 3) {
    throw new Error("Invalid ciphertext format")
  }

  const [ivHex, authTagHex, encryptedHex] = parts
  if (ivHex === undefined || authTagHex === undefined || encryptedHex === undefined) {
    throw new Error("Invalid ciphertext format")
  }

  const iv = Buffer.from(ivHex, "hex")
  const authTag = Buffer.from(authTagHex, "hex")
  const encrypted = Buffer.from(encryptedHex, "hex")

  if (iv.length !== IV_LENGTH) {
    throw new Error("Invalid IV length")
  }
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error("Invalid auth tag length")
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  return decipher.update(encrypted).toString("utf8") + decipher.final("utf8")
}
