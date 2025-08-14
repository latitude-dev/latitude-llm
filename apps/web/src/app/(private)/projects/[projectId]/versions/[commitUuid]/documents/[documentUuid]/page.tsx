import {
  findCommitCached,
  getDocumentByUuidCached,
  getDocumentsAtCommitCached,
  getProviderApiKeysCached,
} from '$/app/(private)/_data-access'
import providerApiKeyPresenter from '$/presenters/providerApiKeyPresenter'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import { getFreeRuns } from '@latitude-data/core/services/freeRunsManager/index'
import { env } from '@latitude-data/env'
import { redirect } from 'next/navigation'
import DocumentEditor from './_components/DocumentEditor/Editor'
import { ExperimentsRepository } from '@latitude-data/core/repositories'

async function getDiffFromExperimentId({
  workspaceId,
  experimentId,
}: {
  workspaceId: number
  experimentId?: number
}): Promise<string | undefined> {
  if (!experimentId || isNaN(experimentId)) {
    return undefined
  }
  const experimentsScope = new ExperimentsRepository(workspaceId)
  const experimentResult = await experimentsScope.find(experimentId)
  if (!experimentResult.ok) return undefined

  const newValue = experimentResult.unwrap().metadata.prompt
  return newValue
}

/**
 * Documentation:
 * https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config#dynamic
 *
 * NextJS is not the best. Without this the page gets cached second time the user visits it (I think)
 */
export const dynamic = 'force-dynamic'

export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{
    projectId: string
    commitUuid: string
    documentUuid: string
  }>
  searchParams: Promise<{
    applyExperimentId?: string
  }>
}) {
  const { projectId: pjid, commitUuid, documentUuid } = await params
  const projectId = Number(pjid)
  const { workspace } = await getCurrentUserOrRedirect()

  let commit
  try {
    commit = await findCommitCached({ projectId, uuid: commitUuid })
  } catch (error) {
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

  const awaitedSearchParams = await searchParams
  const initialDiff = await getDiffFromExperimentId({
    workspaceId: workspace.id,
    experimentId: Number(awaitedSearchParams?.['applyExperimentId']),
  })

  return (
    <DocumentEditor
      documents={documents}
      document={document}
      providerApiKeys={providerApiKeys.map(providerApiKeyPresenter)}
      freeRunsCount={freeRunsCount ? Number(freeRunsCount) : undefined}
      copilotEnabled={env.LATITUDE_CLOUD}
      initialDiff={initialDiff}
    />
  )
}
