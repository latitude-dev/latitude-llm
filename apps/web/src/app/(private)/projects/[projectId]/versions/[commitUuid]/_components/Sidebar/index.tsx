import {
  Commit,
  CommitStatus,
  DocumentVersion,
  Project,
} from '@latitude-data/core/browser'
import { CommitsRepository } from '@latitude-data/core/repositories/index'
import { DocumentSidebar } from '@latitude-data/web-ui'
import { fetchCommitsByProjectAction } from '$/actions/commits/fetchCommitsByProjectAction'
import { getDocumentsAtCommitCached } from '$/app/(private)/_data-access'
import { getCurrentUser } from '$/services/auth/getCurrentUser'

import ClientFilesTree from './ClientFilesTree'
import CommitSelector from './CommitSelector'

export default async function Sidebar({
  project,
  commit,
  currentDocument,
}: {
  project: Project
  commit: Commit
  currentDocument?: DocumentVersion
}) {
  const { workspace } = await getCurrentUser()
  const documents = await getDocumentsAtCommitCached({ commit })
  const [draftCommits, fetchCommitsError] = await fetchCommitsByProjectAction({
    projectId: project.id,
    status: CommitStatus.Draft,
  })
  const commitsScope = new CommitsRepository(workspace.id)
  const headCommitResult = await commitsScope.getHeadCommit(project.id)
  const headCommit = headCommitResult.value

  if (fetchCommitsError) {
    throw fetchCommitsError
  }

  return (
    <DocumentSidebar
      header={
        <CommitSelector
          headCommit={headCommit}
          currentCommit={commit}
          currentDocument={currentDocument}
          draftCommits={draftCommits}
        />
      }
      tree={
        <ClientFilesTree
          currentDocument={currentDocument}
          documents={documents}
        />
      }
    />
  )
}
