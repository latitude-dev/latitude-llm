import { NotFoundError } from '@latitude-data/core/lib/errors'
import { QueryParams } from '@latitude-data/core/lib/pagination/buildPaginatedUrl'
import { findManyByIdAndEvaluation } from '@latitude-data/core/services/evaluationResults/findManyByIdAndEvaluation'
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
import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'

import DocumentEditor from './_components/DocumentEditor/Editor'
import { PromptlNotificationModal } from './_components/PromptlNotificationModal'
import env from '$/env'

export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{
    projectId: string
    commitUuid: string
    documentUuid: string
  }>
  searchParams: Promise<QueryParams>
}) {
  const { projectId: pjid, commitUuid, documentUuid } = await params
  const projectId = Number(pjid)
  const { workspace } = await getCurrentUser()
  const query = await searchParams

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
  const refinementResult = await findManyByIdAndEvaluation({
    ids: query.reval,
    workspace,
    documentUuid,
  })

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
        runDocumentAction={runDocumentAction}
        addMessagesAction={addMessagesAction}
        documents={documents}
        document={document}
        providerApiKeys={providerApiKeys.map(providerApiKeyPresenter)}
        freeRunsCount={freeRunsCount ? Number(freeRunsCount) : undefined}
        evaluationResults={refinementResult.evaluationResults ?? []}
        evaluation={refinementResult.evaluation}
        copilotEnabled={env.LATITUDE_CLOUD}
      />
      <PromptlNotificationModal documents={documents} />
    </>
  )
}
