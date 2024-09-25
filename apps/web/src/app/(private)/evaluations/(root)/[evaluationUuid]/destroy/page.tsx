'use client'

import { EvaluationDto } from '@latitude-data/core/browser'
import DestroyModal from '$/components/modals/DestroyModal'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import useEvaluations from '$/stores/evaluations'

export default function DestroyEvaluation({
  params: { evaluationUuid },
}: {
  params: { evaluationUuid: string }
}) {
  const navigate = useNavigate()
  const { data, destroy } = useEvaluations()
  const evaluation = data.find((e: EvaluationDto) => e.uuid === evaluationUuid)

  if (!evaluation) return null

  return (
    <DestroyModal
      title='Delete Evaluation'
      description={`Are you sure you want to delete the evaluation "${evaluation.name}"? This action cannot be undone.`}
      onOpenChange={(open: boolean) =>
        !open && navigate.push(ROUTES.evaluations.root)
      }
      action={destroy}
      submitStr='Delete'
      model={evaluation}
      onSuccess={() => navigate.push(ROUTES.evaluations.root)}
    />
  )
}
