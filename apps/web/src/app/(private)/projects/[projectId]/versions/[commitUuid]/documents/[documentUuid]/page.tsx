import { streamTextAction } from '$/actions/documents/streamTextAction'
import {
  findCommitCached,
  findProjectCached,
  getDocumentByUuidCached,
  getDocumentsAtCommitCached,
} from '$/app/(private)/_data-access'
import { getCurrentUser } from '$/services/auth/getCurrentUser'

import DocumentsLayout from '../../_components/DocumentsLayout'
import DocumentEditor from './_components/DocumentEditor/Editor'

export default async function DocumentPage({
  params,
}: {
  params: { projectId: string; commitUuid: string; documentUuid: string }
}) {
  const session = await getCurrentUser()
  const projectId = Number(params.projectId)
  const commintUuid = params.commitUuid
  const project = await findProjectCached({
    projectId,
    workspaceId: session.workspace.id,
  })
  const commit = await findCommitCached({ project, uuid: commintUuid })
  const document = await getDocumentByUuidCached({
    documentUuid: params.documentUuid,
    commit,
  })
  const documents = await getDocumentsAtCommitCached({ commit })

  return (
    <DocumentsLayout
      projectId={projectId}
      commitUuid={commintUuid}
      document={document}
    >
      <DocumentEditor
        streamTextAction={streamTextAction}
        documents={documents}
        document={document}
      />
    </DocumentsLayout>
  )
}
