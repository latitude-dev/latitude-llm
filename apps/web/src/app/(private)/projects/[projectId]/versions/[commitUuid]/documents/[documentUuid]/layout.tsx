import { ReactNode } from 'react'

import { DocumentVersionProvider } from '@latitude-data/web-ui'
import {
  getApiKeysCached,
  getDocumentByUuidCached,
} from '$/app/(private)/_data-access'
import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'

import DocumentsLayout from '../../_components/DocumentsLayout'
import DocumentationModal, {
  DocumentationModalProvider,
} from './_components/DocumentationModal'
import DocumentTabs from './_components/DocumentTabs'

export default async function DocumentPage({
  params,
  children,
}: {
  params: { projectId: string; commitUuid: string; documentUuid: string }
  children: ReactNode
}) {
  const projectId = Number(params.projectId)
  const documentUuid = params.documentUuid
  const commitUuid = params.commitUuid

  try {
    const apiKeys = await getApiKeysCached()
    const document = await getDocumentByUuidCached({
      projectId,
      commitUuid,
      documentUuid,
    })

    return (
      <DocumentVersionProvider document={document}>
        <DocumentsLayout
          projectId={projectId}
          commitUuid={commitUuid}
          document={document}
        >
          <DocumentationModalProvider>
            <DocumentationModal
              projectId={params.projectId}
              commitUuid={params.commitUuid}
              apiKeys={apiKeys}
            />
            <DocumentTabs params={params}>{children}</DocumentTabs>
          </DocumentationModalProvider>
        </DocumentsLayout>
      </DocumentVersionProvider>
    )
  } catch (error) {
    return redirect(
      ROUTES.projects
        .detail({ id: Number(params.projectId) })
        .commits.detail({ uuid: params.commitUuid }).documents.root,
    )
  }
}
