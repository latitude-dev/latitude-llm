'use server'

import { ConnectedEvaluationsRepository } from '@latitude-data/core/repositories'
import { updateConnectedEvaluation } from '@latitude-data/core/services/connectedEvaluations/update'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const updateConnectedEvaluationAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      id: z.number(),
      data: z.object({
        live: z.boolean(),
      }),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const connectedEvaluationsScope = new ConnectedEvaluationsRepository(
      ctx.workspace.id,
    )
    const connectedEvaluation = await connectedEvaluationsScope
      .find(input.id)
      .then((r) => r.unwrap())

    const result = await updateConnectedEvaluation({
      connectedEvaluation,
      data: input.data,
    })

    return result.unwrap()
  })
