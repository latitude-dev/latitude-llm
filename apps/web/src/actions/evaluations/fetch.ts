'use server'

import { EvaluationsRepository } from '@latitude-data/core/repositories'

import { authProcedure } from '../procedures'

export const fetchEvaluationsAction = authProcedure
  .createServerAction()
  .handler(async ({ ctx }) => {
    const evaluationsScope = new EvaluationsRepository(ctx.workspace.id)

    return await evaluationsScope.findAll().then((r) => r.unwrap())
  })
