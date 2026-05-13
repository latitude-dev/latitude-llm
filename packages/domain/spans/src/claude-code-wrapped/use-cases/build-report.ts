import type { Project } from "@domain/projects"
import type { OrganizationId } from "@domain/shared"
import { Effect } from "effect"
import {
  type FileLine,
  type Report,
  reportV1Schema,
  type ToolBucket,
  type ToolMix,
  type WorkspaceDeepDive,
} from "../entities/report.ts"
import { pickReadAnchor, pickWrittenAnchor } from "../helpers/anchors.ts"
import {
  type BiggestWriteRow,
  type BusiestDayRow,
  ClaudeCodeSpanReader,
  type HeatmapCellRow,
  type LocStatsRow,
  type SessionDurationStatsRow,
  type ToolMixRow,
  type WorkspaceDeepDiveRow,
  type WorkspaceRow,
  type WrappedTotalsRow,
} from "../ports/claude-code-span-reader.ts"
import { assignPersonality } from "./assign-personality.ts"

/** Maximum workspaces to drill into. Anything past this counts as "other". */
const MAX_WORKSPACE_DEEP_DIVES = 3

/** Concurrency cap for the main fan-out. ClickHouse handles the load fine, but
 *  the cron can run against many projects in parallel so we stay polite. */
const QUERY_CONCURRENCY = 6

/** Concurrency cap for the per-workspace fan-out. */
const DEEP_DIVE_CONCURRENCY = 3

/**
 * Tool-name → bucket map. Maps every Claude Code tool we ship today and
 * funnels everything else into `other` so the bucket sums always equal the
 * total tool-call count.
 */
const TOOL_NAME_TO_BUCKET: Record<string, ToolBucket> = {
  Bash: "bash",
  Read: "read",
  NotebookRead: "read",
  Edit: "edit",
  NotebookEdit: "edit",
  MultiEdit: "edit",
  Write: "write",
  Grep: "search",
  Glob: "search",
  LS: "search",
  WebFetch: "research",
  WebSearch: "research",
  TaskCreate: "plan",
  TaskUpdate: "plan",
  TodoWrite: "plan",
}

export const toolBucketFor = (toolName: string): ToolBucket => TOOL_NAME_TO_BUCKET[toolName] ?? "other"

const emptyToolMix = (): ToolMix => ({
  bash: 0,
  read: 0,
  edit: 0,
  write: 0,
  search: 0,
  research: 0,
  plan: 0,
  other: 0,
})

const bucketise = (rows: readonly ToolMixRow[]): ToolMix => {
  const mix = emptyToolMix()
  for (const row of rows) {
    mix[toolBucketFor(row.toolName)] += row.uses
  }
  return mix
}

// CodeQL flagged the previous trailing-slash regex (`/\/+$/`) as potential
// ReDoS on uncontrolled input. The loop below is linear regardless of how
// many trailing slashes the input has.
const trimTrailingSlashes = (path: string): string => {
  let end = path.length
  while (end > 0 && (path.charCodeAt(end - 1) === 0x2f || path.charCodeAt(end - 1) === 0x5c)) {
    end--
  }
  return end === path.length ? path : path.slice(0, end)
}

const basename = (path: string): string => {
  if (path === "") return ""
  const trimmed = trimTrailingSlashes(path)
  const idx = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"))
  return idx >= 0 ? trimmed.slice(idx + 1) : trimmed
}

/**
 * Strips an absolute workspace prefix so renderable paths are never longer
 * than `src/components/Chat.tsx` — never `/Users/<name>/Dev/.../Chat.tsx`.
 * Falls back to the basename if the workspace prefix doesn't match (e.g. a
 * symlink target or a path outside the workspace root).
 */
const toRelativeDisplayPath = (path: string, workspacePath: string): string => {
  if (path === "") return ""
  if (workspacePath !== "" && path.startsWith(workspacePath)) {
    const trimmed = path.slice(workspacePath.length).replace(/^[/\\]+/, "")
    if (trimmed !== "") return trimmed
  }
  return basename(path)
}

const toEmptyHeatmap = (): Report["heatmap"] => Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))

