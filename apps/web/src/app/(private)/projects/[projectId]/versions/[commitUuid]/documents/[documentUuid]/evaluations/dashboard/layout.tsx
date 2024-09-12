import { ReactNode } from 'react'

import { TableWithHeader } from '@latitude-data/web-ui'
import { getEvaluationsByDocumentUuidCached } from '$/app/(private)/_data-access'

import { Actions } from './_components/Actions'
import EvaluationsLayoutClient from './_components/Layout'

export default async function EvaluationsLayout({
  children,
  params: { projectId, commitUuid, documentUuid },
}: {
  children: ReactNode
  params: { projectId: string; commitUuid: string; documentUuid: string }
}) {
  const evaluations = await getEvaluationsByDocumentUuidCached(documentUuid)
  return (
    <div className='w-full p-6'>
      {children}
      <TableWithHeader
        title='Evaluations'
        actions={
          <Actions
            projectId={projectId}
            commitUuid={commitUuid}
            documentUuid={documentUuid}
          />
        }
        table={<EvaluationsLayoutClient evaluations={evaluations} />}
      />
    </div>
  )
}
