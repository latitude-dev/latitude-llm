import { getFreeRuns } from '@latitude-data/core/services/freeRunsManager/index'
import { addMessagesAction } from '$/actions/sdk/addMessagesAction'
import { runDocumentAction } from '$/actions/sdk/runDocumentAction'
import {
  findCommitCached,
  getDocumentByUuidCached,
  getDocumentsAtCommitCached,
  getProviderApiKeysCached,
} from '$/app/(private)/_data-access'
import providerApiKeyPresenter from '$/presenters/providerApiKeyPresenter'
import { getCurrentUser } from '$/services/auth/getCurrentUser'

import DocumentEditor from './_components/DocumentEditor/Editor'

export default async function DocumentPage({
  params,
}: {
  params: { projectId: string; commitUuid: string; documentUuid: string }
}) {
  const { workspace } = await getCurrentUser()
  const projectId = Number(params.projectId)
  const commitUuid = params.commitUuid
  const commit = await findCommitCached({ projectId, uuid: commitUuid })
  const document = await getDocumentByUuidCached({
    documentUuid: params.documentUuid,
    projectId,
    commitUuid,
  })
  const documents = await getDocumentsAtCommitCached({ commit })
  const providerApiKeys = await getProviderApiKeysCached()
  const freeRunsCount = await getFreeRuns(workspace.id)

  return (
    <DocumentEditor
      runDocumentAction={runDocumentAction}
      addMessagesAction={addMessagesAction}
      documents={documents}
      document={document}
      providerApiKeys={providerApiKeys.map(providerApiKeyPresenter)}
      freeRunsCount={freeRunsCount ? Number(freeRunsCount) : undefined}
    />
  )
}
