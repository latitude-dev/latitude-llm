import {
  findCommitCached,
  getDocumentByUuidCached,
  getDocumentsAtCommitCached,
  getProviderApiKeysCached,
} from '$/app/(private)/_data-access'
import providerApiKeyPresenter from '$/presenters/providerApiKeyPresenter'
import { getCurrentUser } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import { getFreeRuns } from '@latitude-data/core/services/freeRunsManager/index'
import { env } from '@latitude-data/env'
import { redirect } from 'next/navigation'
import DocumentEditor from './_components/DocumentEditor/Editor'

export default async function DocumentPage({
  params,
}: {
  params: Promise<{
    projectId: string
    commitUuid: string
    documentUuid: string
  }>
}) {
  const { projectId: pjid, commitUuid, documentUuid } = await params
  const projectId = Number(pjid)
  const { workspace } = await getCurrentUser()

  let commit
  try {
    commit = await findCommitCached({ projectId, uuid: commitUuid })
  } catch (error) {
    console.warn((error as Error).message)

    if (error instanceof NotFoundError) {
      return redirect(ROUTES.dashboard.root)
    }

    throw error
  }

  const document = await getDocumentByUuidCached({
    documentUuid: documentUuid,
    projectId,
    commitUuid,
  })
  const documents = await getDocumentsAtCommitCached({ commit })
  const providerApiKeys = await getProviderApiKeysCached()
  const freeRunsCount = await getFreeRuns(workspace.id)

  return (
    <>
      <DocumentEditor
        documents={documents}
        document={document}
        providerApiKeys={providerApiKeys.map(providerApiKeyPresenter)}
        freeRunsCount={freeRunsCount ? Number(freeRunsCount) : undefined}
        copilotEnabled={env.LATITUDE_CLOUD}
      />
    </>
  )
}
