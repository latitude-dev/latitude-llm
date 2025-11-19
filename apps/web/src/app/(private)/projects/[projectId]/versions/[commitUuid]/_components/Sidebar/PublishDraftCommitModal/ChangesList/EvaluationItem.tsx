import { ChangedEvaluation, EvaluationV2 } from '@latitude-data/constants'
import React, { useMemo } from 'react'
import { ROUTES } from '$/services/routes'
import { ListItem } from './ListItem'
import {
  EVALUATION_SPECIFICATIONS,
  getEvaluationMetricSpecification,
} from '$/components/evaluations'
import { MODIFICATION_COLORS } from '@latitude-data/web-ui/molecules/DocumentChange'
import { TextColor } from '@latitude-data/web-ui/tokens'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'

function DoubleIcon({
  main,
  secondary,
  color,
}: {
  main: IconName
  secondary: IconName
  color: TextColor
}) {
  return (
    <div className='flex-none relative w-6 h-6'>
      <div className='sidebar-icon-mask absolute inset-0 z-50'>
        <Icon name={main} color={color} className='absolute top-1 left-0' />
      </div>
      <div className='z-10 absolute bottom-1 right-0.5'>
        <Icon name={secondary} color={color} size='xsmall' />
      </div>
    </div>
  )
}

export function EvaluationChangeItem({
  projectId,
  commitUuid,
  change,
  evaluations,
}: {
  projectId: number
  commitUuid: string
  change: ChangedEvaluation
  evaluations: EvaluationV2[]
}) {
  const evaluation = useMemo<EvaluationV2 | undefined>(
    () => evaluations.find((e) => e.uuid === change.evaluationUuid),
    [evaluations, change.evaluationUuid],
  )

  const evaluationIcon = useMemo<IconName>(
    () => EVALUATION_SPECIFICATIONS[change.type].icon,
    [change.type],
  )

  const metricIcon = useMemo<IconName | undefined>(() => {
    if (!evaluation) return undefined
    return getEvaluationMetricSpecification(evaluation).icon
  }, [evaluation])

  const iconColor = useMemo<TextColor>(() => {
    if (change.hasIssues) return 'destructive'
    return MODIFICATION_COLORS[change.changeType]
  }, [change])

  return (
    <ListItem
      icon={
        metricIcon ? (
          <DoubleIcon
            main={evaluationIcon}
            secondary={metricIcon}
            color={iconColor}
          />
        ) : (
          evaluationIcon
        )
      }
      label={change.name}
      changeType={change.changeType}
      hasIssues={change.hasIssues}
      href={
        ROUTES.projects
          .detail({ id: projectId })
          .commits.detail({ uuid: commitUuid })
          .documents.detail({ uuid: change.documentUuid })
          .evaluations.detail({ uuid: change.evaluationUuid }).root
      }
    />
  )
}
