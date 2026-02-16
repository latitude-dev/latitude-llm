import { eq } from 'drizzle-orm'

import { issueHistograms } from '../../schema/models/issueHistograms'

export const tenancyFilter = (workspaceId: number) =>
  eq(issueHistograms.workspaceId, workspaceId)
