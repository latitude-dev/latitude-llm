import React from 'react'

import { DocumentDetailWrapper } from '@latitude-data/web-ui'
import { findCommit, getDocumentByUuid } from '$/app/(private)/_data-access'

import Sidebar from '../../_components/Sidebar'

export default async function DocumentLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { projectId: string; commitUuid: string; documentUuid: string }
}) {
  const commit = await findCommit({
    projectId: Number(params.projectId),
    uuid: params.commitUuid,
  })
  const document = await getDocumentByUuid({
    documentUuid: params.documentUuid,
    commitId: commit.id,
  })
  return (
    <DocumentDetailWrapper>
      <Sidebar
        commit={commit}
        documentUuid={params.documentUuid}
        documentPath={document.path}
      />
      <div className='p-32'>{children}</div>
    </DocumentDetailWrapper>
  )
}
