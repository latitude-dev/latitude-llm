import { describe, expect, it } from "vitest"
import type { z } from "zod"
import {
  githubKeywordListInputSchema,
  githubMatchingRulesInputSchema,
  githubMonitorSettingsInputSchema,
} from "./config-validation.ts"

const firstIssue = <T>(result: z.ZodSafeParseResult<T>) => (result.success ? undefined : result.error.issues[0])

describe("githubKeywordListInputSchema", () => {
  it("trims, collapses whitespace, and dedupes case-insensitively", () => {
    const parsed = githubKeywordListInputSchema.parse(["  Fixes ", "fixes", "roll   back", "FIXES"])
    expect(parsed).toEqual(["Fixes", "roll back"])
  })

  it("drops blank entries instead of erroring", () => {
    expect(githubKeywordListInputSchema.parse(["fix", "   ", ""])).toEqual(["fix"])
  })

  it("rejects a keyword longer than 64 characters, on that entry's path", () => {
    const result = githubKeywordListInputSchema.safeParse(["fix", "x".repeat(65)])
    expect(result.success).toBe(false)
    expect(firstIssue(result)?.path).toEqual([1])
  })

  it("rejects a keyword with a disallowed character", () => {
    const result = githubKeywordListInputSchema.safeParse(["fix!"])
    expect(result.success).toBe(false)
    expect(firstIssue(result)?.message).toContain("letters, digits, spaces and hyphens")
  })

  it("rejects a slug-shaped keyword", () => {
    const result = githubKeywordListInputSchema.safeParse(["abc-def1"])
    expect(result.success).toBe(false)
    expect(firstIssue(result)?.message).toContain("signal slug")
  })

  it("rejects more than 64 keywords, at the list path", () => {
    const many = Array.from({ length: 65 }, (_, i) => `kw${i}`)
    const result = githubKeywordListInputSchema.safeParse(many)
    expect(result.success).toBe(false)
    expect(firstIssue(result)?.path).toEqual([])
  })

  it("accepts hyphenated and multi-word phrases", () => {
    expect(githubKeywordListInputSchema.parse(["part of", "back-out"])).toEqual(["part of", "back-out"])
  })
})

describe("githubMatchingRulesInputSchema", () => {
  it("validates each list and normalizes", () => {
    const parsed = githubMatchingRulesInputSchema.parse({
      resolveKeywords: ["Fixes", "fixes"],
      unresolveKeywords: ["reverts"],
      referenceKeywords: [],
    })
    expect(parsed).toEqual({ resolveKeywords: ["Fixes"], unresolveKeywords: ["reverts"], referenceKeywords: [] })
  })

  it("reports the failing list under its key path", () => {
    const result = githubMatchingRulesInputSchema.safeParse({
      resolveKeywords: ["fix"],
      unresolveKeywords: ["bad!"],
      referenceKeywords: [],
    })
    expect(result.success).toBe(false)
    expect(firstIssue(result)?.path[0]).toBe("unresolveKeywords")
  })
})

describe("githubMonitorSettingsInputSchema", () => {
  it("round-trips a full settings object", () => {
    const settings = {
      monitorPullRequests: true,
      monitorCommits: false,
      sources: { commitMessage: true, branchName: false, prTitle: true, prBody: true },
      rules: { resolveKeywords: ["fix"], unresolveKeywords: ["revert"], referenceKeywords: ["ref"] },
    }
    expect(githubMonitorSettingsInputSchema.parse(settings)).toEqual(settings)
  })
})
