import type { ClickHouseClient } from "@clickhouse/client"
import {
  ChSqlClient,
  type ChSqlClientShape,
  type OrganizationId as OrganizationIdT,
  type ProjectId as ProjectIdT,
  OrganizationId as toOrganizationId,
  ProjectId as toProjectId,
  toRepositoryError,
} from "@domain/shared"
import {
  type BashPatternRow,
  type BiggestWriteRow,
  type BranchRow,
  type BusiestDayRow,
  ClaudeCodeSpanReader,
  type ClaudeCodeSpanReaderShape,
  type FileTouchesRow,
  type HeatmapCellRow,
  type LocStatsRow,
  type SessionDurationStatsRow,
  type ToolMixRow,
  type WorkspaceDeepDiveRow,
  type WorkspaceRow,
  type WrappedTotalsRow,
} from "@domain/spans"
import { Effect, Layer } from "effect"

// Spans from `@latitude-data/telemetry-claude-code` always carry the Claude
// Code version under this metadata key. Using `ifNull(metadata[k], '') != ''`
// works against ClickHouse's `Map(String, String)` storage and lets us scan
// without a separate column.
const CLAUDE_CODE_VERSION_KEY = "claude_code.version"

// ClickHouse DateTime64(9, 'UTC') rejects trailing 'Z'; strip it. (Mirrors the
// helper used in span-repository.ts.)
const toClickhouseDateTime = (date: Date): string => date.toISOString().replace("Z", "")

// Tool names that carry a `file_path` in `tool_input`. Kept literal so the
// embedded SQL matches what the spans adapter actually inserts.
const FILE_PATH_TOOLS = ["Read", "Edit", "Write", "NotebookEdit", "MultiEdit"] as const

// Shared filter parameters appended to every project-window query so the same
// keys are used everywhere and the centralised filter stays in sync.
const projectWindowParams = (params: {
  readonly organizationId: OrganizationIdT
  readonly projectId: ProjectIdT
  readonly from: Date
  readonly to: Date
}) => ({
  organizationId: params.organizationId as string,
  projectId: params.projectId as string,
  from: toClickhouseDateTime(params.from),
  to: toClickhouseDateTime(params.to),
  metadataKey: CLAUDE_CODE_VERSION_KEY,
})

const PROJECT_WINDOW_FILTER = `
  organization_id = {organizationId:String}
  AND project_id = {projectId:String}
  AND start_time >= {from:DateTime64(9, 'UTC')}
  AND start_time <= {to:DateTime64(9, 'UTC')}
  AND ifNull(metadata[{metadataKey:String}], '') != ''
`

interface ProjectsListRow {
  readonly organization_id: string
  readonly project_id: string
}

interface SessionCountRow {
  readonly sessions: number | string
}

interface TotalsCHRow {
  readonly sessions: number | string
  readonly tool_calls: number | string
  readonly files_touched: number | string
  readonly commands_run: number | string
  readonly workspaces: number | string
  readonly branches: number | string
  readonly commits: number | string
  readonly repos: number | string
  readonly streak_days: number | string
  readonly tests_run: number | string
}

interface LocStatsCHRow {
  readonly write_lines: number | string
  readonly edit_added: number | string
  readonly edit_removed: number | string
  readonly multiedit_added: number | string
  readonly multiedit_removed: number | string
  readonly read_lines: number | string
}

interface BiggestWriteCHRow {
  readonly file_path: string
  readonly lines: number | string
}

interface DurationStatsCHRow {
  readonly total_duration_s: number | string
  readonly longest_duration_s: number | string
  readonly longest_workspace: string
}

interface ToolMixCHRow {
  readonly tool_name: string
  readonly uses: number | string
}

interface FileTouchesCHRow {
  readonly path: string
  readonly touches: number | string
}

interface BashPatternCHRow {
  readonly pattern: string
  readonly uses: number | string
}

interface WorkspaceCHRow {
  readonly name: string
  readonly sessions: number | string
  readonly tool_calls: number | string
}

