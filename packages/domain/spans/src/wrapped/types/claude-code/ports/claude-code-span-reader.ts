import type { ChSqlClient, OrganizationId, ProjectId, RepositoryError } from "@domain/shared"
import { Context, type Effect } from "effect"

/**
 * Read port for the Claude Code Wrapped feature.
 *
 * A focused port (rather than reusing the broad `SpanRepository`) keeps the
 * Wrapped feature decoupled from the rest of the spans domain — adding a new
 * data point is one new method here, plus its query in the adapter.
 */

export interface OrgProjectPair {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
}

export interface WindowInput {
  readonly from: Date
  readonly to: Date
}

export interface ProjectWindowInput extends WindowInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
}

export interface WrappedTotalsRow {
  readonly sessions: number
  readonly toolCalls: number
  readonly filesTouched: number
  readonly commandsRun: number
  readonly workspaces: number
  readonly branches: number
  readonly commits: number
  readonly repos: number
  /** Distinct UTC calendar days with at least one Claude Code span. Max 7. */
  readonly streakDays: number
  /** Count of Bash invocations that look like a test-runner command. */
  readonly testsRun: number
}

export interface LocStatsRow {
  /** Lines written from scratch (Write `content`). */
  readonly writeLines: number
  /** Lines added by Edit / MultiEdit / NotebookEdit (`new_string` newlines). */
  readonly editAdded: number
  /** Lines removed by Edit / MultiEdit / NotebookEdit (`old_string` newlines). */
  readonly editRemoved: number
  /** Lines Claude read (Read / NotebookRead `tool_output` newlines). */
  readonly readLines: number
}

export interface BiggestWriteRow {
  /** Absolute file_path from the tool_input. Caller takes basename for display. */
  readonly filePath: string
  readonly lines: number
}

export interface SessionDurationStatsRow {
  readonly totalDurationMs: number
  readonly longestDurationMs: number
  readonly longestWorkspace: string | null
}

export interface ToolMixRow {
  readonly toolName: string
  readonly uses: number
}

export interface FileTouchesRow {
  readonly path: string
  readonly touches: number
}

export interface BashPatternRow {
  readonly pattern: string
  readonly uses: number
}

export interface WorkspaceRow {
  readonly name: string
  readonly sessions: number
  readonly toolCalls: number
}

export interface BranchRow {
  readonly name: string
  readonly sessions: number
}

export interface WorkspaceFileRow {
  readonly path: string
  readonly touches: number
  readonly linesAdded: number
  readonly linesRemoved: number
  readonly reads: number
}

export interface WorkspaceBashCommandRow {
  readonly pattern: string
  readonly uses: number
}

export interface WorkspaceDeepDiveRow {
  readonly toolCalls: number
  readonly sessions: number
  /** Distinct commits seen in this workspace's spans. */
  readonly commits: number
  /**
   * Absolute path of the workspace (from `metadata['workspace.path']`). Used
   * to compute relative file paths before rendering — never shown directly.
   * Empty string when the workspace's spans don't carry the path metadata.
   */
  readonly workspacePath: string
  /** Top-touched files in the workspace, with per-file diff and read stats. */
  readonly topFiles: readonly WorkspaceFileRow[]
  readonly topBranches: readonly string[]
  /** Top bash command prefixes used in this workspace (up to 3). */
  readonly topBashCommands: readonly WorkspaceBashCommandRow[]
  readonly dominantTool: string | null
}

export interface HeatmapCellRow {
  /** 1=Mon..7=Sun (ClickHouse toDayOfWeek). */
  readonly dayOfWeek: number
  /** 0..23 UTC. */
  readonly hourOfDay: number
  readonly uses: number
}

export interface BusiestDayRow {
  /** YYYY-MM-DD, UTC. */
  readonly date: string
  readonly toolCalls: number
}

export interface ClaudeCodeSpanReaderShape {
  // ─────────────────────────────────────────────────────────────────────
  // Existing methods — used by the cron and the no-activity gate.
  // ─────────────────────────────────────────────────────────────────────

  listProjectsWithSpansInWindow(
    params: WindowInput,
  ): Effect.Effect<readonly OrgProjectPair[], RepositoryError, ChSqlClient>

  countSessionsForProjectInWindow(params: ProjectWindowInput): Effect.Effect<number, RepositoryError, ChSqlClient>

  // ─────────────────────────────────────────────────────────────────────
  // Wrapped content queries — one per data point in the email.
  // ─────────────────────────────────────────────────────────────────────

  /** Distinct counts for the headline numbers + breadth strip. */
  getTotalsForProject(params: ProjectWindowInput): Effect.Effect<WrappedTotalsRow, RepositoryError, ChSqlClient>

  /** Session wall-clock total + the single longest session's primary workspace. */
  getSessionDurationStats(
    params: ProjectWindowInput,
  ): Effect.Effect<SessionDurationStatsRow, RepositoryError, ChSqlClient>

  /** Aggregated lines-of-code stats — written, edit-added, edit-removed, read. */
  getLocStats(params: ProjectWindowInput): Effect.Effect<LocStatsRow, RepositoryError, ChSqlClient>

  /** The single Write call with the largest content. */
  getBiggestWrite(params: ProjectWindowInput): Effect.Effect<BiggestWriteRow | null, RepositoryError, ChSqlClient>

  /** Raw per-tool-name counts. App-side maps to TOOL_BUCKETS. */
  getToolMix(params: ProjectWindowInput): Effect.Effect<readonly ToolMixRow[], RepositoryError, ChSqlClient>

  /** Top 5 file paths by touch count across Read/Edit/Write tools. */
  getTopFiles(params: ProjectWindowInput): Effect.Effect<readonly FileTouchesRow[], RepositoryError, ChSqlClient>

  /** Top 5 Bash commands grouped by leading whitespace token. */
  getTopBashCommands(params: ProjectWindowInput): Effect.Effect<readonly BashPatternRow[], RepositoryError, ChSqlClient>

  /** All workspaces in the window, sorted by tool-call count desc. */
  getTopWorkspaces(params: ProjectWindowInput): Effect.Effect<readonly WorkspaceRow[], RepositoryError, ChSqlClient>

  /** Top 5 git branches by distinct-session count. */
  getTopBranches(params: ProjectWindowInput): Effect.Effect<readonly BranchRow[], RepositoryError, ChSqlClient>

  /** Per-workspace deep dive (top files / branches / dominant tool). */
  getWorkspaceDeepDive(
    params: ProjectWindowInput & { readonly workspaceName: string },
  ): Effect.Effect<WorkspaceDeepDiveRow, RepositoryError, ChSqlClient>

  /** Tool-call counts grouped by day-of-week × hour-of-day (UTC). Sparse. */
  getHeatmap(params: ProjectWindowInput): Effect.Effect<readonly HeatmapCellRow[], RepositoryError, ChSqlClient>

  /** The single busiest UTC calendar day in the window. */
  getBusiestDay(params: ProjectWindowInput): Effect.Effect<BusiestDayRow | null, RepositoryError, ChSqlClient>
}

export class ClaudeCodeSpanReader extends Context.Service<ClaudeCodeSpanReader, ClaudeCodeSpanReaderShape>()(
  "@domain/spans/ClaudeCodeSpanReader",
) {}
