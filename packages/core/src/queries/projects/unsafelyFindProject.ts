import { eq } from 'drizzle-orm'

import { type Project } from '../../schema/models/types/Project'
import { projects } from '../../schema/models/projects'
import { unscopedQuery } from '../scope'
import { tt } from './columns'

export const unsafelyFindProject = unscopedQuery(
  async function unsafelyFindProject(
    { projectId }: { projectId: number },
    db,
  ): Promise<Project | undefined> {
    const result = await db
      .select(tt)
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)
    return result[0] as Project | undefined
  },
)
