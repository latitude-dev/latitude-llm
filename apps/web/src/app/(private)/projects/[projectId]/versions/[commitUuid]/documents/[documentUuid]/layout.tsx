import { ReactNode } from 'react'

import {
  getApiKeysCached,
  getDocumentByUuidCached,
} from '$/app/(private)/_data-access'
import { DocumentVersionProvider } from '$/app/providers/DocumentProvider'
import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'

import DocumentsLayout from '../../_components/DocumentsLayout'
import DocumentationModal, {
  DocumentationModalProvider,
} from './_components/DocumentationModal'
import DocumentTabs from './_components/DocumentTabs'
import buildMetatags from '$/app/_lib/buildMetatags'

export const metadata = buildMetatags({
  locationDescription: 'Prompt Editor and Playground',
})

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
      <DocumentVersionProvider
        document={document}
        projectId={projectId}
        commitUuid={commitUuid}
      >
        <DocumentsLayout
          projectId={projectId}
          commitUuid={commitUuid}
          document={document}
        >
          <DocumentationModalProvider>
            <DocumentationModal
              projectId={String(projectId)}
              commitUuid={commitUuid}
              apiKeys={apiKeys}
            />
            <DocumentTabs document={document} params={paramsAwaited}>
              {children}
            </DocumentTabs>
          </DocumentationModalProvider>
        </DocumentsLayout>
      </DocumentVersionProvider>
    )
  } catch (error) {
    return redirect(
      ROUTES.projects
        .detail({ id: Number(projectId) })
        .commits.detail({ uuid: commitUuid }).documents.root,
    )
  }
}
