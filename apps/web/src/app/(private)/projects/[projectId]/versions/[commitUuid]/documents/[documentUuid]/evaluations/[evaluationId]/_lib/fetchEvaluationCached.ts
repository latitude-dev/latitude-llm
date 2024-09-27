import { cache } from 'react'

import { EvaluationsRepository } from '@latitude-data/core/repositories'
import { getCurrentUser } from '$/services/auth/getCurrentUser'

export const fetchEvaluationCached = cache(async (id: number) => {
  const { workspace } = await getCurrentUser()
  const evaluationScope = new EvaluationsRepository(workspace.id)
  return evaluationScope.find(id).then((r) => r.unwrap())
})
