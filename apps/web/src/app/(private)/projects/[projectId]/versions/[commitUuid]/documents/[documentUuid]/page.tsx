import {
  findCommitCached,
  getDocumentByUuidCached,
  getDocumentsAtCommitCached,
} from '$/app/(private)/_data-access'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import { getFreeRuns } from '@latitude-data/core/services/freeRunsManager/index'
import { env } from '@latitude-data/env'
import { redirect } from 'next/navigation'
import { MetadataProvider } from '$/components/MetadataProvider'
import { DevModeProvider } from '$/hooks/useDevMode'
import { DocumentValueProvider } from '$/hooks/useDocumentValueContext'
import DocumentEditor from './_components/DocumentEditor/Editor'

export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{
    projectId: string
    commitUuid: string
    documentUuid: string
  }>
  searchParams: Promise<{ showPreview?: string }>
}) {
  const queryParams = await searchParams
  const showPreview = queryParams.showPreview === 'true'
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
  const freeRunsCount = await getFreeRuns(workspace.id)

  return (
    <MetadataProvider>
      <DevModeProvider>
        <DocumentValueProvider document={document} documents={documents}>
          <DocumentEditor
            freeRunsCount={freeRunsCount ? Number(freeRunsCount) : undefined}
            showPreview={showPreview}
            refinementEnabled={env.LATITUDE_CLOUD}
          />
        </DocumentValueProvider>
      </DevModeProvider>
    </MetadataProvider>
  )
}
