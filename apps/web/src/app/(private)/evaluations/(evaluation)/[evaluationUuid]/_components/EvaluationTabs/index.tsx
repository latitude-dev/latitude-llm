'use client'

import { useMemo } from 'react'

import { Evaluation } from '@latitude-data/core/browser'
import { TabSelector } from '@latitude-data/web-ui'
import { useNavigate } from '$/hooks/useNavigate'
import { useSelectedPath } from '$/hooks/useSelectedPath'
import { EvaluationRoutes, ROUTES } from '$/services/routes'

export function EvaluationTabSelector({
  evaluation,
}: {
  evaluation: Evaluation
}) {
  const router = useNavigate()
  const selected = useSelectedPath({ pickFirstSegment: false }) as
    | EvaluationRoutes
    | undefined
  const options = useMemo(() => {
    const base = ROUTES.evaluations.detail({ uuid: evaluation.uuid })
    return [
      { label: 'Dashboard', value: base.dashboard.root },
      { label: 'Editor', value: base.editor.root },
    ]
  }, [evaluation.uuid])
  return (
    <div className='flex flex-row'>
      <TabSelector
        options={options}
        selected={selected}
        onSelect={(value) => {
          router.push(value)
        }}
      />
    </div>
  )
}
