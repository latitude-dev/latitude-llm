import { describe, expect, it } from "vitest"

import { truncateExcerpt } from "./shared.ts"

describe("truncateExcerpt", () => {
  it("does not emit lone UTF-16 surrogates when truncation splits an emoji", () => {
    const excerpt = truncateExcerpt(`prefix ${"🎯"} suffix`, 8)

    expect(excerpt).toBe("prefix �...")
    expect(excerpt).not.toMatch(/[\uD800-\uDFFF]/)
  })

  it("replaces malformed surrogates in untruncated text", () => {
    const excerpt = truncateExcerpt("bad \uD83D input")

    expect(excerpt).toBe("bad � input")
    expect(excerpt).not.toMatch(/[\uD800-\uDFFF]/)
  })
})
