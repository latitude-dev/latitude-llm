import { eq } from 'drizzle-orm'

import type { Workspace } from '../../browser'
import { database } from '../../client'
import { Result, Transaction } from '../../lib'
import { workspaces } from '../../schema'

export async function updateWorkspace(
  workspace: Workspace,
  values: {
    name?: string
    defaultProviderId?: number | null
  },
  db = database,
) {
  return Transaction.call<Workspace>(async (tx) => {
    const updated = await tx
      .update(workspaces)
      .set(values)
      .where(eq(workspaces.id, workspace.id))
      .returning()

    return Result.ok(updated[0]!)
  }, db)
}
