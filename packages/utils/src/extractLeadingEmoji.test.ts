import { describe, expect, it } from "vitest"
import { extractLeadingEmoji } from "./extractLeadingEmoji.ts"

describe("extractLeadingEmoji", () => {
  it("extracts a leading emoji and trims the separating space", () => {
    expect(extractLeadingEmoji("🚀 Launch")).toEqual(["🚀", "Launch"])
  })

  it("extracts an emoji written with a variation selector", () => {
    expect(extractLeadingEmoji("❤️ Loved")).toEqual(["❤️", "Loved"])
  })

  it("returns the text untouched when there is no leading emoji", () => {
    expect(extractLeadingEmoji("Hello world")).toEqual([null, "Hello world"])
  })

  it("ignores an emoji that is not at the start", () => {
    expect(extractLeadingEmoji("Launch 🚀")).toEqual([null, "Launch 🚀"])
  })

  it("handles an empty string", () => {
    expect(extractLeadingEmoji("")).toEqual([null, ""])
  })

  // Keycap bases (0-9, #, *) are `Emoji_Component`s but only render as emoji
  // when combined with U+20E3. Treating a bare one as an emoji mangled titles
  // that simply start with a number.
  describe("titles starting with a keycap base", () => {
    it.each([
      "2024 roadmap",
      "3 apples",
      "1. First step",
      "0 to 60",
      "5xx errors",
      "#hashtag title",
      "*starred",
    ])("leaves %j untouched", (title) => {
      expect(extractLeadingEmoji(title)).toEqual([null, title])
    })
  })
})
