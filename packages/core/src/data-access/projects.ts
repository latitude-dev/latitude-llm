import { database } from '$core/client'
import { Result } from '$core/lib'
import { projects } from '$core/schema'
import { and, eq } from 'drizzle-orm'

class ProjectNotFoundError extends Error {
  constructor() {
    super('Project not found')
  }
}

export async function findProject({
  projectId,
  workspaceId,
}: {
  projectId: number
  workspaceId: number
}) {
  const project = await database.query.projects.findFirst({
    where: and(
      eq(projects.workspaceId, workspaceId),
      eq(projects.id, projectId),
    ),
  })

  if (!project) {
    return Result.error(new ProjectNotFoundError())
  }

  return Result.ok(project!)
}
