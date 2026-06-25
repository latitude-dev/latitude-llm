import { z } from "zod"

/**
 * Optional declarative config a user edits in the builder; compiles deterministically to the
 * evaluation's `script`. NULL when the script is hand-written (raw) or GEPA-generated. The shape
 * grows as the builder grows; the judge case is the first kind (compiles to a script that calls
 * `llm()`, generated + aligned via optimize-evaluation).
 */
export const evaluationSettingsSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("judge"), criteria: z.string().min(1) }),
])
export type EvaluationSettings = z.infer<typeof evaluationSettingsSchema>
