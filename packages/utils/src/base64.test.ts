import { describe, expect, it } from "vitest"
import {
  base64ByteLength,
  base64Decode,
  base64Encode,
  base64urlDecode,
  base64urlEncode,
  hexDecode,
  hexEncode,
} from "./base64.ts"

describe("base64ByteLength", () => {
  it("returns the decoded byte length without decoding", () => {
    for (const bytes of [new Uint8Array([]), new Uint8Array([1]), new Uint8Array([1, 2]), new Uint8Array([1, 2, 3])]) {
      expect(base64ByteLength(base64Encode(bytes))).toBe(bytes.length)
    }
  })

  it("accounts for padding", () => {
    expect(base64ByteLength("")).toBe(0)
    expect(base64ByteLength("QQ==")).toBe(1)
    expect(base64ByteLength("QUI=")).toBe(2)
    expect(base64ByteLength("QUJD")).toBe(3)
  })
})

describe("base64Encode / base64Decode", () => {
  it("round-trips binary bytes", () => {
    const bytes = new Uint8Array([0, 127, 255, 10, 13])
    expect(base64Decode(base64Encode(bytes))).toEqual(bytes)
  })

  it("encodes utf-8 strings", () => {
    const s = '{"spans":[]}'
    expect(new TextDecoder().decode(base64Decode(base64Encode(s)))).toBe(s)
  })
})

describe("base64urlEncode / base64urlDecode", () => {
  it("round-trips bytes without standard base64 padding in output", () => {
    const bytes = new Uint8Array([251, 255, 0])
    const encoded = base64urlEncode(bytes)
    expect(encoded.includes("=")).toBe(false)
    expect(base64urlDecode(encoded)).toEqual(bytes)
  })
})

describe("hexEncode / hexDecode", () => {
  it("round-trips", () => {
    const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef])
    expect(hexDecode(hexEncode(bytes))).toEqual(bytes)
  })
})
