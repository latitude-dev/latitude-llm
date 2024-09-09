'use server'

import { findAllEvaluationTemplates } from '@latitude-data/core/data-access'

import { authProcedure } from '../procedures'

export const fetchEvaluationTemplatesAction = authProcedure
  .createServerAction()
  .handler(async () => {
    const result = await findAllEvaluationTemplates()
    return result.unwrap()
  })
