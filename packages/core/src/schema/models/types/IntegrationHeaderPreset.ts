import { type InferSelectModel } from 'drizzle-orm'

import { integrationHeaderPresets } from '../integrationHeaderPresets'

export type IntegrationHeaderPreset = InferSelectModel<
  typeof integrationHeaderPresets
>
