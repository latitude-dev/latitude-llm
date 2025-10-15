import { type InferSelectModel } from 'drizzle-orm'

import { datasets } from '../datasets'

export type Dataset = InferSelectModel<typeof datasets>
