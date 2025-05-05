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
import { usePathname } from 'next/navigation'
import { getEvaluationMetricSpecification } from '$/components/evaluations'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { TextColor } from '@latitude-data/web-ui/tokens'
import { IndentType } from '$/components/Sidebar/Files/NodeHeaderWrapper'
import { ModifiedDocumentType } from '@latitude-data/core/browser'
import { cn } from '@latitude-data/web-ui/utils'
import { useModifiedColors } from '$/components/Sidebar/Files/useModifiedColors'
import { IndentationBar } from '$/components/Sidebar/Files/IndentationBar'

function EvaluationItem({
  isLast,
  color,
  indentation: promptIndentation,
  selectedBackgroundColor,
  commitUuid,
  projectId,
  documentUuid,
  evaluation,
  currentEvaluationUuid,
}: {
  isLast: boolean
  color: TextColor
  indentation: IndentType[]
  selectedBackgroundColor: string
  evaluation: EvaluationV2
  commitUuid: string
  projectId: number
  documentUuid: string
  currentEvaluationUuid?: string | null
}) {
  const spec = getEvaluationMetricSpecification(evaluation)
  const isSelected = evaluation.uuid === currentEvaluationUuid
  const url = isSelected
    ? '#'
    : ROUTES.projects
        .detail({ id: projectId })
        .commits.detail({ uuid: commitUuid })
        .documents.detail({ uuid: documentUuid })
        .evaluationsV2.detail({ uuid: evaluation.uuid }).root
  const ItemComponent = isSelected ? 'div' : Link
  const indentation = useMemo(
    () => [...promptIndentation, { isLast }],
    [isLast, promptIndentation],
  )
  return (
    <ItemComponent
      href={url}
      className={cn('flex flex-row items-center gap-x-1 min-w-0 py-0.5 pr-2', {
        [selectedBackgroundColor]: isSelected,
        'hover:bg-muted cursor-pointer': !isSelected,
      })}
    >
      <IndentationBar indentation={indentation} hasChildren={false} />
      <Icon name={spec.icon} className='flex-none' color={color} />
      <Text.H5M ellipsis noWrap userSelect={false} color={color}>
        {evaluation.name}
      </Text.H5M>
    </ItemComponent>
  )
}

const EVALUATION_PATH_REGEX =
  /evaluations-v2\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/

export function EvaluationList({
  indentation,
  changeType,
  documentUuid,
}: {
  changeType?: ModifiedDocumentType | undefined
  indentation: IndentType[]
  documentUuid: string
}) {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const document = useMemo(
    () => ({ documentUuid, commitId: commit.id }),
    [documentUuid, commit.id],
  )
  const pathname = usePathname()
  const match = pathname.match(EVALUATION_PATH_REGEX)
  const currentEvaluationUuid = match ? match[1] : null
  const { color, selectedBackgroundColor } = useModifiedColors({
    changeType,
  })
  const { data } = useEvaluationsV2({
    project,
    commit,
    document,
  })
  const evaluationsSize = data.length

  return (
    <ul className='flex flex-col gap-y-1 min-w-0'>
      {data.map((evaluation, index) => (
        <li key={evaluation.uuid}>
          <EvaluationItem
            isLast={index === evaluationsSize - 1}
            indentation={indentation}
            color={color}
            selectedBackgroundColor={selectedBackgroundColor}
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
