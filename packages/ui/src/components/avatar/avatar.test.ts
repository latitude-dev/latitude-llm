import { describe, expect, it } from "vitest"

import { initialsFromDisplayName } from "./avatar.tsx"

describe("initialsFromDisplayName", () => {
  it("uses the first displayable letter after emoji prefixes", () => {
    expect(initialsFromDisplayName("🌈 Latitude")).toBe("L")
    expect(initialsFromDisplayName("🌈Latitude")).toBe("L")
  })

  it("falls back for names without displayable letters or numbers", () => {
    expect(initialsFromDisplayName("🌈")).toBe("L")
    expect(initialsFromDisplayName("---")).toBe("L")
    expect(initialsFromDisplayName("")).toBe("L")
  })

  it("keeps letters and numbers as valid initials", () => {
    expect(initialsFromDisplayName(" latitude")).toBe("L")
    expect(initialsFromDisplayName("123 Industries")).toBe("1")
  })
})
