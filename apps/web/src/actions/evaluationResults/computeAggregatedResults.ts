'use server'

import { EvaluationsRepository } from '@latitude-data/core/repositories'
import {
  computeAverageResultAndCostOverCommit,
  computeAverageResultOverTime,
} from '@latitude-data/core/services/evaluationResults/computeAggregatedResults'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const computeAverageResultAndCostOverCommitAction = authProcedure
  .createServerAction()
  .input(z.object({ evaluationId: z.number(), documentUuid: z.string() }))
  .handler(async ({ input, ctx }) => {
    const { evaluationId, documentUuid } = input
    const { workspace } = ctx

    const evaluationScope = new EvaluationsRepository(workspace.id)
    const evaluation = await evaluationScope
      .find(evaluationId)
      .then((r) => r.unwrap())

    return await computeAverageResultAndCostOverCommit({
      workspaceId: workspace.id,
      evaluation,
      documentUuid,
    }).then((r) => r.unwrap())
  })

export const computeAverageResultOverTimeAction = authProcedure
  .createServerAction()
  .input(z.object({ evaluationId: z.number(), documentUuid: z.string() }))
  .handler(async ({ input, ctx }) => {
    const { evaluationId, documentUuid } = input
    const { workspace } = ctx

    const evaluationScope = new EvaluationsRepository(workspace.id)
    const evaluation = await evaluationScope
      .find(evaluationId)
      .then((r) => r.unwrap())

    return await computeAverageResultOverTime({
      workspaceId: workspace.id,
      evaluation,
      documentUuid,
    }).then((r) => r.unwrap())
  })
