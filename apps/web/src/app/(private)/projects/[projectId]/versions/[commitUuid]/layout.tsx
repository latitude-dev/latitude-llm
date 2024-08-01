import { ReactNode } from 'react'

import {
  CommitsRepository,
  HEAD_COMMIT,
  NotFoundError,
  ProjectsRepository,
} from '@latitude-data/core'
import type { Commit, Project } from '@latitude-data/core/browser'
import { CommitProvider, ProjectProvider } from '@latitude-data/web-ui'
import { BreadcrumpBadge } from '@latitude-data/web-ui/browser'
import { NAV_LINKS } from '$/app/(private)/_lib/constants'
import { ProjectPageParams } from '$/app/(private)/projects/[projectId]/page'
import { AppLayout } from '$/components/layouts'
import { getCurrentUser, SessionData } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
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
    const projectsRepo = new ProjectsRepository(session.workspace.id)
    const commitsRepo = new CommitsRepository(session.workspace.id)
    project = (
      await projectsRepo.getProjectById(Number(params.projectId))
    ).unwrap()
    commit = (
      await commitsRepo.getCommitByUuid({ uuid: params.commitUuid, project })
    ).unwrap()
  } catch (error) {
    if (error instanceof NotFoundError) return notFound()

    throw error
  }

  const url = ROUTES.projects.detail({ id: project.id }).commits.latest
  const sectionLinks = [
    { label: 'Projects', href: url },
    { label: 'Settings', href: ROUTES.settings.root },
  ]

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
          sectionLinks={sectionLinks}
        >
          {children}
        </AppLayout>
      </CommitProvider>
    </ProjectProvider>
  )
}
