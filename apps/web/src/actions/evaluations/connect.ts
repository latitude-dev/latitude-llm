'use server'

import { connectEvaluations } from '@latitude-data/core/services/evaluations/connect'
import { z } from 'zod'

import { withProject } from '../procedures'

export const connectEvaluationsAction = withProject
  .createServerAction()
  .input(
    z.object({
      documentUuid: z.string(),
      templateIds: z.array(z.number()),
      evaluationUuids: z.array(z.string()),
    }),
  )
  .handler(async ({ ctx, input }) => {
    const connectedEvaluations = await connectEvaluations({
      workspace: ctx.workspace,
      documentUuid: input.documentUuid,
      evaluationUuids: input.evaluationUuids,
      templateIds: input.templateIds,
    }).then((r) => r.unwrap())

    return connectedEvaluations
  })
