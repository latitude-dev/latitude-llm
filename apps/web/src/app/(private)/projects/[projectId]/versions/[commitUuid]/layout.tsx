'use server'

import { ReactNode } from 'react'

import {
  HEAD_COMMIT,
  type Commit,
  type Project,
} from '@latitude-data/core/browser'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import {
  CommitsRepository,
  ProjectsRepository,
} from '@latitude-data/core/repositories/index'
import { CommitProvider, ProjectProvider } from '@latitude-data/web-ui'
import { BreadcrumpBadge } from '@latitude-data/web-ui/browser'
import { NAV_LINKS } from '$/app/(private)/_lib/constants'
import { ProjectPageParams } from '$/app/(private)/projects/[projectId]/page'
import BreadcrumpLink from '$/components/BreadcrumpLink'
import { AppLayout } from '$/components/layouts'
import { getCurrentUser, SessionData } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import { notFound } from 'next/navigation'

import BreadcrumpInput from './documents/_components/BreadcrumpInput'

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
      await commitsRepo.getCommitByUuid({
        uuid: params.commitUuid,
        projectId: Number(params.projectId),
      })
    ).unwrap()
  } catch (error) {
    if (error instanceof NotFoundError) return notFound()

    throw error
  }

  const projectUrl = ROUTES.projects.detail({ id: project.id }).commits.latest
  const sectionLinks = [{ label: 'Editor', href: projectUrl }]

  return (
    <ProjectProvider project={project}>
      <CommitProvider commit={commit} isHead={isHead}>
        <AppLayout
          navigationLinks={NAV_LINKS}
          currentUser={session.user}
          breadcrumbs={[
            {
              name: (
                <BreadcrumpLink
                  name={session.workspace.name}
                  href={ROUTES.root}
                />
              ),
            },
            { name: <BreadcrumpInput projectId={project.id} /> },
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
