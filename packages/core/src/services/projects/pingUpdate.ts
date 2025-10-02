import { and, eq } from 'drizzle-orm'
import { NotFoundError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction, { PromisedResult } from '../../lib/Transaction'
import { projects } from '../../schema/models/projects'

export async function pingProjectUpdate(
  {
    projectId,
  }: {
    projectId: number
  },
  transaction = new Transaction(),
): PromisedResult<undefined, Error> {
  return transaction.call(async (tx) => {
    const result = (
      await tx
        .update(projects)
        .set({ lastEditedAt: new Date() })
        .where(and(eq(projects.id, projectId)))
        .returning()
    )[0]

    if (!result) {
      return Result.error(new NotFoundError('Project does not exist'))
    }

    return Result.ok(undefined)
  })
}
