'use server'

import {
  getDocumentLogsApproximatedCountByProjectCached,
  getDocumentsAtCommitCached,
  getHeadCommitCached,
} from '$/app/(private)/_data-access'
import DocumentSidebar from '$/components/Sidebar'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import {
  CommitStatus,
  LIMITED_VIEW_THRESHOLD,
  ULTRA_LARGE_PAGE_SIZE,
} from '@latitude-data/core/constants'
import { paginateQuery } from '@latitude-data/core/lib/pagination/paginate'
import { CommitsRepository } from '@latitude-data/core/repositories/index'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { Project } from '@latitude-data/core/schema/models/types/Project'
import ClientFilesTree from './ClientFilesTree'
import CommitSelector from './CommitSelector'
import ProjectSection from './ProjectSection'
import ProductionBanner from './ProductionBanner'

export default async function Sidebar({
  project,
  commit,
  currentDocument,
}: {
  project: Project
  commit: Commit
  currentDocument?: DocumentVersion
}) {
  const { workspace } = await getCurrentUserOrRedirect()
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

  const approximatedCount =
    await getDocumentLogsApproximatedCountByProjectCached(project.id)
  const limitedView = approximatedCount > LIMITED_VIEW_THRESHOLD

  return (
    <DocumentSidebar
      banner={<ProductionBanner project={project} />}
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
          <ProjectSection
            project={project}
            commit={commit}
            limitedView={limitedView}
          />
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
