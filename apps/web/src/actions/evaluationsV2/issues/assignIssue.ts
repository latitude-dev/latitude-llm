'use server'

import {
  EvaluationResultsV2Repository,
  IssuesRepository,
} from '@latitude-data/core/repositories'
import { assignIssue } from '@latitude-data/core/services/issues/assignIssue'
import { z } from 'zod'
import { withEvaluation, withEvaluationSchema } from '../../procedures'

export const assignIssueAction = withEvaluation
  .inputSchema(
    withEvaluationSchema.extend({
      issueId: z.number(),
      evaluationResultUuid: z.string(),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const issue = await new IssuesRepository(ctx.workspace.id)
      .find(parsedInput.issueId)
      .then((r) => r.unwrap())
    const evaluationResult = await new EvaluationResultsV2Repository(
      ctx.workspace.id,
    )
      .findByUuid(parsedInput.evaluationResultUuid)
      .then((r) => r.unwrap())

    const result = await assignIssue({
      workspace: ctx.workspace,
      project: ctx.project,
      commit: ctx.commit,
      evaluation: ctx.evaluation,
      evaluationResult,
      issue,
    }).then((r) => r.unwrap())

    return result
  })
