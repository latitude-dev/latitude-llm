import { TableBlankSlate, TableWithHeader } from '@latitude-data/web-ui'
import {
  findCommitCached,
  getDocumentLogsWithMetadataCached,
} from '$/app/(private)/_data-access'

import { DocumentLogs } from './_components/DocumentLogs'

export default async function DocumentPage({
  params,
}: {
  params: { projectId: string; commitUuid: string; documentUuid: string }
}) {
  const projectId = Number(params.projectId)
  const commitUuid = params.commitUuid
  const commit = await findCommitCached({ projectId, uuid: commitUuid })
  const logs = await getDocumentLogsWithMetadataCached({
    documentUuid: params.documentUuid,
    commit,
  })

  return (
    <div className='flex flex-col w-full h-full overflow-hidden p-6 gap-2 min-w-0'>
      <TableWithHeader
        title='Logs'
        table={
          <>
            {!logs.length && (
              <TableBlankSlate description='There are no logs for this prompt yet. Logs will appear here when you run the prompt for the first time.' />
            )}
            {logs.length > 0 && <DocumentLogs documentLogs={logs} />}
          </>
        }
      />
    </div>
  )
}
