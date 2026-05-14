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

// SQL list literal for the path-aware tool set — `Read`/`Edit`/`Write` plus
// the two notebook variants. Used by every query that filters or routes on
// file path.
const FILE_PATH_TOOLS_SQL = FILE_PATH_TOOLS.map((t) => `'${t}'`).join(",")
const PATH_AWARE_TOOLS_SQL = `('Edit','MultiEdit','NotebookEdit','Write','Read','NotebookRead')`

// Splits a Bash command string into its `&&` / `||`-separated segments.
//
// We deliberately do NOT split on `|` or `;`:
//   - `|` appears constantly inside grep / sed regex alternations
//     (`grep "foo\|bar"`), shell pipes for plumbing (`… | tail`), and
//     quoted strings. Splitting on it produced junk segments like
//     `api[_-]key\` and `BUILD)"` from quote-broken content.
//   - `;` appears inside SQL strings (`psql -c "INSERT …; UPDATE …;"`)
//     and shell loop bodies (`for x in *; do …; done`). Splitting on it
//     produced segments starting with `set(evals_sched)` or `do`.
//
// Cost: piped-after commands and bare-`;`-chained commands don't get
// their own segment. In practice the RHS of a pipe is almost always a
// plumbing tool (`| tail`, `| grep`, `| wc`) we already exclude, and
// Claude rarely uses bare `;` for chaining (it uses `&&`). So the net
// change to `commandsRun` and bucket counts is small, and the
// junk-token elimination is worth far more.
//
// Subshells (`$(…)`, backticks) are still not handled — proper handling
// would need a real shell tokeniser, not worth it.
const BASH_SEGMENT_REGEX = "\\\\s*(?:&&|\\\\|\\\\|)\\\\s*"

// Path classifier used by every query that has to decide whether a file
// touch counts. Mirrors the TS `classifyToolMixRow` rules in
// `@domain/spans/.../build-report.ts` — both must move in lockstep.
//
//   plan-file:    `**/.claude/plans/<id>.md`            → routes to `plan`
//   claude-noise: any other path under `**/.claude/**`  → excluded
//   external:     outside the workspace root            → excluded
//   workspace:    inside the workspace                  → existing bucket
//   "":           the call carries no `file_path`       → existing bucket
//
// Empty string is the "no file_path" case (LS / a Read with `offset`
// only / a malformed input) — the call still counts toward the existing
// tool-name bucket; only path-bearing calls can be excluded by path.
const filePathDispositionSql = (workspacePathExpr: string, filePathExpr: string): string => `
  multiIf(
    ${filePathExpr} = '', '',
    match(${filePathExpr}, '/\\\\.claude/plans/[^/]+\\\\.md$'), 'plan-file',
    positionUTF8(${filePathExpr}, '/.claude/') > 0, 'claude-noise',
    ${workspacePathExpr} != '' AND NOT startsWith(${filePathExpr}, ${workspacePathExpr}), 'external',
    'workspace'
  )
`

/**
 * Lenient predicate — keeps anything that represents "real iteration this
 * week" regardless of which workspace it happened in. Used for the
 * *headline* LOC / file-touch counters that are presented at the project
 * level ("Lines written: 14,832"). Includes plan-mode files because
 * iterating on a plan is genuine writing work.
 *
 *   workspace files     ✓ count
 *   .claude/plans/*.md  ✓ count (real iteration)
 *   other .claude/**    ✗ excluded (config / history noise)
 *   external scratch    ✗ excluded (not part of this project's week)
 *
 * `file_path = ''` is allowed defensively — the path-aware tools always
 * carry a `file_path`, but if a malformed input ever lands the row's line
 * counts still aggregate.
 */
const loCountablePathPredicate = (workspacePathExpr: string, filePathExpr: string): string => `
  (
    ${filePathExpr} = ''
    OR match(${filePathExpr}, '/\\\\.claude/plans/[^/]+\\\\.md$')
    OR (
      positionUTF8(${filePathExpr}, '/.claude/') = 0
      AND ${workspacePathExpr} != ''
      AND startsWith(${filePathExpr}, ${workspacePathExpr})
    )
  )
`

