import type { Project } from "@domain/projects"
import { OrganizationId, ProjectId } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { reportV1Schema } from "../entities/report.ts"
import type { ToolMixRow } from "../ports/claude-code-span-reader.ts"
import {
  type AssembleReportInput,
  assembleReport,
  classifyToolMixRow,
  extractBashTokens,
  isGitWriteSegment,
  toolBucketFor,
} from "./build-report.ts"

/**
 * Convenience builder for `ToolMixRow` fixtures — most tests only care
 * about the `(toolName, uses)` pair; the post-refactor row carries three
 * extra fields (bash prefix, bash second token, file disposition) that we
 * default to empty / "workspace" so the existing tests still exercise the
 * pre-refactor routing.
 */
const row = (toolName: string, uses: number, extras: Partial<ToolMixRow> = {}): ToolMixRow => ({
  toolName,
  uses,
  bashPrefix: "",
  bashSecondToken: "",
  bashThirdToken: "",
  fileDisposition: toolName === "Bash" ? "" : (extras.fileDisposition ?? ""),
  ...extras,
})

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
    commits: 3,
    repos: 1,
    streakDays: 5,
    testsRun: 9,
    gitWriteOps: 0,
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
    row("Edit", 50, { fileDisposition: "workspace" }),
    row("Read", 25, { fileDisposition: "workspace" }),
    row("Bash", 15),
    row("Write", 5, { fileDisposition: "workspace" }),
    row("Grep", 5),
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
        commits: 3,
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

  it("maps WebFetch and WebSearch to research", () => {
    expect(toolBucketFor("WebFetch")).toBe("research")
    expect(toolBucketFor("WebSearch")).toBe("research")
  })

  it("maps TodoWrite to plan alongside TaskCreate / TaskUpdate", () => {
    expect(toolBucketFor("TodoWrite")).toBe("plan")
  })

  it("falls back to other for unknown tools", () => {
    expect(toolBucketFor("MysteryTool")).toBe("other")
    expect(toolBucketFor("")).toBe("other")
  })
})

describe("extractBashTokens", () => {
  it("plain `git push origin main` → prefix=git, second=push, third=origin", () => {
    expect(extractBashTokens("git push origin main")).toEqual({
      prefix: "git",
      secondToken: "push",
      thirdToken: "origin",
    })
  })

  it("`git -C /path status -s` → skips -C and the absolute path", () => {
    // Claude Code emits this pattern constantly. Pre-fix, secondToken
    // was "-c" (the literal second whitespace token) and the segment
    // mis-classified as `bash` instead of `search`. After the fix the
    // flag-like tokens are filtered so the meaningful subcommand
    // surfaces.
    expect(extractBashTokens("git -C /Users/sans/src/worktrees/repo status -s")).toEqual({
      prefix: "git",
      secondToken: "status",
      thirdToken: "",
    })
  })

  it("`gh -R owner/repo pr create --title foo` → triplet pr/create surfaces", () => {
    expect(extractBashTokens("gh -R owner/repo pr create --title foo")).toEqual({
      prefix: "gh",
      secondToken: "pr",
      thirdToken: "create",
    })
  })

  it("`pnpm --filter @domain/spans test` → skips --filter and the scoped arg", () => {
    expect(extractBashTokens("pnpm --filter @domain/spans test")).toEqual({
      prefix: "pnpm",
      secondToken: "test",
      thirdToken: "",
    })
  })

  it("`git --version` → no subcommand, second/third empty", () => {
    expect(extractBashTokens("git --version")).toEqual({
      prefix: "git",
      secondToken: "",
      thirdToken: "",
    })
  })

  it("`./scripts/build.sh --release` → prefix keeps its leading dot (it IS the command)", () => {
    // Only the *suffix* tokens are flag-filtered. The prefix is the
    // literal first token — a script path is its own command name.
    expect(extractBashTokens("./scripts/build.sh --release")).toEqual({
      prefix: "./scripts/build.sh",
      secondToken: "",
      thirdToken: "",
    })
  })

  it("`GIT STATUS` → both prefix and tokens are lowercased", () => {
    expect(extractBashTokens("GIT STATUS")).toEqual({
      prefix: "git",
      secondToken: "status",
      thirdToken: "",
    })
  })

  it("`git -c user.email=x commit -m msg` → skips =-containing tokens and -m flag", () => {
    expect(extractBashTokens("git -c user.email=x commit -m msg")).toEqual({
      prefix: "git",
      secondToken: "commit",
      thirdToken: "msg",
    })
  })

  it("`head -n 50 foo.log` → numeric `50` is skipped", () => {
    expect(extractBashTokens("head -n 50 foo.log")).toEqual({
      prefix: "head",
      secondToken: "foo.log",
      thirdToken: "",
    })
  })

  it("collapses runs of whitespace and handles empty input", () => {
    expect(extractBashTokens("")).toEqual({ prefix: "", secondToken: "", thirdToken: "" })
    expect(extractBashTokens("   ")).toEqual({ prefix: "", secondToken: "", thirdToken: "" })
    expect(extractBashTokens("git   push   origin")).toEqual({
      prefix: "git",
      secondToken: "push",
      thirdToken: "origin",
    })
  })

  it("strips bash line continuations (`\\<NEWLINE>`) before tokenising", () => {
    // Claude Code emits multi-line commands like:
    //   foo bar \
    //     echo continued
    // The literal char sequence stored is `foo bar \<NL>  echo continued`.
    // Without normalisation, the `\<NL>` becomes a junk token and surfaces
    // as `\ echo` in the top-commands display.
    expect(extractBashTokens("foo bar \\\n  echo continued")).toEqual({
      prefix: "foo",
      secondToken: "bar",
      thirdToken: "echo",
    })
  })

  it("normalises a segment that begins with a line-continuation join", () => {
    // After splitting on `&&` / `;` / `|`, a segment can start with `\<NL>`
    // when the chain operator appeared at end-of-line just before the
    // continuation. The prefix should be the first real token, not `\<NL>`.
    expect(extractBashTokens("\\\n  echo something")).toEqual({
      prefix: "echo",
      secondToken: "something",
      thirdToken: "",
    })
  })

  it("treats embedded tabs and newlines as whitespace", () => {
    expect(extractBashTokens("git\tpush\norigin")).toEqual({
      prefix: "git",
      secondToken: "push",
      thirdToken: "origin",
    })
  })
})

