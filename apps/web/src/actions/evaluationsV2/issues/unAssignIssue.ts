'use server'

import { z } from 'zod'
import { EvaluationResultsV2Repository } from '@latitude-data/core/repositories'
import { unAssignIssue } from '@latitude-data/core/services/issues/unAssignIssue'
import { withEvaluation, withEvaluationSchema } from '../../procedures'

export const unAssignIssueAction = withEvaluation
  .inputSchema(
    withEvaluationSchema.extend({
      evaluationResultUuid: z.string(),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const evaluationResult = await new EvaluationResultsV2Repository(
      ctx.workspace.id,
    )
      .findByUuid(parsedInput.evaluationResultUuid)
      .then((r) => r.unwrap())

    const result = await unAssignIssue({
      workspace: ctx.workspace,
      project: ctx.project,
      commit: ctx.commit,
      evaluationResult,
    }).then((r) => r.unwrap())

    return result
  })
