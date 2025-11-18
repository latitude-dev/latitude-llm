'use server'

import { EvaluationResultsV2Repository } from '@latitude-data/core/repositories'
import { generateIssue } from '@latitude-data/core/services/issues/generate'
import { z } from 'zod'
import { withEvaluation, withEvaluationSchema } from '$/actions/procedures'

export const generateIssueAction = withEvaluation
  .inputSchema(
    withEvaluationSchema.extend({
      evaluationResultUuid: z.string(),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const result = await new EvaluationResultsV2Repository(ctx.workspace.id)
      .findByUuid(parsedInput.evaluationResultUuid)
      .then((r) => r.unwrap())

    const response = await generateIssue({
      results: [{ result, evaluation: ctx.evaluation }],
    }).then((r) => r.unwrap())

    return response
  })
