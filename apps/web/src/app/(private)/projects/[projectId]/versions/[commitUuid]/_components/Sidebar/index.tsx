import {
  Commit,
  DocumentVersion,
  DocumentVersionsRepository,
} from '@latitude-data/core'
import { DocumentSidebar } from '@latitude-data/web-ui'
import { getCurrentUser } from '$/services/auth/getCurrentUser'

import ClientFilesTree from './ClientFilesTree'

export default async function Sidebar({
  commit,
  currentDocument,
}: {
  commit: Commit
  currentDocument?: DocumentVersion
}) {
  const { workspace } = await getCurrentUser()
  const docsScope = new DocumentVersionsRepository(workspace.id)
  const documents = await docsScope.getDocumentsAtCommit({ commit })
  return (
    <DocumentSidebar>
      <ClientFilesTree
        currentDocument={currentDocument}
        documents={documents.unwrap()}
      />
    </DocumentSidebar>
  )
}
