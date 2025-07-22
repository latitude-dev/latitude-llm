import { eq } from 'drizzle-orm'

import { Project } from '../../browser'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { projects } from '../../schema'

export async function updateProject(
  project: Project,
  values: Partial<Project>,
  transaction = new Transaction(),
) {
  return transaction.call<Project>(async (tx) => {
    const updates = await tx
      .update(projects)
      .set(values)
      .where(eq(projects.id, project.id))
      .returning()

    return Result.ok(updates[0]!)
  })
}
