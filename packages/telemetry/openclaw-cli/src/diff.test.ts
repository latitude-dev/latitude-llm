import { describe, expect, it } from "vitest"
import { jsonDiff } from "./diff.ts"

describe("jsonDiff", () => {
  it("returns empty string when before and after are deeply equal", () => {
    expect(jsonDiff({ a: 1, b: [2, 3] }, { a: 1, b: [2, 3] })).toBe("")
  })

  it("renders a hunk with --- / +++ headers and +/- markers", () => {
    const before = { plugins: { entries: { foo: { enabled: false } } } }
    const after = { plugins: { entries: { foo: { enabled: true } } } }
    const out = jsonDiff(before, after)
    expect(out).toContain("--- current")
    expect(out).toContain("+++ proposed")
    // Line is `<marker><space><JSON-line>` where the JSON line itself has
    // 8 spaces of indent (`"enabled"` is at depth 4 with 2-space JSON.stringify).
    expect(out).toMatch(/^- {9}"enabled": false$/m)
    expect(out).toMatch(/^\+ {9}"enabled": true$/m)
  })

  it("respects fromLabel / toLabel options", () => {
    const out = jsonDiff({ x: 1 }, { x: 2 }, { fromLabel: "live", toLabel: "next" })
    expect(out).toContain("--- live")
    expect(out).toContain("+++ next")
  })

  it("renders pure additions (no `before` value)", () => {
    const out = jsonDiff({}, { foo: "bar" })
    expect(out).toContain('+   "foo": "bar"')
    // Should not have a `- "foo": "bar"` line for an empty `before`.
    expect(out).not.toMatch(/^- {2}"foo":/m)
  })

  it("renders pure removals", () => {
    const out = jsonDiff({ foo: "bar" }, {})
    expect(out).toContain('-   "foo": "bar"')
  })
})
