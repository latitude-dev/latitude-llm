import {
  findCommitCached,
  findProjectCached,
  getDocumentLogsWithMetadataCached,
} from '$/app/(private)/_data-access'
import { getCurrentUser } from '$/services/auth/getCurrentUser'

import { Header } from '../_components/DocumentEditor/Editor/Header'
import { DocumentLogs } from './_components/DocumentLogs'

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
  const logs = await getDocumentLogsWithMetadataCached({
    documentUuid: params.documentUuid,
    commit,
  })

  return (
    <div className='flex flex-col w-full h-full overflow-hidden p-6 gap-2 min-w-0'>
      <Header title='Logs' />
      <DocumentLogs documentLogs={logs} />
    </div>
  )
}
