import { type InferSelectModel } from 'drizzle-orm'

import { features } from '../features'

export type Feature = InferSelectModel<typeof features>
