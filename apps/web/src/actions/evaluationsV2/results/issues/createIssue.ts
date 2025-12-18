'use server'

import { EvaluationResultsV2Repository } from '@latitude-data/core/repositories'
import { assignEvaluationResultV2ToIssue } from '@latitude-data/core/services/evaluationsV2/results/assign'
import { z } from 'zod'
import { withEvaluation, withEvaluationSchema } from '$/actions/procedures'

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
    let result = await new EvaluationResultsV2Repository(ctx.workspace.id)
      .findByUuid(parsedInput.evaluationResultUuid)
      .then((r) => r.unwrap())

    const response = await assignEvaluationResultV2ToIssue({
      result: result,
      evaluation: ctx.evaluation,
      create: {
        title: parsedInput.title,
        description: parsedInput.description,
        document: ctx.document,
        project: ctx.project,
      },
      workspace: ctx.workspace,
    }).then((r) => r.unwrap())
    const issue = response.issue
    result = response.result

    return { issue, evaluationResult: { ...result, issueId: issue.id } }
  })