/**
 * Strict predicate — keeps only file_paths that sit inside the span's own
 * `workspace.path`. Used for the *workspace-specific* views (top files
 * per workspace, "biggest write" display, "mostly X" dominant-tool
 * inference). Plan files are explicitly excluded — they're not part of
 * any project's source tree.
 *
 * Requires `workspace.path` to be present; an empty workspace path makes
 * the span ambiguous as to "what counts as inside" and we err on the
 * side of excluding rather than allowing.
 */
const workspaceStrictPathPredicate = (workspacePathExpr: string, filePathExpr: string): string => `
  (
    positionUTF8(${filePathExpr}, '/.claude/') = 0
    AND ${workspacePathExpr} != ''
    AND startsWith(${filePathExpr}, ${workspacePathExpr})
  )
`

// SQL list literals for the Bash sub-classification. Lowercased.
const GIT_WRITE_SUBCOMMANDS_SQL = `('commit','push','merge','rebase','tag','revert','cherry-pick')`

/**
 * Tokens that look like commands but aren't. Excluded from segment
 * counting so they don't pollute `commandsRun` or dominate the
 * top-commands list. Three groups: output shapers, navigation, and bash
 * control-flow keywords. Mirrors `BASH_PLUMBING_PREFIXES` in
 * `build-report.ts` — these two lists must stay in lockstep.
 */
const BASH_PLUMBING_PREFIXES_SQL = `(
  -- output shapers (almost always after a pipe)
  'head','tail','cat','less','more',
  'echo','printf','sed','awk','wc','sort','uniq','cut','tr','xargs','tee',
  -- navigation / shell admin
  'cd','pwd','pushd','popd','clear','exit','open','claude',
  -- bash control-flow keywords (loop/conditional bodies)
  'do','done','if','then','else','elif','fi','for','while','until','case','esac','in','select','function'
)`

/**
 * Generic investigation tools — route to the `search` bucket for personality
 * purposes (a heavy grepper is a Detective) but are filtered out of the
 * top-commands display. The display is reserved for shell orchestration
 * the user actually drove; investigation is summarised by the `search`
 * bucket's share.
 */
const BASH_SEARCH_PREFIXES_SQL = `('grep','rg','ag','find','ls','tree')`

/**
 * Git sub-commands that don't route to `bash` (i.e. `git status` /
 * `log` / `diff` etc. → `search`; `git checkout` / `switch` etc. →
 * `excluded`). Used by the top-commands display filter to keep only
 * segments that route to `bash` or `research`.
 */
const GIT_NON_BASH_SUBCOMMANDS_SQL = `(
  'status','log','diff','show','blame','branch','ls-files','reflog',
  'checkout','switch','restore','config','init','remote'
)`

/**
 * Normalises a Bash command segment before tokenisation:
 *   1. Replace `\\<NEWLINE>` (literal backslash + newline) with a single
 *      space — multi-line bash continuations would otherwise tokenise
 *      as `\\<NL>` and surface as junk "commands" in the display.
 *   2. Collapse any whitespace run (spaces, tabs, leftover newlines) to
 *      a single space so \`splitByChar(' ', …)\` produces clean tokens.
 *   3. Trim leading/trailing whitespace.
 *
 * Mirrors the JS normalisation in \`extractBashTokens\` (build-report.ts).
 */
const normalizeSegmentSql = (segmentExpr: string): string =>
  `trim(replaceRegexpAll(replaceAll(${segmentExpr}, '\\\\\\n', ' '), '\\\\s+', ' '))`

/**
 * gh sub-subcommand triplets that count as shipping write-ops (they
 * increment `gitWriteOps` alongside the raw git write-subcommands).
 * Encoded as a SQL OR predicate so the same expression can be reused
 * across the totals query and any future per-segment aggregation.
 */
const GH_WRITE_OPS_PREDICATE = `(
  (second_token = 'pr'      AND third_token IN ('create','merge','ready','edit','review'))
  OR (second_token = 'release' AND third_token IN ('create','edit','upload'))
  OR (second_token = 'repo'    AND third_token = 'create')
)`

