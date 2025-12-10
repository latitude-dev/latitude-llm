'use server'

import {
  getDocumentsAtCommitCached,
  getHeadCommitCached,
} from '$/app/(private)/_data-access'
import DocumentSidebar from '$/components/Sidebar'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import {
  CommitStatus,
  ULTRA_LARGE_PAGE_SIZE,
} from '@latitude-data/core/constants'
import { paginateQuery } from '@latitude-data/core/lib/pagination/paginate'
import {
  CommitsRepository,
  DeploymentTestsRepository,
} from '@latitude-data/core/repositories/index'
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

  const deploymentTestsRepo = new DeploymentTestsRepository(workspace.id)
  const activeTests = await deploymentTestsRepo.findAllActiveForProject(
    project.id,
  )
  const activeTestCommitIds = new Set<number>()
  // Baseline is always the head commit, so we only need to track challenger commits
  // But we also add the head commit if there are active tests
  if (headCommit && activeTests.length > 0) {
    activeTestCommitIds.add(headCommit.id)
  }
  activeTests.forEach((test) => {
    activeTestCommitIds.add(test.challengerCommitId)
  })

  // Fetch commits that are in active test deployments
  const commitsInActiveTests: Commit[] =
    activeTestCommitIds.size > 0
      ? await commitsScope.getCommitsByIds(Array.from(activeTestCommitIds))
      : []

  return (
    <DocumentSidebar
      banner={<ProductionBanner project={project} />}
      header={
        <CommitSelector
          headCommit={headCommit}
          currentCommit={commit}
          currentDocument={currentDocument}
          draftCommits={rows}
          commitsInActiveTests={commitsInActiveTests}
          activeTests={activeTests}
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
