import { type InferSelectModel } from 'drizzle-orm'

import { issueHistograms } from '../issueHistograms'

export type IssueHistogram = InferSelectModel<typeof issueHistograms>
