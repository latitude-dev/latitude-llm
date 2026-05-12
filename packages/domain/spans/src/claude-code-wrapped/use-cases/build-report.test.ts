import type { Project } from "@domain/projects"
import { OrganizationId, ProjectId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { reportSchema } from "../entities/report.ts"
import { assembleReport, type AssembleReportInput, toolBucketFor } from "./build-report.ts"

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
  },
  durationStats: {
    totalDurationMs: 30 * 60 * 1000,
    longestDurationMs: 15 * 60 * 1000,
    longestWorkspace: "poncho-ios",
  },
  toolMix: [
    { toolName: "Edit", uses: 50 },
    { toolName: "Read", uses: 25 },
    { toolName: "Bash", uses: 15 },
    { toolName: "Write", uses: 5 },
    { toolName: "Grep", uses: 5 },
  ],
  topFiles: [
    { path: "/Users/cesar/Dev/latitude/poncho-ios/src/index.ts", touches: 12 },
    { path: "/Users/cesar/Dev/latitude/poncho-ios/src/types.ts", touches: 7 },
  ],
  topBash: [
    { pattern: "pnpm", uses: 9 },
    { pattern: "git", uses: 6 },
  ],
  topWorkspaces: [{ name: "poncho-ios", sessions: 5, toolCalls: 100 }],
  topBranches: [{ name: "main", sessions: 5 }],
  heatmap: [
    { dayOfWeek: 1, hourOfDay: 14, uses: 25 },
    { dayOfWeek: 3, hourOfDay: 9, uses: 40 },
  ],
  busiestDay: { date: "2026-05-06", toolCalls: 40 },
  deepDives: [
    {
      workspace: { name: "poncho-ios", sessions: 5, toolCalls: 100 },
      row: {
        toolCalls: 100,
        sessions: 5,
        topFilePaths: ["/Users/cesar/Dev/latitude/poncho-ios/src/index.ts"],
        topBranches: ["main"],
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

  it("zero-fills the 7×24 heatmap and places known cells correctly", () => {
    const report = assembleReport(baseInput)
    expect(report.heatmap).toHaveLength(7)
    expect(report.heatmap.every((row) => row.length === 24)).toBe(true)
    expect(report.heatmap[0]?.[14]).toBe(25) // Monday 14:00 UTC
    expect(report.heatmap[2]?.[9]).toBe(40) // Wednesday 09:00 UTC
    expect(report.heatmap[5]?.[5]).toBe(0)
  })

  it("extracts basenames for top files", () => {
    const report = assembleReport(baseInput)
    expect(report.topFiles[0]?.displayName).toBe("index.ts")
    expect(report.topFiles[1]?.displayName).toBe("types.ts")
    expect(report.topFiles[0]?.path).toContain("/Users/cesar/")
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
        row: { toolCalls: workspace.toolCalls, sessions: workspace.sessions, topFilePaths: [], topBranches: [], dominantTool: "Edit" },
      })),
    })
    expect(report.otherWorkspaceCount).toBe(2)
    expect(report.workspaceDeepDives).toHaveLength(3)
  })

  it("sets mainCharacterFile from the top file when present", () => {
    const report = assembleReport(baseInput)
    expect(report.moments.mainCharacterFile?.displayName).toBe("index.ts")
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
})
