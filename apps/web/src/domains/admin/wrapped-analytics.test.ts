import { OrganizationId, ProjectId, WrappedReportId } from "@domain/shared"
import type { PersonalityKind, Report, ToolMix, WrappedReportRecord } from "@domain/spans"
import { describe, expect, it } from "vitest"
import { buildAnalyticsPayload } from "./wrapped-analytics.ts"

const zeroToolMix: ToolMix = {
  bash: 0,
  read: 0,
  edit: 0,
  write: 0,
  search: 0,
  research: 0,
  plan: 0,
  other: 0,
}

const zeroReport = (overrides: {
  toolMix?: Partial<ToolMix>
  totals?: Partial<Report["totals"]>
  loc?: Partial<Report["loc"]>
  personality: { kind: PersonalityKind; score: number }
}): Report => ({
  project: { id: ProjectId("proj-x"), name: "Project X", slug: "project-x" },
  organization: { id: OrganizationId("org-x"), name: "Org X" },
  window: { start: new Date("2026-05-01T00:00:00Z"), end: new Date("2026-05-08T00:00:00Z") },
  totals: {
    sessions: 0,
    toolCalls: 0,
    durationMs: 0,
    filesTouched: 0,
    commandsRun: 0,
    workspaces: 0,
    branches: 0,
    commits: 0,
    repos: 0,
    streakDays: 0,
    testsRun: 0,
    gitWriteOps: 0,
    ...overrides.totals,
  },
  toolMix: { ...zeroToolMix, ...overrides.toolMix },
  loc: {
    written: 0,
    read: 0,
    added: 0,
    removed: 0,
    writtenAnchor: { prefix: "", emphasis: "" },
    readAnchor: { prefix: "", emphasis: "" },
    ...overrides.loc,
  },
  topBashCommand: null,
  workspaceDeepDives: [],
  otherWorkspaceCount: 0,
  heatmap: Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0)),
  moments: { longestSession: null, busiestDay: null, biggestWrite: null },
  personality: {
    kind: overrides.personality.kind,
    score: overrides.personality.score,
    evidence: ["", "", ""],
  },
})

const makeRecord = (overrides: {
  id?: string
  organizationId?: string
  projectId?: string
  projectName?: string
  organizationName?: string
  ownerName?: string
  createdAt?: Date
  report: Report
}): WrappedReportRecord => ({
  id: WrappedReportId(overrides.id ?? "rec-1"),
  type: "claude_code",
  organizationId: OrganizationId(overrides.organizationId ?? "org-1"),
  projectId: ProjectId(overrides.projectId ?? "proj-1"),
  windowStart: new Date("2026-05-01T00:00:00Z"),
  windowEnd: new Date("2026-05-08T00:00:00Z"),
  ownerName: overrides.ownerName ?? "Owner",
  reportVersion: 1,
  report: {
    ...overrides.report,
    project: {
      ...overrides.report.project,
      name: overrides.projectName ?? overrides.report.project.name,
    },
    organization: {
      ...overrides.report.organization,
      name: overrides.organizationName ?? overrides.report.organization.name,
    },
  },
  createdAt: overrides.createdAt ?? new Date("2026-04-15T00:00:00Z"),
  updatedAt: overrides.createdAt ?? new Date("2026-04-15T00:00:00Z"),
})

