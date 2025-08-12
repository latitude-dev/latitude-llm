'use server'

import { destroyEvaluationTemplate } from '@latitude-data/core/services/evaluationAdvancedTemplates/destroy'
import { z } from 'zod'

import { withAdmin } from '../procedures'

export const destroyEvaluationTemplateAction = withAdmin
  .inputSchema(z.object({ id: z.number() }))
  .action(async ({ parsedInput }) => {
    const { id } = parsedInput

    return await destroyEvaluationTemplate({
      id,
    }).then((r) => r.unwrap())
  })
