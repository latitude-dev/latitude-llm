import { type InferSelectModel } from 'drizzle-orm'

import { runErrors } from '../runErrors'

export type RunError = InferSelectModel<typeof runErrors>
export type RunErrorInsert = typeof runErrors.$inferInsert
