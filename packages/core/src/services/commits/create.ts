import { Commit, commits, database, Result } from '@latitude-data/core'

export default async function createCommit(tx = database) {
  try {
    return Result.ok(
      (
        await tx
          .insert(commits)
          .values({} as Commit)
          .returning()
      )[0],
    )
  } catch (err) {
    return Result.error(err as Error)
  }
}
