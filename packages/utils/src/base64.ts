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

export function base64urlEncode(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data
  return bytes.toBase64({ alphabet: "base64url" })
}

export function base64urlDecode(str: string): Uint8Array {
  return Uint8Array.fromBase64(str, { alphabet: "base64url" })
}

export function base64Encode(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data
  return bytes.toBase64()
}

export function base64Decode(str: string): Uint8Array {
  return Uint8Array.fromBase64(str)
}

/** Node 25+ provides `Uint8Array.fromHex` / `Uint8Array.prototype.toHex` (repo `mise.toml`). */
export function hexEncode(buffer: Uint8Array): string {
  return buffer.toHex()
}

export function hexDecode(hex: string): Uint8Array {
  return Uint8Array.fromHex(hex)
}
