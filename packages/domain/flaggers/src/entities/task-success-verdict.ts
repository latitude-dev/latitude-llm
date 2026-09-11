import { z } from "zod"

export const TASK_SUCCESS_VERDICTS = ["success", "failure", "indeterminate", "notApplicable"] as const

export const taskSuccessVerdictKindSchema = z.enum(TASK_SUCCESS_VERDICTS)
export type TaskSuccessVerdictKind = z.infer<typeof taskSuccessVerdictKindSchema>

const judgedVerdictFields = {
  feedback: z.string().min(1),
  messageIndex: z.number().int().nonnegative().optional(),
} as const

export const taskSuccessVerdictSchema = z.discriminatedUnion("verdict", [
  z.object({ verdict: z.literal("success"), ...judgedVerdictFields }),
  z.object({ verdict: z.literal("failure"), ...judgedVerdictFields }),
  z.object({ verdict: z.literal("indeterminate"), reason: z.string().min(1) }),
  z.object({ verdict: z.literal("notApplicable"), reason: z.string().min(1) }),
])

export type TaskSuccessVerdict = z.infer<typeof taskSuccessVerdictSchema>

/** The two verdicts that persist a score; the other two are coverage decisions. */
export const isScoringTaskSuccessVerdict = (verdict: TaskSuccessVerdictKind): verdict is "success" | "failure" =>
  verdict === "success" || verdict === "failure"
