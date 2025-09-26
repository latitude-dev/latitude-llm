'use server'

import { deleteEvaluationV2 } from '@latitude-data/core/services/evaluationsV2/delete'
import { withEvaluation, withEvaluationSchema } from '../procedures'

export const deleteEvaluationV2Action = withEvaluation
  .inputSchema(withEvaluationSchema.extend({}))
  .action(async ({ ctx }) => {
    const result = await deleteEvaluationV2({
      evaluation: ctx.evaluation,
      commit: ctx.commit,
      workspace: ctx.workspace,
    }).then((r) => r.unwrap())

    return result
  })
