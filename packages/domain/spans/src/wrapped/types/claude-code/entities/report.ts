import { organizationIdSchema, projectIdSchema } from "@domain/shared"
import { z } from "zod"

/**
 * Schema versions for the persisted Claude Code Wrapped report.
 *
 * Every persisted row carries a `report_version` integer; the renderer
 * dispatch on both the email and web sides picks the version-scoped
 * component by reading it. When the data shape changes, freeze the
 * existing V1 schema + components and add V2 alongside — old shares stay
 * rendering with their original schema and template.
 *
 * The blob in Postgres is the raw `Report` (no version field embedded);
 * the version metadata lives in the DB column and in this constant.
 */
export const REPORT_VERSIONS = [1, 2] as const
export type ReportVersion = (typeof REPORT_VERSIONS)[number]
export const CURRENT_REPORT_VERSION: ReportVersion = 2

/**
 * Tool-call buckets used by the personality algorithm and the
 * (personality-internal) tool-mix evidence. The standalone tool-mix bar
 * is gone — the percentages live inside the personality reveal.
 *
 * `research` is web-side investigation (WebFetch / WebSearch) and is kept
 * separate from `search` (codebase grep/glob/LS) because the two tell very
 * different stories about how the user worked.
 */
export const TOOL_BUCKETS = ["bash", "read", "edit", "write", "search", "research", "plan", "other"] as const
export type ToolBucket = (typeof TOOL_BUCKETS)[number]

/**
 * Personalities revealed at the end of the email. Assignment is deterministic
 * and pure — see `assignPersonality`. The set leans on conditional behavioural
 * signals (Strategist/Scholar/Consultant/Shipper/Tester) and falls back to a
 * baseline-excess tool-mix winner among Surgeon/Architect/Detective/Conductor.
 */
export const PERSONALITY_KINDS = [
  "strategist",
  "scholar",
  "consultant",
  "shipper",
  "tester",
  "surgeon",
  "architect",
  "detective",
  "conductor",
] as const
export type PersonalityKind = (typeof PERSONALITY_KINDS)[number]

const fileLineSchema = z.object({
  /**
   * Display path — relative to the owning workspace when known, basename
   * otherwise. Never the absolute path (which would leak `/Users/<name>/…`
   * or similar private prefixes).
   */
  displayPath: z.string(),
  /** Distinct tool calls that touched this file (Read, Edit, Write, …). */
  touches: z.number().int().nonnegative(),
  /**
   * Lines Claude added — counted across Edit / MultiEdit / NotebookEdit
   * `new_string` newlines plus Write `content` newlines. The "+N" in the
   * "+N / −M" diff label.
   */
  linesAdded: z.number().int().nonnegative(),
  /** Lines Claude removed (Edit / MultiEdit / NotebookEdit `old_string` newlines). */
  linesRemoved: z.number().int().nonnegative(),
  /** Read / NotebookRead call count — used when there's no diff to show. */
  reads: z.number().int().nonnegative(),
})
export type FileLine = z.infer<typeof fileLineSchema>

const topBashCommandSchema = z.object({
  pattern: z.string(),
  count: z.number().int().nonnegative(),
})
export type TopBashCommand = z.infer<typeof topBashCommandSchema>

const workspaceDeepDiveSchema = z.object({
  name: z.string(),
  toolCalls: z.number().int().nonnegative(),
  sessions: z.number().int().nonnegative(),
  commits: z.number().int().nonnegative(),
  topFiles: z.array(fileLineSchema).max(3),
  topBranches: z.array(z.string()).max(3),
  /** Top bash command prefixes within this workspace (up to 3). */
  topBashCommands: z.array(topBashCommandSchema).max(3),
  dominantTool: z.enum(TOOL_BUCKETS),
})
export type WorkspaceDeepDive = z.infer<typeof workspaceDeepDiveSchema>

const toolMixSchema = z.object({
  bash: z.number().int().nonnegative(),
  read: z.number().int().nonnegative(),
  edit: z.number().int().nonnegative(),
  write: z.number().int().nonnegative(),
  search: z.number().int().nonnegative(),
  research: z.number().int().nonnegative(),
  plan: z.number().int().nonnegative(),
  other: z.number().int().nonnegative(),
})
export type ToolMix = z.infer<typeof toolMixSchema>

const personalitySchema = z.object({
  kind: z.enum(PERSONALITY_KINDS),
  /** 0..1 — how dominant the winning signal was. Used for copy variation. */
  score: z.number().min(0).max(1),
  /** Three short fact strings shown under the archetype card. */
  evidence: z.array(z.string()).length(3),
})
export type Personality = z.infer<typeof personalitySchema>

/**
 * Comparison anchor split into a small muted prefix (e.g. "≈" or "≈ 25% of")
 * and a large accent-coloured noun phrase the email renders with weight
 * (e.g. "the Apollo 11 guidance code").
 */
const locAnchorSchema = z.object({
  prefix: z.string(),
  emphasis: z.string(),
})

