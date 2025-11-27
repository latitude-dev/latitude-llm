import { eq } from 'drizzle-orm'

import { type Workspace } from '../../schema/models/types/Workspace'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { workspaces } from '../../schema/models/workspaces'
import { publisher } from '../../events/publisher'

type BaseArgs = {
  workspace: Workspace
  enabled: boolean
  currentUserEmail: string | null
}

type AnnotationArgs = BaseArgs & {
  source: 'annotation'
  projectId: number
}

type AdminArgs = BaseArgs & {
  source: 'admin-action'
}

type ToggleIssuesUnlockedArgs = AnnotationArgs | AdminArgs

/**
 * Toggle the issuesUnlocked flag for a workspace
 */
export async function toggleIssuesUnlocked(
  args: ToggleIssuesUnlockedArgs,
  transaction = new Transaction(),
) {
  return transaction.call<Workspace>(
    async (tx) => {
      const updated = await tx
        .update(workspaces)
        .set({ issuesUnlocked: args.enabled })
        .where(eq(workspaces.id, args.workspace.id))
        .returning()
        .then((r) => r[0])

      return Result.ok(updated)
    },
    async (ws) => {
      if (!args.enabled) return
      if (args.source !== 'annotation') return

      publisher.publishLater({
        type: 'workspaceIssuesDashboardUnlocked',
        data: {
          userEmail: args.currentUserEmail,
          workspaceId: ws.id,
          projectId: args.projectId,
        },
      })
    },
  )
}