/**
 * Fills a 7×24 zeroed matrix from sparse `(dayOfWeek, hourOfDay, uses)`
 * triples. ClickHouse's `toDayOfWeek` returns 1=Mon..7=Sun, mapped to 0..6
 * so the array index is the day's display-order offset.
 */
const fillHeatmap = (rows: readonly HeatmapCellRow[]): Report["heatmap"] => {
  const matrix = toEmptyHeatmap()
  for (const row of rows) {
    const dayIndex = row.dayOfWeek - 1
    if (dayIndex < 0 || dayIndex >= 7 || row.hourOfDay < 0 || row.hourOfDay >= 24) continue
    const dayRow = matrix[dayIndex]
    if (!dayRow) continue
    dayRow[row.hourOfDay] = row.uses
  }
  return matrix
}

const buildDeepDive = (workspace: WorkspaceRow, row: WorkspaceDeepDiveRow): WorkspaceDeepDive => ({
  name: workspace.name,
  toolCalls: row.toolCalls,
  sessions: row.sessions,
  commits: row.commits,
  topFiles: row.topFiles.map(
    (file): FileLine => ({
      displayPath: toRelativeDisplayPath(file.path, row.workspacePath),
      touches: file.touches,
      linesAdded: file.linesAdded,
      linesRemoved: file.linesRemoved,
      reads: file.reads,
    }),
  ),
  topBranches: [...row.topBranches],
  topBashCommands: row.topBashCommands.map((cmd) => ({ pattern: cmd.pattern, count: cmd.uses })),
  dominantTool: row.dominantTool ? toolBucketFor(row.dominantTool) : "other",
})

export interface AssembleReportInput {
  readonly project: Project
  readonly organization: { readonly id: OrganizationId; readonly name: string }
  readonly windowStart: Date
  readonly windowEnd: Date
  readonly totals: WrappedTotalsRow
  readonly durationStats: SessionDurationStatsRow
  readonly locStats: LocStatsRow
  readonly toolMix: readonly ToolMixRow[]
  readonly topBash: ReadonlyArray<{ readonly pattern: string; readonly uses: number }>
  readonly topWorkspaces: readonly WorkspaceRow[]
  readonly heatmap: readonly HeatmapCellRow[]
  readonly busiestDay: BusiestDayRow | null
  readonly biggestWrite: BiggestWriteRow | null
  readonly deepDives: ReadonlyArray<{
    readonly workspace: WorkspaceRow
    readonly row: WorkspaceDeepDiveRow
  }>
}

/**
 * Pure assembly step — no Effect, no I/O. Bucketises the tool mix, computes
 * relative paths + anchors, fills the 7×24 heatmap, assigns the personality,
 * and runs the assembled object through `reportV1Schema.parse` so callers can
 * rely on the returned value being a `Report`.
 */
