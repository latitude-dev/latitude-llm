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
 * Tool-name → bucket map. Used for two paths:
 *   1. The non-Bash, non-path-aware classifier branch in `classifyToolMixRow`.
 *   2. Coarse name-only mapping for `dominantTool` on the workspace deep
 *      dive, where the display field is "what kind of tool was most-used
 *      in this workspace" — a per-span path/command analysis would be
 *      overkill for that bit of copy.
 *
 * `Bash` maps to `bash` here for case (2); the per-segment classifier in
 * `classifyBashSegment` is what drives the toolMix shares.
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

const PATH_AWARE_TOOLS = new Set(["Edit", "MultiEdit", "NotebookEdit", "Write", "Read", "NotebookRead"])

// Bash command-prefix routing. Lowercased; the adapter does the lowercase.
const BASH_SEARCH_PREFIXES = new Set(["grep", "rg", "ag", "find", "ls", "tree"])
const BASH_RESEARCH_PREFIXES = new Set(["curl", "wget"])

/**
 * Tokens that look like commands but aren't. Excluded entirely from
 * segment counting so they don't pad `commandsRun` or dominate the
 * top-commands list. Three categories:
 *
 *   - Output shapers (`head`, `tail`, `cat`, `sed`, `awk`, …): almost
 *     always after a `|` to format something else's output, never
 *     standalone work in the Claude Code context.
 *   - Navigation / shell admin (`cd`, `pwd`, `open`, `claude`, …): pure
 *     context changes, no work.
 *   - Bash control-flow keywords (`for`, `while`, `if`, `do`, …): bash
 *     reserved words that surface as a segment prefix when a loop or
 *     conditional starts the segment. Not commands.
 */
const BASH_PLUMBING_PREFIXES = new Set([
  "head",
  "tail",
  "cat",
  "less",
  "more",
  "echo",
  "printf",
  "sed",
  "awk",
  "wc",
  "sort",
  "uniq",
  "cut",
  "tr",
  "xargs",
  "tee",
  "cd",
  "pwd",
  "pushd",
  "popd",
  "clear",
  "exit",
  "open",
  "claude",
  // Bash control-flow keywords. They appear as a segment prefix when a
  // loop or conditional is the start of a chain (`for x in *; do …` etc.)
  // — they're not commands the user "ran." Includes both block-start
  // keywords (`for`, `while`, `if`, `case`) and the after-`;` keywords
  // (`do`, `done`, `then`, `else`, `fi`) for completeness.
  "do",
  "done",
  "if",
  "then",
  "else",
  "elif",
  "fi",
  "for",
  "while",
  "until",
  "case",
  "esac",
  "in",
  "select",
  "function",
])

// git sub-command routing.
const GIT_SEARCH_SUBCOMMANDS = new Set(["status", "log", "diff", "show", "blame", "branch", "ls-files", "reflog"])
const GIT_EXCLUDED_SUBCOMMANDS = new Set(["checkout", "switch", "restore", "config", "init", "remote"])
const GIT_WRITE_SUBCOMMANDS = new Set(["commit", "push", "merge", "rebase", "tag", "revert", "cherry-pick"])

// gh sub-subcommand routing. Keyed on (secondToken, thirdToken). `gh` is
// the only command we look at three deep — its surface (`gh pr create`,
// `gh issue list`, `gh api`) reads more like a 3-level CLI than git's
// 2-level one, and the second token alone (`pr`, `issue`, `release`) is
// too coarse to tell shipping from investigation apart.
const GH_RESEARCH_SECOND_TOKENS = new Set(["issue", "api", "run", "workflow"])
const GH_PR_RESEARCH_SUBCOMMANDS = new Set(["view", "list", "checks", "comment", "diff", "status"])
/**
 * gh write-ops triplets — these increment `gitWriteOps` AND stay in the
 * `bash` bucket. Keyed by (secondToken → set of thirdToken). Anything
 * not enumerated falls through to plain `bash`.
 */
