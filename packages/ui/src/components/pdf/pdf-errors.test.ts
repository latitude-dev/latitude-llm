import { describe, expect, it } from "vitest"
import { classifyPdfError } from "./pdf-errors.ts"

describe("classifyPdfError", () => {
  it("maps pdf.js exception names to user-facing states", () => {
    expect(classifyPdfError({ name: "PasswordException" })?.kind).toBe("password")
    expect(classifyPdfError({ name: "InvalidPDFException" })?.kind).toBe("corrupt")
    expect(classifyPdfError({ name: "MissingPDFException" })?.kind).toBe("missing")
  })

  it("treats cancellations as teardown rather than failure", () => {
    expect(classifyPdfError({ name: "AbortException" })).toBeNull()
    expect(classifyPdfError({ name: "RenderingCancelledException" })).toBeNull()
  })

  it("falls back for unknown and malformed errors", () => {
    expect(classifyPdfError(new Error("boom"))?.kind).toBe("unavailable")
    expect(classifyPdfError(null)?.kind).toBe("unavailable")
  })

  it("carries a label for every state", () => {
    expect(classifyPdfError({ name: "PasswordException" })?.label).toBe("Password-protected PDF")
  })
})
