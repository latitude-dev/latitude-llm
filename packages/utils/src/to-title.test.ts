import { describe, expect, it } from "vitest"
import { toTitle } from "./to-title.ts"

describe("toTitle", () => {
  it("promotes the first letter of all-lowercase words", () => {
    expect(toTitle("chrome")).toBe("Chrome")
    expect(toTitle("ios")).toBe("Ios")
    expect(toTitle("hello world")).toBe("Hello World")
  })

  it("preserves words that already carry an uppercase letter", () => {
    // Regression: these were mangled to "IPhone" / "IOS", which is how a
    // session's browser/OS name was rendered in account settings.
    expect(toTitle("iPhone")).toBe("iPhone")
    expect(toTitle("iOS")).toBe("iOS")
    expect(toTitle("MacOS")).toBe("MacOS")
    expect(toTitle("GitHub")).toBe("GitHub")
  })

  it("mixes promoted and preserved words in one string", () => {
    expect(toTitle("iOS device")).toBe("iOS Device")
    expect(toTitle("chrome on macOS")).toBe("Chrome On macOS")
  })

  it("titlecases contractions", () => {
    expect(toTitle("don't")).toBe("Don't")
  })

  it("leaves numbers, punctuation and whitespace untouched", () => {
    expect(toTitle("windows 11")).toBe("Windows 11")
    expect(toTitle("")).toBe("")
  })
})