const GH_WRITE_OPS: Record<string, ReadonlySet<string>> = {
  pr: new Set(["create", "merge", "ready", "edit", "review"]),
  release: new Set(["create", "edit", "upload"]),
  repo: new Set(["create"]),
}

/**
 * Pure routing rule for one `ToolMixRow`. Returns the bucket the row counts
 * toward, or `"excluded"` to drop it entirely (so the toolMix denominator
 * isn't padded by navigation/scratch noise). Mirrors the SQL classification
 * in the CH adapter — both live here so unit tests pin the contract.
 */
export const classifyToolMixRow = (row: ToolMixRow): ToolBucket | "excluded" => {
  if (row.toolName === "Bash") {
    return classifyBashSegment(row.bashPrefix, row.bashSecondToken, row.bashThirdToken)
  }
  if (PATH_AWARE_TOOLS.has(row.toolName)) {
    if (row.fileDisposition === "plan-file") return "plan"
    if (row.fileDisposition === "claude-noise" || row.fileDisposition === "external") return "excluded"
    // "workspace" or "" (no file_path on this call) fall through to the
    // tool-name map.
  }
  return TOOL_NAME_TO_BUCKET[row.toolName] ?? "other"
}

const classifyBashSegment = (prefix: string, secondToken: string, thirdToken: string): ToolBucket | "excluded" => {
  if (BASH_PLUMBING_PREFIXES.has(prefix)) return "excluded"
  if (BASH_SEARCH_PREFIXES.has(prefix)) return "search"
  if (BASH_RESEARCH_PREFIXES.has(prefix)) return "research"
  if (prefix === "git") {
    if (GIT_SEARCH_SUBCOMMANDS.has(secondToken)) return "search"
    if (GIT_EXCLUDED_SUBCOMMANDS.has(secondToken)) return "excluded"
    // Including GIT_WRITE_SUBCOMMANDS, GIT_NEUTRAL (add/rm/mv/stash/pull/…)
    // and unknown subcommands — stays in `bash` (genuine shell orchestration).
  }
  if (prefix === "gh") {
    // Read-side gh hits api.github.com, mirroring curl / wget — research.
    if (GH_RESEARCH_SECOND_TOKENS.has(secondToken)) return "research"
    if (secondToken === "pr" && GH_PR_RESEARCH_SUBCOMMANDS.has(thirdToken)) return "research"
    // Everything else under gh stays in `bash` — including the write-ops
    // triplets (which also feed `gitWriteOps`), `gh auth` / `gh config`,
    // and `gh repo view` / `gh repo clone`.
  }
  return "bash"
}

/**
 * True if a token should be skipped when looking for the meaningful
 * subcommand keyword inside a Bash segment. Mirrors the SQL
 * `FLAG_LIKE_TOKEN_PREDICATE` in the CH adapter — both files must move
 * in lockstep.
 *
 *   `-flag` / `--flag`         : POSIX / GNU CLI flags
 *   tokens starting with `@`   : pnpm / npm / yarn scoped package args
 *   tokens containing `/`      : absolute paths (`/Users/.../repo`),
 *                                relative paths (`./scripts/x`), and
 *                                `owner/repo`-style slugs (`gh -R x/y …`)
 *   tokens starting with `.`   : relative paths without `/` (`./bin`)
 *   tokens containing `=`      : `--key=value` syntax
 *   purely numeric tokens      : counts / indices (`head -n 50`)
 *
 * Subcommands are by convention single bare keywords (`status`, `create`,
 * `install`, `build`), so none of these patterns produce false positives
 * in practice.
 */
const isFlagLikeToken = (t: string): boolean => {
  if (t === "") return true
  const c = t.charAt(0)
  if (c === "-" || c === "@" || c === ".") return true
  if (t.includes("/")) return true
  if (t.includes("=")) return true
  if (/^\d+$/.test(t)) return true
  return false
}

interface BashTokens {
  readonly prefix: string
  readonly secondToken: string
  readonly thirdToken: string
}

