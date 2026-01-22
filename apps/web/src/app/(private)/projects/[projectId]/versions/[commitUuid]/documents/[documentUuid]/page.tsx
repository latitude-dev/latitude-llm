import {
  findCommitCached,
  getDocumentByUuidCached,
  getDocumentsAtCommitCached,
} from '$/app/(private)/_data-access'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import { getFreeRuns } from '@latitude-data/core/services/freeRunsManager/index'
import { redirect } from 'next/navigation'
import { MetadataProvider } from '$/components/MetadataProvider'
import { DevModeProvider } from '$/hooks/useDevMode'
import { DocumentValueProvider } from '$/hooks/useDocumentValueContext'
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

export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{
    projectId: string
    commitUuid: string
    documentUuid: string
  }>
  searchParams: Promise<{ showPreview?: string; applyExperimentId?: string }>
}) {
  const { showPreview: _showPreview, applyExperimentId: _applyExperimentId } =
    await searchParams
  const showPreview = _showPreview === 'true'
  const applyExperimentId = _applyExperimentId
    ? Number(_applyExperimentId)
    : undefined

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

  const experimentDiff = await getDiffFromExperimentId({
    workspaceId: workspace.id,
    experimentId: applyExperimentId,
  })

  return (
    <MetadataProvider>
      <DevModeProvider>
        <DocumentValueProvider
          document={document}
          documents={documents}
          initialDiffOptions={
            experimentDiff
              ? {
                  newValue: experimentDiff,
                  description: 'Restore prompt from experiment',
                  source: 'experiment',
                }
              : undefined
          }
        >
          <DocumentEditor
            freeRunsCount={freeRunsCount ? Number(freeRunsCount) : undefined}
            showPreview={showPreview}
          />
        </DocumentValueProvider>
      </DevModeProvider>
    </MetadataProvider>
  )
}