interface BranchCHRow {
  readonly name: string
  readonly sessions: number | string
}

interface WorkspaceDeepDiveCHRow {
  readonly tool_calls: number | string
  readonly sessions: number | string
  readonly commits: number | string
  readonly workspace_path: string
  /** Parallel arrays describing the top 3 touched files. */
  readonly top_file_paths: readonly string[] | null
  readonly top_file_touches: readonly (number | string)[] | null
  readonly top_file_lines_added: readonly (number | string)[] | null
  readonly top_file_lines_removed: readonly (number | string)[] | null
  readonly top_file_reads: readonly (number | string)[] | null
  readonly top_branches: readonly string[] | null
  /** Parallel arrays describing the top 3 bash command prefixes. */
  readonly top_command_patterns: readonly string[] | null
  readonly top_command_counts: readonly (number | string)[] | null
  readonly dominant_tool: readonly string[] | null
}

interface HeatmapCHRow {
  readonly day_of_week: number | string
  readonly hour_of_day: number | string
  readonly uses: number | string
}

interface BusiestDayCHRow {
  readonly date: string
  readonly tool_calls: number | string
}

const num = (raw: number | string): number => (typeof raw === "number" ? raw : Number(raw))

export const ClaudeCodeSpanReaderLive = Layer.effect(
  ClaudeCodeSpanReader,
  Effect.gen(function* () {
    // ─────────────────────────────────────────────────────────────────────
    // Existing queries (kept verbatim from the previous adapter).
    // ─────────────────────────────────────────────────────────────────────

    const listProjectsWithSpansInWindow: ClaudeCodeSpanReaderShape["listProjectsWithSpansInWindow"] = ({ from, to }) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT DISTINCT organization_id, project_id
                    FROM spans
                    WHERE start_time >= {from:DateTime64(9, 'UTC')}
                      AND start_time <= {to:DateTime64(9, 'UTC')}
                      AND ifNull(metadata[{metadataKey:String}], '') != ''`,
              query_params: {
                from: toClickhouseDateTime(from),
                to: toClickhouseDateTime(to),
                metadataKey: CLAUDE_CODE_VERSION_KEY,
              },
              format: "JSONEachRow",
            })
            return result.json<ProjectsListRow>()
          })
          .pipe(
            Effect.map((rows) =>
              rows.map((row): { readonly organizationId: OrganizationIdT; readonly projectId: ProjectIdT } => ({
                organizationId: toOrganizationId(row.organization_id),
                projectId: toProjectId(row.project_id),
              })),
            ),
            Effect.mapError((error) => toRepositoryError(error, "listProjectsWithSpansInWindow")),
          )
      })

    const countSessionsForProjectInWindow: ClaudeCodeSpanReaderShape["countSessionsForProjectInWindow"] = (params) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT count(DISTINCT session_id) AS sessions
                    FROM spans
                    WHERE ${PROJECT_WINDOW_FILTER}
                      AND session_id != ''`,
              query_params: projectWindowParams(params),
              format: "JSONEachRow",
            })
            const [row] = await result.json<SessionCountRow>()
            return row ? num(row.sessions) : 0
          })
          .pipe(Effect.mapError((error) => toRepositoryError(error, "countSessionsForProjectInWindow")))
      })

    // ─────────────────────────────────────────────────────────────────────
    // Wrapped content queries.
    //
    // Each method runs one SQL statement. `Effect.all` in the use case
    // parallelises them so the per-project Wrapped run hits ClickHouse with
    // ~8 concurrent requests, not 8 sequential.
    // ─────────────────────────────────────────────────────────────────────

    const getTotalsForProject: ClaudeCodeSpanReaderShape["getTotalsForProject"] = (params) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `
                SELECT
                  countDistinctIf(session_id, session_id != '')                                       AS sessions,
                  countIf(operation = 'execute_tool')                                                 AS tool_calls,
                  countDistinctIf(
                    JSONExtractString(tool_input, 'file_path'),
                    tool_name IN (${FILE_PATH_TOOLS.map((t) => `'${t}'`).join(",")})
                    AND JSONExtractString(tool_input, 'file_path') != ''
                  )                                                                                   AS files_touched,
                  countIf(tool_name = 'Bash')                                                         AS commands_run,
                  countDistinctIf(metadata['workspace.name'], metadata['workspace.name'] != '')       AS workspaces,
                  countDistinctIf(metadata['git.branch'],     metadata['git.branch']     != '')       AS branches,
                  countDistinctIf(metadata['git.commit'],     metadata['git.commit']     != '')       AS commits,
                  countDistinctIf(metadata['git.repo'],       metadata['git.repo']       != '')       AS repos,
                  uniqExact(toDate(start_time))                                                       AS streak_days,
                  countIf(
                    tool_name = 'Bash'
                    AND match(JSONExtractString(tool_input, 'command'),
                      '(?i)(^|\\s)(test(\\s|:|$)|pytest|vitest|jest|mocha|rspec)')
                  )                                                                                   AS tests_run
                FROM spans
                WHERE ${PROJECT_WINDOW_FILTER}
              `,
              query_params: projectWindowParams(params),
              format: "JSONEachRow",
            })
            const [row] = await result.json<TotalsCHRow>()
            const empty: WrappedTotalsRow = {
              sessions: 0,
              toolCalls: 0,
              filesTouched: 0,
              commandsRun: 0,
              workspaces: 0,
              branches: 0,
              commits: 0,
              repos: 0,
              streakDays: 0,
              testsRun: 0,
            }
            if (!row) return empty
            return {
              sessions: num(row.sessions),
              toolCalls: num(row.tool_calls),
              filesTouched: num(row.files_touched),
              commandsRun: num(row.commands_run),
              workspaces: num(row.workspaces),
              branches: num(row.branches),
              commits: num(row.commits),
              repos: num(row.repos),
              streakDays: num(row.streak_days),
              testsRun: num(row.tests_run),
            }
          })
          .pipe(Effect.mapError((error) => toRepositoryError(error, "getTotalsForProject")))
      })

    const getLocStats: ClaudeCodeSpanReaderShape["getLocStats"] = (params) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        return yield* chSqlClient
          .query(async (client) => {
            // countSubstrings counts non-overlapping occurrences — equivalent
            // to "lines of code" when measured by '\n'. We treat the final
            // line as "complete enough" for the aggregate.
            const result = await client.query({
              query: `
                SELECT
                  sumIf(countSubstrings(JSONExtractString(tool_input, 'content'),    '\\n'),
                        tool_name = 'Write')                                          AS write_lines,
                  sumIf(countSubstrings(JSONExtractString(tool_input, 'new_string'), '\\n'),
                        tool_name IN ('Edit', 'NotebookEdit'))                        AS edit_added,
                  sumIf(countSubstrings(JSONExtractString(tool_input, 'old_string'), '\\n'),
                        tool_name IN ('Edit', 'NotebookEdit'))                        AS edit_removed,
                  sumIf(arraySum(arrayMap(
                          x -> countSubstrings(JSONExtractString(x, 'new_string'), '\\n'),
                          JSONExtractArrayRaw(tool_input, 'edits')
                        )), tool_name = 'MultiEdit')                                  AS multiedit_added,
                  sumIf(arraySum(arrayMap(
                          x -> countSubstrings(JSONExtractString(x, 'old_string'), '\\n'),
                          JSONExtractArrayRaw(tool_input, 'edits')
                        )), tool_name = 'MultiEdit')                                  AS multiedit_removed,
                  sumIf(countSubstrings(tool_output, '\\n'),
                        tool_name IN ('Read', 'NotebookRead'))                        AS read_lines
                FROM spans
                WHERE ${PROJECT_WINDOW_FILTER}
              `,
              query_params: projectWindowParams(params),
              format: "JSONEachRow",
            })
            const [row] = await result.json<LocStatsCHRow>()
            const empty: LocStatsRow = { writeLines: 0, editAdded: 0, editRemoved: 0, readLines: 0 }
            if (!row) return empty
            return {
              writeLines: num(row.write_lines),
              editAdded: num(row.edit_added) + num(row.multiedit_added),
              editRemoved: num(row.edit_removed) + num(row.multiedit_removed),
              readLines: num(row.read_lines),
            }
          })
          .pipe(Effect.mapError((error) => toRepositoryError(error, "getLocStats")))
      })

    const getBiggestWrite: ClaudeCodeSpanReaderShape["getBiggestWrite"] = (params) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `
                SELECT
                  JSONExtractString(tool_input, 'file_path')                AS file_path,
                  countSubstrings(JSONExtractString(tool_input, 'content'), '\\n') AS lines
                FROM spans
                WHERE ${PROJECT_WINDOW_FILTER}
                  AND tool_name = 'Write'
                  AND JSONExtractString(tool_input, 'file_path') != ''
                ORDER BY lines DESC
                LIMIT 1
              `,
              query_params: projectWindowParams(params),
              format: "JSONEachRow",
            })
            const [row] = await result.json<BiggestWriteCHRow>()
            if (!row || num(row.lines) <= 0) return null
            return { filePath: row.file_path, lines: num(row.lines) } satisfies BiggestWriteRow
          })
          .pipe(Effect.mapError((error) => toRepositoryError(error, "getBiggestWrite")))
      })

    const getSessionDurationStats: ClaudeCodeSpanReaderShape["getSessionDurationStats"] = (params) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `
                SELECT
                  sumOrNull(duration_s)         AS total_duration_s,
                  maxOrNull(duration_s)         AS longest_duration_s,
                  argMax(workspace, duration_s) AS longest_workspace
                FROM (
                  SELECT
                    session_id,
                    dateDiff('second', min(start_time), max(end_time)) AS duration_s,
                    any(metadata['workspace.name'])                    AS workspace
                  FROM spans
                  WHERE ${PROJECT_WINDOW_FILTER}
                    AND session_id != ''
                  GROUP BY session_id
                )
              `,
              query_params: projectWindowParams(params),
              format: "JSONEachRow",
            })
            const [row] = await result.json<DurationStatsCHRow>()
            const empty: SessionDurationStatsRow = {
              totalDurationMs: 0,
              longestDurationMs: 0,
              longestWorkspace: null,
            }
            if (!row) return empty
            return {
              totalDurationMs: num(row.total_duration_s) * 1000,
              longestDurationMs: num(row.longest_duration_s) * 1000,
              longestWorkspace: row.longest_workspace !== "" ? row.longest_workspace : null,
            }
          })
          .pipe(Effect.mapError((error) => toRepositoryError(error, "getSessionDurationStats")))
      })

    const getToolMix: ClaudeCodeSpanReaderShape["getToolMix"] = (params) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `
                SELECT tool_name, count() AS uses
                FROM spans
                WHERE ${PROJECT_WINDOW_FILTER}
                  AND operation = 'execute_tool'
                  AND tool_name != ''
                GROUP BY tool_name
              `,
              query_params: projectWindowParams(params),
              format: "JSONEachRow",
            })
            return result.json<ToolMixCHRow>()
          })
          .pipe(
            Effect.map((rows): readonly ToolMixRow[] =>
              rows.map((row) => ({ toolName: row.tool_name, uses: num(row.uses) })),
            ),
            Effect.mapError((error) => toRepositoryError(error, "getToolMix")),
          )
      })

    const getTopFiles: ClaudeCodeSpanReaderShape["getTopFiles"] = (params) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `
                SELECT
                  JSONExtractString(tool_input, 'file_path') AS path,
                  count() AS touches
                FROM spans
                WHERE ${PROJECT_WINDOW_FILTER}
                  AND tool_name IN (${FILE_PATH_TOOLS.map((t) => `'${t}'`).join(",")})
                  AND JSONExtractString(tool_input, 'file_path') != ''
                GROUP BY path
                ORDER BY touches DESC
                LIMIT 5
              `,
              query_params: projectWindowParams(params),
              format: "JSONEachRow",
            })
            return result.json<FileTouchesCHRow>()
          })
          .pipe(
            Effect.map((rows): readonly FileTouchesRow[] =>
              rows.map((row) => ({ path: row.path, touches: num(row.touches) })),
            ),
            Effect.mapError((error) => toRepositoryError(error, "getTopFiles")),
          )
      })

    const getTopBashCommands: ClaudeCodeSpanReaderShape["getTopBashCommands"] = (params) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `
                SELECT
                  splitByChar(' ', trim(BOTH ' ' FROM JSONExtractString(tool_input, 'command')))[1] AS pattern,
                  count() AS uses
                FROM spans
                WHERE ${PROJECT_WINDOW_FILTER}
                  AND tool_name = 'Bash'
                  AND JSONExtractString(tool_input, 'command') != ''
                GROUP BY pattern
                ORDER BY uses DESC
                LIMIT 5
              `,
              query_params: projectWindowParams(params),
              format: "JSONEachRow",
            })
            return result.json<BashPatternCHRow>()
          })
          .pipe(
            Effect.map((rows): readonly BashPatternRow[] =>
              rows.filter((row) => row.pattern !== "").map((row) => ({ pattern: row.pattern, uses: num(row.uses) })),
            ),
            Effect.mapError((error) => toRepositoryError(error, "getTopBashCommands")),
          )
      })

    const getTopWorkspaces: ClaudeCodeSpanReaderShape["getTopWorkspaces"] = (params) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `
                SELECT
                  metadata['workspace.name'] AS name,
                  countDistinctIf(session_id, session_id != '') AS sessions,
                  count() AS tool_calls
                FROM spans
                WHERE ${PROJECT_WINDOW_FILTER}
                  AND metadata['workspace.name'] != ''
                GROUP BY name
                ORDER BY tool_calls DESC
              `,
              query_params: projectWindowParams(params),
              format: "JSONEachRow",
            })
            return result.json<WorkspaceCHRow>()
          })
          .pipe(
            Effect.map((rows): readonly WorkspaceRow[] =>
              rows.map((row) => ({
                name: row.name,
                sessions: num(row.sessions),
                toolCalls: num(row.tool_calls),
              })),
            ),
            Effect.mapError((error) => toRepositoryError(error, "getTopWorkspaces")),
          )
      })

    const getTopBranches: ClaudeCodeSpanReaderShape["getTopBranches"] = (params) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `
                SELECT
                  metadata['git.branch'] AS name,
                  countDistinctIf(session_id, session_id != '') AS sessions
                FROM spans
                WHERE ${PROJECT_WINDOW_FILTER}
                  AND metadata['git.branch'] != ''
                GROUP BY name
                ORDER BY sessions DESC
                LIMIT 5
              `,
              query_params: projectWindowParams(params),
              format: "JSONEachRow",
            })
            return result.json<BranchCHRow>()
          })
          .pipe(
            Effect.map((rows): readonly BranchRow[] =>
              rows.map((row) => ({ name: row.name, sessions: num(row.sessions) })),
            ),
            Effect.mapError((error) => toRepositoryError(error, "getTopBranches")),
          )
      })

    const getWorkspaceDeepDive: ClaudeCodeSpanReaderShape["getWorkspaceDeepDive"] = (params) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        return yield* chSqlClient
          .query(async (client) => {
            // Two CTEs precompute per-file diff stats and per-pattern bash
            // counts (each capped at top-3). The outer SELECT materialises
            // them as parallel arrays so we can return everything in a
            // single round-trip.
            const result = await client.query({
              query: `
                WITH files AS (
                  SELECT
                    JSONExtractString(tool_input, 'file_path')                              AS path,
                    countIf(tool_name IN ('Read', 'NotebookRead'))                          AS reads,
                    sumIf(countSubstrings(JSONExtractString(tool_input, 'new_string'), '\\n'),
                          tool_name IN ('Edit', 'NotebookEdit'))
                      + sumIf(arraySum(arrayMap(
                              x -> countSubstrings(JSONExtractString(x, 'new_string'), '\\n'),
                              JSONExtractArrayRaw(tool_input, 'edits')
                            )), tool_name = 'MultiEdit')
                      + sumIf(countSubstrings(JSONExtractString(tool_input, 'content'), '\\n'),
                              tool_name = 'Write')                                          AS lines_added,
                    sumIf(countSubstrings(JSONExtractString(tool_input, 'old_string'), '\\n'),
                          tool_name IN ('Edit', 'NotebookEdit'))
                      + sumIf(arraySum(arrayMap(
                              x -> countSubstrings(JSONExtractString(x, 'old_string'), '\\n'),
                              JSONExtractArrayRaw(tool_input, 'edits')
                            )), tool_name = 'MultiEdit')                                    AS lines_removed,
                    count() AS touches
                  FROM spans
                  WHERE ${PROJECT_WINDOW_FILTER}
                    AND metadata['workspace.name'] = {workspaceName:String}
                    AND tool_name IN ('Read','NotebookRead','Edit','NotebookEdit','MultiEdit','Write')
                    AND JSONExtractString(tool_input, 'file_path') != ''
                  GROUP BY path
                  ORDER BY touches DESC
                  LIMIT 3
                ),
                commands AS (
                  SELECT
                    splitByChar(' ', trim(BOTH ' ' FROM JSONExtractString(tool_input, 'command')))[1] AS pattern,
                    count() AS uses
                  FROM spans
                  WHERE ${PROJECT_WINDOW_FILTER}
                    AND metadata['workspace.name'] = {workspaceName:String}
                    AND tool_name = 'Bash'
                    AND JSONExtractString(tool_input, 'command') != ''
                  GROUP BY pattern
                  ORDER BY uses DESC
                  LIMIT 3
                )
                SELECT
                  (SELECT count() FROM spans
                    WHERE ${PROJECT_WINDOW_FILTER}
                      AND metadata['workspace.name'] = {workspaceName:String}) AS tool_calls,
                  (SELECT countDistinctIf(session_id, session_id != '') FROM spans
                    WHERE ${PROJECT_WINDOW_FILTER}
                      AND metadata['workspace.name'] = {workspaceName:String}) AS sessions,
                  (SELECT countDistinctIf(metadata['git.commit'], metadata['git.commit'] != '') FROM spans
                    WHERE ${PROJECT_WINDOW_FILTER}
                      AND metadata['workspace.name'] = {workspaceName:String}) AS commits,
                  (SELECT any(metadata['workspace.path']) FROM spans
                    WHERE ${PROJECT_WINDOW_FILTER}
                      AND metadata['workspace.name'] = {workspaceName:String}
                      AND metadata['workspace.path'] != '') AS workspace_path,
                  (SELECT topKIf(3)(metadata['git.branch'], metadata['git.branch'] != '') FROM spans
                    WHERE ${PROJECT_WINDOW_FILTER}
                      AND metadata['workspace.name'] = {workspaceName:String}) AS top_branches,
                  (SELECT topKIf(1)(tool_name, operation = 'execute_tool' AND tool_name != '') FROM spans
                    WHERE ${PROJECT_WINDOW_FILTER}
                      AND metadata['workspace.name'] = {workspaceName:String}) AS dominant_tool,
                  (SELECT groupArray(path)          FROM files) AS top_file_paths,
                  (SELECT groupArray(touches)       FROM files) AS top_file_touches,
                  (SELECT groupArray(lines_added)   FROM files) AS top_file_lines_added,
                  (SELECT groupArray(lines_removed) FROM files) AS top_file_lines_removed,
                  (SELECT groupArray(reads)         FROM files) AS top_file_reads,
                  (SELECT groupArray(pattern)       FROM commands) AS top_command_patterns,
                  (SELECT groupArray(uses)          FROM commands) AS top_command_counts
              `,
              query_params: { ...projectWindowParams(params), workspaceName: params.workspaceName },
              format: "JSONEachRow",
            })
            const [row] = await result.json<WorkspaceDeepDiveCHRow>()
            const empty: WorkspaceDeepDiveRow = {
              toolCalls: 0,
              sessions: 0,
              commits: 0,
              workspacePath: "",
              topFiles: [],
              topBranches: [],
              topBashCommands: [],
              dominantTool: null,
            }
            if (!row) return empty

            const filePaths = row.top_file_paths ?? []
            const fileTouches = row.top_file_touches ?? []
            const fileAdded = row.top_file_lines_added ?? []
            const fileRemoved = row.top_file_lines_removed ?? []
            const fileReads = row.top_file_reads ?? []
            const topFiles = filePaths.map((path, i) => ({
              path,
              touches: num(fileTouches[i] ?? 0),
              linesAdded: num(fileAdded[i] ?? 0),
              linesRemoved: num(fileRemoved[i] ?? 0),
              reads: num(fileReads[i] ?? 0),
            }))

            const commandPatterns = row.top_command_patterns ?? []
            const commandCounts = row.top_command_counts ?? []
            const topBashCommands = commandPatterns
              .map((pattern, i) => ({ pattern, uses: num(commandCounts[i] ?? 0) }))
              .filter((cmd) => cmd.pattern !== "")

            return {
              toolCalls: num(row.tool_calls),
              sessions: num(row.sessions),
              commits: num(row.commits),
              workspacePath: row.workspace_path ?? "",
              topFiles,
              topBranches: row.top_branches ?? [],
              topBashCommands,
              dominantTool: row.dominant_tool?.[0] ?? null,
            }
          })
          .pipe(Effect.mapError((error) => toRepositoryError(error, "getWorkspaceDeepDive")))
      })

    const getHeatmap: ClaudeCodeSpanReaderShape["getHeatmap"] = (params) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `
                SELECT
                  toDayOfWeek(start_time) AS day_of_week,
                  toHour(start_time)      AS hour_of_day,
                  count()                 AS uses
                FROM spans
                WHERE ${PROJECT_WINDOW_FILTER}
                GROUP BY day_of_week, hour_of_day
              `,
              query_params: projectWindowParams(params),
              format: "JSONEachRow",
            })
            return result.json<HeatmapCHRow>()
          })
          .pipe(
            Effect.map((rows): readonly HeatmapCellRow[] =>
              rows.map((row) => ({
                dayOfWeek: num(row.day_of_week),
                hourOfDay: num(row.hour_of_day),
                uses: num(row.uses),
              })),
            ),
            Effect.mapError((error) => toRepositoryError(error, "getHeatmap")),
          )
      })

    const getBusiestDay: ClaudeCodeSpanReaderShape["getBusiestDay"] = (params) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `
                SELECT
                  toDate(start_time) AS date,
                  count()            AS tool_calls
                FROM spans
                WHERE ${PROJECT_WINDOW_FILTER}
                GROUP BY date
                ORDER BY tool_calls DESC
                LIMIT 1
              `,
              query_params: projectWindowParams(params),
              format: "JSONEachRow",
            })
            const [row] = await result.json<BusiestDayCHRow>()
            if (!row) return null
            return { date: row.date, toolCalls: num(row.tool_calls) } satisfies BusiestDayRow
          })
          .pipe(Effect.mapError((error) => toRepositoryError(error, "getBusiestDay")))
      })

    return {
      listProjectsWithSpansInWindow,
      countSessionsForProjectInWindow,
      getTotalsForProject,
      getSessionDurationStats,
      getLocStats,
      getBiggestWrite,
      getToolMix,
      getTopFiles,
      getTopBashCommands,
      getTopWorkspaces,
      getTopBranches,
      getWorkspaceDeepDive,
      getHeatmap,
      getBusiestDay,
    }
  }),
)
