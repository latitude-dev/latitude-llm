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

export interface WorkspaceDeepDiveRow {
  readonly toolCalls: number
  readonly sessions: number
  readonly topFilePaths: readonly string[]
  readonly topBranches: readonly string[]
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

  /** Raw per-tool-name counts. App-side maps to TOOL_BUCKETS. */
  getToolMix(params: ProjectWindowInput): Effect.Effect<readonly ToolMixRow[], RepositoryError, ChSqlClient>

  /** Top 5 file paths by touch count across Read/Edit/Write tools. */
  getTopFiles(params: ProjectWindowInput): Effect.Effect<readonly FileTouchesRow[], RepositoryError, ChSqlClient>

  /** Top 5 Bash commands grouped by leading whitespace token. */
  getTopBashCommands(
    params: ProjectWindowInput,
  ): Effect.Effect<readonly BashPatternRow[], RepositoryError, ChSqlClient>

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
