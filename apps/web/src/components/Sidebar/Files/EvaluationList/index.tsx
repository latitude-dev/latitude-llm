import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import {
  getEvaluationMetricSpecification,
  getEvaluationTypeSpecification,
} from '$/components/evaluations'
import { IndentationLine } from '$/components/Sidebar/Files/IndentationBar'
import { IndentType } from '$/components/Sidebar/Files/NodeHeaderWrapper'
import { useModifiedColors } from '$/components/Sidebar/Files/useModifiedColors'
import { ROUTES } from '$/services/routes'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import {
  EvaluationV2,
  ModifiedDocumentType,
} from '@latitude-data/core/constants'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextColor } from '@latitude-data/web-ui/tokens'
import { cn } from '@latitude-data/web-ui/utils'
import { type ParamValue } from 'next/dist/server/request/params'
import Link from 'next/link'
import { useMemo } from 'react'

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
  currentEvaluationUuid: ParamValue
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
        .evaluations.detail({ uuid: evaluation.uuid }).root
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
  document,
  currentEvaluationUuid,
}: {
  changeType?: ModifiedDocumentType | undefined
  indentation?: IndentType[]
  document: DocumentVersion
  currentEvaluationUuid: ParamValue
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { color, selectedBackgroundColor, selectedBackgroundColorHover } =
    useModifiedColors({
      changeType,
    })
  const { data } = useEvaluationsV2({
    project,
    commit,
    document,
  })
  const evaluations = useMemo(() => {
    return data.filter((evaluation) => !evaluation.ignoredAt)
  }, [data])
  return (
    <ul className='flex flex-col min-w-0'>
      {evaluations.map((evaluation, index) => (
        <li key={evaluation.uuid}>
          <EvaluationItem
            isLast={index === evaluations.length - 1}
            indentation={indentation}
            color={color}
            selectedBackgroundColor={selectedBackgroundColor}
            selectedBackgroundColorHover={selectedBackgroundColorHover}
            projectId={project.id}
            commitUuid={commit.uuid}
            documentUuid={document.documentUuid}
            evaluation={evaluation}
            currentEvaluationUuid={currentEvaluationUuid}
          />
        </li>
      ))}
    </ul>
  )
}
