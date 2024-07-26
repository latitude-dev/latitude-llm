import {
  findCommit,
  findProject,
  getDocumentByUuid,
} from '$/app/(private)/_data-access'
import { getCurrentUser } from '$/services/auth/getCurrentUser'

import ClientDocumentEditor from './_components/DocumentEditor'

export default async function DocumentPage({
  params,
}: {
  params: { projectId: string; commitUuid: string; documentUuid: string }
}) {
  const session = await getCurrentUser()
  const project = await findProject({
    projectId: Number(params.projectId),
    workspaceId: session.workspace.id,
  })
  const commit = await findCommit({
    project,
    uuid: params.commitUuid,
  })
  const document = await getDocumentByUuid({
    documentUuid: params.documentUuid,
    commit,
  })
  return <ClientDocumentEditor commit={commit} document={document} />
}
