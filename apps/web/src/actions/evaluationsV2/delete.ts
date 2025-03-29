'use server'

import { deleteEvaluationV2 } from '@latitude-data/core'
import { z } from 'zod'
import { withEvaluation } from '../procedures'

export const deleteEvaluationV2Action = withEvaluation
  .createServerAction()
  .input(z.object({}))
  .handler(async ({ ctx }) => {
    const result = await deleteEvaluationV2({
      evaluation: ctx.evaluation,
      commit: ctx.commit,
      workspace: ctx.workspace,
    }).then((r) => r.unwrap())

    return result
  })
