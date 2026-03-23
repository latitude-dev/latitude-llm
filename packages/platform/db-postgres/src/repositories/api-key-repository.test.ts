import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import { resolveApiKeyEncryptionKey } from "./api-key-repository.ts"

describe("resolveApiKeyEncryptionKey", () => {
  it("uses strict 32-byte hex keys as-is", () => {
    const secret = "75d697b90c1e46c13bd7f7343ab2b9a9e430cdcda05d47f055e1523d54d5409b"

    const key = resolveApiKeyEncryptionKey(secret)

    expect(key).toStrictEqual(Buffer.from(secret, "hex"))
    expect(key.length).toBe(32)
  })

  it("keeps backward compatibility for legacy hex-decoded AES keys", () => {
    const secret = "00112233445566778899aabbccddeeffnot-hex-suffix"

    const key = resolveApiKeyEncryptionKey(secret)

    expect(key).toStrictEqual(Buffer.from("00112233445566778899aabbccddeeff", "hex"))
    expect(key.length).toBe(16)
  })

  it("derives a stable 32-byte key for non-hex secrets", () => {
    const secret = "legacy-secret-generated-by-random-password"

    const key = resolveApiKeyEncryptionKey(secret)

    expect(key).toStrictEqual(createHash("sha256").update(secret, "utf8").digest())
    expect(key.length).toBe(32)
  })
})
