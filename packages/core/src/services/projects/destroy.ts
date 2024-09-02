import { eq } from 'drizzle-orm'

import { Project } from '../../browser'
import { Result, Transaction } from '../../lib'
import { projects } from '../../schema'

export function destroyProject({ project }: { project: Project }) {
  return Transaction.call(async (tx) => {
    const updated = await tx
      .update(projects)
      .set({ deletedAt: new Date() })
      .where(eq(projects.id, project.id))
      .returning()

    return Result.ok(updated[0]!)
  })
}
