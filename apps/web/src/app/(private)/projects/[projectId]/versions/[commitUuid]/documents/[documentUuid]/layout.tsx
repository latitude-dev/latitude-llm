import { ReactNode } from 'react'

import { DocumentVersionProvider } from '@latitude-data/web-ui'
import { getDocumentByUuidCached } from '$/app/(private)/_data-access'
import env from '$/env'
import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'

import DocumentsLayout from '../../_components/DocumentsLayout'
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
          <DocumentTabs params={params}>{children}</DocumentTabs>
        </DocumentsLayout>
      </DocumentVersionProvider>
    )
  } catch (error) {
    // TODO: Show a 404 page within the documents layout, while still showing
    // the sidebar and stuff For now, we just redirect to documents root if
    // document is not found instead for a cleaner UX
    if (env.NODE_ENV === 'development') {
      console.error(error)
    }

    return redirect(
      ROUTES.projects
        .detail({ id: Number(params.projectId) })
        .commits.detail({ uuid: params.commitUuid }).documents.root,
    )
  }
}
