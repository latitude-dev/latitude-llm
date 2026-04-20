import { cuidSchema, evaluationIdSchema, filterSetSchema } from "@domain/shared"
import { z } from "zod"

import { DEFAULT_EVALUATION_SAMPLING, EVALUATION_NAME_MAX_LENGTH, EVALUATION_TURNS } from "../constants.ts"

// ---------------------------------------------------------------------------
// EvaluationTrigger
// ---------------------------------------------------------------------------

export const evaluationTurnSchema = z.enum(EVALUATION_TURNS)
export type EvaluationTurn = z.infer<typeof evaluationTurnSchema>

function validateEvaluationTrigger(
  trigger: {
    readonly turn: EvaluationTurn
    readonly debounce: number
  },
  ctx: z.core.$RefinementCtx<unknown>,
) {
  if (trigger.turn === "last" && trigger.debounce === 0) {
    ctx.addIssue({
      code: "custom",
      message: "`turn = last` requires `debounce > 0`",
      path: ["debounce"],
      input: trigger.debounce,
    })
  }
}

export const evaluationTriggerSchema = z
  .object({
    filter: filterSetSchema, // trace/session filter over the shared trace field registry; `{}` matches all traces
    turn: evaluationTurnSchema, // runs on the first, every, or last ingested trace/turn
    debounce: z.number().int().nonnegative(), // debounce time in seconds
    sampling: z.number().min(0).max(100), // percentage [0, 100]
  })
  .superRefine(validateEvaluationTrigger)

export type EvaluationTrigger = z.infer<typeof evaluationTriggerSchema>

/**
 * Build a default trigger for a newly generated issue-linked evaluation.
 * Uses the shared FilterSet from `@domain/shared` for the filter field.
 */
export function defaultEvaluationTrigger(): EvaluationTrigger {
  return {
    filter: filterSetSchema.parse({}),
    turn: "every",
    debounce: 0,
    sampling: DEFAULT_EVALUATION_SAMPLING,
  }
}

// ---------------------------------------------------------------------------
// ConfusionMatrix
// ---------------------------------------------------------------------------

export const confusionMatrixSchema = z.object({
  truePositives: z.number().int().nonnegative(), // stored counts from which MCC and other metrics can be derived later on
  falsePositives: z.number().int().nonnegative(),
  falseNegatives: z.number().int().nonnegative(),
  trueNegatives: z.number().int().nonnegative(),
})

export type ConfusionMatrix = z.infer<typeof confusionMatrixSchema>

// ---------------------------------------------------------------------------
// EvaluationAlignment
// ---------------------------------------------------------------------------

export const evaluationAlignmentSchema = z.object({
  evaluationHash: z.string(), // sha1 of the script so we know if we can increment or recompute the confusion matrix
  confusionMatrix: confusionMatrixSchema, // stored counts from which MCC and other metrics can be derived later on
})

export type EvaluationAlignment = z.infer<typeof evaluationAlignmentSchema>

/** Build an empty alignment state for a newly generated evaluation. */
export function emptyEvaluationAlignment(evaluationHash: string): EvaluationAlignment {
  return {
    evaluationHash,
    confusionMatrix: {
      truePositives: 0,
      falsePositives: 0,
      falseNegatives: 0,
      trueNegatives: 0,
    },
  }
}

// ---------------------------------------------------------------------------
// Evaluation entity
// ---------------------------------------------------------------------------

export const evaluationSchema = z.object({
  id: evaluationIdSchema, // CUID evaluation identifier
  organizationId: cuidSchema, // owning organization
  projectId: cuidSchema, // owning project
  issueId: cuidSchema, // in MVP evaluations are issue-linked; multiple evaluations may link to the same issue
  name: z.string().min(1).max(EVALUATION_NAME_MAX_LENGTH), // unique name within the project among non-deleted rows
  description: z.string(), // generated from the resulting script after alignment
  // TODO(eval-sandbox): when sandbox is available, this field will hold arbitrary JS; until then
  // it must conform to the fixed LLM-as-judge template enforced by validateEvaluationScript().
  script: z.string().min(1),
  trigger: evaluationTriggerSchema, // controls when the evaluation runs on live traffic
  alignment: evaluationAlignmentSchema, // persisted confusion matrix and script hash
  alignedAt: z.date(), // last time the evaluation was realigned
  archivedAt: z.date().nullable(), // archived evaluations are still visible in read-only mode
  deletedAt: z.date().nullable(), // deleted evaluations are soft deleted from management UI
  createdAt: z.date(), // evaluation creation time
  updatedAt: z.date(), // evaluation update time
})

export type Evaluation = z.infer<typeof evaluationSchema>

// ---------------------------------------------------------------------------
// Lifecycle helpers
// ---------------------------------------------------------------------------

/** An evaluation is active when it is neither archived nor deleted. */
export function isActiveEvaluation(evaluation: Pick<Evaluation, "archivedAt" | "deletedAt">): boolean {
  return evaluation.archivedAt === null && evaluation.deletedAt === null
}

/** An evaluation is paused when its sampling is 0. */
export function isPausedEvaluation(evaluation: Pick<Evaluation, "trigger">): boolean {
  return evaluation.trigger.sampling === 0
}
