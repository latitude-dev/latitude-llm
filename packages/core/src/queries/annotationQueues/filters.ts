import { eq } from 'drizzle-orm'

import { annotationQueues } from '../../schema/models/annotationQueues'

export const scopeFilter = (workspaceId: number) =>
  eq(annotationQueues.workspaceId, workspaceId)
