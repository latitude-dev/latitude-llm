import { type InferSelectModel } from 'drizzle-orm'

import { claimedPromocodes } from '../claimedPromocodes'

export type ClaimedPromocode = InferSelectModel<typeof claimedPromocodes>
