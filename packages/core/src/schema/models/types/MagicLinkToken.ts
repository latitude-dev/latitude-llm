import { type InferSelectModel } from 'drizzle-orm'

import { magicLinkTokens } from '../magicLinkTokens'

export type MagicLinkToken = InferSelectModel<typeof magicLinkTokens>
