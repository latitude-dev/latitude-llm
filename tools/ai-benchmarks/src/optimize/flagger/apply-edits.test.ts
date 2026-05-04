import { describe, expect, it } from "vitest"
import { ApplyEditsError, applyEdits } from "./apply-edits.ts"

describe("applyEdits", () => {
  it("applies a single literal find/replace", () => {
    const source = "const a = 1\nconst b = 2\nconst c = 3\n"
    const result = applyEdits(source, [{ find: "const b = 2", replace: "const b = 200" }])
    expect(result).toBe("const a = 1\nconst b = 200\nconst c = 3\n")
  })

  it("applies edits sequentially against the evolving text", () => {
    // Edit 1 inserts "const d = 4". Edit 2's find references that newly
    // inserted line, proving sequential semantics (one-pass would fail
    // because "const d = 4" doesn't exist in the original).
    const source = "const a = 1\nconst c = 3\n"
    const result = applyEdits(source, [
      { find: "const c = 3\n", replace: "const c = 3\nconst d = 4\n" },
      { find: "const d = 4", replace: "const d = 40" },
    ])
    expect(result).toBe("const a = 1\nconst c = 3\nconst d = 40\n")
  })

  it("rejects when find matches zero times", () => {
    const source = "const a = 1\n"
    expect(() => applyEdits(source, [{ find: "const z = 99", replace: "const z = 100" }])).toThrowError(ApplyEditsError)
    try {
      applyEdits(source, [{ find: "const z = 99", replace: "const z = 100" }])
    } catch (err) {
      const e = err as ApplyEditsError
      expect(e.reason.kind).toBe("match-not-found")
      if (e.reason.kind === "match-not-found") {
        expect(e.reason.editIndex).toBe(0)
        expect(e.reason.findPreview).toContain("const z = 99")
      }
    }
  })

  it("rejects when find matches multiple times", () => {
    const source = "const x = 1\nconst x = 1\nconst x = 1\n"
    try {
      applyEdits(source, [{ find: "const x = 1", replace: "const x = 99" }])
      throw new Error("expected applyEdits to throw")
    } catch (err) {
      expect(err).toBeInstanceOf(ApplyEditsError)
      const e = err as ApplyEditsError
      expect(e.reason.kind).toBe("ambiguous-match")
      if (e.reason.kind === "ambiguous-match") {
        expect(e.reason.editIndex).toBe(0)
        expect(e.reason.occurrences).toBe(3)
      }
    }
  })

  it("caps the ambiguous-match occurrence count at 10+", () => {
    // Pathological input: the find string is repeated 25 times. Counting
    // every occurrence is wasted work; the error message just needs to
    // tell the model "many" so it disambiguates next round.
    const source = "x\n".repeat(25)
    try {
      applyEdits(source, [{ find: "x\n", replace: "y\n" }])
      throw new Error("expected applyEdits to throw")
    } catch (err) {
      const e = err as ApplyEditsError
      if (e.reason.kind === "ambiguous-match") {
        expect(e.reason.occurrences).toBe(10)
      }
    }
  })

  it("treats regex special chars in replace as literal text", () => {
    // String.prototype.replace with a string second arg interprets `$&`,
    // `$1`, `` $` ``, etc. — applyEdits must NOT do that. We verify by
    // including `$&` in the replacement; the result should contain the
    // literal `$&`, not the matched substring repeated.
    const source = "const a = 1\n"
    const result = applyEdits(source, [{ find: "const a = 1", replace: "const $& = 2 // $1" }])
    expect(result).toBe("const $& = 2 // $1\n")
  })

  it("treats regex special chars in find as literal text", () => {
    const source = "if (x.match(/.*/)) return\n"
    const result = applyEdits(source, [{ find: "x.match(/.*/)", replace: "x.test(/foo/)" }])
    expect(result).toBe("if (x.test(/foo/)) return\n")
  })

  it("normalizes CRLF in find and replace before matching", () => {
    // Source uses LF (the convention for our strategy files). The model
    // emits CRLF in its find string. Without normalization this would
    // throw match-not-found.
    const source = "line1\nline2\nline3\n"
    const result = applyEdits(source, [{ find: "line2\r\n", replace: "line2-edited\r\n" }])
    expect(result).toBe("line1\nline2-edited\nline3\n")
  })

  it("handles deletions via empty replace", () => {
    const source = "keep\nremove\nkeep\n"
    const result = applyEdits(source, [{ find: "remove\n", replace: "" }])
    expect(result).toBe("keep\nkeep\n")
  })

  it("handles insertions by extending an anchor with new content", () => {
    const source = "// header\nconst a = 1\n"
    const result = applyEdits(source, [{ find: "const a = 1\n", replace: "const a = 1\nconst b = 2\n" }])
    expect(result).toBe("// header\nconst a = 1\nconst b = 2\n")
  })

  it("returns the source unchanged when edits is empty", () => {
    const source = "const a = 1\n"
    expect(applyEdits(source, [])).toBe(source)
  })

  it("preserves indentation and surrounding whitespace exactly", () => {
    const source = "  if (x) {\n    return 1\n  }\n"
    const result = applyEdits(source, [{ find: "    return 1\n", replace: "    return 42\n" }])
    expect(result).toBe("  if (x) {\n    return 42\n  }\n")
  })

  it("fails on edit 2 when its find no longer exists after edit 1 removed it", () => {
    // Edit 1 deletes the line edit 2 wants to find. Sequential semantics
    // means edit 2 sees the post-edit-1 text, where the find is absent.
    const source = "alpha\nbeta\ngamma\n"
    try {
      applyEdits(source, [
        { find: "beta\n", replace: "" },
        { find: "beta\n", replace: "BETA\n" },
      ])
      throw new Error("expected applyEdits to throw")
    } catch (err) {
      const e = err as ApplyEditsError
      expect(e.reason.kind).toBe("match-not-found")
      if (e.reason.kind === "match-not-found") {
        expect(e.reason.editIndex).toBe(1)
      }
    }
  })

  it("reports the first failing edit index when later edits would also fail", () => {
    const source = "a\nb\nc\n"
    try {
      applyEdits(source, [
        { find: "MISSING_1", replace: "X" },
        { find: "MISSING_2", replace: "Y" },
      ])
      throw new Error("expected applyEdits to throw")
    } catch (err) {
      const e = err as ApplyEditsError
      if (e.reason.kind === "match-not-found") {
        expect(e.reason.editIndex).toBe(0)
      }
    }
  })

  it("is deterministic — same edits + same input always produce the same result", () => {
    const source = "const a = 1\nconst b = 2\nconst c = 3\n"
    const edits = [
      { find: "const a = 1", replace: "const a = 100" },
      { find: "const c = 3", replace: "const c = 300" },
    ]
    const r1 = applyEdits(source, edits)
    const r2 = applyEdits(source, edits)
    expect(r1).toBe(r2)
  })
})
