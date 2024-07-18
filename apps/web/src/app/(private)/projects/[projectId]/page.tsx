import { HEAD_COMMIT, NotFoundError, Project } from '@latitude-data/core'
import { findCommit, findProject } from '$/app/(private)/_data-access'
import { getCurrentUser, SessionData } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import { notFound, redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'
const PROJECT_ROUTE = ROUTES.projects.detail

export type ProjectPageParams = {
  params: { projectId: string }
}
export default async function ProjectPage({ params }: ProjectPageParams) {
  let session: SessionData
  let project: Project
  let url

  try {
    session = await getCurrentUser()
    project = await findProject({
      projectId: params.projectId,
      workspaceId: session.workspace.id,
    })
    await findCommit({ uuid: HEAD_COMMIT, projectId: project.id })
    url = PROJECT_ROUTE({ id: +project.id }).commits.latest
  } catch (error) {
    if (error instanceof NotFoundError) {
      return notFound()
    }
    throw error
  }

  return redirect(url)
}
