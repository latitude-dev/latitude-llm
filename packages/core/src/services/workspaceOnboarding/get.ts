import { eq } from 'drizzle-orm'

import { NotFoundError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import { workspaceOnboarding } from '../../schema/models/workspaceOnboarding'
import { database } from '../../client'
import { PromisedResult } from '../../lib/Transaction'
import { Workspace } from '../../schema/models/types/Workspace'
import { WorkspaceOnboarding } from '../../schema/models/types/WorkspaceOnboarding'

export async function getWorkspaceOnboarding(
  {
    workspace,
  }: {
    workspace: Workspace
  },
  db = database,
): PromisedResult<WorkspaceOnboarding> {
  const onboardings = await db
    .select()
    .from(workspaceOnboarding)
    .where(eq(workspaceOnboarding.workspaceId, workspace.id))

  const onboarding = onboardings[0]
  if (!onboarding) {
    return Result.error(new NotFoundError('Workspace onboarding not found'))
  }

  return Result.ok(onboarding)
}
