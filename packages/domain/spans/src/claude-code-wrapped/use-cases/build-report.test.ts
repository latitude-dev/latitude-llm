import type { Project } from "@domain/projects"
import { OrganizationId, ProjectId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { reportSchema } from "../entities/report.ts"
import { type AssembleReportInput, assembleReport, toolBucketFor } from "./build-report.ts"

const ORG_ID = OrganizationId("org-build".padEnd(24, "x").slice(0, 24))
const PROJECT_ID = ProjectId("proj-build".padEnd(24, "x").slice(0, 24))

const project: Project = {
  id: PROJECT_ID,
  organizationId: ORG_ID,
  name: "poncho-ios",
  slug: "poncho-ios",
  settings: null,
  firstTraceAt: null,
  deletedAt: null,
  lastEditedAt: new Date("2026-05-04T00:00:00.000Z"),
  createdAt: new Date("2026-05-04T00:00:00.000Z"),
  updatedAt: new Date("2026-05-04T00:00:00.000Z"),
}

const WORKSPACE_PATH = "/Users/cesar/Dev/latitude/poncho-ios"

const baseInput: AssembleReportInput = {
  project,
  organization: { id: ORG_ID, name: "Acme" },
  windowStart: new Date("2026-05-04T00:00:00.000Z"),
  windowEnd: new Date("2026-05-11T00:00:00.000Z"),
  totals: {
    sessions: 5,
    toolCalls: 100,
    filesTouched: 12,
    commandsRun: 15,
    workspaces: 1,
    branches: 2,
    commits: 7,
    repos: 1,
    streakDays: 5,
    testsRun: 9,
  },
  durationStats: {
    totalDurationMs: 30 * 60 * 1000,
    longestDurationMs: 15 * 60 * 1000,
    longestWorkspace: "poncho-ios",
  },
  locStats: {
    writeLines: 240,
    editAdded: 600,
    editRemoved: 180,
    readLines: 9_200,
  },
  toolMix: [
    { toolName: "Edit", uses: 50 },
    { toolName: "Read", uses: 25 },
    { toolName: "Bash", uses: 15 },
    { toolName: "Write", uses: 5 },
    { toolName: "Grep", uses: 5 },
  ],
  topBash: [
    { pattern: "pnpm", uses: 9 },
    { pattern: "git", uses: 6 },
  ],
  topWorkspaces: [{ name: "poncho-ios", sessions: 5, toolCalls: 100 }],
  heatmap: [
    { dayOfWeek: 1, hourOfDay: 14, uses: 25 },
    { dayOfWeek: 3, hourOfDay: 9, uses: 40 },
  ],
  busiestDay: { date: "2026-05-06", toolCalls: 40 },
  biggestWrite: { filePath: `${WORKSPACE_PATH}/src/index.ts`, lines: 320 },
  deepDives: [
    {
      workspace: { name: "poncho-ios", sessions: 5, toolCalls: 100 },
      row: {
        toolCalls: 100,
        sessions: 5,
        commits: 7,
        workspacePath: WORKSPACE_PATH,
        topFiles: [
          { path: `${WORKSPACE_PATH}/src/index.ts`, touches: 23, linesAdded: 234, linesRemoved: 132, reads: 5 },
          { path: `${WORKSPACE_PATH}/src/Chat.tsx`, touches: 18, linesAdded: 890, linesRemoved: 0, reads: 0 },
          { path: "/Users/someone-else/elsewhere/foo.ts", touches: 4, linesAdded: 0, linesRemoved: 0, reads: 4 },
        ],
        topBranches: ["main", "feat/chat-input", "fix/keyboard"],
        topBashCommands: [
          { pattern: "pnpm", uses: 9 },
          { pattern: "git", uses: 6 },
          { pattern: "swift", uses: 3 },
        ],
        dominantTool: "Edit",
      },
    },
  ],
}

describe("toolBucketFor", () => {
  it("maps Edit, NotebookEdit, MultiEdit to edit", () => {
    expect(toolBucketFor("Edit")).toBe("edit")
    expect(toolBucketFor("NotebookEdit")).toBe("edit")
    expect(toolBucketFor("MultiEdit")).toBe("edit")
  })

  it("maps Read and NotebookRead to read", () => {
    expect(toolBucketFor("Read")).toBe("read")
    expect(toolBucketFor("NotebookRead")).toBe("read")
  })

  it("maps Grep, Glob, LS to search", () => {
    expect(toolBucketFor("Grep")).toBe("search")
    expect(toolBucketFor("Glob")).toBe("search")
    expect(toolBucketFor("LS")).toBe("search")
  })

  it("maps TaskCreate and TaskUpdate to plan", () => {
    expect(toolBucketFor("TaskCreate")).toBe("plan")
    expect(toolBucketFor("TaskUpdate")).toBe("plan")
  })

  it("falls back to other for unknown tools", () => {
    expect(toolBucketFor("WebFetch")).toBe("other")
    expect(toolBucketFor("")).toBe("other")
  })
})

describe("assembleReport", () => {
  it("produces a report that validates against the schema", () => {
    const report = assembleReport(baseInput)
    expect(() => reportSchema.parse(report)).not.toThrow()
  })

  it("bucketises tool mix correctly", () => {
    const report = assembleReport(baseInput)
    expect(report.toolMix.edit).toBe(50)
    expect(report.toolMix.read).toBe(25)
    expect(report.toolMix.bash).toBe(15)
    expect(report.toolMix.write).toBe(5)
    expect(report.toolMix.search).toBe(5)
    expect(report.toolMix.plan).toBe(0)
    expect(report.toolMix.other).toBe(0)
  })

  it("merges NotebookEdit and MultiEdit into the edit bucket", () => {
    const report = assembleReport({
      ...baseInput,
      toolMix: [
        { toolName: "Edit", uses: 10 },
        { toolName: "NotebookEdit", uses: 3 },
        { toolName: "MultiEdit", uses: 2 },
      ],
    })
    expect(report.toolMix.edit).toBe(15)
  })

  it("computes LOC totals and anchors", () => {
    const report = assembleReport(baseInput)
    expect(report.loc.written).toBe(840) // writeLines + editAdded
    expect(report.loc.added).toBe(600)
    expect(report.loc.removed).toBe(180)
    expect(report.loc.read).toBe(9_200)
    expect(report.loc.writtenAnchor.length).toBeGreaterThan(0)
    expect(report.loc.readAnchor.length).toBeGreaterThan(0)
  })

  it("zero-fills the 7×24 heatmap and places known cells correctly", () => {
    const report = assembleReport(baseInput)
    expect(report.heatmap).toHaveLength(7)
    expect(report.heatmap.every((row) => row.length === 24)).toBe(true)
    expect(report.heatmap[0]?.[14]).toBe(25) // Monday 14:00 UTC
    expect(report.heatmap[2]?.[9]).toBe(40) // Wednesday 09:00 UTC
    expect(report.heatmap[5]?.[5]).toBe(0)
  })

  it("renders workspace-relative file paths (never absolute)", () => {
    const report = assembleReport(baseInput)
    const paths = report.workspaceDeepDives[0]?.topFiles.map((f) => f.displayPath) ?? []
    expect(paths).toContain("src/index.ts")
    expect(paths).toContain("src/Chat.tsx")
    // The file outside the workspace falls back to basename — no absolute paths.
    expect(paths).toContain("foo.ts")
    for (const p of paths) {
      expect(p.startsWith("/")).toBe(false)
    }
  })

  it("exposes the top 3 bash commands for the workspace deep dive", () => {
    const report = assembleReport(baseInput)
    expect(report.workspaceDeepDives[0]?.topBashCommands).toEqual([
      { pattern: "pnpm", count: 9 },
      { pattern: "git", count: 6 },
      { pattern: "swift", count: 3 },
    ])
  })

  it("carries per-file diff stats through to the workspace deep dive", () => {
    const report = assembleReport(baseInput)
    const files = report.workspaceDeepDives[0]?.topFiles ?? []
    const indexTs = files.find((f) => f.displayPath === "src/index.ts")
    expect(indexTs).toEqual({
      displayPath: "src/index.ts",
      touches: 23,
      linesAdded: 234,
      linesRemoved: 132,
      reads: 5,
    })
    // A file with no edits still surfaces reads — the template can swap the
    // "+N / −M" label for "N reads" using these fields.
    const readOnly = files.find((f) => f.displayPath === "foo.ts")
    expect(readOnly).toEqual({
      displayPath: "foo.ts",
      touches: 4,
      linesAdded: 0,
      linesRemoved: 0,
      reads: 4,
    })
  })

  it("emits otherWorkspaceCount = 0 for 1-workspace input", () => {
    const report = assembleReport(baseInput)
    expect(report.otherWorkspaceCount).toBe(0)
    expect(report.workspaceDeepDives).toHaveLength(1)
  })

  it("emits otherWorkspaceCount = max(0, count-3) and keeps top-3 deep dives", () => {
    const fiveWorkspaces = Array.from({ length: 5 }, (_, i) => ({
      name: `ws-${i}`,
      sessions: 5 - i,
      toolCalls: 100 - i * 10,
    }))
    const report = assembleReport({
      ...baseInput,
      topWorkspaces: fiveWorkspaces,
      deepDives: fiveWorkspaces.slice(0, 3).map((workspace) => ({
        workspace,
        row: {
          toolCalls: workspace.toolCalls,
          sessions: workspace.sessions,
          commits: 0,
          workspacePath: "",
          topFiles: [],
          topBranches: [],
          topBashCommands: [],
          dominantTool: "Edit",
        },
      })),
    })
    expect(report.otherWorkspaceCount).toBe(2)
    expect(report.workspaceDeepDives).toHaveLength(3)
  })

  it("sets biggestWrite to basename only (no full path)", () => {
    const report = assembleReport(baseInput)
    expect(report.moments.biggestWrite?.displayName).toBe("index.ts")
    expect(report.moments.biggestWrite?.lines).toBe(320)
    // Defence: the basename must never leak the absolute path.
    expect(report.moments.biggestWrite?.displayName.startsWith("/")).toBe(false)
  })

  it("sets longestSession to null when duration is 0", () => {
    const report = assembleReport({
      ...baseInput,
      durationStats: { totalDurationMs: 0, longestDurationMs: 0, longestWorkspace: null },
    })
    expect(report.moments.longestSession).toBeNull()
  })

  it("assigns a personality (Surgeon here, since Edit dominates)", () => {
    const report = assembleReport(baseInput)
    expect(report.personality.kind).toBe("surgeon")
    expect(report.personality.evidence).toHaveLength(3)
  })

  it("carries streakDays and testsRun through from totals", () => {
    const report = assembleReport(baseInput)
    expect(report.totals.streakDays).toBe(5)
    expect(report.totals.testsRun).toBe(9)
  })

  it("surfaces the #1 bash command as the singleton", () => {
    const report = assembleReport(baseInput)
    expect(report.topBashCommand).toEqual({ pattern: "pnpm", count: 9 })
  })

  it("topBashCommand is null when no bash data exists", () => {
    const report = assembleReport({ ...baseInput, topBash: [] })
    expect(report.topBashCommand).toBeNull()
  })
})
