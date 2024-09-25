'use client'

import { EvaluationDto } from '@latitude-data/core/browser'
import { Button, Icon, TableWithHeader } from '@latitude-data/web-ui'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'

import LiveEvaluationToggle from './LiveEvaluationToggle'

export function Actions({
  evaluation,
  projectId,
  commitUuid,
  documentUuid,
}: {
  evaluation: EvaluationDto
  projectId: string
  commitUuid: string
  documentUuid: string
}) {
  const href = ROUTES.projects
    .detail({ id: Number(projectId) })
    .commits.detail({ uuid: commitUuid })
    .documents.detail({ uuid: documentUuid })
    .evaluations.detail(evaluation.id).createBatch

  return (
    <div className='flex flex-row items-center gap-4'>
      <LiveEvaluationToggle
        documentUuid={documentUuid}
        evaluation={evaluation}
      />
      <Link href={ROUTES.evaluations.detail({ uuid: evaluation.uuid }).root}>
        <Button variant='ghost'>
          Go to evaluation <Icon name='externalLink' />
        </Button>
      </Link>
      <Link href={href}>
        <TableWithHeader.Button>Run batch evaluation</TableWithHeader.Button>
      </Link>
    </div>
  )
}
