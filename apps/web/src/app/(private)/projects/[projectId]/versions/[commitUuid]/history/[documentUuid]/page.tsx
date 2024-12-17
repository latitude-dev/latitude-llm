import {
  findCommitsByProjectCached,
  findCommitsWithDocumentChangesCached,
} from '$/app/(private)/_data-access'
import DocumentsLayout from '../../_components/DocumentsLayout'

import { ProjectChanges } from '../_components/ProjectChanges'

export default async function DocumentHistoryPage({
  params,
}: {
  params: Promise<{
    projectId: string
    commitUuid: string
    documentUuid: string
  }>
}) {
  const { projectId, commitUuid, documentUuid } = await params
  const allCommits = await findCommitsByProjectCached({
    projectId: Number(projectId),
  })
  const documentCommits = await findCommitsWithDocumentChangesCached({
    projectId: Number(projectId),
    documentUuid,
  })

  return (
    <DocumentsLayout projectId={Number(projectId)} commitUuid={commitUuid}>
      <ProjectChanges
        allCommits={allCommits}
        documentCommits={documentCommits}
        documentUuid={documentUuid}
      />
    </DocumentsLayout>
  )
}
