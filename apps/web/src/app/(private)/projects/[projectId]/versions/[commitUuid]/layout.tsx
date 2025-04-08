'use server'

import { ReactNode } from 'react'

import {
  HEAD_COMMIT,
  type Commit,
  type Project,
} from '@latitude-data/core/browser'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import {
  CommitProvider,
  ProjectProvider,
} from '@latitude-data/web-ui/providers'
import {
  findCommitsByProjectCached,
  findProjectCached,
  getHeadCommitCached,
} from '$/app/(private)/_data-access'
import { ProjectPageParams } from '$/app/(private)/projects/[projectId]/page'
import { getCurrentUser, SessionData } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import { notFound, redirect } from 'next/navigation'

export type CommitPageParams = {
  children: ReactNode
  params: Promise<Awaited<ProjectPageParams['params']> & { commitUuid: string }>
}

export default async function CommitLayout({
  children,
  params,
}: CommitPageParams) {
  let session: SessionData
  let project: Project
  let commit: Commit | undefined
  let isHead = false
  const { projectId, commitUuid } = await params
  try {
    session = await getCurrentUser()
    if (!session.workspace) return redirect(ROUTES.root)

    const workspace = session.workspace
    project = await findProjectCached({
      projectId: Number(projectId),
      workspaceId: workspace.id,
    })

    const headCommit = await getHeadCommitCached({
      workspace,
      projectId: project.id,
    })

    if (commitUuid === HEAD_COMMIT) {
      isHead = true
      commit = headCommit
    } else {
      const commits = await findCommitsByProjectCached({
        projectId: project.id,
      })
      commit = commits.find((c) => c.uuid === commitUuid)
    }

    isHead = commit?.id === headCommit?.id

    if (!commit) throw new NotFoundError('Commit not found')
  } catch (error) {
    if (error instanceof NotFoundError) return notFound()

    throw error
  }

  return (
    <ProjectProvider project={project}>
      <CommitProvider commit={commit} isHead={isHead}>
        {children}
      </CommitProvider>
    </ProjectProvider>
  )
}
