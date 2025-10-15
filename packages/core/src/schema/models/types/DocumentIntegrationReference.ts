import { type InferSelectModel } from 'drizzle-orm'

import { documentIntegrationReferences } from '../documentIntegrationReferences'

export type DocumentIntegrationReference = InferSelectModel<
  typeof documentIntegrationReferences
>
