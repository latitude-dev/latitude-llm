'use server'

import { EvaluationsRepository } from '@latitude-data/core'
import { destroyEvaluation } from '@latitude-data/core'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const destroyEvaluationAction = authProcedure
  .createServerAction()
  .input(z.object({ id: z.coerce.number() }))
  .handler(async ({ input, ctx }) => {
    const scope = new EvaluationsRepository(ctx.workspace.id)
    const evaluation = await scope.find(input.id).then((r) => r.unwrap())
    const result = await destroyEvaluation({ evaluation })

    return result.unwrap()
  })
