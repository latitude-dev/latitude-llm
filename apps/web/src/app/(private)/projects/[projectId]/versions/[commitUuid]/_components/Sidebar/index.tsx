import {
  Commit,
  CommitStatus,
  DocumentVersion,
  Project,
  ULTRA_LARGE_PAGE_SIZE,
} from '@latitude-data/core/browser'
import { paginateQuery } from '@latitude-data/core/lib/index'
import { CommitsRepository } from '@latitude-data/core/repositories/index'
import { DocumentSidebar } from '@latitude-data/web-ui/sections'
import {
  getDocumentsAtCommitCached,
  getHeadCommitCached,
} from '$/app/(private)/_data-access'
import { getCurrentUser } from '$/services/auth/getCurrentUser'

import ClientFilesTree from './ClientFilesTree'
import CommitSelector from './CommitSelector'
import ProjectSection from './ProjectSection'

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
  const commitsScope = new CommitsRepository(workspace.id)
  const headCommit = await getHeadCommitCached({
    workspace,
    projectId: project.id,
  })
  const liveDocuments = commit.mergedAt
    ? undefined
    : await getDocumentsAtCommitCached({ commit: headCommit! })

  const { rows } = await paginateQuery({
    dynamicQuery: commitsScope
      .getCommitsByProjectQuery({
        project,
        filterByStatus: CommitStatus.Draft,
      })
      .$dynamic(),
    defaultPaginate: {
      pageSize: ULTRA_LARGE_PAGE_SIZE,
    },
  })

  return (
    <DocumentSidebar
      header={
        <CommitSelector
          headCommit={headCommit}
          currentCommit={commit}
          currentDocument={currentDocument}
          draftCommits={rows}
        />
      }
      tree={
        <div className='flex flex-col gap-4'>
          <ProjectSection project={project} commit={commit} />
          <ClientFilesTree
            currentDocument={currentDocument}
            documents={documents}
            liveDocuments={liveDocuments}
          />
        </div>
      }
    />
  )
}
