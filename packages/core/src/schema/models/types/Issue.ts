import { type InferSelectModel } from 'drizzle-orm'

import { issues } from '../issues'

export type Issue = InferSelectModel<typeof issues>
