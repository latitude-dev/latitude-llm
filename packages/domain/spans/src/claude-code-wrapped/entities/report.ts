import { organizationIdSchema, projectIdSchema } from "@domain/shared"
import { z } from "zod"

/**
 * Tool-call buckets used by the personality algorithm and the
 * (personality-internal) tool-mix evidence. The standalone tool-mix bar
 * is gone — the percentages live inside the personality reveal.
 */
export const TOOL_BUCKETS = ["bash", "read", "edit", "write", "search", "plan", "other"] as const
export type ToolBucket = (typeof TOOL_BUCKETS)[number]

/**
 * The six personalities revealed at the end of the email. Assignment is
 * deterministic and pure — see `assignPersonality`.
 */
export const PERSONALITY_KINDS = ["surgeon", "architect", "detective", "conductor", "marathoner", "strategist"] as const
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
  writtenAnchor: z.string(),
  /** Playful comparison anchor for `read`. */
  readAnchor: z.string(),
})
export type LocStats = z.infer<typeof locSchema>

/**
 * Data shape passed to the Claude Code Wrapped email template. Every field is
 * a directly-renderable value — no computation happens in the template.
 */
export const reportSchema = z.object({
  project: z.object({ id: projectIdSchema, name: z.string(), slug: z.string() }),
  organization: z.object({ id: organizationIdSchema, name: z.string() }),
  window: z.object({ start: z.date(), end: z.date() }),

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
    /** Count of Bash invocations that look like a test runner. */
    testsRun: z.number().int().nonnegative(),
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

export type Report = z.infer<typeof reportSchema>
