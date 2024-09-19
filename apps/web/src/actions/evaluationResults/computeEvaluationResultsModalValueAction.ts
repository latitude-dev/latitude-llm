'use server'

import { EvaluationsRepository } from '@latitude-data/core/repositories'
import { getEvaluationModalValueQuery } from '@latitude-data/core/services/evaluationResults/index'
import { findCommitCached } from '$/app/(private)/_data-access'
import { z } from 'zod'

import { withDocument } from '../procedures'

export const computeEvaluationResultsModalValueAction = withDocument
  .createServerAction()
  .input(
    z.object({
      commitUuid: z.string(),
      documentUuid: z.string(),
      evaluationId: z.number(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const { evaluationId, documentUuid } = input
    const { workspace } = ctx
    const evaluationScope = new EvaluationsRepository(workspace.id)
    const commit = await findCommitCached({
      projectId: ctx.project.id,
      uuid: input.commitUuid,
    })
    const evaluation = await evaluationScope
      .find(evaluationId)
      .then((r) => r.unwrap())
    return getEvaluationModalValueQuery({
      workspaceId: workspace.id,
      commit,
      evaluation,
      documentUuid,
    })
  })
