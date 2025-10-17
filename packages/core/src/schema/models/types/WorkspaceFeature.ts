import { type InferSelectModel } from 'drizzle-orm'

import { workspaceFeatures } from '../workspaceFeatures'

export type WorkspaceFeature = InferSelectModel<typeof workspaceFeatures>
