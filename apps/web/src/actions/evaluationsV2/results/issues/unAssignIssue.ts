'use server'

import { withEvaluation, withEvaluationSchema } from '$/actions/procedures'
import { EvaluationResultsV2Repository } from '@latitude-data/core/repositories'
import { findIssueByResultId } from '@latitude-data/core/queries/issues/findByResultId'
import { unassignEvaluationResultV2FromIssue } from '@latitude-data/core/services/evaluationsV2/results/unassign'
import { z } from 'zod'

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

    let issue = await findIssueByResultId({
      workspaceId: ctx.workspace.id,
      resultId: result.id,
    })

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
