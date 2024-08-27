import { BadRequestError, Result } from '.'
import { Commit } from '../browser'

export function assertCommitIsDraft(commit: Commit) {
  if (commit.mergedAt !== null) {
    return Result.error(new BadRequestError('Cannot modify a merged commit'))
  }
  return Result.ok(true)
}