describe("extractBashTokens + classifyToolMixRow (end-to-end on raw segments)", () => {
  // Bridges the SQL-level extraction to the classifier — proves that a
  // raw Claude Code Bash segment lands in the right toolMix bucket.
  const classify = (segment: string): ReturnType<typeof classifyToolMixRow> => {
    const t = extractBashTokens(segment)
    return classifyToolMixRow(
      row("Bash", 1, { bashPrefix: t.prefix, bashSecondToken: t.secondToken, bashThirdToken: t.thirdToken }),
    )
  }

  it("`git -C /path status -s` lands in search (not bash)", () => {
    expect(classify("git -C /Users/sans/src/worktrees/repo status -s")).toBe("search")
  })

  it("`git -C /path commit -m msg` lands in bash (and counts as a write-op)", () => {
    const t = extractBashTokens("git -C /repo commit -m msg")
    const r = row("Bash", 1, { bashPrefix: t.prefix, bashSecondToken: t.secondToken, bashThirdToken: t.thirdToken })
    expect(classifyToolMixRow(r)).toBe("bash")
    expect(isGitWriteSegment(r)).toBe(true)
  })

  it("`gh -R owner/repo pr create` is a write-op (feeds gitWriteOps)", () => {
    const t = extractBashTokens("gh -R owner/repo pr create --title foo")
    const r = row("Bash", 1, { bashPrefix: t.prefix, bashSecondToken: t.secondToken, bashThirdToken: t.thirdToken })
    expect(classifyToolMixRow(r)).toBe("bash")
    expect(isGitWriteSegment(r)).toBe(true)
  })

  it("`gh -R owner/repo pr view 123` is research, not a write-op", () => {
    const t = extractBashTokens("gh -R owner/repo pr view 123")
    const r = row("Bash", 1, { bashPrefix: t.prefix, bashSecondToken: t.secondToken, bashThirdToken: t.thirdToken })
    expect(classifyToolMixRow(r)).toBe("research")
    expect(isGitWriteSegment(r)).toBe(false)
  })

  it("`pnpm --filter @domain/spans test` is bash (genuine shell orchestration)", () => {
    expect(classify("pnpm --filter @domain/spans test")).toBe("bash")
  })

  it("`tail -8` (raw plumbing) is excluded entirely", () => {
    expect(classify("tail -8")).toBe("excluded")
  })

  it("`cd /Users/sans/src` is excluded (navigation)", () => {
    expect(classify("cd /Users/sans/src")).toBe("excluded")
  })

  it("a line-continuation `echo` segment classifies as excluded plumbing", () => {
    // Pre-normalisation this segment produced prefix `\<NL>` which wasn't
    // in any classifier set → fell through to plain `bash` and showed up
    // as "\ echo" in top-commands. After normalisation, the prefix is
    // `echo` → plumbing → excluded.
    expect(classify("\\\n  echo something")).toBe("excluded")
  })
})

