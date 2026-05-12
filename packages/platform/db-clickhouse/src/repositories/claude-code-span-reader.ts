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
  type BranchRow,
  type BusiestDayRow,
  ClaudeCodeSpanReader,
  type ClaudeCodeSpanReaderShape,
  type FileTouchesRow,
  type HeatmapCellRow,
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
  readonly top_file_paths: readonly string[] | null
  readonly top_branches: readonly string[] | null
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
                  countDistinctIf(metadata['git.repo'],       metadata['git.repo']       != '')       AS repos
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
            }
          })
          .pipe(Effect.mapError((error) => toRepositoryError(error, "getTotalsForProject")))
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
            const result = await client.query({
              query: `
                SELECT
                  count() AS tool_calls,
                  countDistinctIf(session_id, session_id != '') AS sessions,
                  topKIf(3)(
                    JSONExtractString(tool_input, 'file_path'),
                    tool_name IN (${FILE_PATH_TOOLS.map((t) => `'${t}'`).join(",")})
                    AND JSONExtractString(tool_input, 'file_path') != ''
                  ) AS top_file_paths,
                  topKIf(2)(metadata['git.branch'], metadata['git.branch'] != '') AS top_branches,
                  topKIf(1)(tool_name, operation = 'execute_tool' AND tool_name != '') AS dominant_tool
                FROM spans
                WHERE ${PROJECT_WINDOW_FILTER}
                  AND metadata['workspace.name'] = {workspaceName:String}
              `,
              query_params: { ...projectWindowParams(params), workspaceName: params.workspaceName },
              format: "JSONEachRow",
            })
            const [row] = await result.json<WorkspaceDeepDiveCHRow>()
            const empty: WorkspaceDeepDiveRow = {
              toolCalls: 0,
              sessions: 0,
              topFilePaths: [],
              topBranches: [],
              dominantTool: null,
            }
            if (!row) return empty
            return {
              toolCalls: num(row.tool_calls),
              sessions: num(row.sessions),
              topFilePaths: row.top_file_paths ?? [],
              topBranches: row.top_branches ?? [],
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
