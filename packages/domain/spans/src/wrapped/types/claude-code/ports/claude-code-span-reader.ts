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
  /**
   * Total Bash command *segments* — a single Bash tool call carrying
   * `cd foo && grep bar && git push` contributes three. The denominator
   * for the "1,471 commands" headline.
   */
  readonly commandsRun: number
  readonly workspaces: number
  readonly branches: number
  readonly commits: number
  readonly repos: number
  /** Distinct UTC calendar days with at least one Claude Code span. Max 7. */
  readonly streakDays: number
  /** Count of Bash segments that look like a test-runner command. */
  readonly testsRun: number
  /**
   * Count of git operations that mutate repo state (`commit`/`push`/`merge`/
   * `rebase`/`tag`/`revert`/`cherry-pick`). Sibling of `commits` (which
   * counts distinct git-commit SHAs from span metadata). Feeds the
   * Shipper archetype's score and gate.
   */
  readonly gitWriteOps: number
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

/**
 * One row per group of tool calls sharing a classification key. Bash calls
 * are pre-split into command segments by the adapter and exploded into
 * rows keyed on `(bashPrefix, bashSecondToken)`; path-aware tools (`Edit`,
 * `Write`, `Read`, …) get a per-row `fileDisposition` derived from the
 * `tool_input.file_path` vs `metadata['workspace.path']` comparison.
 *
 * The domain-side classifier in `build-report.ts` turns each row into a
 * `ToolBucket` (or drops it as "excluded"). The shape stays raw so the
 * routing rules live in TS where they're unit-testable.
 */
export interface ToolMixRow {
  readonly toolName: string
  /** Number of tool calls / Bash segments in this group. */
  readonly uses: number
  /**
   * Lowercased first token of the Bash command segment. Empty string for
   * non-Bash rows.
   */
  readonly bashPrefix: string
  /**
   * Lowercased **first non-flag** token after the prefix — i.e. the
   * subcommand keyword. Flag-like tokens (starting with `-`, `@`, or
   * `.`; containing `/` or `=`; or purely numeric) are skipped during
   * extraction. So `git -C /repo status -s` produces
   * `bashSecondToken = "status"`, not `"-c"`, and `gh -R owner/repo pr
   * create` produces `bashSecondToken = "pr"`, not `"owner/repo"`.
   *
   * Empty string for non-Bash rows or segments with no non-flag tokens
   * after the prefix. See `extractBashTokens` for the canonical spec.
   */
  readonly bashSecondToken: string
  /**
   * Lowercased **second non-flag** token after the prefix. Used to
   * disambiguate `gh`'s three-deep CLI: `gh pr create` vs `gh pr view`
   * (same prefix + second, different intent). Same flag-skipping rule
   * as `bashSecondToken`. Empty string when the segment has fewer than
   * two non-flag tokens after the prefix.
   */
  readonly bashThirdToken: string
  /**
   * Path classification for `Edit`/`Write`/`Read`/`MultiEdit`/`NotebookEdit`/
   * `NotebookRead` calls based on the span's `tool_input.file_path` and
   * `metadata['workspace.path']`:
   *
   * - `"plan-file"`: file is `**` /`.claude/plans/<id>.md` → routes to `plan`
   * - `"claude-noise"`: file is under `.claude/` but not `plans/` → excluded
   * - `"external"`: file is outside the workspace (and not `.claude/`) → excluded
   * - `"workspace"`: file is inside the workspace (the common case) → existing bucket
   * - `""`: not a path-aware tool, or no `file_path` carried (e.g. `LS`)
   */
  readonly fileDisposition: "" | "workspace" | "plan-file" | "claude-noise" | "external"
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
