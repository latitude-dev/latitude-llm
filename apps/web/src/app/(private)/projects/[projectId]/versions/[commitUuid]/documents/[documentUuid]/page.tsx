import { addMessagesAction } from '$/actions/sdk/addMessagesAction'
import { runDocumentAction } from '$/actions/sdk/runDocumentAction'
import {
  findCommitCached,
  findProjectCached,
  getDocumentByUuidCached,
  getDocumentsAtCommitCached,
} from '$/app/(private)/_data-access'
import { getCurrentUser } from '$/services/auth/getCurrentUser'

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
    <DocumentEditor
      runDocumentAction={runDocumentAction}
      addMessagesAction={addMessagesAction}
      documents={documents}
      document={document}
    />
  )
}
