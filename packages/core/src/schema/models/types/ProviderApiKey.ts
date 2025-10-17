import { type InferSelectModel } from 'drizzle-orm'

import { providerApiKeys } from '../providerApiKeys'

export type ProviderApiKey = InferSelectModel<typeof providerApiKeys>
