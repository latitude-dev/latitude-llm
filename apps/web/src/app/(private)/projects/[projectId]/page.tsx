import { HEAD_COMMIT, type Project } from '@latitude-data/core/browser'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import {
  findCommitCached,
  findProjectCached,
} from '$/app/(private)/_data-access'
import { getCurrentUser, SessionData } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import { notFound, redirect } from 'next/navigation'

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
    project = await findProjectCached({
      projectId: Number(params.projectId),
      workspaceId: session.workspace.id,
    })
    await findCommitCached({ uuid: HEAD_COMMIT, project })
    url = PROJECT_ROUTE({ id: +project.id }).commits.latest
  } catch (error) {
    if (error instanceof NotFoundError) {
      return notFound()
    }
    throw error
  }

  return redirect(url)
}
