'use server'

import { EvaluationsRepository } from '@latitude-data/core/repositories'
import { ejectEvaluation } from '@latitude-data/core/services/evaluations/eject'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const ejectEvaluationAction = authProcedure
  .createServerAction()
  .input(z.object({ id: z.coerce.number() }))
  .handler(async ({ input, ctx }) => {
    const scope = new EvaluationsRepository(ctx.workspace.id)
    const evaluation = await scope.find(input.id).then((r) => r.unwrap())
    const result = await ejectEvaluation(evaluation)

    return result.unwrap()
  })
