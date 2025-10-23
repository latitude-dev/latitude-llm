'use server'

import { z } from 'zod'
import { EvaluationResultsV2Repository } from '@latitude-data/core/repositories'
import { createAndAssignIssue } from '@latitude-data/core/services/issues/createAndAssignIssue'
import { withEvaluation, withEvaluationSchema } from '../../procedures'

export const createIssueAction = withEvaluation
  .inputSchema(
    withEvaluationSchema.extend({
      evaluationResultUuid: z.string(),
      title: z.string().trim().min(1, { message: 'Title cannot be empty' }),
      description: z
        .string()
        .trim()
        .min(1, { message: 'Description cannot be empty' }),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const evaluationResult = await new EvaluationResultsV2Repository(
      ctx.workspace.id,
    )
      .findByUuid(parsedInput.evaluationResultUuid)
      .then((r) => r.unwrap())

    const result = await createAndAssignIssue({
      workspace: ctx.workspace,
      project: ctx.project,
      commit: ctx.commit,
      evaluation: ctx.evaluation,
      evaluationResult,
      title: parsedInput.title,
      description: parsedInput.description,
    }).then((r) => r.unwrap())

    return result
  })
