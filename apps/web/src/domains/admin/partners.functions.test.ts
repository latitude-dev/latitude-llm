import { describe, expect, it } from "vitest"
import {
  adminCreatePartnerInputSchema,
  adminPartnerIdInputSchema,
  adminSetPartnerEnabledInputSchema,
  adminUpdatePartnerInputSchema,
} from "./partners.functions.ts"

const REDIRECT_URLS = ["https://longitude.example/oauth/callback"]

describe("adminCreatePartnerInputSchema", () => {
  it("accepts a name with an http(s) icon and a known scope", () => {
    for (const iconUrl of ["https://longitude.example/icon.png", "http://localhost:4321/icon.png"]) {
      expect(
        adminCreatePartnerInputSchema.safeParse({
          name: "Longitude",
          iconUrl,
          redirectUrls: REDIRECT_URLS,
          scopes: ["accounts:provision"],
        }).success,
      ).toBe(true)
    }
  })

  it("treats an empty, null or omitted icon as no icon", () => {
    for (const iconUrl of ["", null, undefined]) {
      expect(
        adminCreatePartnerInputSchema.safeParse({ name: "Longitude", iconUrl, redirectUrls: REDIRECT_URLS, scopes: [] })
          .success,
      ).toBe(true)
    }
  })

  it("rejects an icon the oauth_applications CHECK would refuse", () => {
    for (const iconUrl of [
      "javascript:alert(1)",
      "data:image/png;base64,AAA",
      "longitude.example/icon.png",
      "https://has space",
    ]) {
      expect(
        adminCreatePartnerInputSchema.safeParse({ name: "Longitude", iconUrl, redirectUrls: REDIRECT_URLS, scopes: [] })
          .success,
      ).toBe(false)
    }
  })

  it("trims the name and rejects a blank or over-long one", () => {
    expect(
      adminCreatePartnerInputSchema.parse({ name: "  Longitude  ", redirectUrls: REDIRECT_URLS, scopes: [] }).name,
    ).toBe("Longitude")
    expect(
      adminCreatePartnerInputSchema.safeParse({ name: "   ", redirectUrls: REDIRECT_URLS, scopes: [] }).success,
    ).toBe(false)
    expect(
      adminCreatePartnerInputSchema.safeParse({ name: "x".repeat(257), redirectUrls: REDIRECT_URLS, scopes: [] })
        .success,
    ).toBe(false)
  })

  it("rejects an unknown scope", () => {
    expect(
      adminCreatePartnerInputSchema.safeParse({
        name: "Longitude",
        redirectUrls: REDIRECT_URLS,
        scopes: ["accounts:delete"],
      }).success,
    ).toBe(false)
  })
})

describe("allowedIps input", () => {
  it("defaults to an empty list when omitted", () => {
    expect(
      adminCreatePartnerInputSchema.parse({ name: "Longitude", redirectUrls: REDIRECT_URLS, scopes: [] }).allowedIps,
    ).toEqual([])
  })

  it("accepts single addresses and CIDR blocks in both families", () => {
    const parsed = adminCreatePartnerInputSchema.parse({
      name: "Longitude",
      redirectUrls: REDIRECT_URLS,
      scopes: [],
      allowedIps: ["203.0.113.7", "203.0.113.0/24", "2001:db8::1", "2001:db8::/32"],
    })
    expect(parsed.allowedIps).toEqual(["203.0.113.7", "203.0.113.0/24", "2001:db8::1", "2001:db8::/32"])
  })

  it("drops blank lines the textarea produces and trims the rest", () => {
    const parsed = adminCreatePartnerInputSchema.parse({
      name: "Longitude",
      redirectUrls: REDIRECT_URLS,
      scopes: [],
      allowedIps: ["  203.0.113.7  ", "", "   ", "203.0.113.0/24"],
    })
    expect(parsed.allowedIps).toEqual(["203.0.113.7", "203.0.113.0/24"])
  })

  it("rejects anything that is not an address or a block", () => {
    for (const entry of ["not-an-ip", "203.0.113.7/33", "256.0.0.1", "203.0.113"]) {
      expect(
        adminCreatePartnerInputSchema.safeParse({
          name: "Longitude",
          redirectUrls: REDIRECT_URLS,
          scopes: [],
          allowedIps: [entry],
        }).success,
        entry,
      ).toBe(false)
    }
  })
})

describe("redirectUrls input", () => {
  it("requires at least one entry, even after trimming blanks", () => {
    expect(adminCreatePartnerInputSchema.safeParse({ name: "Longitude", scopes: [] }).success).toBe(false)
    expect(adminCreatePartnerInputSchema.safeParse({ name: "Longitude", redirectUrls: [], scopes: [] }).success).toBe(
      false,
    )
    expect(
      adminCreatePartnerInputSchema.safeParse({ name: "Longitude", redirectUrls: ["  ", ""], scopes: [] }).success,
    ).toBe(false)
  })

  it("accepts several exact http(s) callbacks and trims them", () => {
    const parsed = adminCreatePartnerInputSchema.parse({
      name: "Longitude",
      redirectUrls: [" https://app.longitude.example/oauth/callback ", "http://localhost:4321/oauth/callback"],
      scopes: [],
    })
    expect(parsed.redirectUrls).toEqual([
      "https://app.longitude.example/oauth/callback",
      "http://localhost:4321/oauth/callback",
    ])
  })

  it("rejects plaintext http off loopback, other schemes, and URLs that could not survive comma-joining", () => {
    for (const entry of [
      "http://app.longitude.example/callback",
      "javascript:alert(1)",
      "longitude.example/callback",
      "https://a.example/cb,https://b.example/cb",
    ]) {
      expect(
        adminCreatePartnerInputSchema.safeParse({ name: "Longitude", redirectUrls: [entry], scopes: [] }).success,
        entry,
      ).toBe(false)
    }
  })
})

describe("adminUpdatePartnerInputSchema", () => {
  it("requires a partner id alongside the editable fields", () => {
    expect(
      adminUpdatePartnerInputSchema.safeParse({
        partnerId: "a".repeat(24),
        name: "Longitude",
        redirectUrls: REDIRECT_URLS,
        scopes: [],
      }).success,
    ).toBe(true)
    expect(
      adminUpdatePartnerInputSchema.safeParse({ name: "Longitude", redirectUrls: REDIRECT_URLS, scopes: [] }).success,
    ).toBe(false)
    expect(
      adminUpdatePartnerInputSchema.safeParse({
        partnerId: "",
        name: "Longitude",
        redirectUrls: REDIRECT_URLS,
        scopes: [],
      }).success,
    ).toBe(false)
  })
})

describe("adminSetPartnerEnabledInputSchema", () => {
  it("requires an explicit boolean", () => {
    expect(adminSetPartnerEnabledInputSchema.safeParse({ partnerId: "a".repeat(24), enabled: false }).success).toBe(
      true,
    )
    expect(adminSetPartnerEnabledInputSchema.safeParse({ partnerId: "a".repeat(24) }).success).toBe(false)
    expect(adminSetPartnerEnabledInputSchema.safeParse({ partnerId: "a".repeat(24), enabled: "yes" }).success).toBe(
      false,
    )
  })
})

describe("adminPartnerIdInputSchema", () => {
  it("requires a non-empty partner id", () => {
    expect(adminPartnerIdInputSchema.safeParse({ partnerId: "a".repeat(24) }).success).toBe(true)
    expect(adminPartnerIdInputSchema.safeParse({ partnerId: "" }).success).toBe(false)
  })
})
