import { ReactNode } from 'react'

import {
  Commit,
  HEAD_COMMIT,
  NotFoundError,
  Project,
} from '@latitude-data/core'
import { CommitProvider, ProjectProvider } from '@latitude-data/web-ui'
import { AppLayout, BreadcrumpBadge } from '@latitude-data/web-ui/browser'
import { findCommit, findProject } from '$/app/(private)/_data-access'
import { NAV_LINKS } from '$/app/(private)/_lib/constants'
import { ProjectPageParams } from '$/app/(private)/projects/[projectId]/page'
import { getCurrentUser, SessionData } from '$/services/auth/getCurrentUser'
import { notFound } from 'next/navigation'

export type CommitPageParams = {
  children: ReactNode
  params: ProjectPageParams['params'] & { commitUuid: string }
}

export default async function CommitLayout({
  children,
  params,
}: CommitPageParams) {
  const isHead = params.commitUuid === HEAD_COMMIT
  let session: SessionData
  let project: Project
  let commit: Commit
  try {
    session = await getCurrentUser()
    project = await findProject({
      projectId: params.projectId,
      workspaceId: session.workspace.id,
    })
    commit = await findCommit({
      uuid: params.commitUuid,
      projectId: project.id,
    })
  } catch (error) {
    if (error instanceof NotFoundError) {
      return notFound()
    }
    throw error
  }

  return (
    <ProjectProvider project={project}>
      <CommitProvider commit={commit} isHead={isHead}>
        <AppLayout
          navigationLinks={NAV_LINKS}
          currentUser={session.user}
          breadcrumbs={[
            { name: session.workspace.name },
            { name: project.name },
            {
              name: (
                <BreadcrumpBadge
                  uuid={commit.uuid}
                  title={commit.title}
                  isHead={isHead}
                />
              ),
            },
          ]}
        >
          <main className='flex flex-row w-full'>
            <div className='w-[280px]'>
              {/* TODO: commented out until fixed toTree methods to new path schema */}
              {/* <Sidebar commitUuid={commit.uuid} projectId={project.id} /> */}
            </div>
            <div className='flex-1'>{children}</div>
          </main>
        </AppLayout>
      </CommitProvider>
    </ProjectProvider>
  )
}
