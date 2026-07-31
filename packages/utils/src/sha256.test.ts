import { describe, expect, it } from "vitest"
import { hexEncode } from "./base64.ts"
import { sha256Bytes } from "./sha256.ts"

const digestOf = (value: string): string => hexEncode(sha256Bytes(new TextEncoder().encode(value)))

describe("sha256Bytes", () => {
  it.each([
    ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
    ["The quick brown fox jumps over the lazy dog", "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592"],
    [
      "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    ],
  ])("matches the published digest for %j", (input, expected) => {
    expect(digestOf(input)).toBe(expected)
  })

  /**
   * The padding block boundary is where a hand-written implementation goes wrong: a message of exactly 55,
   * 56 or 64 bytes decides whether the length field needs an extra block.
   */
  it.each([54, 55, 56, 57, 63, 64, 65, 119, 120, 128])("agrees with Web Crypto at length %i", async (length) => {
    const input = new Uint8Array(length).map((_, index) => (index * 31 + 7) & 0xff)
    const expected = new Uint8Array(await crypto.subtle.digest("SHA-256", input))

    expect(hexEncode(sha256Bytes(input))).toBe(hexEncode(expected))
  })

  it("agrees with Web Crypto on a multi-block payload", async () => {
    const input = new TextEncoder().encode("latitude".repeat(1000))
    const expected = new Uint8Array(await crypto.subtle.digest("SHA-256", input))

    expect(hexEncode(sha256Bytes(input))).toBe(hexEncode(expected))
  })
})
