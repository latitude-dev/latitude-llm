import { hash } from "@repo/utils"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { decryptField, encryptField, resolveEncryptionKey } from "./encryption-key.ts"

const KEY = Buffer.from("75d697b90c1e46c13bd7f7343ab2b9a9e430cdcda05d47f055e1523d54d5409b", "hex")

describe("resolveEncryptionKey", () => {
  it("uses strict 32-byte hex keys as-is", async () => {
    const secret = "75d697b90c1e46c13bd7f7343ab2b9a9e430cdcda05d47f055e1523d54d5409b"

    const key = await Effect.runPromise(resolveEncryptionKey(secret))

    expect(key).toStrictEqual(Buffer.from(secret, "hex"))
    expect(key.length).toBe(32)
  })

  it("derives a stable 32-byte key for non-hex secrets", async () => {
    const secret = "legacy-secret-generated-by-random-password"

    const key = await Effect.runPromise(resolveEncryptionKey(secret))
    const expected = await Effect.runPromise(hash(secret).pipe(Effect.map((h) => Buffer.from(h, "hex"))))

    expect(key).toStrictEqual(expected)
    expect(key.length).toBe(32)
  })

  it("trims surrounding whitespace before decoding hex", async () => {
    const secret = "  75d697b90c1e46c13bd7f7343ab2b9a9e430cdcda05d47f055e1523d54d5409b  "
    const key = await Effect.runPromise(resolveEncryptionKey(secret))

    expect(key).toStrictEqual(Buffer.from(secret.trim(), "hex"))
    expect(key.length).toBe(32)
  })
})

describe("encryptField / decryptField", () => {
  it("round-trips a value through encrypt then decrypt", async () => {
    const plaintext = JSON.stringify({ apiKey: "phc_secret" })

    const ciphertext = await Effect.runPromise(encryptField(plaintext, KEY, "encrypt"))
    const recovered = await Effect.runPromise(decryptField(ciphertext, KEY, "decrypt"))

    expect(recovered).toBe(plaintext)
  })

  it("produces ciphertext that differs from the plaintext", async () => {
    const plaintext = "phc_secret"

    const ciphertext = await Effect.runPromise(encryptField(plaintext, KEY, "encrypt"))

    expect(ciphertext).not.toBe(plaintext)
    expect(ciphertext).not.toContain(plaintext)
    expect(ciphertext.split(":")).toHaveLength(3)
  })

  it("maps a decrypt failure to a RepositoryError carrying the operation label", async () => {
    const error = await Effect.runPromise(
      decryptField("not-a-valid-ciphertext", KEY, "decryptDestinationCredentials").pipe(Effect.flip),
    )

    expect(error._tag).toBe("RepositoryError")
    expect(error.operation).toBe("decryptDestinationCredentials")
  })

  it("maps an encrypt failure to a RepositoryError carrying the operation label", async () => {
    const invalidKey = new Uint8Array(5)

    const error = await Effect.runPromise(
      encryptField("phc_secret", invalidKey, "encryptDestinationCredentials").pipe(Effect.flip),
    )

    expect(error._tag).toBe("RepositoryError")
    expect(error.operation).toBe("encryptDestinationCredentials")
  })
})
