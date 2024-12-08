import { eq } from 'drizzle-orm'

import { database } from '../client'
import { projects } from '../schema'

export function unsafelyFindProject(projectId: number, db = database) {
  return db.query.projects.findFirst({ where: eq(projects.id, projectId) })
}
