const ALGORITHM = "AES-GCM"
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

function hexEncode(buffer: Uint8Array): string {
  return Array.from(buffer)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

function hexDecode(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}

/**
 * Hash a plaintext string using SHA-256.
 * Returns a hex-encoded hash suitable for indexed lookups.
 */
export async function hashToken(plaintext: string): Promise<string> {
  const data = new TextEncoder().encode(plaintext)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  return hexEncode(new Uint8Array(hashBuffer))
}

/**
 * Import a raw key buffer for AES-GCM operations.
 */
async function importKey(key: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", key, { name: ALGORITHM }, false, ["encrypt", "decrypt"])
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 *
 * @param plaintext - The plaintext to encrypt
 * @param key - 32-byte encryption key as Uint8Array or Buffer
 * @returns Encrypted string in format: iv:authTag:ciphertext (hex-encoded)
 */
export async function encrypt(plaintext: string, key: Uint8Array): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const cryptoKey = await importKey(key)
  const data = new TextEncoder().encode(plaintext)

  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv, tagLength: AUTH_TAG_LENGTH * 8 },
    cryptoKey,
    data,
  )

  const encryptedBytes = new Uint8Array(encrypted)
  // Web Crypto appends the auth tag at the end of the ciphertext
  const ciphertext = encryptedBytes.slice(0, encryptedBytes.length - AUTH_TAG_LENGTH)
  const authTag = encryptedBytes.slice(encryptedBytes.length - AUTH_TAG_LENGTH)

  return `${hexEncode(iv)}:${hexEncode(authTag)}:${hexEncode(ciphertext)}`
}

/**
 * Decrypt a string encrypted with AES-256-GCM.
 *
 * @param ciphertext - Encrypted string in format: iv:authTag:ciphertext (hex-encoded)
 * @param key - 32-byte encryption key as Uint8Array or Buffer (same key used for encryption)
 * @returns The decrypted plaintext
 */
export async function decrypt(ciphertext: string, key: Uint8Array): Promise<string> {
  const parts = ciphertext.split(":")
  if (parts.length !== 3) {
    throw new Error("Invalid ciphertext format")
  }

  const [ivHex, authTagHex, encryptedHex] = parts
  if (ivHex === undefined || authTagHex === undefined || encryptedHex === undefined) {
    throw new Error("Invalid ciphertext format")
  }

  const iv = hexDecode(ivHex)
  const authTag = hexDecode(authTagHex)
  const encrypted = hexDecode(encryptedHex)

  if (iv.length !== IV_LENGTH) {
    throw new Error("Invalid IV length")
  }
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error("Invalid auth tag length")
  }

  const cryptoKey = await importKey(key)

  // Web Crypto expects ciphertext + authTag concatenated
  const combined = new Uint8Array(encrypted.length + authTag.length)
  combined.set(encrypted)
  combined.set(authTag, encrypted.length)

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv, tagLength: AUTH_TAG_LENGTH * 8 },
    cryptoKey,
    combined,
  )

  return new TextDecoder().decode(decrypted)
}
