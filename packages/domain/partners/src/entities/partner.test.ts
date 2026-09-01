import { describe, expect, it } from "vitest"
import { partnerRedirectUrlSchema } from "./partner.ts"

const accepts = (value: string) => partnerRedirectUrlSchema.safeParse(value).success

describe("partnerRedirectUrlSchema", () => {
  it("accepts https callbacks on any host", () => {
    for (const url of [
      "https://app.longitude.example/oauth/callback",
      "https://longitude.example:8443/cb",
      "https://longitude.example/cb?tenant=acme",
    ]) {
      expect(accepts(url), url).toBe(true)
    }
  })

  it("accepts plaintext http only on loopback, where there is no certificate to present", () => {
    for (const url of ["http://localhost:4321/oauth/callback", "http://127.0.0.1:4321/cb", "http://[::1]:4321/cb"]) {
      expect(accepts(url), url).toBe(true)
    }
  })

  it("rejects plaintext http anywhere else — an authorization code would ride in the clear", () => {
    for (const url of [
      "http://app.longitude.example/oauth/callback",
      "http://192.168.1.10/cb",
      "http://localhost.evil.example/cb",
    ]) {
      expect(accepts(url), url).toBe(false)
    }
  })

  it("rejects anything that is not an absolute http(s) URL", () => {
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,x",
      "longitude.example/cb",
      "ftp://longitude.example/cb",
    ]) {
      expect(accepts(url), url).toBe(false)
    }
  })

  it("rejects commas and whitespace, which would break the comma-joined column", () => {
    for (const url of ["https://a.example/cb,https://b.example/cb", "https://a.example/c b", "https://a.example/cb "]) {
      expect(accepts(url), url).toBe(false)
    }
  })
})
