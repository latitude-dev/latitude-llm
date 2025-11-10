'use server'

import {
  EvaluationResultsV2Repository,
  IssuesRepository,
} from '@latitude-data/core/repositories'
import { unassignEvaluationResultV2FromIssue } from '@latitude-data/core/services/evaluationsV2/results/unassign'
import { z } from 'zod'
import { withEvaluation, withEvaluationSchema } from '../../procedures'

export const unAssignIssueAction = withEvaluation
  .inputSchema(
    withEvaluationSchema.extend({
      evaluationResultUuid: z.string(),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    let result = await new EvaluationResultsV2Repository(ctx.workspace.id)
      .findByUuid(parsedInput.evaluationResultUuid)
      .then((r) => r.unwrap())

    let issue = await new IssuesRepository(ctx.workspace.id)
      .find(result.issueId)
      .then((r) => r.unwrap())

    const response = await unassignEvaluationResultV2FromIssue({
      result: result,
      evaluation: ctx.evaluation,
      issue: issue,
      workspace: ctx.workspace,
    }).then((r) => r.unwrap())
    issue = response.issue
    result = response.result

    return result
  })
