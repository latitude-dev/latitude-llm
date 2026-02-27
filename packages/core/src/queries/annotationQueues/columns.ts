import { getTableColumns } from 'drizzle-orm'

import { annotationQueues } from '../../schema/models/annotationQueues'

export const tt = getTableColumns(annotationQueues)
