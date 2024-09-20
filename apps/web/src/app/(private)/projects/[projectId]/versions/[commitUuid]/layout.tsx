'use server'

import { ReactNode } from 'react'

import {
  HEAD_COMMIT,
  type Commit,
  type Project,
} from '@latitude-data/core/browser'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import { CommitProvider, ProjectProvider } from '@latitude-data/web-ui'
import { BreadcrumbBadge } from '@latitude-data/web-ui/browser'
import {
  findCommitsByProjectCached,
  findProjectCached,
} from '$/app/(private)/_data-access'
import { NAV_LINKS } from '$/app/(private)/_lib/constants'
import { ProjectPageParams } from '$/app/(private)/projects/[projectId]/page'
import BreadcrumbLink from '$/components/BreadcrumbLink'
import { AppLayout } from '$/components/layouts'
import { getCurrentUser, SessionData } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import { notFound } from 'next/navigation'

import BreadcrumbInput from './_components/BreadcrumbInput'
import { LastSeenCommitCookie } from './_components/LastSeenCommitCookie'

export type CommitPageParams = {
  children: ReactNode
  params: ProjectPageParams['params'] & { commitUuid: string }
}

export default async function CommitLayout({
  children,
  params,
}: CommitPageParams) {
  let session: SessionData
  let project: Project
  let commit: Commit | undefined
  let isHead = false
  try {
    session = await getCurrentUser()
    project = await findProjectCached({
      projectId: Number(params.projectId),
      workspaceId: session.workspace.id,
    })
    const commits = await findCommitsByProjectCached({ projectId: project.id })
    if (params.commitUuid === HEAD_COMMIT) {
      isHead = true
      commit = commits.find((c) => !!c.mergedAt)
    } else {
      commit = commits.find((c) => c.uuid === params.commitUuid)
    }

    if (!commit) throw new NotFoundError('Commit not found')
  } catch (error) {
    if (error instanceof NotFoundError) return notFound()

    throw error
  }
  return (
    <ProjectProvider project={project}>
      <CommitProvider commit={commit} isHead={isHead}>
        <LastSeenCommitCookie
          projectId={project.id}
          commitUuid={params.commitUuid}
        />
        <AppLayout
          navigationLinks={NAV_LINKS}
          currentUser={session.user}
          breadcrumbs={[
            {
              name: session.workspace.name,
            },
            {
              name: (
                <BreadcrumbLink name='Projects' href={ROUTES.projects.root} />
              ),
            },
            {
              name: (
                <BreadcrumbInput
                  projectId={project.id}
                  projectName={project.name}
                />
              ),
            },
            {
              name: (
                <BreadcrumbBadge
                  uuid={params.commitUuid}
                  title={commit.title}
                  isHead={isHead}
                />
              ),
            },
          ]}
        >
          {children}
        </AppLayout>
      </CommitProvider>
    </ProjectProvider>
  )
}
