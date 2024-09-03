'use client'

import { TabSelector } from '@latitude-data/web-ui'
import { useNavigate } from '$/hooks/useNavigate'
import { EvaluationRoutes, ROUTES } from '$/services/routes'
import { useSelectedLayoutSegment } from 'next/navigation'

export function EvaluationTabSelector({
  evaluationUuid,
}: {
  evaluationUuid: string
}) {
  const router = useNavigate()
  const selectedSegment = useSelectedLayoutSegment() as EvaluationRoutes | null

  const pathTo = (evaluationRoute: EvaluationRoutes) => {
    const evaluationDetail = ROUTES.evaluations.detail({ uuid: evaluationUuid })
    const detail = evaluationDetail[evaluationRoute] ?? evaluationDetail
    return detail.root
  }

  return (
    <div className='flex flex-row p-4 pb-0'>
      <TabSelector
        options={[
          { label: 'History', value: EvaluationRoutes.history },
          { label: 'Editor', value: EvaluationRoutes.editor },
        ]}
        selected={selectedSegment ?? EvaluationRoutes.history}
        onSelect={(value) => {
          router.push(pathTo(value))
        }}
      />
    </div>
  )
}
