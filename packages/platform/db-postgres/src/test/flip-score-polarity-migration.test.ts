import { OrganizationId, ProjectId } from "@domain/shared"
import { asc, sql } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { scores as scoresTable } from "../schema/scores.ts"
import { closeInMemoryPostgres, createInMemoryPostgres, type InMemoryPostgres } from "./in-memory-postgres.ts"

const organizationId = OrganizationId("o".repeat(24))
const projectId = ProjectId("p".repeat(24))

// Mirrors drizzle/20260618140517_signals-flip-historical-score-polarity/migration.sql: the one-time
// cutover that converts existing evaluation + annotation scores from the old problem-detector
// polarity to passed=true = behavior present. custom (user-pushed) and errored rows are excluded.
const FLIP_SQL = sql`
  UPDATE latitude.scores
  SET passed = NOT passed
  WHERE source_type IN ('evaluation', 'annotation') AND errored = false
`

const makeRow = (over: {
  readonly id: string
  readonly sourceType: "evaluation" | "annotation" | "custom"
  readonly passed: boolean
  readonly errored?: boolean
}): typeof scoresTable.$inferInsert => ({
  id: over.id.repeat(24).slice(0, 24),
  organizationId: organizationId as string,
  projectId: projectId as string,
  sessionId: null,
  traceId: `trace-${over.id}`,
  spanId: null,
  sourceType: over.sourceType,
  sourceId: over.sourceType === "annotation" ? "SYSTEM" : "s".repeat(24),
  simulationId: null,
  signalId: over.sourceType === "custom" ? null : "i".repeat(24),
  value: over.passed ? 1 : 0,
  passed: over.passed,
  feedback: "feedback",
  metadata:
    over.sourceType === "evaluation"
      ? { evaluationHash: "h" }
      : over.sourceType === "annotation"
        ? { rawFeedback: "f" }
        : {},
  error: over.errored ? "boom" : null,
  errored: over.errored ?? false,
  duration: 0,
  tokens: 0,
  cost: 0,
  draftedAt: null,
  createdAt: new Date("2026-04-01T00:00:00.000Z"),
  updatedAt: new Date("2026-04-01T00:00:00.000Z"),
})

describe("signals flip-historical-score-polarity migration", () => {
  let database: InMemoryPostgres

  beforeAll(async () => {
    database = await createInMemoryPostgres()
  })
  beforeEach(async () => {
    await database.db.delete(scoresTable)
  })
  afterAll(async () => {
    await closeInMemoryPostgres(database)
  })

  it("flips passed for non-errored evaluation + annotation scores; leaves custom and errored untouched", async () => {
    await database.db.insert(scoresTable).values([
      makeRow({ id: "a", sourceType: "evaluation", passed: false }), // member under old polarity → true
      makeRow({ id: "b", sourceType: "evaluation", passed: true }), // clean under old polarity → false
      makeRow({ id: "c", sourceType: "annotation", passed: false }), // exhibits → true
      makeRow({ id: "d", sourceType: "annotation", passed: true }), // clean → false
      makeRow({ id: "e", sourceType: "custom", passed: false }), // user-pushed, untouched
      makeRow({ id: "f", sourceType: "evaluation", passed: false, errored: true }), // errored, untouched
    ])

    await database.db.execute(FLIP_SQL)

    const rows = await database.db
      .select({ id: scoresTable.id, sourceType: scoresTable.sourceType, passed: scoresTable.passed })
      .from(scoresTable)
      .orderBy(asc(scoresTable.id))

    const passedById = new Map(rows.map((row) => [row.id, row.passed]))
    expect(passedById.get("a".repeat(24))).toBe(true) // evaluation false → true
    expect(passedById.get("b".repeat(24))).toBe(false) // evaluation true → false
    expect(passedById.get("c".repeat(24))).toBe(true) // annotation false → true
    expect(passedById.get("d".repeat(24))).toBe(false) // annotation true → false
    expect(passedById.get("e".repeat(24))).toBe(false) // custom untouched
    expect(passedById.get("f".repeat(24))).toBe(false) // errored untouched
  })
})
