import { describe, expect, it } from 'vitest'
import { containsUrl } from './containsUrl'

describe('containsUrl', () => {
  it('detects http URLs', () => {
    expect(containsUrl('Visit http://spam.com')).toBe(true)
    expect(containsUrl('http://example.org/path')).toBe(true)
  })

  it('detects https URLs', () => {
    expect(containsUrl('Check https://spam.com')).toBe(true)
    expect(containsUrl('https://example.org')).toBe(true)
  })

  it('detects www prefixed domains', () => {
    expect(containsUrl('Go to www.spam.com')).toBe(true)
    expect(containsUrl('www.example.org')).toBe(true)
  })

  it('detects bare domains with common TLDs', () => {
    expect(containsUrl('Visit spam.com')).toBe(true)
    expect(containsUrl('check evil.net now')).toBe(true)
    expect(containsUrl('my-site.org')).toBe(true)
    expect(containsUrl('spam.io')).toBe(true)
    expect(containsUrl('some.click')).toBe(true)
    expect(containsUrl('go to site.online')).toBe(true)
  })

  it('allows normal names', () => {
    expect(containsUrl('Jon Snow')).toBe(false)
    expect(containsUrl("O'Brien")).toBe(false)
    expect(containsUrl('Jean-Pierre')).toBe(false)
    expect(containsUrl('María García')).toBe(false)
    expect(containsUrl('José')).toBe(false)
    expect(containsUrl('Dr. Smith')).toBe(false)
    expect(containsUrl('Anna-Marie von Trapp')).toBe(false)
  })

  it('allows empty strings', () => {
    expect(containsUrl('')).toBe(false)
  })
})
