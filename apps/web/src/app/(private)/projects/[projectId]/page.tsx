import { type Project } from '@latitude-data/core/browser'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import {
  findCommitsByProjectCached,
  findProjectCached,
} from '$/app/(private)/_data-access'
import { lastSeenCommitCookieName } from '$/helpers/cookies/lastSeenCommit'
import { getCurrentUser, SessionData } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'

import { getRedirectUrl } from './utils'

const PROJECT_ROUTE = ROUTES.projects.detail

export type ProjectPageParams = {
  params: { projectId: string }
}

export default async function ProjectPage({ params }: ProjectPageParams) {
  const { commitUuid: lastSeenCommitUuid, documentUuid: lastSeenDocumentUuid } =
    getLastSeenDataFromCookie(params.projectId)

  let session: SessionData
  let project: Project
  let url

  try {
    session = await getCurrentUser()
    project = await findProjectCached({
      projectId: Number(params.projectId),
      workspaceId: session.workspace.id,
    })
    const commits = await findCommitsByProjectCached({
      projectId: project.id,
    })

    url = getRedirectUrl({
      commits,
      projectId: project.id,
      lastSeenCommitUuid,
      lastSeenDocumentUuid,
      PROJECT_ROUTE,
    })
  } catch (error) {
    if (error instanceof NotFoundError) {
      return notFound()
    }

    throw error
  }

  return redirect(url)
}

function getLastSeenDataFromCookie(projectId: string) {
  const cookieStore = cookies()
  const data = cookieStore.get(lastSeenCommitCookieName(Number(projectId)))
  if (!data?.value) return {}

  try {
    const { commitUuid, documentUuid } = JSON.parse(data.value)
    return { commitUuid, documentUuid }
  } catch (_) {
    return { commitUuid: data.value as string }
  }
}
