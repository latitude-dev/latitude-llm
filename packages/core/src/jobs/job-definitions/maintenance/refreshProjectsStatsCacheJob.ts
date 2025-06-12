import { Job } from 'bullmq'
import { isNull } from 'drizzle-orm'
import { database } from '../../../client'
import { projects } from '../../../schema'
import { maintenanceQueue } from '../../queues'

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
    await maintenanceQueue.add(
      'refreshProjectStatsCacheJob',
      { projectId: project.id },
      { attempts: 1 },
    )
  }

  return { success: true, projects: candidates.length }
}
