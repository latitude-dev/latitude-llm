import { describe, expect, it } from 'vitest'

import {
  decryptProviderToken,
  encryptProviderToken,
  isTokenEncrypted,
} from './tokenEncryption'

describe('tokenEncryption', () => {
  describe('encryptProviderToken', () => {
    it('encrypts a token with enc: prefix', () => {
      const plainToken = 'sk-test-api-key-12345'
      const encrypted = encryptProviderToken(plainToken)

      expect(encrypted.startsWith('enc:')).toBe(true)
      expect(encrypted).not.toContain(plainToken)
    })

    it('produces different ciphertext for same input (due to random IV)', () => {
      const plainToken = 'sk-test-api-key-12345'
      const encrypted1 = encryptProviderToken(plainToken)
      const encrypted2 = encryptProviderToken(plainToken)

      expect(encrypted1).not.toEqual(encrypted2)
    })
  })

  describe('decryptProviderToken', () => {
    it('decrypts an encrypted token', () => {
      const plainToken = 'sk-test-api-key-12345'
      const encrypted = encryptProviderToken(plainToken)
      const decrypted = decryptProviderToken(encrypted)

      expect(decrypted).toEqual(plainToken)
    })

    it('returns unencrypted tokens as-is (backwards compatibility)', () => {
      const legacyToken = 'sk-legacy-unencrypted-token'
      const result = decryptProviderToken(legacyToken)

      expect(result).toEqual(legacyToken)
    })

    it('handles tokens that look similar to encrypted format', () => {
      const tricky = 'abc:def:ghi'
      const result = decryptProviderToken(tricky)

      expect(result).toEqual(tricky)
    })
  })

  describe('isTokenEncrypted', () => {
    it('returns true for encrypted tokens', () => {
      const encrypted = encryptProviderToken('test-token')
      expect(isTokenEncrypted(encrypted)).toBe(true)
    })

    it('returns false for unencrypted tokens', () => {
      expect(isTokenEncrypted('sk-plain-api-key')).toBe(false)
      expect(isTokenEncrypted('abc:def:ghi')).toBe(false)
      expect(isTokenEncrypted('')).toBe(false)
    })
  })

  describe('round trip', () => {
    it('encrypts and decrypts various token formats', () => {
      const tokens = [
        'sk-proj-abc123',
        'anthropic-key-xyz',
        'special!@#$%^&*()characters',
        'unicode-token-日本語',
        'very-long-token-' + 'a'.repeat(200),
        '',
      ]

      for (const token of tokens) {
        const encrypted = encryptProviderToken(token)
        const decrypted = decryptProviderToken(encrypted)
        expect(decrypted).toEqual(token)
      }
    })
  })
})
