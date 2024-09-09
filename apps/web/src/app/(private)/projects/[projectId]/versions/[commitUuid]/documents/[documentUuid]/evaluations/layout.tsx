import { ReactNode } from 'react'

import { TableBlankSlate, TableWithHeader } from '@latitude-data/web-ui'
import { getEvaluationsByDocumentUuidCached } from '$/app/(private)/_data-access'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'

import Layout from './_components/Layout'

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
    .documents.detail({ uuid: documentUuid }).evaluations.connect.root

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
        table={
          <>
            {evaluations.length > 0 && <Layout evaluations={evaluations} />}
            {evaluations.length === 0 && (
              <TableBlankSlate
                description='There are no evaluations connected to this prompt yet. Connect one to start evaluating the prompt.'
                link={
                  <Link href={href}>
                    <TableBlankSlate.Button>
                      Connect your first evaluation
                    </TableBlankSlate.Button>
                  </Link>
                }
              />
            )}
          </>
        }
      />
    </div>
  )
}
