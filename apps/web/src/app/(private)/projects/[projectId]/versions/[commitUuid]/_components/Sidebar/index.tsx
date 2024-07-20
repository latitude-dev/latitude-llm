import { Suspense } from 'react'

import {
  Commit,
  DocumentVersionsRepository,
  findWorkspaceFromCommit,
} from '@latitude-data/core'
import { DocumentSidebar } from '@latitude-data/web-ui'

import ClientFilesTree from './ClientFilesTree'

export default async function Sidebar({
  commit,
  documentUuid,
  documentPath,
}: {
  commit: Commit
  documentPath?: string
  documentUuid?: string
}) {
  const workspace = await findWorkspaceFromCommit(commit)
  const docsScope = new DocumentVersionsRepository(workspace!.id)
  const documents = await docsScope.getDocumentsAtCommit(commit)
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <DocumentSidebar>
        <ClientFilesTree
          documentPath={documentPath}
          documents={documents.unwrap()}
          documentUuid={documentUuid}
        />
      </DocumentSidebar>
    </Suspense>
  )
}
