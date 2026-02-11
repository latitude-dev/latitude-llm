import { and, desc, isNull } from 'drizzle-orm'

import { type Project } from '../../schema/models/types/Project'
import { Result, TypedResult } from '../../lib/Result'
import { projects } from '../../schema/models/projects'
import { scopedQuery } from '../scope'
import { tt } from './columns'
import { tenancyFilter } from './filters'

export const findAllActiveProjects = scopedQuery(
  async function findAllActiveProjects(
    { workspaceId }: { workspaceId: number },
    db,
  ): Promise<TypedResult<Project[]>> {
    const result = await db
      .select(tt)
      .from(projects)
      .where(and(tenancyFilter(workspaceId), isNull(projects.deletedAt)))
      .orderBy(desc(projects.lastEditedAt), desc(projects.id))

    return Result.ok(result as Project[])
  },
)