export const assembleReport = (input: AssembleReportInput): Report => {
  const toolMix = bucketise(input.toolMix)
  const heatmap = fillHeatmap(input.heatmap)

  const workspaces = input.topWorkspaces.map((row) => ({
    name: row.name,
    sessions: row.sessions,
    toolCalls: row.toolCalls,
  }))
  const otherWorkspaceCount = Math.max(0, workspaces.length - MAX_WORKSPACE_DEEP_DIVES)
  const workspaceDeepDives = input.deepDives.map(({ workspace, row }) => buildDeepDive(workspace, row))

  // Two distinct measurements that together make up "lines that came into
  // existence this week". Kept separate so the personality function can sum
  // them without double-counting, and so the email's "Lines written" stat
  // can show the total.
  const writeLines = input.locStats.writeLines
  const editAdded = input.locStats.editAdded
  const linesRemoved = input.locStats.editRemoved
  const linesRead = input.locStats.readLines
  const totalLinesWritten = writeLines + editAdded

  const personality = assignPersonality({
    toolMix,
    sessions: input.totals.sessions,
    filesTouched: input.totals.filesTouched,
    commandsRun: input.totals.commandsRun,
    commits: input.totals.commits,
    testsRun: input.totals.testsRun,
    editAdded,
    writeLines,
    linesRead,
  })

  const longestSession =
    input.durationStats.longestDurationMs > 0
      ? { durationMs: input.durationStats.longestDurationMs, workspace: input.durationStats.longestWorkspace }
      : null

  const busiestDay = input.busiestDay ? { date: input.busiestDay.date, toolCalls: input.busiestDay.toolCalls } : null

  const biggestWrite = input.biggestWrite
    ? { displayName: basename(input.biggestWrite.filePath), lines: input.biggestWrite.lines }
    : null

  const topBashCommand =
    input.topBash[0] && input.topBash[0].pattern !== ""
      ? { pattern: input.topBash[0].pattern, count: input.topBash[0].uses }
      : null

  // Runtime-validate the assembled object so callers can rely on the
  // return being a `Report` even when something upstream (a query, an
  // adapter, a refactor) drifts away from the schema. Cheap — one Zod
  // parse per Wrapped run, fired ~once per project per week.
  return reportV1Schema.parse({
    project: { id: input.project.id, name: input.project.name, slug: input.project.slug },
    organization: input.organization,
    window: { start: input.windowStart, end: input.windowEnd },
    totals: {
      sessions: input.totals.sessions,
      toolCalls: input.totals.toolCalls,
      durationMs: input.durationStats.totalDurationMs,
      filesTouched: input.totals.filesTouched,
      commandsRun: input.totals.commandsRun,
      workspaces: input.totals.workspaces,
      branches: input.totals.branches,
      commits: input.totals.commits,
      repos: input.totals.repos,
      streakDays: input.totals.streakDays,
      testsRun: input.totals.testsRun,
    },
    toolMix,
    loc: {
      written: totalLinesWritten,
      read: linesRead,
      added: editAdded,
      removed: linesRemoved,
      writtenAnchor: pickWrittenAnchor(totalLinesWritten),
      readAnchor: pickReadAnchor(linesRead),
    },
    topBashCommand,
    workspaceDeepDives,
    otherWorkspaceCount,
    heatmap,
    moments: { longestSession, busiestDay, biggestWrite },
    personality,
  })
}

export interface BuildReportInput {
  readonly project: Project
  readonly organization: { readonly id: OrganizationId; readonly name: string }
  readonly windowStart: Date
  readonly windowEnd: Date
}

/**
 * Runs the independent Wrapped queries in parallel, then a per-top-3
 * workspace fan-out, then hands the raw rows to `assembleReport` for the
 * pure transformation step. Returns a validated `Report`.
 */
export const buildReportUseCase = Effect.fn("claude-code-wrapped.buildReport")(function* (input: BuildReportInput) {
  const reader = yield* ClaudeCodeSpanReader

  const projectScope = {
    organizationId: input.organization.id,
    projectId: input.project.id,
    from: input.windowStart,
    to: input.windowEnd,
  }

  const [totals, durationStats, locStats, toolMix, topBash, topWorkspaces, heatmap, busiestDay, biggestWrite] =
    yield* Effect.all(
      [
        reader.getTotalsForProject(projectScope),
        reader.getSessionDurationStats(projectScope),
        reader.getLocStats(projectScope),
        reader.getToolMix(projectScope),
        reader.getTopBashCommands(projectScope),
        reader.getTopWorkspaces(projectScope),
        reader.getHeatmap(projectScope),
        reader.getBusiestDay(projectScope),
        reader.getBiggestWrite(projectScope),
      ],
      { concurrency: QUERY_CONCURRENCY },
    )

  const deepDiveTargets = topWorkspaces.slice(0, MAX_WORKSPACE_DEEP_DIVES)
  const deepDives = yield* Effect.forEach(
    deepDiveTargets,
    (workspace) =>
      reader
        .getWorkspaceDeepDive({ ...projectScope, workspaceName: workspace.name })
        .pipe(Effect.map((row) => ({ workspace, row }))),
    { concurrency: DEEP_DIVE_CONCURRENCY },
  )

  return assembleReport({
    project: input.project,
    organization: input.organization,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    totals,
    durationStats,
    locStats,
    toolMix,
    topBash,
    topWorkspaces,
    heatmap,
    busiestDay,
    biggestWrite,
    deepDives,
  })
})
