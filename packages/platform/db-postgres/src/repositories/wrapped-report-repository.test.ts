import { generateId, NotFoundError, OrganizationId, ProjectId, type SqlClient, WrappedReportId } from "@domain/shared"
import { CURRENT_REPORT_VERSION, type Report, type WrappedReportRecord, WrappedReportRepository } from "@domain/spans"
import { Effect } from "effect"
import { afterEach, describe, expect, it } from "vitest"
import { wrappedReports } from "../schema/wrapped-reports.ts"
import { setupTestPostgres } from "../test/in-memory-postgres.ts"
import { withPostgres } from "../with-postgres.ts"
import { WrappedReportRepositoryLive } from "./wrapped-report-repository.ts"

const ORG_A = OrganizationId("a".repeat(24))
const PROJECT_A = ProjectId("p".repeat(24))

const pg = setupTestPostgres()

const runWithLive = <A, E>(
  effect: Effect.Effect<A, E, WrappedReportRepository | SqlClient>,
  org: OrganizationId = OrganizationId("system"),
) => Effect.runPromise(effect.pipe(withPostgres(WrappedReportRepositoryLive, pg.adminPostgresClient, org)))

const sampleReport: Report = {
  project: { id: PROJECT_A, name: "poncho-ios", slug: "poncho-ios" },
  organization: { id: ORG_A, name: "Acme" },
  window: { start: new Date("2026-05-04T00:00:00.000Z"), end: new Date("2026-05-11T00:00:00.000Z") },
  totals: {
    sessions: 5,
    toolCalls: 100,
    durationMs: 30 * 60_000,
    filesTouched: 12,
    commandsRun: 15,
    workspaces: 1,
    branches: 2,
    commits: 3,
    repos: 1,
    streakDays: 5,
    testsRun: 9,
  },
  toolMix: { bash: 15, read: 25, edit: 50, write: 5, search: 5, research: 0, plan: 0, other: 0 },
  loc: {
    written: 840,
    read: 9_200,
    added: 600,
    removed: 180,
    writtenAnchor: { prefix: "≈", emphasis: "a short academic paper" },
    readAnchor: { prefix: "≈", emphasis: "a short story" },
  },
  topBashCommand: { pattern: "pnpm", count: 9 },
  workspaceDeepDives: [],
  otherWorkspaceCount: 0,
  heatmap: Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0)),
  moments: { longestSession: null, busiestDay: null, biggestWrite: null },
  personality: {
    kind: "surgeon",
    score: 0.5,
    evidence: ["50% of your tool calls were Edits", "Touched 12 files this week", "5 Write calls on top"],
  },
}

