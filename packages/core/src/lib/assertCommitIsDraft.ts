import { Commit } from '../schema/types'
import { BadRequestError } from './errors'
import { Result } from './Result'

export function assertCommitIsDraft(commit: Commit) {
  if (commit.mergedAt !== null) {
    return Result.error(new BadRequestError('Cannot modify a merged commit'))
  }
  return Result.ok(true)
}
