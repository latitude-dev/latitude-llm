'use client'

import { useMemo } from 'react'

import { Text } from '@latitude-data/web-ui'
import useEvaluations from '$/stores/evaluations'

export function EvaluationTitle({
  evaluationUuid,
}: {
  evaluationUuid: string
}) {
  const { data: evaluations } = useEvaluations()
  const evaluation = useMemo(() => {
    return evaluations?.find((evaluation) => evaluation.uuid === evaluationUuid)
  }, [evaluations, evaluationUuid])

  if (!evaluation) return null

  return (
    <div className='flex flex-row items-center justify-between p-4 pb-0'>
      <Text.H4B>{evaluation.name}</Text.H4B>
    </div>
  )
}
