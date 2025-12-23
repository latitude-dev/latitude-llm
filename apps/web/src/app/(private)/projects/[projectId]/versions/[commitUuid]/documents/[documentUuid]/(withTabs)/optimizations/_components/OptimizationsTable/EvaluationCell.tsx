'use client'

import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { ROUTES } from '$/services/routes'
import { EvaluationV2 } from '@latitude-data/core/constants'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import Link from 'next/link'

export function EvaluationCell({
  evaluation,
  commitUuid,
  hasError,
}: {
  evaluation?: EvaluationV2
  commitUuid: string
  hasError: boolean
}) {
  const { project } = useCurrentProject()
  const { document } = useCurrentDocument()

  if (!evaluation) {
    return (
      <Tooltip
        asChild
        trigger={
          <Badge variant='outlineMuted' disabled>
            <Text.H6
              color={hasError ? 'destructive' : 'foregroundMuted'}
              userSelect={false}
            >
              Unknown
            </Text.H6>
          </Badge>
        }
        align='center'
        side='top'
        delayDuration={750}
      >
        Evaluation was deleted
      </Tooltip>
    )
  }

  const href = ROUTES.projects
    .detail({ id: project.id })
    .commits.detail({ uuid: commitUuid })
    .documents.detail({ uuid: document.documentUuid })
    .evaluations.detail({ uuid: evaluation.uuid }).root

  return (
    <Link href={href} target='_blank' onClick={(e) => e.stopPropagation()}>
      <Badge variant='outlineMuted'>
        <div className='flex flex-row gap-1 items-center'>
          <Text.H6
            color={hasError ? 'destructive' : 'foreground'}
            userSelect={false}
          >
            {evaluation.name}
          </Text.H6>
          <Icon name='externalLink' size='small' className='shrink-0' />
        </div>
      </Badge>
    </Link>
  )
}
