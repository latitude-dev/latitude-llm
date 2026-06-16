const uuidToBytes = (uuid: string): Uint8Array => {
  const hex = uuid.replaceAll("-", "")
  // Fail fast: a malformed namespace would otherwise parse to NaN→0 bytes and
  // silently mint wrong-but-deterministic UUIDs, corrupting wire identity.
  if (!/^[0-9a-f]{32}$/i.test(hex)) {
    throw new Error(`uuidV5: namespace is not a valid UUID: ${uuid}`)
  }
  const bytes = new Uint8Array(16)
  for (let index = 0; index < 16; index++) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  }
  return bytes
}

const bytesToUuid = (bytes: Uint8Array): string => {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * RFC-4122 UUIDv5 over web-standard `crypto.subtle` (SHA-1, hence async).
 * Deterministic: the same namespace + name always yields the same UUID, which
 * is what makes destination retries and window re-runs dedupe downstream.
 */
export const uuidV5 = async (input: { readonly namespace: string; readonly name: string }): Promise<string> => {
  const namespaceBytes = uuidToBytes(input.namespace)
  const nameBytes = new TextEncoder().encode(input.name)
  const data = new Uint8Array(namespaceBytes.length + nameBytes.length)
  data.set(namespaceBytes)
  data.set(nameBytes, namespaceBytes.length)
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", data))
  const bytes = digest.slice(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  return bytesToUuid(bytes)
}
