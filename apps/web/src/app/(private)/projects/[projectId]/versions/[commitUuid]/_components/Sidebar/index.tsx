import { Suspense } from 'react'

import { Commit, getDocumentsAtCommit } from '@latitude-data/core'
import { DocumentSidebar } from '@latitude-data/web-ui'

import ClientFilesTree from './ClientFilesTree'

export default async function Sidebar({
  commit,
  documentUuid,
}: {
  commit: Commit
  documentUuid?: string
}) {
  const documents = await getDocumentsAtCommit({ commitId: commit.id })
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <DocumentSidebar>
        <ClientFilesTree
          documents={documents.unwrap()}
          documentUuid={documentUuid}
        />
      </DocumentSidebar>
    </Suspense>
  )
}
