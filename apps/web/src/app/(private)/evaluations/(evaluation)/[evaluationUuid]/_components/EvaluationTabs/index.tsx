'use client'

import { Evaluation } from '@latitude-data/core/browser'
import { TabSelector } from '@latitude-data/web-ui'
import { useNavigate } from '$/hooks/useNavigate'
import { EvaluationRoutes, ROUTES } from '$/services/routes'
import { useSelectedLayoutSegment } from 'next/navigation'

export function EvaluationTabSelector({
  evaluation,
}: {
  evaluation: Evaluation
}) {
  const router = useNavigate()
  const selectedSegment = useSelectedLayoutSegment() as EvaluationRoutes | null

  const pathTo = (evaluationRoute: EvaluationRoutes) => {
    const evaluationDetail = ROUTES.evaluations.detail({
      uuid: evaluation.uuid,
    })
    const detail = evaluationDetail[evaluationRoute] ?? evaluationDetail
    return detail.root
  }

  return (
    <div className='flex flex-row p-4 pb-0'>
      <TabSelector
        options={[
          { label: 'Dashboard', value: EvaluationRoutes.dashboard },
          { label: 'Editor', value: EvaluationRoutes.editor },
        ]}
        selected={selectedSegment ?? EvaluationRoutes.dashboard}
        onSelect={(value) => {
          router.push(pathTo(value))
        }}
      />
    </div>
  )
}
