import { describe, expect, it } from "vitest"
import { signalTracesInputSchema } from "./signals.functions.ts"

const VALID_SIGNAL_ID = "ssssssssssssssssssssssss"

describe("signalTracesInputSchema", () => {
  it("accepts a well-formed CUID signalId", () => {
    const result = signalTracesInputSchema.safeParse({
      projectId: "ssssssssssssssssssssssss",
      signalId: VALID_SIGNAL_ID,
    })
    expect(result.success).toBe(true)
  })

  it("rejects a signalId that is not a CUID", () => {
    const result = signalTracesInputSchema.safeParse({
      projectId: "ssssssssssssssssssssssss",
      signalId: "structured-output-json-parse-failure",
    })
    expect(result.success).toBe(false)
  })

  it("rejects an empty signalId", () => {
    const result = signalTracesInputSchema.safeParse({
      projectId: "ssssssssssssssssssssssss",
      signalId: "",
    })
    expect(result.success).toBe(false)
  })
})