describe("classifyToolMixRow — Bash sub-classification", () => {
  it("routes investigation-style binaries to search", () => {
    expect(classifyToolMixRow(row("Bash", 1, { bashPrefix: "grep" }))).toBe("search")
    expect(classifyToolMixRow(row("Bash", 1, { bashPrefix: "rg" }))).toBe("search")
    expect(classifyToolMixRow(row("Bash", 1, { bashPrefix: "find" }))).toBe("search")
    expect(classifyToolMixRow(row("Bash", 1, { bashPrefix: "ls" }))).toBe("search")
  })

  it("drops shell plumbing entirely (cat/head/tail/echo/sed/awk/…)", () => {
    // These are almost always used as `… | tail -8` or `… | sed s/x/y/`
    // shapers — never standalone Claude work. Dropping them entirely
    // keeps the `read` bucket clean and the top-commands surface free
    // of "Your favourite command: tail" results.
    for (const prefix of [
      "cat",
      "head",
      "tail",
      "less",
      "more",
      "echo",
      "printf",
      "sed",
      "awk",
      "wc",
      "sort",
      "cut",
      "tr",
      "xargs",
      "tee",
    ]) {
      expect(classifyToolMixRow(row("Bash", 1, { bashPrefix: prefix }))).toBe("excluded")
    }
  })

  it("routes curl / wget to research", () => {
    expect(classifyToolMixRow(row("Bash", 1, { bashPrefix: "curl" }))).toBe("research")
    expect(classifyToolMixRow(row("Bash", 1, { bashPrefix: "wget" }))).toBe("research")
  })

  it("drops navigation-only commands (cd / pwd / open / claude)", () => {
    expect(classifyToolMixRow(row("Bash", 1, { bashPrefix: "cd" }))).toBe("excluded")
    expect(classifyToolMixRow(row("Bash", 1, { bashPrefix: "pwd" }))).toBe("excluded")
    expect(classifyToolMixRow(row("Bash", 1, { bashPrefix: "open" }))).toBe("excluded")
    expect(classifyToolMixRow(row("Bash", 1, { bashPrefix: "claude" }))).toBe("excluded")
  })

  it("routes git status / log / diff to search (investigation)", () => {
    expect(classifyToolMixRow(row("Bash", 1, { bashPrefix: "git", bashSecondToken: "status" }))).toBe("search")
    expect(classifyToolMixRow(row("Bash", 1, { bashPrefix: "git", bashSecondToken: "log" }))).toBe("search")
    expect(classifyToolMixRow(row("Bash", 1, { bashPrefix: "git", bashSecondToken: "diff" }))).toBe("search")
    expect(classifyToolMixRow(row("Bash", 1, { bashPrefix: "git", bashSecondToken: "blame" }))).toBe("search")
  })

  it("drops git checkout / switch / config (navigation / setup)", () => {
    expect(classifyToolMixRow(row("Bash", 1, { bashPrefix: "git", bashSecondToken: "checkout" }))).toBe("excluded")
    expect(classifyToolMixRow(row("Bash", 1, { bashPrefix: "git", bashSecondToken: "switch" }))).toBe("excluded")
    expect(classifyToolMixRow(row("Bash", 1, { bashPrefix: "git", bashSecondToken: "config" }))).toBe("excluded")
  })

  it("keeps git commit / push / merge in bash (genuine shell orchestration)", () => {
    expect(classifyToolMixRow(row("Bash", 1, { bashPrefix: "git", bashSecondToken: "commit" }))).toBe("bash")
    expect(classifyToolMixRow(row("Bash", 1, { bashPrefix: "git", bashSecondToken: "push" }))).toBe("bash")
    expect(classifyToolMixRow(row("Bash", 1, { bashPrefix: "git", bashSecondToken: "merge" }))).toBe("bash")
  })

  it("keeps unrecognised binaries in bash (build / test / runtime / infra)", () => {
    expect(classifyToolMixRow(row("Bash", 1, { bashPrefix: "pnpm" }))).toBe("bash")
    expect(classifyToolMixRow(row("Bash", 1, { bashPrefix: "xcodebuild" }))).toBe("bash")
    expect(classifyToolMixRow(row("Bash", 1, { bashPrefix: "python3" }))).toBe("bash")
    expect(classifyToolMixRow(row("Bash", 1, { bashPrefix: "railway" }))).toBe("bash")
  })
})

