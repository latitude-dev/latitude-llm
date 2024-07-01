import { timestamps } from '$/db/schema/schemaHelpers'
import { InferSelectModel } from 'drizzle-orm'
import { pgTable } from 'drizzle-orm/pg-core'

export const prompts = pgTable('prompts', {
  ...timestamps(),
})

export type Prompt = InferSelectModel<typeof prompts>
