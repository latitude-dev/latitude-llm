import {
  findCommit,
  findProject,
  getDocumentByUuid,
} from '$/app/(private)/_data-access'
import { getCurrentUser } from '$/services/auth/getCurrentUser'

import DocumentsLayout from '../../_components/DocumentsLayout'
import ClientDocumentEditor from './_components/DocumentEditor'

export default async function DocumentPage({
  params,
}: {
  params: { projectId: string; commitUuid: string; documentUuid: string }
}) {
  const session = await getCurrentUser()
  const projectId = Number(params.projectId)
  const commintUuid = params.commitUuid
  const project = await findProject({
    projectId,
    workspaceId: session.workspace.id,
  })
  const commit = await findCommit({ project, uuid: commintUuid })
  const document = await getDocumentByUuid({
    documentUuid: params.documentUuid,
    commit,
  })

  return (
    <DocumentsLayout
      projectId={projectId}
      commitUuid={commintUuid}
      document={document}
    >
      <ClientDocumentEditor commit={commit} document={document} />
    </DocumentsLayout>
  )
}
