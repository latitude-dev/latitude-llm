import { ReactNode } from 'react'

import {
  getApiKeysCached,
  getDocumentByUuidCached,
} from '$/app/(private)/_data-access'
import { DocumentVersionProvider } from '$/app/providers/DocumentProvider'
import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'

import DocumentsLayout from '../../_components/DocumentsLayout'
import { LastSeenCommitCookie } from '../../_components/LastSeenCommitCookie'
import DocumentationModal, {
  DocumentationModalProvider,
} from './_components/DocumentationModal'
import DocumentTabs from './_components/DocumentTabs'

export default async function DocumentPage({
  params,
  children,
}: {
  params: Promise<{
    projectId: string
    commitUuid: string
    documentUuid: string
  }>
  children: ReactNode
}) {
  const paramsAwaited = await params
  const { projectId: pjid, commitUuid, documentUuid } = paramsAwaited
  const projectId = Number(pjid)

  try {
    const apiKeys = await getApiKeysCached()
    const document = await getDocumentByUuidCached({
      projectId,
      commitUuid,
      documentUuid,
    })

    return (
      <DocumentsLayout
        document={document}
        projectId={projectId}
        commitUuid={commitUuid}
      >
        <DocumentVersionProvider
          document={document}
          documentUuid={documentUuid}
          projectId={projectId}
          commitUuid={commitUuid}
        >
          <DocumentationModalProvider>
            <DocumentationModal
              projectId={String(projectId)}
              commitUuid={commitUuid}
              apiKeys={apiKeys}
            />
            <LastSeenCommitCookie
              projectId={projectId}
              commitUuid={commitUuid}
              documentUuid={document.documentUuid}
            />
            <DocumentTabs params={await params}>{children}</DocumentTabs>
          </DocumentationModalProvider>
        </DocumentVersionProvider>
      </DocumentsLayout>
    )
  } catch (error) {
    return redirect(
      ROUTES.projects
        .detail({ id: Number(projectId) })
        .commits.detail({ uuid: commitUuid }).documents.root,
    )
  }
}
