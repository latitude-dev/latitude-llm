import { database } from '$core/client'
import { Result } from '$core/lib'
import { NotFoundError } from '$core/lib/errors'
import { projects } from '$core/schema'
import { and, eq } from 'drizzle-orm'

const NOT_FOUND_MSG = 'Project not found'

export type FindProjectProps = {
  projectId: number | string
  workspaceId: number
}
export async function findProject({
  projectId,
  workspaceId,
}: FindProjectProps) {
  const id = Number(projectId)
  if (isNaN(id)) {
    return Result.error(new NotFoundError(NOT_FOUND_MSG))
  }

  const project = await database.query.projects.findFirst({
    where: and(eq(projects.workspaceId, workspaceId), eq(projects.id, id)),
  })

  if (!project) {
    return Result.error(new NotFoundError(NOT_FOUND_MSG))
  }

  return Result.ok(project!)
}

export async function getFirstProject({
  workspaceId,
}: {
  workspaceId: number
}) {
  const project = await database.query.projects.findFirst({
    where: eq(projects.workspaceId, workspaceId),
  })

  if (!project) {
    return Result.error(new NotFoundError(NOT_FOUND_MSG))
  }

  return Result.ok(project!)
}
