import { describe, expect, it } from "vitest"
import { extractLeadingEmoji } from "./extractLeadingEmoji.ts"

describe("extractLeadingEmoji", () => {
  it("returns null when there is no leading emoji", () => {
    expect(extractLeadingEmoji("hello world")).toEqual([null, "hello world"])
    expect(extractLeadingEmoji("")).toEqual([null, ""])
  })

  it("does not treat leading digits as emoji", () => {
    expect(extractLeadingEmoji("1 Demo Project")).toEqual([null, "1 Demo Project"])
    expect(extractLeadingEmoji("42 Demo Project")).toEqual([null, "42 Demo Project"])
  })

  it("extracts a simple emoji", () => {
    expect(extractLeadingEmoji("😀 hi")).toEqual(["😀", "hi"])
    expect(extractLeadingEmoji("🎉party")).toEqual(["🎉", "party"])
  })

  it("extracts the full flag emoji even when it precedes a title", () => {
  expect(extractLeadingEmoji("🇺🇸 Team")).toEqual(["🇺🇸", "Team"])
})

  it("extracts the full keycap emoji even when it precedes a title", () => {
    expect(extractLeadingEmoji("1️⃣ Team")).toEqual(["1️⃣", "Team"])
  })
})