/**
 * Prefixes for which the "top commands" surface should display
 * `prefix + first-non-flag-token` instead of just `prefix`. `git push` is
 * a meaningfully different story from `git status`; `pnpm test` is
 * different from `pnpm install`. For most tools, the first token is
 * descriptive enough.
 *
 * `gh` gets two-deep treatment (handled separately) because its CLI is
 * structurally 3-level (`gh pr create` vs `gh pr view`).
 */
const SUBCOMMAND_AWARE_PREFIXES_SQL = `(
  'git','pnpm','npm','yarn','bun','cargo','brew','docker','kubectl',
  'mix','rake','gradle','mvn','go','poetry','pipx','terraform',
  'fly','railway','vercel'
)`

/**
 * SQL expression that takes a tokens array (from `splitByChar(' ',
 * segment)`) and the prefix, and emits the displayable pattern:
 *
 *   - empty if the prefix is in the plumbing set (filtered out upstream
 *     of this helper, but defended in depth here too)
 *   - `prefix subcommand` for known multi-action prefixes — `subcommand`
 *     is the first non-flag-like token after the prefix
 *   - `gh second third` for `gh` — both sub and sub-sub, again skipping
 *     flag-like tokens
 *   - just `prefix` otherwise
 *
 * "Flag-like" token = starts with `-`, `@`, `/`, or `.`, or contains `=`,
 * or is purely numeric. These are CLI flag syntax / scoped-package args
 * / paths / counts — none of them are subcommand keywords.
 *
 * Built with `arrayFirst` over `arraySlice` to walk tokens.
 */
/**
 * Mirrors `isFlagLikeToken` in `@domain/spans/.../build-report.ts` — both
 * must stay in lockstep. Skips:
 *   `-flag` / `--flag`         : CLI flags
 *   `@scope/...`               : scoped package args
 *   any `/`-containing token   : paths AND `owner/repo`-style slugs
 *                                 (`gh -R owner/repo …` would otherwise
 *                                 have `owner/repo` survive as the
 *                                 "subcommand")
 *   `.foo`                     : relative paths without `/`
 *   `key=value`                : `--key=value` syntax
 *   purely numeric             : counts (`head -n 50`)
 */
const FLAG_LIKE_TOKEN_PREDICATE = `(t = ''
  OR startsWith(t, '-')
  OR startsWith(t, '@')
  OR startsWith(t, '.')
  OR position(t, '/') > 0
  OR position(t, '=') > 0
  OR match(t, '^[0-9]+$'))`

