'use client'

import { EvaluationDto } from '@latitude-data/core/browser'
import { TableWithHeader } from '@latitude-data/web-ui'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'

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
    <Link href={href}>
      <TableWithHeader.Button>Run batch evaluation</TableWithHeader.Button>
    </Link>
  )
}
