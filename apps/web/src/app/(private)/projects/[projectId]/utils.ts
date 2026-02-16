import { ROUTES } from '$/services/routes'
import { HEAD_COMMIT } from '@latitude-data/core/constants'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'

type GetCommitUrlParams = {
  commits: Commit[]
  projectId: number
  lastSeenCommitUuid: string | undefined
  lastSeenDocumentUuid?: string | undefined
  PROJECT_ROUTE: typeof ROUTES.projects.detail
  agentBuilder: boolean
  documents: DocumentVersion[]
}

export function getRedirectUrl({
  commits,
  projectId,
  lastSeenCommitUuid,
  lastSeenDocumentUuid,
  PROJECT_ROUTE,
  agentBuilder,
  documents,
}: GetCommitUrlParams): string {
  const url = getCommitUrl({
    commits,
    projectId,
    lastSeenCommitUuid,
    PROJECT_ROUTE,
  })

  if (agentBuilder) {
    if (!lastSeenDocumentUuid) {
      return url.home.root
    }
    return url.documents.detail({ uuid: lastSeenDocumentUuid }).root
  }

  const firstDocument = documents[0]
  if (firstDocument) {
    return url.documents.detail({ uuid: firstDocument.documentUuid }).root
  }

  // TODO: Replace with /traces project level when ready
  return url.issues.root
}

function getCommitUrl({
  commits,
  projectId,
  lastSeenCommitUuid,
  PROJECT_ROUTE,
}: Omit<
  GetCommitUrlParams,
  'lastSeenDocumentUuid' | 'agentBuilder' | 'documents'
>) {
  const headCommit = commits.find((c) => c.mergedAt)
  const firstCommit = commits[0]

  const headCommitRoute = PROJECT_ROUTE({ id: projectId }).commits.detail({
    uuid: HEAD_COMMIT,
  })

  const firstCommitRoute = PROJECT_ROUTE({ id: projectId }).commits.detail({
    uuid: firstCommit.uuid,
  })

  const defaultCommitRoute = headCommit ? headCommitRoute : firstCommitRoute

  if (lastSeenCommitUuid === HEAD_COMMIT) {
    return defaultCommitRoute
  }

  const lastSeenCommit = commits.find((c) => c.uuid === lastSeenCommitUuid)

  if (!lastSeenCommit) {
    return defaultCommitRoute
  }

  if (lastSeenCommit.mergedAt) {
    // If last seen commit is merged, we redirect to the newest HEAD commit
    return defaultCommitRoute
  }

  return PROJECT_ROUTE({ id: projectId }).commits.detail({
    uuid: lastSeenCommit.uuid,
  })
}
