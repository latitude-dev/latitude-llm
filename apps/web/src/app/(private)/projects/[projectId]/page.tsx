import {
  findCommitsByProjectCached,
  findProjectCached,
  getDocumentsAtCommitCached,
} from '$/app/(private)/_data-access'
import { lastSeenCommitCookieName } from '$/helpers/cookies/lastSeenCommit'
import {
  SessionData,
  getCurrentUserOrRedirect,
} from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import { computeProductAccess } from '@latitude-data/core/services/productAccess/computeProductAccess'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import { Project } from '@latitude-data/core/schema/models/types/Project'
import { cookies } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getRedirectUrl } from './utils'

const PROJECT_ROUTE = ROUTES.projects.detail

export type ProjectPageParams = {
  params: Promise<{ projectId: string }>
}

async function getLastSeenDataFromCookie(projectId: string) {
  const cookieStore = await cookies()
  const data = cookieStore.get(lastSeenCommitCookieName(Number(projectId)))
  if (!data?.value) return {}

  try {
    const { commitUuid, documentUuid } = JSON.parse(data.value)
    return { commitUuid, documentUuid }
  } catch (_) {
    return { commitUuid: data.value as string }
  }
}

export default async function ProjectPage({ params }: ProjectPageParams) {
  const { projectId } = await params
  const { commitUuid: lastSeenCommitUuid, documentUuid: lastSeenDocumentUuid } =
    await getLastSeenDataFromCookie(projectId)

  let session: SessionData
  let project: Project
  let url

  try {
    session = await getCurrentUserOrRedirect()
    const productAccess = computeProductAccess(session.workspace)

    project = await findProjectCached({
      projectId: Number(projectId),
      workspaceId: session.workspace.id,
    })
    const commits = await findCommitsByProjectCached({
      projectId: project.id,
    })

    const headCommit = commits.find((c) => c.mergedAt) ?? commits[0]
    const documents = headCommit
      ? await getDocumentsAtCommitCached({ commit: headCommit })
      : []

    url = getRedirectUrl({
      commits,
      projectId: project.id,
      lastSeenCommitUuid,
      lastSeenDocumentUuid,
      PROJECT_ROUTE,
      agentBuilder: productAccess.agentBuilder,
      documents,
    })
  } catch (error) {
    if (error instanceof NotFoundError) {
      return notFound()
    }

    throw error
  }

  return redirect(url)
}
