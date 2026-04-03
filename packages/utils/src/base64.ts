// TS won't add types for these methods until TS 6.
// https://github.com/microsoft/TypeScript/pull/61696
declare global {
  interface Uint8Array {
    toBase64(options?: { alphabet?: "base64" | "base64url" }): string
    toHex(): string
  }
  interface Uint8ArrayConstructor {
    fromBase64(base64: string, options?: { alphabet?: "base64" | "base64url" }): Uint8Array
    fromHex(hex: string): Uint8Array
  }
}

function encodeBase64Standard(bytes: Uint8Array): string {
  if (typeof bytes.toBase64 === "function") {
    return bytes.toBase64()
  }
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("")
  return globalThis.btoa(binary)
}

function decodeBase64Standard(str: string): Uint8Array {
  if (typeof Uint8Array.fromBase64 === "function") {
    return Uint8Array.fromBase64(str)
  }
  const binary = globalThis.atob(str)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i)
  }
  return out
}

function encodeBase64Url(bytes: Uint8Array): string {
  if (typeof bytes.toBase64 === "function") {
    return bytes.toBase64({ alphabet: "base64url" })
  }
  return encodeBase64Standard(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function decodeBase64Url(str: string): Uint8Array {
  if (typeof Uint8Array.fromBase64 === "function") {
    return Uint8Array.fromBase64(str, { alphabet: "base64url" })
  }
  const padded = str.replace(/-/g, "+").replace(/_/g, "/")
  const padLen = (4 - (padded.length % 4)) % 4
  return decodeBase64Standard(padded + "=".repeat(padLen))
}

function encodeHex(buffer: Uint8Array): string {
  if (typeof buffer.toHex === "function") {
    return buffer.toHex()
  }
  return Array.from(buffer, (b) => b.toString(16).padStart(2, "0")).join("")
}

function decodeHex(hex: string): Uint8Array {
  if (typeof Uint8Array.fromHex === "function") {
    return Uint8Array.fromHex(hex)
  }
  const clean = hex.length % 2 === 0 ? hex : `0${hex}`
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

export function base64urlEncode(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data
  return encodeBase64Url(bytes)
}

export function base64urlDecode(str: string): Uint8Array {
  return decodeBase64Url(str)
}

export function base64Encode(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data
  return encodeBase64Standard(bytes)
}

export function base64Decode(str: string): Uint8Array {
  return decodeBase64Standard(str)
}

/** Prefers `Uint8Array` hex helpers when present (e.g. Node 25+ per repo `mise.toml`). */
export function hexEncode(buffer: Uint8Array): string {
  return encodeHex(buffer)
}

export function hexDecode(hex: string): Uint8Array {
  return decodeHex(hex)
}
