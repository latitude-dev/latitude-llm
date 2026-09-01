import { describe, expect, it } from "vitest"
import { deriveDisplayNameFromEmail, deriveOrganizationNameFromDisplayName } from "./display-name.ts"

describe("deriveDisplayNameFromEmail", () => {
  it("capitalizes a single-word local part", () => {
    expect(deriveDisplayNameFromEmail("founder@example.com")).toBe("Founder")
  })

  it("splits the common separators into words", () => {
    expect(deriveDisplayNameFromEmail("ada.lovelace@example.com")).toBe("Ada Lovelace")
    expect(deriveDisplayNameFromEmail("ada_lovelace@example.com")).toBe("Ada Lovelace")
    expect(deriveDisplayNameFromEmail("ada-lovelace@example.com")).toBe("Ada Lovelace")
    expect(deriveDisplayNameFromEmail("ada.b.lovelace@example.com")).toBe("Ada B Lovelace")
  })

  it("drops plus-addressing tags", () => {
    expect(deriveDisplayNameFromEmail("ada.lovelace+latitude@example.com")).toBe("Ada Lovelace")
    expect(deriveDisplayNameFromEmail("founder+a+b@example.com")).toBe("Founder")
  })

  it("normalizes case and surrounding whitespace", () => {
    expect(deriveDisplayNameFromEmail("  ADA.LOVELACE@Example.COM  ")).toBe("Ada Lovelace")
  })

  it("keeps digits", () => {
    expect(deriveDisplayNameFromEmail("agent007@example.com")).toBe("Agent007")
  })

  it("collapses repeated and trailing separators", () => {
    expect(deriveDisplayNameFromEmail("ada..lovelace.@example.com")).toBe("Ada Lovelace")
  })

  it("returns an empty name when the local part has nothing usable", () => {
    // The app already treats "" as "no name" and prompts for one later.
    expect(deriveDisplayNameFromEmail("...@example.com")).toBe("")
    expect(deriveDisplayNameFromEmail("+tag@example.com")).toBe("")
  })
})

describe("deriveOrganizationNameFromDisplayName", () => {
  it("makes the name possessive", () => {
    expect(deriveOrganizationNameFromDisplayName("Ada Lovelace")).toBe("Ada Lovelace's Organization")
  })

  it("falls back to a generic label when there is no name to use", () => {
    expect(deriveOrganizationNameFromDisplayName("")).toBe("My Organization")
    expect(deriveOrganizationNameFromDisplayName("   ")).toBe("My Organization")
  })
})
