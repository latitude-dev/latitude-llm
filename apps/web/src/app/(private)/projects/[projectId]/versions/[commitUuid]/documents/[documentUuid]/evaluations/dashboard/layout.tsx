import { ReactNode } from 'react'

import { TableWithHeader } from '@latitude-data/web-ui'
import { getEvaluationsByDocumentUuidCached } from '$/app/(private)/_data-access'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'

import EvaluationsLayoutClient from './_components/Layout'

export default async function EvaluationsLayout({
  children,
  params: { projectId, commitUuid, documentUuid },
}: {
  children: ReactNode
  params: { projectId: string; commitUuid: string; documentUuid: string }
}) {
  const evaluations = await getEvaluationsByDocumentUuidCached(documentUuid)
  const href = ROUTES.projects
    .detail({ id: Number(projectId) })
    .commits.detail({ uuid: commitUuid })
    .documents.detail({ uuid: documentUuid }).evaluations.dashboard.connect.root

  return (
    <div className='w-full p-6'>
      {children}
      <TableWithHeader
        title='Evaluations'
        actions={
          <Link href={href}>
            <TableWithHeader.Button>Connect evaluation</TableWithHeader.Button>
          </Link>
        }
        table={<EvaluationsLayoutClient evaluations={evaluations} />}
      />
    </div>
  )
}
