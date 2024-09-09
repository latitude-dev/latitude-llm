'use client'

import { EvaluationDto } from '@latitude-data/core/browser'
import ActiveEvaluationsTable from '$/app/(private)/evaluations/_components/ActiveEvaluations/Table'
import useEvaluations from '$/stores/evaluations'

export default function Layout({
  evaluations: fallbackData,
}: {
  evaluations: EvaluationDto[]
}) {
  const { data: evaluations } = useEvaluations({ fallbackData })

  return <ActiveEvaluationsTable evaluations={evaluations} />
}
