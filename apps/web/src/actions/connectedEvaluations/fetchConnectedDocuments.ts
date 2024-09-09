'use server'

import { ConnectedEvaluationsRepository } from '@latitude-data/core/repositories'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const fetchConnectedDocumentsAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      evaluationId: z.number(),
    }),
  )
  .handler(async ({ input, ctx }) => {
    const connectedEvaluationsScope = new ConnectedEvaluationsRepository(
      ctx.workspace.id,
    )
    const connectedDocuments =
      await connectedEvaluationsScope.getConnectedDocumentsWithMetadata(
        input.evaluationId,
      )

    return connectedDocuments.unwrap()
  })
