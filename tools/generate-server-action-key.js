#!/usr/bin/env node

/**
 * This script generates a secure AES-GCM encrypted key for Next.js Server Actions.
 * The key is generated using the Web Crypto API and is suitable for use with
 * the NEXT_SERVER_ACTIONS_ENCRYPTION_KEY environment variable.
 *
 * Usage:
 * node tools/generate-server-action-key.js
 */

const crypto = require('crypto')

// Generate a random 32-byte (256-bit) key
const key = crypto.randomBytes(32)

// Generate a random 12-byte (96-bit) initialization vector (IV)
const iv = crypto.randomBytes(12)

// Create a simple message to encrypt (this is just for demonstration)
const message = 'Next.js Server Actions Encryption Key'

// Encrypt the message using AES-GCM
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
let encrypted = cipher.update(message, 'utf8', 'base64')
encrypted += cipher.final('base64')

// Get the authentication tag
const authTag = cipher.getAuthTag()

// Combine the IV, encrypted data, and auth tag into a single string
// Format: base64(iv):base64(encrypted):base64(authTag)
const encryptedKey = `${iv.toString('base64')}:${encrypted}:${authTag.toString('base64')}`

console.log('Generated AES-GCM Encrypted Server Actions Key:')
console.log('----------------------------------------')
console.log(encryptedKey)
console.log('----------------------------------------')
console.log('Add this to your .env.development file as:')
console.log(`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=${encryptedKey}`)
console.log('----------------------------------------')
console.log('Note: Make sure to use the same key across all server instances.')
