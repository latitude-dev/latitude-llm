import { z } from "zod"
import { buildJudgmentVersion } from "./judgment-version.ts"

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

export const taskOutcomeJudgmentVersion = (judge: { readonly provider: string; readonly model: string }): string =>
  buildJudgmentVersion(TASK_OUTCOME_JUDGMENT_VERSION_PREFIX, judge)
