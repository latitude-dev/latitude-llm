import sha256 from 'fast-sha256'

/**
 * Hash content using SHA256
 */
export function hashContent(content: string): string {
  return Array.from(sha256(new TextEncoder().encode(content)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