describe("buildAnalyticsPayload", () => {
  it("returns empty stats for an empty cohort without crashing", () => {
    const out = buildAnalyticsPayload([])
    expect(out.list).toEqual([])
    expect(out.stats.summary.reports).toBe(0)
    expect(out.stats.summary.projects).toBe(0)
    expect(out.stats.summary.organizations).toBe(0)
    expect(out.stats.summary.oldestCreatedAt).toBeNull()
    expect(out.stats.summary.newestCreatedAt).toBeNull()
    // All 9 personality kinds appear with count 0.
    expect(out.stats.personalityDistribution).toHaveLength(9)
    expect(out.stats.personalityDistribution.every((d) => d.count === 0)).toBe(true)
    // No score percentiles when no reports.
    expect(out.stats.scorePercentilesByKind).toEqual([])
    // Tool-mix baseline check still produces 8 rows (the buckets); percentiles are 0.
    expect(out.stats.toolMixBaselineCheck).toHaveLength(8)
    // Gate pass-rates: 5 conditional kinds, each at 0% pass.
    expect(out.stats.gatePassRates).toHaveLength(5)
    expect(out.stats.gatePassRates.every((g) => g.passRate === 0 && g.medianSignal === null)).toBe(true)
  })

  it("sorts the list by toolCalls descending", () => {
    const records = [
      makeRecord({
        id: "small",
        projectId: "p-small",
        report: zeroReport({
          totals: { toolCalls: 10, sessions: 1 },
          personality: { kind: "detective", score: 0.5 },
        }),
      }),
      makeRecord({
        id: "big",
        projectId: "p-big",
        report: zeroReport({
          totals: { toolCalls: 500, sessions: 5 },
          personality: { kind: "conductor", score: 0.7 },
        }),
      }),
      makeRecord({
        id: "mid",
        projectId: "p-mid",
        report: zeroReport({
          totals: { toolCalls: 100, sessions: 2 },
          personality: { kind: "shipper", score: 0.9 },
        }),
      }),
    ]
    const out = buildAnalyticsPayload(records)
    expect(out.list.map((r) => r.id)).toEqual(["big", "mid", "small"])
  })

  it("counts personalities and computes summary correctly", () => {
    const records = [
      makeRecord({
        id: "a",
        organizationId: "org-1",
        projectId: "p1",
        createdAt: new Date("2026-04-10T00:00:00Z"),
        report: zeroReport({
          totals: { toolCalls: 100, sessions: 5 },
          personality: { kind: "conductor", score: 0.4 },
        }),
      }),
      makeRecord({
        id: "b",
        organizationId: "org-1",
        projectId: "p2",
        createdAt: new Date("2026-04-20T00:00:00Z"),
        report: zeroReport({
          totals: { toolCalls: 200, sessions: 8 },
          personality: { kind: "conductor", score: 0.8 },
        }),
      }),
      makeRecord({
        id: "c",
        organizationId: "org-2",
        projectId: "p3",
        createdAt: new Date("2026-04-15T00:00:00Z"),
        report: zeroReport({
          totals: { toolCalls: 50, sessions: 3 },
          personality: { kind: "detective", score: 0.3 },
        }),
      }),
    ]
    const out = buildAnalyticsPayload(records)
    expect(out.stats.summary).toMatchObject({ reports: 3, projects: 3, organizations: 2 })
    expect(out.stats.summary.oldestCreatedAt).toBe("2026-04-10T00:00:00.000Z")
    expect(out.stats.summary.newestCreatedAt).toBe("2026-04-20T00:00:00.000Z")
    const conductor = out.stats.personalityDistribution.find((d) => d.kind === "conductor")
    const detective = out.stats.personalityDistribution.find((d) => d.kind === "detective")
    expect(conductor?.count).toBe(2)
    expect(detective?.count).toBe(1)
    // Score percentiles only show kinds with ≥1 report.
    const kinds = out.stats.scorePercentilesByKind.map((r) => r.kind)
    expect(kinds.sort()).toEqual(["conductor", "detective"])
    const conductorScores = out.stats.scorePercentilesByKind.find((r) => r.kind === "conductor")
    expect(conductorScores?.n).toBe(2)
  })

  it("flags gate pass-rates accurately for a Shipper-shaped record", () => {
    // 6 sessions, 18 commits → 3 commits/session, well above the gates.
    const records = [
      makeRecord({
        id: "shipper",
        report: zeroReport({
          totals: { toolCalls: 100, sessions: 6, commits: 18, gitWriteOps: 24, testsRun: 0 },
          loc: { written: 1000, added: 800 },
          toolMix: { bash: 40, edit: 40, read: 20 },
          personality: { kind: "shipper", score: 1.0 },
        }),
      }),
    ]
    const out = buildAnalyticsPayload(records)
    const shipperGate = out.stats.gatePassRates.find((g) => g.kind === "shipper")
    expect(shipperGate?.passCount).toBe(1)
    expect(shipperGate?.passRate).toBe(1)
    // Median signal among passers: max(commits/session=3, writeOps/session=4) = 4
    expect(shipperGate?.medianSignal).toBeCloseTo(4, 5)
    // Tester / Strategist / Scholar shouldn't pass — no tests, no plan, no research.
    expect(out.stats.gatePassRates.find((g) => g.kind === "tester")?.passCount).toBe(0)
    expect(out.stats.gatePassRates.find((g) => g.kind === "strategist")?.passCount).toBe(0)
    expect(out.stats.gatePassRates.find((g) => g.kind === "scholar")?.passCount).toBe(0)
  })

  it("computes tool-mix baseline drift from cohort p50", () => {
    // Two records with bash 50% and 50% — cohort p50 of bash share = 0.5;
    // baseline (post-retune) is 0.40, so drift should be +0.10.
    const records = [
      makeRecord({
        id: "a",
        projectId: "pa",
        report: zeroReport({
          toolMix: { bash: 50, read: 30, edit: 20 },
          totals: { toolCalls: 100, sessions: 5 },
          personality: { kind: "conductor", score: 0.5 },
        }),
      }),
      makeRecord({
        id: "b",
        projectId: "pb",
        report: zeroReport({
          toolMix: { bash: 50, read: 30, edit: 20 },
          totals: { toolCalls: 100, sessions: 5 },
          personality: { kind: "conductor", score: 0.5 },
        }),
      }),
    ]
    const out = buildAnalyticsPayload(records)
    const bash = out.stats.toolMixBaselineCheck.find((b) => b.bucket === "bash")
    expect(bash?.baseline).toBeCloseTo(0.4, 5)
    expect(bash?.p50).toBeCloseTo(0.5, 5)
    expect(bash?.drift).toBeCloseTo(0.1, 5)
  })

  it("buckets always-fires excess values into the canonical histogram ranges", () => {
    // One record with bash 80% → bashExcess = 0.40, falls in the ≥0.30 bucket.
    const records = [
      makeRecord({
        id: "saturated",
        report: zeroReport({
          toolMix: { bash: 80, read: 10, edit: 10 },
          totals: { toolCalls: 100 },
          personality: { kind: "conductor", score: 1 },
        }),
      }),
    ]
    const out = buildAnalyticsPayload(records)
    const conductorHisto = out.stats.excessHistograms.find((h) => h.kind === "conductor")
    expect(conductorHisto).toBeDefined()
    // 6 buckets total; the saturated `≥0.30` bucket is the last.
    expect(conductorHisto?.buckets).toHaveLength(6)
    expect(conductorHisto?.buckets.at(-1)?.count).toBe(1)
    expect(conductorHisto?.buckets.slice(0, -1).reduce((acc, b) => acc + b.count, 0)).toBe(0)
  })
})
