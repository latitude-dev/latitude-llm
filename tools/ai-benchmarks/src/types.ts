import { z } from "zod"

// Row in `fixtures/<target>.jsonl` — minimal, portable shape the runner
// expands into a full TraceDetail before calling the classifier. Only
// `allMessages` (plus `systemInstructions` when `systemPrompt` is set) is
// actually read by flagger strategies; everything else on TraceDetail
// gets default values.

const fixtureMessageSchema = z.object({
  role: z.enum(["user", "assistant", "tool", "function", "system"]),
  parts: z.array(
    z.object({
      type: z.literal("text"),
      content: z.string(),
    }),
  ),
})

const fixtureTraceSchema = z.object({
  systemPrompt: z.string().optional(),
  messages: z.array(fixtureMessageSchema),
})

export const fixtureRowSchema = z.object({
  id: z.string(),
  source: z.string(),
  licence: z.string(),
  expected: z.object({
    matched: z.boolean(),
  }),
  tier: z.enum(["easy", "medium", "hard"]).optional(),
  tags: z.array(z.string()).default([]),
  trace: fixtureTraceSchema,
  notes: z.string().optional(),
})

export type FixtureRow = z.infer<typeof fixtureRowSchema>
