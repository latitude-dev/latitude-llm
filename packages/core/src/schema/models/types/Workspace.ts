import { type InferSelectModel } from 'drizzle-orm'

import { workspaces } from '../workspaces'
import { Subscription } from './Subscription'

export type Workspace = InferSelectModel<typeof workspaces>
export type WorkspaceDto = Workspace & {
  hasBillingPortal: boolean
  currentSubscription: Subscription
}

export type WorkspaceLimits = {
  seats: number
  runs: number
  credits: number
  resetsAt: Date
}