const locSchema = z.object({
  /**
   * Total lines that came into existence — Write content + Edit additions
   * + MultiEdit additions. The headline "lines written" number.
   */
  written: z.number().int().nonnegative(),
  /**
   * Total lines Claude read (Read / NotebookRead `tool_output`). Approximate
   * — Read can be partial-file when callers pass `offset` / `limit`.
   */
  read: z.number().int().nonnegative(),
  /** Lines added by Edit / MultiEdit specifically (excludes brand-new Writes). */
  added: z.number().int().nonnegative(),
  /** Lines removed by Edit / MultiEdit. */
  removed: z.number().int().nonnegative(),
  /** Playful comparison anchor for `written`. */
  writtenAnchor: locAnchorSchema,
  /** Playful comparison anchor for `read`. */
  readAnchor: locAnchorSchema,
})
export type LocStats = z.infer<typeof locSchema>

/**
 * V1 data shape for the Claude Code Wrapped report. Every field is a
 * directly-renderable value — no computation happens in the template /
 * web component. Frozen-in-amber when V2 ever ships.
 */
export const reportV1Schema = z.object({
  project: z.object({ id: projectIdSchema, name: z.string(), slug: z.string() }),
  organization: z.object({ id: organizationIdSchema, name: z.string() }),
  // `z.coerce.date()` accepts both real `Date` instances (the producer) and
  // ISO strings (what JSONB → JS gives us back when re-reading the blob).
  window: z.object({ start: z.coerce.date(), end: z.coerce.date() }),

  totals: z.object({
    sessions: z.number().int().nonnegative(),
    toolCalls: z.number().int().nonnegative(),
    durationMs: z.number().int().nonnegative(),
    filesTouched: z.number().int().nonnegative(),
    commandsRun: z.number().int().nonnegative(),
    workspaces: z.number().int().nonnegative(),
    branches: z.number().int().nonnegative(),
    commits: z.number().int().nonnegative(),
    repos: z.number().int().nonnegative(),
    /** Distinct UTC calendar days with at least one Claude Code span. Max 7. */
    streakDays: z.number().int().nonnegative(),
    /** Count of Bash segments that look like a test runner. */
    testsRun: z.number().int().nonnegative(),
    /**
     * Count of git operations that mutate repo state (commit / push / merge
     * / rebase / tag / revert / cherry-pick). Sibling of `commits` (which
     * counts distinct git-commit SHAs from span metadata). Feeds the
     * Shipper archetype.
     */
    gitWriteOps: z.number().int().nonnegative(),
  }),

  toolMix: toolMixSchema,

  loc: locSchema,

  /** The single most-used Bash command prefix this week (null if no bash). */
  topBashCommand: topBashCommandSchema.nullable(),

  workspaceDeepDives: z.array(workspaceDeepDiveSchema).max(3),
  /** Count of workspaces beyond the top-3 shown in deep dives. */
  otherWorkspaceCount: z.number().int().nonnegative(),

  /** 7 rows (Mon..Sun in UTC) × 24 cols (0..23). Values = tool-call counts. */
  heatmap: z.array(z.array(z.number().int().nonnegative()).length(24)).length(7),

  moments: z.object({
    longestSession: z
      .object({
        durationMs: z.number().int().nonnegative(),
        workspace: z.string().nullable(),
      })
      .nullable(),
    busiestDay: z
      .object({
        /** YYYY-MM-DD, UTC. */
        date: z.string(),
        toolCalls: z.number().int().nonnegative(),
      })
      .nullable(),
    biggestWrite: z
      .object({
        /** Basename only — full path is never rendered. */
        displayName: z.string(),
        lines: z.number().int().nonnegative(),
      })
      .nullable(),
  }),

  personality: personalitySchema,
})

export type ReportV1 = z.infer<typeof reportV1Schema>

/**
 * Snapshot of the previous week's headline stats, stored in every V2 blob
 * at generation time so the renderer can display week-over-week deltas
 * without an extra DB round-trip.
 *
 * Every field is nullable — `null` means "not available" for any reason:
 * no previous report exists, or the previous report was V1 (which didn't
 * carry `tokensTotal`). The renderer treats `null` uniformly: no delta
 * badge is shown for that stat.
 */
export const lastReportSchema = z.object({
  sessions: z.number().int().nonnegative().nullable(),
  toolCalls: z.number().int().nonnegative().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  filesTouched: z.number().int().nonnegative().nullable(),
  locWritten: z.number().int().nonnegative().nullable(),
  tokensTotal: z.number().int().nonnegative().nullable(),
})
export type LastReport = z.infer<typeof lastReportSchema>

/**
 * V2 adds:
 *  - `totals.tokensTotal` — sum of `tokens_total` across all LLM spans
 *  - `lastReport` — previous week's headline stats for week-over-week display
 *
 * Shown in both public and member views (no private data in either field).
 * V1 blobs are still validated against `reportV1Schema`; only new runs
 * produce V2 blobs. `reportV1Schema` is frozen.
 */
export const reportV2Schema = reportV1Schema.extend({
  totals: reportV1Schema.shape.totals.extend({
    tokensTotal: z.number().int().nonnegative(),
  }),
  lastReport: lastReportSchema,
})
export type ReportV2 = z.infer<typeof reportV2Schema>

/** Discriminated union across all schema versions. */
export type Report = ReportV1 | ReportV2

/**
 * Maps a persisted `report_version` to the Zod schema that validates its
 * blob on read. Keep the keys aligned with `REPORT_VERSIONS`.
 */
export const SCHEMA_BY_VERSION = {
  1: reportV1Schema,
  2: reportV2Schema,
} as const satisfies Record<ReportVersion, z.ZodTypeAny>
