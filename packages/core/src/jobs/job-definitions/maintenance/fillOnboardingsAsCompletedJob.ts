import { Job } from 'bullmq'
import { Result } from '../../../lib/Result'
import { workspaceOnboarding } from '../../../schema/models/workspaceOnboarding'
import { database } from '../../../client'
import { isNull } from 'drizzle-orm'

export type FillOnboardingsAsCompletedJobData = Record<string, never>

export const fillOnboardingsAsCompletedJob = async (
  _: Job<FillOnboardingsAsCompletedJobData>,
) => {
  const updatedOnboardings = await database
    .update(workspaceOnboarding)
    .set({
      completedAt: new Date(),
    })
    .where(isNull(workspaceOnboarding.completedAt))
    .returning()

  return Result.ok({
    success: true,
    updatedOnboardings: updatedOnboardings.length,
  })
}
