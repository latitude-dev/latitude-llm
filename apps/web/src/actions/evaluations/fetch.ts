'use server'

import { EvaluationsRepository } from '@latitude-data/core/repositories'

import { authProcedure } from '../procedures'

export const fetchEvaluationsAction = authProcedure
  .createServerAction()
  .handler(async ({ ctx }) => {
    const evaluationsScope = new EvaluationsRepository(ctx.workspace.id)
    const evaluations = await evaluationsScope.findAll().then((r) => r.unwrap())

    return evaluations
  })
