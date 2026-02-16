import { eq } from 'drizzle-orm'

import { type Workspace } from '../../schema/models/types/Workspace'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { workspaces } from '../../schema/models/workspaces'

type UpdateProductAccessArgs = {
  workspace: Workspace
  promptManagerEnabled?: boolean
  agentBuilderEnabled?: boolean
}

export async function updateProductAccess(
  args: UpdateProductAccessArgs,
  transaction = new Transaction(),
) {
  return transaction.call<Workspace>(async (tx) => {
    const updateData: Partial<{
      promptManagerEnabled: boolean
      agentBuilderEnabled: boolean
    }> = {}

    if (args.promptManagerEnabled !== undefined) {
      updateData.promptManagerEnabled = args.promptManagerEnabled
    }
    if (args.agentBuilderEnabled !== undefined) {
      updateData.agentBuilderEnabled = args.agentBuilderEnabled
    }

    const finalPromptManagerEnabled =
      updateData.promptManagerEnabled ?? args.workspace.promptManagerEnabled

    if (!finalPromptManagerEnabled) {
      updateData.agentBuilderEnabled = false
    }

    const updated = await tx
      .update(workspaces)
      .set(updateData)
      .where(eq(workspaces.id, args.workspace.id))
      .returning()
      .then((r) => r[0])

    return Result.ok(updated)
  })
}
