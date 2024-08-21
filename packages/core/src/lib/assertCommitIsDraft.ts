import { Commit } from '$core/browser'
import { BadRequestError, Result } from '$core/lib'

export function assertCommitIsDraft(commit: Commit) {
  if (commit.mergedAt !== null) {
    return Result.error(new BadRequestError('Cannot modify a merged commit'))
  }
  return Result.ok(true)
}
