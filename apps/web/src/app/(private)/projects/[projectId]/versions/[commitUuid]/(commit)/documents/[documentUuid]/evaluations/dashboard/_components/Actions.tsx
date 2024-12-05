'use client'

import { TableWithHeader } from '@latitude-data/web-ui'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'

export function Actions({
  projectId,
  commitUuid,
  documentUuid,
}: {
  projectId: string
  commitUuid: string
  documentUuid: string
}) {
  const href = ROUTES.projects
    .detail({ id: Number(projectId) })
    .commits.detail({ uuid: commitUuid })
    .documents.detail({ uuid: documentUuid }).evaluations.dashboard.connect.root

  return (
    <Link href={href}>
      <TableWithHeader.Button>Connect evaluation</TableWithHeader.Button>
    </Link>
  )
}
