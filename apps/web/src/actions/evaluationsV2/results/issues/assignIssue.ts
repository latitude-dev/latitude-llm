'use server'

import {
  EvaluationResultsV2Repository,
  IssuesRepository,
} from '@latitude-data/core/repositories'
import { assignEvaluationResultV2ToIssue } from '@latitude-data/core/services/evaluationsV2/results/assign'
import { z } from 'zod'
import { withEvaluation, withEvaluationSchema } from '$/actions/procedures'

export const assignIssueAction = withEvaluation
  .inputSchema(
    withEvaluationSchema.extend({
      issueId: z.number(),
      evaluationResultUuid: z.string(),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    let issue = await new IssuesRepository(ctx.workspace.id)
      .find(parsedInput.issueId)
      .then((r) => r.unwrap())

    let result = await new EvaluationResultsV2Repository(ctx.workspace.id)
      .findByUuid(parsedInput.evaluationResultUuid)
      .then((r) => r.unwrap())

    const response = await assignEvaluationResultV2ToIssue({
      result: result,
      evaluation: ctx.evaluation,
      issue: issue,
      workspace: ctx.workspace,
    }).then((r) => r.unwrap())
    issue = response.issue
    result = response.result

    return { issue, evaluationResult: { ...result, issueId: issue.id } }
  })
