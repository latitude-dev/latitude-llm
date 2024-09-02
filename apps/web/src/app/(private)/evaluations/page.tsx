import { NotFoundError } from '@latitude-data/core/lib/errors'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { notFound } from 'next/navigation'

import { getEvaluationTemplatesCached } from '../_data-access'
import Evaluations from './_components/Evaluations'

export default async function EvaluationsPage() {
  try {
    await getCurrentUser()
  } catch (error) {
    if (error instanceof NotFoundError) return notFound()
    throw error
  }

  const evaluationTemplates = await getEvaluationTemplatesCached()

  return <Evaluations evaluationTemplates={evaluationTemplates} />
}
