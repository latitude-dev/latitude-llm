import { Job } from 'bullmq'
import { Result } from '../../../lib/Result'
import { workspaceOnboarding } from '../../../schema/models/workspaceOnboarding'
import { database } from '../../../client'
import { eq, notExists } from 'drizzle-orm'
import { workspaces } from '../../../schema/models/workspaces'

export type FillOnboardingsAsCompletedJobData = Record<string, never>

export const fillOnboardingsAsCompletedJob = async (
  _: Job<FillOnboardingsAsCompletedJobData>,
) => {
  const onboardingsToInsert = await database
    .select({
      workspaceId: workspaces.id,
    })
    .from(workspaces)
    .where(
      notExists(
        database
          .select()
          .from(workspaceOnboarding)
          .where(eq(workspaceOnboarding.workspaceId, workspaces.id)),
      ),
    )

  if (onboardingsToInsert.length === 0) {
    return Result.nil()
  }

  await database
    .insert(workspaceOnboarding)
    .values(
      onboardingsToInsert.map(({ workspaceId }) => ({
        workspaceId,
        completedAt: new Date(),
      })),
    )
    .returning({
      workspaceId: workspaceOnboarding.workspaceId,
    })

  return Result.nil()
}
