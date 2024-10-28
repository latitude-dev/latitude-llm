'use server'

import { UnauthorizedError } from '@latitude-data/core/lib/errors'
import { destroyEvaluationTemplate } from '@latitude-data/core/services/evaluationLegacyTemplates/destroy'
import { z } from 'zod'

import { authProcedure } from '../procedures'

export const destroyEvaluationTemplateAction = authProcedure
  .createServerAction()
  .input(
    z.object({
      id: z.number(),
    }),
  )
  .handler(async ({ ctx, input }) => {
    // TODO: move this check to a procedure
    if (!ctx.user.admin)
      throw new UnauthorizedError(
        'You must be an admin to destroy an evaluation template',
      )

    const { id } = input

    return await destroyEvaluationTemplate({
      id,
    }).then((r) => r.unwrap())
  })
