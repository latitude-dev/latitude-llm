import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import { EvaluationV2 } from '@latitude-data/constants'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import Link from 'next/link'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { useMemo } from 'react'
import { ROUTES } from '$/services/routes'
import {
  getEvaluationMetricSpecification,
  getEvaluationTypeSpecification,
} from '$/components/evaluations'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { TextColor } from '@latitude-data/web-ui/tokens'
import { ModifiedDocumentType } from '@latitude-data/core/browser'
import { cn } from '@latitude-data/web-ui/utils'
import { useModifiedColors } from '$/components/Sidebar/Files/useModifiedColors'
import { IndentationLine } from '$/components/Sidebar/Files/IndentationBar'
import { UseEvaluationPathReturn } from '$/components/Sidebar/Files/useEvaluationPath'
import { IndentType } from '$/components/Sidebar/Files/NodeHeaderWrapper'

const INDENTATION_UNIT_PX = 24
function IndentationBar({
  promptIndentationSize,
  isLast,
}: {
  promptIndentationSize: number
  isLast: boolean
}) {
  return (
    <div className='flex flex-row'>
      <div
        style={{ width: promptIndentationSize * INDENTATION_UNIT_PX }}
        className='h-6'
      />
      <div className='flex justify-center min-w-6 h-6'>
        <IndentationLine showCurve={isLast} />
      </div>
    </div>
  )
}

function EvaluationItem({
  isLast,
  color,
  indentation,
  selectedBackgroundColor,
  selectedBackgroundColorHover,
  commitUuid,
  projectId,
  documentUuid,
  evaluation,
  currentEvaluationUuid,
}: {
  isLast: boolean
  color: TextColor
  selectedBackgroundColor: string
  selectedBackgroundColorHover: string
  indentation?: IndentType[]
  evaluation: EvaluationV2
  commitUuid: string
  projectId: number
  documentUuid: string
  currentEvaluationUuid: UseEvaluationPathReturn['currentEvaluationUuid']
}) {
  const spec = getEvaluationTypeSpecification(evaluation)
  const metricSpec = getEvaluationMetricSpecification(evaluation)
  const isSelected = evaluation.uuid === currentEvaluationUuid
  const url = isSelected
    ? '#'
    : ROUTES.projects
        .detail({ id: projectId })
        .commits.detail({ uuid: commitUuid })
        .documents.detail({ uuid: documentUuid })
        .evaluationsV2.detail({ uuid: evaluation.uuid }).root
  const ItemComponent = isSelected ? 'div' : Link
  return (
    <ItemComponent
      href={url}
      className={cn('flex flex-row items-center gap-x-1 min-w-0 py-0.5 pr-2', {
        [selectedBackgroundColor]: isSelected,
        [`${selectedBackgroundColorHover} cursor-pointer`]: !isSelected,
      })}
    >
      <IndentationBar
        promptIndentationSize={indentation?.length ?? 0}
        isLast={isLast}
      />
      <div className='flex-none relative w-6 h-6 -ml-2'>
        <div
          className={cn('sidebar-icon-mask absolute inset-0 z-50', {
            'opacity-1': isSelected,
            'opacity-70': !isSelected,
          })}
        >
          <Icon
            name={spec.icon}
            color={color}
            className='absolute top-1 left-0'
          />
        </div>
        <div className='z-10 absolute bottom-1 right-0.5'>
          <Icon name={metricSpec.icon} color={color} size='xsmall' />
        </div>
      </div>
      <Text.H5M
        ellipsis
        noWrap
        userSelect={false}
        color={color}
        textOpacity={isSelected ? 100 : 70}
      >
        {evaluation.name}
      </Text.H5M>
    </ItemComponent>
  )
}

export function EvaluationList({
  changeType,
  indentation,
  documentUuid,
  currentEvaluationUuid,
}: {
  changeType?: ModifiedDocumentType | undefined
  indentation?: IndentType[]
  documentUuid: string
  currentEvaluationUuid: UseEvaluationPathReturn['currentEvaluationUuid']
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const document = useMemo(
    () => ({ documentUuid, commitId: commit.id }),
    [documentUuid, commit.id],
  )
  const { color, selectedBackgroundColor, selectedBackgroundColorHover } =
    useModifiedColors({
      changeType,
    })
  const { data } = useEvaluationsV2({
    project,
    commit,
    document,
  })
  const evaluationsSize = data.length
  return (
    <ul className='flex flex-col min-w-0'>
      {data.map((evaluation, index) => (
        <li key={evaluation.uuid}>
          <EvaluationItem
            isLast={index === evaluationsSize - 1}
            indentation={indentation}
            color={color}
            selectedBackgroundColor={selectedBackgroundColor}
            selectedBackgroundColorHover={selectedBackgroundColorHover}
            projectId={project.id}
            commitUuid={commit.uuid}
            documentUuid={documentUuid}
            evaluation={evaluation}
            currentEvaluationUuid={currentEvaluationUuid}
          />
        </li>
      ))}
    </ul>
  )
}
