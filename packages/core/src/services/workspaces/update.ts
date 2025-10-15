import { eq } from 'drizzle-orm'

import type { WorkspaceDto } from '../../schema/models/types/Workspace'
import { type Workspace } from '../../schema/models/types/Workspace'
import { unsafelyFindWorkspace } from '../../data-access/workspaces'
import { NotFoundError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { workspaces } from '../../schema/models/workspaces'

export async function updateWorkspace(
  workspace: Workspace | WorkspaceDto,
  values: {
    name?: string
    defaultProviderId?: number | null
    currentSubscriptionId?: number | null
  },
  transaction = new Transaction(),
) {
  return transaction.call<WorkspaceDto>(async (tx) => {
    await tx
      .update(workspaces)
      .set(values)
      .where(eq(workspaces.id, workspace.id))

    const updated = await unsafelyFindWorkspace(workspace.id, tx)
    if (!updated) {
      return Result.error(new NotFoundError('Workspace not found'))
    }

    return Result.ok(updated)
  })
}
