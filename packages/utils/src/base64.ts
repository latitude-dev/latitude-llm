/**
 * Encode a Uint8Array or string to base64url (URL-safe base64 without padding).
 * Compatible with Web Standards (RFC 4648 §5).
 */
export function base64urlEncode(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data
  const base64 = btoa(String.fromCodePoint(...bytes))
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/**
 * Decode a base64url string to a Uint8Array.
 * Compatible with Web Standards (RFC 4648 §5).
 */
export function base64urlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/")
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=")
  const binary = atob(padded)
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

/**
 * Encode a Uint8Array or string to standard base64 with padding.
 */
export function base64Encode(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data
  return btoa(String.fromCodePoint(...bytes))
}

/**
 * Decode a standard base64 string to a Uint8Array.
 */
export function base64Decode(str: string): Uint8Array {
  const binary = atob(str)
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

/**
 * Encode a Uint8Array to a hex string.
 */
export function hexEncode(buffer: Uint8Array): string {
  return Array.from(buffer)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

/**
 * Decode a hex string to a Uint8Array.
 */
export function hexDecode(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}
