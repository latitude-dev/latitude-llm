import { type InferSelectModel } from 'drizzle-orm'

import { promocodes } from '../promocodes'

export type Promocode = InferSelectModel<typeof promocodes>
