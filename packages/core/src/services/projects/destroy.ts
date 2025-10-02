import { eq } from 'drizzle-orm'

import { Project } from '../../schema/types'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { projects } from '../../schema/models/projects'

export function destroyProject(
  { project }: { project: Project },
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    const updated = await tx
      .update(projects)
      .set({ deletedAt: new Date() })
      .where(eq(projects.id, project.id))
      .returning()

    return Result.ok(updated[0]!)
  })
}
