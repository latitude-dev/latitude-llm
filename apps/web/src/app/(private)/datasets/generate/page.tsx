import { HEAD_COMMIT } from '@latitude-data/core/browser'
import {
  findCommitCached,
  getDocumentsAtCommitCached,
  getFirstProjectCached,
} from '$/app/(private)/_data-access'
import { getCurrentUser } from '$/services/auth/getCurrentUser'

import { GenerateDatasetContent } from './GenerateDatasetContent'

export default async function GenerateDatasetPage() {
  const { workspace } = await getCurrentUser()
  const project = await getFirstProjectCached({ workspaceId: workspace.id })
  const commit = await findCommitCached({
    uuid: HEAD_COMMIT,
    projectId: Number(project.id),
  })
  const documents = await getDocumentsAtCommitCached({ commit })

  return (
    <GenerateDatasetContent
      fallbackDocuments={documents}
      projectId={Number(project.id)}
    />
  )
}