const makeRecord = (overrides: Partial<WrappedReportRecord> = {}): WrappedReportRecord => ({
  id: WrappedReportId(generateId()),
  type: "claude_code",
  organizationId: ORG_A,
  projectId: PROJECT_A,
  windowStart: new Date("2026-05-04T00:00:00.000Z"),
  windowEnd: new Date("2026-05-11T00:00:00.000Z"),
  ownerName: "Alex",
  reportVersion: CURRENT_REPORT_VERSION,
  report: sampleReport,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

afterEach(async () => {
  await pg.db.delete(wrappedReports)
})

describe("WrappedReportRepositoryLive", () => {
  it("saves and finds by id", async () => {
    const record = makeRecord()

    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* WrappedReportRepository
        yield* repo.save(record)
      }),
    )

    const fetched = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* WrappedReportRepository
        return yield* repo.findById(record.id)
      }),
    )

    expect(fetched.id).toBe(record.id)
    expect(fetched.organizationId).toBe(ORG_A)
    expect(fetched.projectId).toBe(PROJECT_A)
    expect(fetched.ownerName).toBe("Alex")
    expect(fetched.reportVersion).toBe(CURRENT_REPORT_VERSION)
    expect(fetched.report.personality.kind).toBe("surgeon")
    expect(fetched.report.totals.sessions).toBe(5)
  })

  it("round-trips the JSONB report blob without lossy serialisation", async () => {
    const record = makeRecord()
    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* WrappedReportRepository
        yield* repo.save(record)
      }),
    )
    const fetched = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* WrappedReportRepository
        return yield* repo.findById(record.id)
      }),
    )
    // Dates inside the report are serialised as ISO strings in JSONB and
    // parsed back by Zod's z.date() coercion. The values must match.
    expect(fetched.report.window.start.toISOString()).toBe(sampleReport.window.start.toISOString())
    expect(fetched.report.window.end.toISOString()).toBe(sampleReport.window.end.toISOString())
    expect(fetched.report.heatmap).toEqual(sampleReport.heatmap)
  })

  it("findById fails with NotFoundError for an unknown id", async () => {
    await expect(
      runWithLive(
        Effect.gen(function* () {
          const repo = yield* WrappedReportRepository
          return yield* repo.findById(WrappedReportId("nope-".padEnd(24, "x").slice(0, 24)))
        }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  // The repo's `save()` lets the DB default `created_at` to now(); these
  // two tests need controlled timestamps so we bypass save() and seed
  // directly via the db client.
  const seedRow = async (overrides: { id: string; createdAt: Date }) => {
    const record = makeRecord({ id: WrappedReportId(overrides.id) })
    await pg.db.insert(wrappedReports).values({
      id: record.id,
      type: record.type,
      organizationId: record.organizationId,
      projectId: record.projectId,
      windowStart: record.windowStart,
      windowEnd: record.windowEnd,
      ownerName: record.ownerName,
      reportVersion: record.reportVersion,
      report: record.report,
      createdAt: overrides.createdAt,
      updatedAt: overrides.createdAt,
    })
  }

  it("findLatestForProject returns the most recent row created on or after the cutoff", async () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    await seedRow({ id: "wrst".padEnd(24, "1"), createdAt: tenDaysAgo })
    await seedRow({ id: "wrst".padEnd(24, "2"), createdAt: threeDaysAgo })
    await seedRow({ id: "wrst".padEnd(24, "3"), createdAt: yesterday })

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const found = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* WrappedReportRepository
        return yield* repo.findLatestForProject({
          projectId: PROJECT_A,
          type: "claude_code",
          sinceCreatedAt: sevenDaysAgo,
        })
      }),
    )
    expect(found?.id).toBe("wrst".padEnd(24, "3"))
  })

  it("findLatestForProject filters by type", async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    await seedRow({ id: "wrst".padEnd(24, "a"), createdAt: yesterday })

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    // The only row is `claude_code` (the default from `makeRecord`), so a
    // query for a hypothetical other type returns null even though a row
    // for the project exists in the window.
    const found = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* WrappedReportRepository
        return yield* repo.findLatestForProject({
          projectId: PROJECT_A,
          // biome-ignore lint/suspicious/noExplicitAny: simulating a future type literal not yet in the union
          type: "openclaw" as any,
          sinceCreatedAt: sevenDaysAgo,
        })
      }),
    )
    expect(found).toBeNull()
  })

  it("findLatestForProject returns null when no row matches the project + cutoff", async () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
    await seedRow({ id: "wrst".padEnd(24, "9"), createdAt: tenDaysAgo })

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const found = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* WrappedReportRepository
        return yield* repo.findLatestForProject({
          projectId: PROJECT_A,
          type: "claude_code",
          sinceCreatedAt: sevenDaysAgo,
        })
      }),
    )
    expect(found).toBeNull()
  })

  it("findById crosses org boundaries when used with the system SqlClient (no-auth public route flow)", async () => {
    const otherOrg = OrganizationId("z".repeat(24))
    const record = makeRecord({ organizationId: otherOrg })

    await runWithLive(
      Effect.gen(function* () {
        const repo = yield* WrappedReportRepository
        yield* repo.save(record)
      }),
    )

    // No org context — the share URL would resolve like this.
    const fetched = await runWithLive(
      Effect.gen(function* () {
        const repo = yield* WrappedReportRepository
        return yield* repo.findById(record.id)
      }),
    )
    expect(fetched.id).toBe(record.id)
    expect(fetched.organizationId).toBe(otherOrg)
  })
})
