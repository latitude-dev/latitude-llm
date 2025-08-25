import crypto from 'node:crypto'
import { env } from '@latitude-data/env'

// Get encryption key from environment or use a default for development
const ENCRYPTION_KEY = env.ENCRYPTION_KEY || 'latitude-default-encryption-key-32chars'

/**
 * Encrypts a string using AES-256-CBC
 * @param text The text to encrypt
 * @returns The encrypted text as a base64 string with IV prepended
 */
export function encrypt(text: string): string {
  // Create an initialization vector
  const iv = crypto.randomBytes(16)

  // Create cipher with key and iv
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv)

  // Encrypt the string
  let encrypted = cipher.update(text, 'utf8', 'base64')
  encrypted += cipher.final('base64')

  // Prepend the IV to the encrypted string (IV is needed for decryption)
  return `${iv.toString('hex')}:${encrypted}`
}

/**
 * Decrypts a string that was encrypted with the encrypt function
 * @param encryptedText The encrypted text (with IV prepended)
 * @returns The decrypted string
 */
export function decrypt(encryptedText: string): string {
  // Split the encrypted text to get the IV and the encrypted data
  const textParts = encryptedText.split(':')
  const iv = Buffer.from(textParts[0]!, 'hex')
  const encryptedData = textParts[1]

  // Create decipher with key and iv
  const decipher = crypto.createDecipheriv(
    'aes-256-cbc',
    Buffer.from(ENCRYPTION_KEY.slice(0, 32)),
    iv,
  )

  // Decrypt the string
  let decrypted = decipher.update(encryptedData!, 'base64', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}
