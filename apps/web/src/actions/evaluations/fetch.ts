'use server'

import { EvaluationsRepository } from '@latitude-data/core/repositories'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const fetchEvaluationsAction = authProcedure
  .createServerAction()
  .input(() => z.object({ documentUuid: z.string().optional() }).optional())
  .handler(async ({ ctx, input }) => {
    const scope = new EvaluationsRepository(ctx.workspace.id)
    let result
    if (input?.documentUuid) {
      result = await scope.findByDocumentUuid(input.documentUuid)
    } else {
      result = await scope.findAll()
    }

    return result.unwrap()
  })
