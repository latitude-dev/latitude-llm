import { Commit, HEAD_COMMIT } from '@latitude-data/core/browser'
import { NotFoundError } from '@latitude-data/core/lib/errors'

type GetCommitUrlParams = {
  commits: Commit[]
  projectId: number
  lastSeenCommitUuid: string | undefined
  PROJECT_ROUTE: any // Replace 'any' with the actual type of PROJECT_ROUTE
}

export function getCommitUrl({
  commits,
  projectId,
  lastSeenCommitUuid,
  PROJECT_ROUTE,
}: GetCommitUrlParams): string {
  const headCommit = commits.find((c) => c.mergedAt)
  const firstCommit = commits[0]

  if (
    lastSeenCommitUuid === HEAD_COMMIT ||
    (lastSeenCommitUuid &&
      !commits.some((c) => c.uuid === lastSeenCommitUuid) &&
      headCommit)
  ) {
    return PROJECT_ROUTE({ id: projectId }).commits.latest
  }

  if (lastSeenCommitUuid) {
    const commit = commits.find((c) => c.uuid === lastSeenCommitUuid)
    if (commit) {
      return PROJECT_ROUTE({ id: projectId }).commits.detail({
        uuid: commit.uuid,
      }).root
    }
  }

  if (headCommit) {
    return PROJECT_ROUTE({ id: projectId }).commits.latest
  }

  if (firstCommit) {
    return PROJECT_ROUTE({ id: projectId }).commits.detail({
      uuid: firstCommit.uuid,
    }).root
  }

  throw new NotFoundError('No commits found')
}
