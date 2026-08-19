import { scoreSchema } from "@domain/scores"
import { createSeedScope, SEED_API_KEY_ID, SEED_ORG_ID, SEED_PROJECT_ID } from "@domain/shared/seeding"
import { describe, expect, it } from "vitest"
import { buildAnchoredAnnotationScoreRows } from "./index.ts"

const scope = createSeedScope({
  organizationId: SEED_ORG_ID,
  projectId: SEED_PROJECT_ID,
  timelineAnchor: new Date("2026-06-16T12:00:00.000Z"),
  apiKeyId: SEED_API_KEY_ID,
})

describe("buildAnchoredAnnotationScoreRows", () => {
  const rows = buildAnchoredAnnotationScoreRows(scope)

  // The repository parses every row through `scoreSchema`, so a missing `rawFeedback` only fails in the UI.
  it("writes rows the score repository can read back", () => {
    for (const row of rows) {
      const parsed = scoreSchema.safeParse({ ...row, sessionId: row.sessionId ?? null })
      expect(parsed.error?.message ?? "valid", row.id).toBe("valid")
    }
  })

  it("links every row to a signal and publishes it", () => {
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.signalId, row.id).not.toBeNull()
      expect(row.draftedAt, row.id).toBeNull()
      expect(row.sourceType, row.id).toBe("annotation")
    }
  })

  it("keeps ids deterministic across builds", () => {
    expect(buildAnchoredAnnotationScoreRows(scope).map((row) => row.id)).toEqual(rows.map((row) => row.id))
  })
})