const subcommandAwarePatternSql = (segmentExpr: string): string => {
  // Each branch needs the normalised segment, its first token (prefix),
  // and the first non-flag token after the prefix (the subcommand
  // candidate). Substitute these once so the multiIf body stays readable.
  const norm = normalizeSegmentSql(segmentExpr)
  const prefix = `lowerUTF8(splitByChar(' ', ${norm})[1])`
  const firstNonFlagAfterPrefix = `coalesce(arrayFirst(t -> NOT ${FLAG_LIKE_TOKEN_PREDICATE},
                                                       arraySlice(splitByChar(' ', ${norm}), 2)), '')`
  const secondNonFlagAfterPrefix = `coalesce(arrayFirst(t -> NOT ${FLAG_LIKE_TOKEN_PREDICATE},
                                                        arraySlice(splitByChar(' ', ${norm}),
                                                                   indexOf(splitByChar(' ', ${norm}),
                                                                           arrayFirst(t -> NOT ${FLAG_LIKE_TOKEN_PREDICATE},
                                                                                      arraySlice(splitByChar(' ', ${norm}), 2))) + 1)), '')`
  return `
    multiIf(
      -- Plumbing prefixes → empty (no displayable pattern at all).
      ${prefix} IN ${BASH_PLUMBING_PREFIXES_SQL}, '',

      -- Search prefixes → empty. Option C: top-commands shows only
      -- segments routing to \`bash\` or \`research\`; investigation
      -- tools (grep / ls / find / …) are summarised by the search
      -- bucket's share in the personality, not by surfacing each
      -- command in the display.
      ${prefix} IN ${BASH_SEARCH_PREFIXES_SQL}, '',

      -- Git non-bash subcommands → empty. \`git status\` / \`git log\`
      -- / \`git diff\` etc. are search; \`git checkout\` / \`switch\`
      -- etc. are excluded. Either way they don't belong in the
      -- top-commands display.
      ${prefix} = 'git' AND lowerUTF8(${firstNonFlagAfterPrefix}) IN ${GIT_NON_BASH_SUBCOMMANDS_SQL}, '',

      -- gh: two-deep extraction (\`gh pr create\` is meaningfully
      -- different from \`gh pr view\`). All gh segments are kept
      -- because they route to either \`bash\` (write-ops + auth/config)
      -- or \`research\` (read-side) — both allowed under Option C.
      ${prefix} = 'gh',
      arrayStringConcat(
        arrayFilter(p -> p != '',
          [
            'gh',
            ${firstNonFlagAfterPrefix},
            ${secondNonFlagAfterPrefix}
          ]),
        ' '
      ),

      -- 1-deep extraction for the known multi-action prefixes.
      ${prefix} IN ${SUBCOMMAND_AWARE_PREFIXES_SQL},
      arrayStringConcat(
        arrayFilter(p -> p != '',
          [
            splitByChar(' ', ${norm})[1],
            ${firstNonFlagAfterPrefix}
          ]),
        ' '
      ),

      -- Default: just the first token.
      splitByChar(' ', ${norm})[1]
    )
  `
}

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
  readonly git_write_ops: number | string
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
  readonly file_disposition: string
  readonly bash_prefix: string
  readonly bash_second_token: string
  readonly bash_third_token: string
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
            // `commands_run`, `tests_run` and `git_write_ops` derive from
            // *Bash segments* (so `cd foo && grep bar && git push` counts
            // as three segments — one navigation, one search, one push).
            // The bash_segments CTE explodes each Bash tool call into its
            // operator-split segments; the outer query joins the segment
            // counters in with the rest of the per-span aggregates.
            const result = await client.query({
              query: `
                WITH bash_segments AS (
                  -- second_token / third_token use flag-skipping so
                  -- \`git -C /path status -s\` matches the git_write_ops
                  -- predicate correctly (second_token = "status", not
                  -- the literal "-c"). Segment normalisation strips
                  -- line continuations and collapses whitespace before
                  -- tokenising. Mirrors extractBashTokens in
                  -- build-report.ts.
                  SELECT
                    lowerUTF8(splitByChar(' ', ${normalizeSegmentSql("segment")})[1])               AS prefix,
                    lowerUTF8(arrayElement(
                      arrayFilter(t -> NOT ${FLAG_LIKE_TOKEN_PREDICATE},
                                  arraySlice(splitByChar(' ', ${normalizeSegmentSql("segment")}), 2)),
                      1
                    ))                                                                              AS second_token,
                    lowerUTF8(arrayElement(
                      arrayFilter(t -> NOT ${FLAG_LIKE_TOKEN_PREDICATE},
                                  arraySlice(splitByChar(' ', ${normalizeSegmentSql("segment")}), 2)),
                      2
                    ))                                                                              AS third_token,
                    segment
                  FROM spans
                  ARRAY JOIN splitByRegexp('${BASH_SEGMENT_REGEX}',
                                            JSONExtractString(tool_input, 'command')) AS segment
                  WHERE ${PROJECT_WINDOW_FILTER}
                    AND tool_name = 'Bash'
                    AND segment != ''
                )
                SELECT
                  countDistinctIf(session_id, session_id != '')                                       AS sessions,
                  countIf(operation = 'execute_tool')                                                 AS tool_calls,
                  countDistinctIf(
                    JSONExtractString(tool_input, 'file_path'),
                    tool_name IN (${FILE_PATH_TOOLS_SQL})
                    AND JSONExtractString(tool_input, 'file_path') != ''
                    AND ${loCountablePathPredicate("metadata['workspace.path']", "JSONExtractString(tool_input, 'file_path')")}
                  )                                                                                   AS files_touched,
                  -- "Commands run" excludes pure plumbing (head/tail/echo/sed/…
                  -- and navigation cd/pwd/open/…). These are never standalone
                  -- work; they'd inflate the headline number without telling
                  -- a story.
                  (SELECT countIf(prefix NOT IN ${BASH_PLUMBING_PREFIXES_SQL})
                    FROM bash_segments)                                                               AS commands_run,
                  countDistinctIf(metadata['workspace.name'], metadata['workspace.name'] != '')       AS workspaces,
                  countDistinctIf(metadata['git.branch'],     metadata['git.branch']     != '')       AS branches,
                  countDistinctIf(metadata['git.commit'],     metadata['git.commit']     != '')       AS commits,
                  countDistinctIf(metadata['git.repo'],       metadata['git.repo']       != '')       AS repos,
                  uniqExact(toDate(start_time))                                                       AS streak_days,
                  (SELECT countIf(match(segment,
                      '(?i)(^|\\\\s)(test(\\\\s|:|$)|pytest|vitest|jest|mocha|rspec)'))
                    FROM bash_segments)                                                               AS tests_run,
                  -- Both git write-subcommands AND gh write-op triplets feed
                  -- gitWriteOps. The persisted field name stays gitWriteOps
                  -- (no schema migration) even though gh is now included.
                  (SELECT countIf(
                    (prefix = 'git' AND second_token IN ${GIT_WRITE_SUBCOMMANDS_SQL})
                    OR (prefix = 'gh' AND ${GH_WRITE_OPS_PREDICATE})
                  ) FROM bash_segments)                                                               AS git_write_ops
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
              gitWriteOps: 0,
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
              gitWriteOps: num(row.git_write_ops),
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
            //
            // These are the *headline* LOC counters — they include
            // plan-mode iterations (`~/.claude/plans/*.md` edits) because
            // those are real lines you wrote this week, while still
            // excluding `.claude/` config noise and out-of-workspace
            // scratch.
            const result = await client.query({
              query: `
                SELECT
                  sumIf(countSubstrings(JSONExtractString(tool_input, 'content'),    '\\n'),
                        tool_name = 'Write'
                        AND ${loCountablePathPredicate("metadata['workspace.path']", "JSONExtractString(tool_input, 'file_path')")})
                                                                                       AS write_lines,
                  sumIf(countSubstrings(JSONExtractString(tool_input, 'new_string'), '\\n'),
                        tool_name IN ('Edit', 'NotebookEdit')
                        AND ${loCountablePathPredicate("metadata['workspace.path']", "JSONExtractString(tool_input, 'file_path')")})
                                                                                       AS edit_added,
                  sumIf(countSubstrings(JSONExtractString(tool_input, 'old_string'), '\\n'),
                        tool_name IN ('Edit', 'NotebookEdit')
                        AND ${loCountablePathPredicate("metadata['workspace.path']", "JSONExtractString(tool_input, 'file_path')")})
                                                                                       AS edit_removed,
                  sumIf(arraySum(arrayMap(
                          x -> countSubstrings(JSONExtractString(x, 'new_string'), '\\n'),
                          JSONExtractArrayRaw(tool_input, 'edits')
                        )), tool_name = 'MultiEdit'
                        AND ${loCountablePathPredicate("metadata['workspace.path']", "JSONExtractString(tool_input, 'file_path')")})
                                                                                       AS multiedit_added,
                  sumIf(arraySum(arrayMap(
                          x -> countSubstrings(JSONExtractString(x, 'old_string'), '\\n'),
                          JSONExtractArrayRaw(tool_input, 'edits')
                        )), tool_name = 'MultiEdit'
                        AND ${loCountablePathPredicate("metadata['workspace.path']", "JSONExtractString(tool_input, 'file_path')")})
                                                                                       AS multiedit_removed,
                  sumIf(countSubstrings(tool_output, '\\n'),
                        tool_name IN ('Read', 'NotebookRead')
                        AND ${loCountablePathPredicate("metadata['workspace.path']", "JSONExtractString(tool_input, 'file_path')")})
                                                                                       AS read_lines
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
                  AND ${workspaceStrictPathPredicate("metadata['workspace.path']", "JSONExtractString(tool_input, 'file_path')")}
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
            // The query unions two row sources:
            //
            //   1. Non-Bash tool calls — one row each, with a path
            //      disposition tag for the path-aware tools (Read / Edit /
            //      Write / NotebookEdit / NotebookRead / MultiEdit). The
            //      domain-side classifier in `build-report.ts` uses the
            //      disposition to route `.claude/plans/*.md` edits to the
            //      `plan` bucket and drop `.claude/**` config + scratch
            //      paths entirely.
            //
            //   2. Bash command *segments* — every Bash tool call is
            //      exploded on `&&` / `||` / `;` / `|`, each segment's
            //      first two tokens are lowercased, and the row carries
            //      `(bash_prefix, bash_second_token)`. The classifier
            //      routes by prefix (`grep` → search, `cat` → read, etc.)
            //      and `git`-by-subcommand (`git status` → search,
            //      `git push` → bash, `git checkout` → excluded).
            //
            // GROUP BY collapses repeats so the wire payload stays
            // bounded; cardinality is bounded by tool names × distinct
            // first-two-token pairs in user Bash + 4 disposition values.
            const result = await client.query({
              query: `
                SELECT tool_name, file_disposition, bash_prefix, bash_second_token, bash_third_token, count() AS uses
                FROM (
                  SELECT
                    tool_name,
                    ${filePathDispositionSql("metadata['workspace.path']", "JSONExtractString(tool_input, 'file_path')")} AS file_disposition,
                    ''  AS bash_prefix,
                    ''  AS bash_second_token,
                    ''  AS bash_third_token
                  FROM spans
                  WHERE ${PROJECT_WINDOW_FILTER}
                    AND operation = 'execute_tool'
                    AND tool_name != ''
                    AND tool_name != 'Bash'

                  UNION ALL

                  -- Bash second/third tokens use flag-skipping (same rule
                  -- as the display layer): filter out flag-like tokens
                  -- (-flag, paths, scopes, k=v, numerics) from the
                  -- post-prefix slice, then take the 1st / 2nd of what
                  -- remains. So \`git -C /path status -s\` produces
                  -- (git, status, "") and \`gh -R owner/repo pr create\`
                  -- produces (gh, pr, create). Segment normalisation
                  -- strips line continuations + collapses whitespace
                  -- first so multi-line bash commands tokenise cleanly.
                  -- Mirrors \`extractBashTokens\` in build-report.ts.
                  SELECT
                    'Bash' AS tool_name,
                    ''     AS file_disposition,
                    lowerUTF8(splitByChar(' ', ${normalizeSegmentSql("segment")})[1])               AS bash_prefix,
                    lowerUTF8(arrayElement(
                      arrayFilter(t -> NOT ${FLAG_LIKE_TOKEN_PREDICATE},
                                  arraySlice(splitByChar(' ', ${normalizeSegmentSql("segment")}), 2)),
                      1
                    ))                                                                              AS bash_second_token,
                    lowerUTF8(arrayElement(
                      arrayFilter(t -> NOT ${FLAG_LIKE_TOKEN_PREDICATE},
                                  arraySlice(splitByChar(' ', ${normalizeSegmentSql("segment")}), 2)),
                      2
                    ))                                                                              AS bash_third_token
                  FROM spans
                  ARRAY JOIN splitByRegexp('${BASH_SEGMENT_REGEX}',
                                            JSONExtractString(tool_input, 'command')) AS segment
                  WHERE ${PROJECT_WINDOW_FILTER}
                    AND tool_name = 'Bash'
                    AND segment != ''
                )
                GROUP BY tool_name, file_disposition, bash_prefix, bash_second_token, bash_third_token
              `,
              query_params: projectWindowParams(params),
              format: "JSONEachRow",
            })
            return result.json<ToolMixCHRow>()
          })
          .pipe(
            Effect.map((rows): readonly ToolMixRow[] =>
              rows.map((row) => ({
                toolName: row.tool_name,
                fileDisposition: (row.file_disposition || "") as ToolMixRow["fileDisposition"],
                bashPrefix: row.bash_prefix,
                bashSecondToken: row.bash_second_token,
                bashThirdToken: row.bash_third_token,
                uses: num(row.uses),
              })),
            ),
            Effect.mapError((error) => toRepositoryError(error, "getToolMix")),
          )
      })

    const getTopFiles: ClaudeCodeSpanReaderShape["getTopFiles"] = (params) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        return yield* chSqlClient
          .query(async (client) => {
            // Excludes `.claude/**` and out-of-workspace paths — the
            // "top files" table reflects *this project's* hot files only,
            // so a Read against `/Users/x/notes.md` or an Edit on
            // `.claude/settings.local.json` doesn't crowd the list.
            const result = await client.query({
              query: `
                SELECT
                  JSONExtractString(tool_input, 'file_path') AS path,
                  count() AS touches
                FROM spans
                WHERE ${PROJECT_WINDOW_FILTER}
                  AND tool_name IN (${FILE_PATH_TOOLS_SQL})
                  AND JSONExtractString(tool_input, 'file_path') != ''
                  AND ${workspaceStrictPathPredicate("metadata['workspace.path']", "JSONExtractString(tool_input, 'file_path')")}
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
            // Counts command segments (a chained `cd foo && grep bar`
            // contributes a `cd` and a `grep`). Plumbing prefixes
            // (tail/head/echo/sed/…) are excluded so the list reflects
            // intentional work. For multi-action prefixes (git, pnpm,
            // gh, …) the pattern is `prefix subcommand` instead of just
            // the prefix — `git push` and `git status` show distinctly.
            const result = await client.query({
              query: `
                SELECT pattern, count() AS uses
                FROM (
                  SELECT ${subcommandAwarePatternSql("segment")} AS pattern
                  FROM spans
                  ARRAY JOIN splitByRegexp('${BASH_SEGMENT_REGEX}',
                                            JSONExtractString(tool_input, 'command')) AS segment
                  WHERE ${PROJECT_WINDOW_FILTER}
                    AND tool_name = 'Bash'
                    AND segment != ''
                )
                WHERE pattern != ''
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
                    AND tool_name IN ${PATH_AWARE_TOOLS_SQL}
                    AND JSONExtractString(tool_input, 'file_path') != ''
                    AND ${workspaceStrictPathPredicate("metadata['workspace.path']", "JSONExtractString(tool_input, 'file_path')")}
                  GROUP BY path
                  ORDER BY touches DESC
                  LIMIT 3
                ),
                commands AS (
                  SELECT pattern, count() AS uses
                  FROM (
                    SELECT ${subcommandAwarePatternSql("segment")} AS pattern
                    FROM spans
                    ARRAY JOIN splitByRegexp('${BASH_SEGMENT_REGEX}',
                                              JSONExtractString(tool_input, 'command')) AS segment
                    WHERE ${PROJECT_WINDOW_FILTER}
                      AND metadata['workspace.name'] = {workspaceName:String}
                      AND tool_name = 'Bash'
                      AND segment != ''
                  )
                  WHERE pattern != ''
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
                  -- "Mostly X" descriptor. Path-aware tools (Read/Edit/Write/…)
                  -- only count when their file_path is inside the workspace
                  -- path — an Edit targeting a sibling project shouldn't make
                  -- you look like an "Edit-mostly" user *in this workspace*.
                  -- Non-path-aware tools (Bash/Grep/Glob/TaskCreate/…) carry
                  -- no file_path and count as-is.
                  (SELECT topKIf(1)(tool_name,
                    operation = 'execute_tool'
                    AND tool_name != ''
                    AND (
                      tool_name NOT IN ${PATH_AWARE_TOOLS_SQL}
                      OR (
                        JSONExtractString(tool_input, 'file_path') != ''
                        AND ${workspaceStrictPathPredicate("metadata['workspace.path']", "JSONExtractString(tool_input, 'file_path')")}
                      )
                    )
                  ) FROM spans
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
