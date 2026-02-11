import { getTableColumns } from 'drizzle-orm'

import { projects } from '../../schema/models/projects'

export const tt = getTableColumns(projects)
