import { FLAGGER_SCORING_ARTIFACT_VERSION_MAX_LENGTH } from "@domain/scores"
import { z } from "zod"

export const TASK_OUTCOME_VERDICTS = ["success", "failure", "indeterminate", "notApplicable"] as const

export const taskOutcomeVerdictKindSchema = z.enum(TASK_OUTCOME_VERDICTS)
export type TaskOutcomeVerdictKind = z.infer<typeof taskOutcomeVerdictKindSchema>

const judgedVerdictFields = {
  feedback: z.string().min(1),
  messageIndex: z.number().int().nonnegative().optional(),
} as const

export const taskOutcomeVerdictSchema = z.discriminatedUnion("verdict", [
  z.object({ verdict: z.literal("success"), ...judgedVerdictFields }),
  z.object({ verdict: z.literal("failure"), ...judgedVerdictFields }),
  z.object({ verdict: z.literal("indeterminate"), reason: z.string().min(1) }),
  z.object({ verdict: z.literal("notApplicable"), reason: z.string().min(1) }),
])

export type TaskOutcomeVerdict = z.infer<typeof taskOutcomeVerdictSchema>

/** The two verdicts that persist a score; the other two are coverage decisions. */
export const isScoringTaskOutcomeVerdict = (verdict: TaskOutcomeVerdictKind): verdict is "success" | "failure" =>
  verdict === "success" || verdict === "failure"

export const TASK_OUTCOME_JUDGMENT_VERSION_PREFIX = "task-failure-v1"

const fnv1a32 = (value: string): string => {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, "0")
}

/**
 * Identifies the prompt, result schema, and judge configuration behind a
 * verdict.
 *
 * The judge is part of the version because a deployment that points
 * `FLAGGER_CLASSIFIER` at another model is producing a different measurement:
 * the Outcome estimator treats each version as its own population rather than
 * pooling verdicts from two judges. The provider and model are spelled out so
 * the version is readable in the score row; an identity that would overflow
 * the persisted version column collapses to a digest instead, since truncating
 * it would let two judges share a label.
 */
export const taskOutcomeJudgmentVersion = (judge: { readonly provider: string; readonly model: string }): string => {
  const readable = `${TASK_OUTCOME_JUDGMENT_VERSION_PREFIX}:${judge.provider}/${judge.model}`
  if (readable.length <= FLAGGER_SCORING_ARTIFACT_VERSION_MAX_LENGTH) return readable
  return `${TASK_OUTCOME_JUDGMENT_VERSION_PREFIX}:h:${fnv1a32(readable)}`
}
