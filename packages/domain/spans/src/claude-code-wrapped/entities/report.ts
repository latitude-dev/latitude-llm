import { organizationIdSchema, projectIdSchema } from "@domain/shared"
import { z } from "zod"

/**
 * Tool-call buckets used by the tool-mix bar and the personality algorithm.
 * Each Claude Code tool span's `tool_name` is bucketed into exactly one of
 * these (see `toolBucketFor` in the build-report use case).
 */
export const TOOL_BUCKETS = ["bash", "read", "edit", "write", "search", "plan", "other"] as const
export type ToolBucket = (typeof TOOL_BUCKETS)[number]

/**
 * The six personalities revealed at the end of the email. Assignment is
 * deterministic and pure — see `assignPersonality`.
 */
export const PERSONALITY_KINDS = [
  "surgeon",
  "architect",
  "detective",
  "conductor",
  "marathoner",
  "strategist",
] as const
export type PersonalityKind = (typeof PERSONALITY_KINDS)[number]

const fileLineSchema = z.object({
  path: z.string(),
  displayName: z.string(),
  touches: z.number().int().nonnegative(),
})
export type FileLine = z.infer<typeof fileLineSchema>

const workspaceLineSchema = z.object({
  name: z.string(),
  sessions: z.number().int().nonnegative(),
  toolCalls: z.number().int().nonnegative(),
})
export type WorkspaceLine = z.infer<typeof workspaceLineSchema>

const workspaceDeepDiveSchema = z.object({
  name: z.string(),
  toolCalls: z.number().int().nonnegative(),
  sessions: z.number().int().nonnegative(),
  topFiles: z.array(fileLineSchema).max(3),
  topBranches: z.array(z.string()).max(2),
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
  }),

  toolMix: toolMixSchema,

  topFiles: z.array(fileLineSchema).max(5),
  topBashCommands: z
    .array(
      z.object({
        pattern: z.string(),
        count: z.number().int().nonnegative(),
      }),
    )
    .max(5),
  topWorkspaces: z.array(workspaceLineSchema),
  topBranches: z
    .array(
      z.object({
        name: z.string(),
        sessions: z.number().int().nonnegative(),
      }),
    )
    .max(5),

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
    mainCharacterFile: fileLineSchema.nullable(),
  }),

  personality: personalitySchema,
})

export type Report = z.infer<typeof reportSchema>
