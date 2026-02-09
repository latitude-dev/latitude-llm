'use server'

import { ReactNode } from 'react'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import {
  findCommitsByProjectCached,
  findProjectCached,
  getHeadCommitCached,
  getLastLatteThreadUuidCached,
} from '$/app/(private)/_data-access'
import { ProjectPageParams } from '$/app/(private)/projects/[projectId]/page'
import {
  SessionData,
  getCurrentUserOrRedirect,
} from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import { notFound, redirect } from 'next/navigation'
import { LatteRealtimeUpdatesProvider } from './providers/LatteRealtimeUpdatesProvider'
import { HEAD_COMMIT } from '@latitude-data/core/constants'

import { LatteLayout } from '$/components/LatteSidebar/LatteLayout'
import { fetchConversationWithMessages } from '@latitude-data/core/data-access/conversations/fetchConversationWithMessages'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { Project } from '@latitude-data/core/schema/models/types/Project'
import { ProjectProvider } from '$/app/providers/ProjectProvider'
import { CommitProvider } from '$/app/providers/CommitProvider'

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
    session = await getCurrentUserOrRedirect()
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

  const lastThreadUuid = await getLastLatteThreadUuidCached({
    projectId: project.id,
  })
  const conversationResult = lastThreadUuid
    ? await fetchConversationWithMessages({
        workspace: session.workspace,
        documentLogUuid: lastThreadUuid,
      })
    : undefined
  const initialMessages = conversationResult?.value?.messages

  return (
    <ProjectProvider project={project}>
      <CommitProvider project={project} commit={commit} isHead={isHead}>
        <LatteRealtimeUpdatesProvider>
          <LatteLayout
            initialThreadUuid={lastThreadUuid}
            initialMessages={initialMessages}
          >
            {children}
          </LatteLayout>
        </LatteRealtimeUpdatesProvider>
      </CommitProvider>
    </ProjectProvider>
  )
}