describe("classifyToolMixRow — file-path disposition", () => {
  it("routes plan-file edits/reads to the plan bucket", () => {
    expect(classifyToolMixRow(row("Edit", 1, { fileDisposition: "plan-file" }))).toBe("plan")
    expect(classifyToolMixRow(row("Write", 1, { fileDisposition: "plan-file" }))).toBe("plan")
    expect(classifyToolMixRow(row("Read", 1, { fileDisposition: "plan-file" }))).toBe("plan")
  })

  it("drops `.claude/` config edits/reads entirely", () => {
    expect(classifyToolMixRow(row("Edit", 1, { fileDisposition: "claude-noise" }))).toBe("excluded")
    expect(classifyToolMixRow(row("Read", 1, { fileDisposition: "claude-noise" }))).toBe("excluded")
  })

  it("drops out-of-workspace edits/reads entirely", () => {
    expect(classifyToolMixRow(row("Edit", 1, { fileDisposition: "external" }))).toBe("excluded")
    expect(classifyToolMixRow(row("Read", 1, { fileDisposition: "external" }))).toBe("excluded")
  })

  it("counts workspace edits/reads via the existing tool-name map", () => {
    expect(classifyToolMixRow(row("Edit", 1, { fileDisposition: "workspace" }))).toBe("edit")
    expect(classifyToolMixRow(row("Write", 1, { fileDisposition: "workspace" }))).toBe("write")
    expect(classifyToolMixRow(row("Read", 1, { fileDisposition: "workspace" }))).toBe("read")
  })

  it("falls back to the tool-name map when no file_path was on the call", () => {
    expect(classifyToolMixRow(row("Edit", 1))).toBe("edit")
    expect(classifyToolMixRow(row("Grep", 1))).toBe("search")
    expect(classifyToolMixRow(row("TodoWrite", 1))).toBe("plan")
  })
})

describe("classifyToolMixRow — gh sub-subcommand routing", () => {
  it("routes gh pr view / list / checks / comment to research (external investigation)", () => {
    for (const third of ["view", "list", "checks", "comment", "diff", "status"]) {
      expect(
        classifyToolMixRow(row("Bash", 1, { bashPrefix: "gh", bashSecondToken: "pr", bashThirdToken: third })),
      ).toBe("research")
    }
  })

  it("routes gh issue / api / run / workflow to research regardless of third token", () => {
    for (const second of ["issue", "api", "run", "workflow"]) {
      expect(
        classifyToolMixRow(row("Bash", 1, { bashPrefix: "gh", bashSecondToken: second, bashThirdToken: "anything" })),
      ).toBe("research")
      expect(classifyToolMixRow(row("Bash", 1, { bashPrefix: "gh", bashSecondToken: second }))).toBe("research")
    }
  })

  it("keeps gh write-ops in bash (and feeds gitWriteOps)", () => {
    for (const third of ["create", "merge", "ready", "edit", "review"]) {
      expect(
        classifyToolMixRow(row("Bash", 1, { bashPrefix: "gh", bashSecondToken: "pr", bashThirdToken: third })),
      ).toBe("bash")
    }
  })

  it("keeps gh auth / config / repo view in bash (not shipping, not research)", () => {
    expect(
      classifyToolMixRow(row("Bash", 1, { bashPrefix: "gh", bashSecondToken: "auth", bashThirdToken: "login" })),
    ).toBe("bash")
    expect(
      classifyToolMixRow(row("Bash", 1, { bashPrefix: "gh", bashSecondToken: "config", bashThirdToken: "set" })),
    ).toBe("bash")
    expect(
      classifyToolMixRow(row("Bash", 1, { bashPrefix: "gh", bashSecondToken: "repo", bashThirdToken: "view" })),
    ).toBe("bash")
  })
})

