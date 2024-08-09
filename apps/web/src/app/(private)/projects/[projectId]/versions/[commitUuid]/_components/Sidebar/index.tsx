import { CommitsRepository, CommitStatus } from '@latitude-data/core'
import { Commit, DocumentVersion, Project } from '@latitude-data/core/browser'
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
  const headCommit = await commitsScope
    .getHeadCommit(project)
    .then((r) => r.unwrap())

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
          headCommit={headCommit}
          documents={documents}
        />
      }
    />
  )
}
