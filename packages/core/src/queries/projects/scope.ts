import { eq, getTableColumns } from 'drizzle-orm'

import { type Project } from '../../schema/models/types/Project'
import { projects } from '../../schema/models/projects'
import { scope } from '../scope'

const tt = getTableColumns(projects)

export const projectsScope = scope<Project>({
  from: (db) => db.select(tt).from(projects).$dynamic(),
  tenancyFilter: (workspaceId) => eq(projects.workspaceId, workspaceId),
})

export type ProjectsScope = ReturnType<typeof projectsScope>