describe("isGitWriteSegment", () => {
  it("returns true for the git write-ops subcommands", () => {
    for (const sub of ["commit", "push", "merge", "rebase", "tag", "revert", "cherry-pick"]) {
      expect(isGitWriteSegment(row("Bash", 1, { bashPrefix: "git", bashSecondToken: sub }))).toBe(true)
    }
  })

  it("returns true for the gh write-op triplets (gh pr create / merge / ready / edit / review)", () => {
    for (const third of ["create", "merge", "ready", "edit", "review"]) {
      expect(
        isGitWriteSegment(row("Bash", 1, { bashPrefix: "gh", bashSecondToken: "pr", bashThirdToken: third })),
      ).toBe(true)
    }
  })

  it("returns true for gh release create / edit / upload and gh repo create", () => {
    expect(
      isGitWriteSegment(row("Bash", 1, { bashPrefix: "gh", bashSecondToken: "release", bashThirdToken: "create" })),
    ).toBe(true)
    expect(
      isGitWriteSegment(row("Bash", 1, { bashPrefix: "gh", bashSecondToken: "release", bashThirdToken: "upload" })),
    ).toBe(true)
    expect(
      isGitWriteSegment(row("Bash", 1, { bashPrefix: "gh", bashSecondToken: "repo", bashThirdToken: "create" })),
    ).toBe(true)
  })

  it("returns false for git investigation / navigation subcommands", () => {
    for (const sub of ["status", "log", "diff", "checkout", "switch", "config"]) {
      expect(isGitWriteSegment(row("Bash", 1, { bashPrefix: "git", bashSecondToken: sub }))).toBe(false)
    }
  })

  it("returns false for gh read-side calls (view / list / api / issue)", () => {
    expect(isGitWriteSegment(row("Bash", 1, { bashPrefix: "gh", bashSecondToken: "pr", bashThirdToken: "view" }))).toBe(
      false,
    )
    expect(isGitWriteSegment(row("Bash", 1, { bashPrefix: "gh", bashSecondToken: "api" }))).toBe(false)
    expect(
      isGitWriteSegment(row("Bash", 1, { bashPrefix: "gh", bashSecondToken: "issue", bashThirdToken: "list" })),
    ).toBe(false)
  })

  it("returns false for non-git Bash segments and non-Bash rows", () => {
    expect(isGitWriteSegment(row("Bash", 1, { bashPrefix: "pnpm" }))).toBe(false)
    expect(isGitWriteSegment(row("Edit", 1, { fileDisposition: "workspace" }))).toBe(false)
  })
})

describe("assembleReport", () => {
  it("produces a report that validates against the schema", () => {
    const report = assembleReport(baseInput)
    expect(() => reportV1Schema.parse(report)).not.toThrow()
  })

  it("bucketises tool mix correctly", () => {
    const report = assembleReport(baseInput)
    expect(report.toolMix.edit).toBe(50)
    expect(report.toolMix.read).toBe(25)
    expect(report.toolMix.bash).toBe(15)
    expect(report.toolMix.write).toBe(5)
    expect(report.toolMix.search).toBe(5)
    expect(report.toolMix.plan).toBe(0)
    expect(report.toolMix.research).toBe(0)
    expect(report.toolMix.other).toBe(0)
  })

  it("merges NotebookEdit and MultiEdit into the edit bucket", () => {
    const report = assembleReport({
      ...baseInput,
      toolMix: [
        row("Edit", 10, { fileDisposition: "workspace" }),
        row("NotebookEdit", 3, { fileDisposition: "workspace" }),
        row("MultiEdit", 2, { fileDisposition: "workspace" }),
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
    expect(report.loc.writtenAnchor.emphasis.length).toBeGreaterThan(0)
    expect(report.loc.readAnchor.emphasis.length).toBeGreaterThan(0)
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
