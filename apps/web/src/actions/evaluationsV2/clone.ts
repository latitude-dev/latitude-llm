'use server'

import { cloneEvaluationV2 } from '@latitude-data/core/services/evaluationsV2/clone'
import { withEvaluation } from '../procedures'

export const cloneEvaluationV2Action = withEvaluation
  .createServerAction()
  .handler(async ({ ctx }) => {
    const result = await cloneEvaluationV2({
      evaluation: ctx.evaluation,
      commit: ctx.commit,
      workspace: ctx.workspace,
    }).then((r) => r.unwrap())

    return result
  })
