import { projects } from '../../../schema/models/projects'
import { Job } from 'bullmq'
import { isNull } from 'drizzle-orm'
import { database } from '../../../client'
import { queues } from '../../queues'

export type RefreshProjectsStatsCacheJobData = Record<string, never>

export const refreshProjectsStatsCacheJob = async (
  _: Job<RefreshProjectsStatsCacheJobData>,
) => {
  const candidates = await database
    .select({ id: projects.id })
    .from(projects)
    .where(isNull(projects.deletedAt))
    .then((r) => r)

  for (const project of candidates) {
    const { maintenanceQueue } = await queues()
    await maintenanceQueue.add(
      'refreshProjectStatsCacheJob',
      { projectId: project.id },
      { attempts: 1 },
    )
  }
}