/**
 * Extracts `(prefix, secondToken, thirdToken)` from a Bash command
 * segment using the same flag-skipping rule the CH adapter applies. The
 * adapter SQL must stay in lockstep with this function; tests against
 * this function effectively validate the SQL by proxy.
 *
 * - `prefix` is the literal first whitespace token, lowercased. NOT
 *   filtered, so a script invocation like `./scripts/build.sh` keeps its
 *   leading `.` and is treated as the command name.
 * - `secondToken` is the **first non-flag** token after the prefix.
 * - `thirdToken` is the **second non-flag** token after the prefix.
 *
 * Examples (see `build-report.test.ts` for the full grid):
 *
 *   `git -C /path status -s`            → (git, status, "")
 *   `gh -R owner/repo pr create --t x`  → (gh, pr, create)
 *   `pnpm --filter @domain/spans test`  → (pnpm, test, "")
 *   `git --version`                     → (git, "", "")
 *   `head -n 50 foo.log`                → (head, foo.log, "")
 */
/**
 * Splits a raw Bash command string on its `&&` / `||` chain operators
 * and returns the trimmed, non-empty segments. Mirrors
 * `BASH_SEGMENT_REGEX` in the CH adapter — both must stay in lockstep,
 * and tests against this function effectively pin the splitter contract.
 *
 * Deliberately does NOT split on `|` or `;`:
 *   - `|` appears constantly inside grep / sed regex alternations
 *     (`grep "foo\|bar"`), shell pipes for plumbing, and quoted strings.
 *   - `;` appears inside SQL statements and shell loop bodies.
 *
 * Subshells (`$(…)`, backticks) are NOT handled — splits inside them
 * would still happen if `&&` / `||` appeared there literally. Rare
 * enough that the regex approach is good enough.
 */
export const splitBashSegments = (command: string): readonly string[] =>
  command
    .split(/\s*(?:&&|\|\|)\s*/)
    .map((s) => s.trim())
    .filter((s) => s !== "")

export const extractBashTokens = (segment: string): BashTokens => {
  // Normalise before tokenising:
  //   1. Strip bash line continuations (`\<NEWLINE>`) — a multi-line
  //      command like `foo bar \<NL>  echo continued` would otherwise
  //      tokenise as `foo`, `bar`, `\<NL>`, `echo`, `continued`, and the
  //      `\<NL>` token becomes a junk "command" in the top-commands
  //      display ("\ echo").
  //   2. Collapse any whitespace run (spaces, tabs, leftover newlines)
  //      to a single space so `splitByChar(' ', …)` produces clean
  //      tokens with no empty entries.
  const normalised = segment.replace(/\\\n/g, " ").replace(/\s+/g, " ").trim()
  if (normalised === "") return { prefix: "", secondToken: "", thirdToken: "" }
  const tokens = normalised.split(" ")
  const prefix = (tokens[0] ?? "").toLowerCase()
  const meaningful = tokens.slice(1).filter((t) => !isFlagLikeToken(t))
  return {
    prefix,
    secondToken: (meaningful[0] ?? "").toLowerCase(),
    thirdToken: (meaningful[1] ?? "").toLowerCase(),
  }
}

/**
 * True when this row's command segment increments `gitWriteOps`. Covers
 * both raw `git` write-subcommands and the `gh` write-op triplets
 * (`gh pr create`, `gh release upload`, `gh repo create`, …). Name stays
 * `gitWriteOps`-flavoured even though it includes `gh` because the
 * persisted field is named that way and a rename would force a schema
 * migration for no behavioural gain.
 */
export const isGitWriteSegment = (row: ToolMixRow): boolean => {
  if (row.toolName !== "Bash") return false
  if (row.bashPrefix === "git") {
    return GIT_WRITE_SUBCOMMANDS.has(row.bashSecondToken)
  }
  if (row.bashPrefix === "gh") {
    return GH_WRITE_OPS[row.bashSecondToken]?.has(row.bashThirdToken) === true
  }
  return false
}

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
    const bucket = classifyToolMixRow(row)
    if (bucket === "excluded") continue
    mix[bucket] += row.uses
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
    gitWriteOps: input.totals.gitWriteOps,
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
      gitWriteOps: input.totals.gitWriteOps,
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
