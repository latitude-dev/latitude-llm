import {
  findCommitCached,
  findProjectCached,
  getDocumentLogsAtCommitCached,
} from '$/app/(private)/_data-access'
import { getCurrentUser } from '$/services/auth/getCurrentUser'

import { Header } from '../_components/DocumentEditor/Editor/Header'
import DocumentWrapper from '../_components/DocumentWrapper'
import { DocumentLogsTable } from './_components/DocumentLogs'

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
  const logs = await getDocumentLogsAtCommitCached({
    documentUuid: params.documentUuid,
    commit,
  })

  return (
    <DocumentWrapper params={params} selected='logs'>
      <div className='flex flex-col w-full h-full'>
        <div className='flex flex-row w-full h-full gap-8 p-6'>
          <div className='flex flex-col flex-1 flex-grow flex-shrink gap-2 min-w-0'>
            <Header title='Logs' />
            <DocumentLogsTable documentLogs={logs} />
          </div>
        </div>
      </div>
    </DocumentWrapper>
  )
}
