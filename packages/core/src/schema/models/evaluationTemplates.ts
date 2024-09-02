import { relations } from 'drizzle-orm'
import { bigint, bigserial, text, varchar } from 'drizzle-orm/pg-core'

import { evaluationTemplateCategories, latitudeSchema } from '..'
import { timestamps } from '../schemaHelpers'

export const evaluationTemplates = latitudeSchema.table(
  'evaluations_templates',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    name: varchar('name', { length: 256 }).notNull(),
    description: text('description').notNull(),
    categoryId: bigint('category', { mode: 'number' }).references(
      () => evaluationTemplateCategories.id,
      { onDelete: 'restrict', onUpdate: 'cascade' },
    ),
    prompt: text('prompt').notNull(),
    ...timestamps(),
  },
)

export const evaluationTemplatesRelations = relations(
  evaluationTemplates,
  ({ one }) => ({
    category: one(evaluationTemplateCategories, {
      fields: [evaluationTemplates.categoryId],
      references: [evaluationTemplateCategories.id],
    }),
  }),
)
