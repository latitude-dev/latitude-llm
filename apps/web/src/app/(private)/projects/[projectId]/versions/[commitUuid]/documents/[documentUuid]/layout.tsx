import { ReactNode } from 'react'

import { DocumentVersionProvider } from '@latitude-data/web-ui'
import { getDocumentByUuidCached } from '$/app/(private)/_data-access'
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
    return redirect(
      ROUTES.projects
        .detail({ id: Number(params.projectId) })
        .commits.detail({ uuid: params.commitUuid }).documents.root,
    )
  }
}
