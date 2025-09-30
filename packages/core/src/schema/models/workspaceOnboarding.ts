import { bigint, bigserial, timestamp, varchar } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { workspaces } from './workspaces'
import { OnboardingStepKey } from '@latitude-data/constants/onboardingSteps'

export const workspaceOnboarding = latitudeSchema.table(
  'workspace_onboarding',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .unique(),
    completedAt: timestamp('completed_at'),
    currentStep: varchar('current_step', {
      length: 128,
    })
      .$type<OnboardingStepKey>()
      .$default(() => OnboardingStepKey.SetupIntegrations),
    ...timestamps(),
  },
)
