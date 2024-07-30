import { NotFoundError } from '@latitude-data/core'
import { type Project } from '@latitude-data/core/browser'
import { getFirstProject } from '$/app/(private)/_data-access'
import { getCurrentUser, SessionData } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import { notFound, redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

const PROJECT_ROUTE = ROUTES.projects.detail

export default async function AppRoot() {
  let session: SessionData
  let project: Project
  let url

  try {
    session = await getCurrentUser()
    project = await getFirstProject({ workspaceId: session.workspace.id })

    url = PROJECT_ROUTE({ id: project.id }).commits.latest
  } catch (error) {
    if (error instanceof NotFoundError) return notFound()

    throw error
  }

  return redirect(url)
}
