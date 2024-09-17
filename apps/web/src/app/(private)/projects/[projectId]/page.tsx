import { HEAD_COMMIT, type Project } from '@latitude-data/core/browser'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import {
  findCommitCached,
  findProjectCached,
} from '$/app/(private)/_data-access'
import { lastSeenCommitCookieName } from '$/helpers/cookies/lastSeenCommit'
import { getCurrentUser, SessionData } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

const PROJECT_ROUTE = ROUTES.projects.detail

export type ProjectPageParams = {
  params: { projectId: string }
}

export default async function ProjectPage({ params }: ProjectPageParams) {
  const cookieStore = cookies()
  const lastSeenCommitUuid = cookieStore.get(
    lastSeenCommitCookieName(Number(params.projectId)),
  )

  let session: SessionData
  let project: Project
  let url

  try {
    session = await getCurrentUser()
    project = await findProjectCached({
      projectId: Number(params.projectId),
      workspaceId: session.workspace.id,
    })

    if (!lastSeenCommitUuid || lastSeenCommitUuid?.value === HEAD_COMMIT) {
      url = PROJECT_ROUTE({ id: +project.id }).commits.latest
    } else {
      const commitUuid = await findCommitCached({
        uuid: lastSeenCommitUuid.value,
        projectId: Number(params.projectId),
      })
        .then((c) => c.uuid)
        .catch(() => HEAD_COMMIT) // Reditect to HEAD COMMIT if the commit does not exist

      url = PROJECT_ROUTE({ id: +project.id }).commits.detail({
        uuid: commitUuid,
      }).root
    }
  } catch (error) {
    if (error instanceof NotFoundError) {
      return notFound()
    }
    throw error
  }

  return redirect(url)
}
