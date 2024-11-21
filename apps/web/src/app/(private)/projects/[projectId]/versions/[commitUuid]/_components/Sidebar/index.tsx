import {
  Commit,
  CommitStatus,
  DocumentVersion,
  Project,
  ULTRA_LARGE_PAGE_SIZE,
} from '@latitude-data/core/browser'
import { paginateQuery } from '@latitude-data/core/lib/index'
import { CommitsRepository } from '@latitude-data/core/repositories/index'
import { DocumentSidebar } from '@latitude-data/web-ui'
import { getDocumentsAtCommitCached } from '$/app/(private)/_data-access'
import { getCurrentUser } from '$/services/auth/getCurrentUser'

import ClientFilesTree from './ClientFilesTree'
import CommitSelector from './CommitSelector'
import ProjectSidebar from './projectSidebar'

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

  const headCommitResult = await commitsScope.getHeadCommit(project.id)
  const headCommit = headCommitResult.value

  return (
    <DocumentSidebar
      header={
        <div className='flex flex-col gap-4'>
          <CommitSelector
            headCommit={headCommit}
            currentCommit={commit}
            currentDocument={currentDocument}
            draftCommits={rows}
          />
          <ProjectSidebar />
        </div>
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
