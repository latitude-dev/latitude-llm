import { relations } from 'drizzle-orm'
import { bigint, bigserial, jsonb, text, varchar } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { evaluationTemplateCategories } from './evaluationTemplateCategories'
import { timestamps } from '../schemaHelpers'
import { EvaluationResultConfiguration } from '../types'

// NOTE: Deprecated
export const evaluationAdvancedTemplates = latitudeSchema.table(
  'evaluations_templates',
  {
    id: bigserial('id', { mode: 'number' }).notNull().primaryKey(),
    name: varchar('name', { length: 256 }).notNull(),
    description: text('description').notNull(),
    categoryId: bigint('category', { mode: 'number' }).references(
      () => evaluationTemplateCategories.id,
      { onDelete: 'restrict', onUpdate: 'cascade' },
    ),
    configuration: jsonb('configuration')
      .notNull()
      .$type<EvaluationResultConfiguration>(),
    prompt: text('prompt').notNull(),
    ...timestamps(),
  },
)

export const evaluationAdvancedTemplatesRelations = relations(
  evaluationAdvancedTemplates,
  ({ one }) => ({
    category: one(evaluationTemplateCategories, {
      fields: [evaluationAdvancedTemplates.categoryId],
      references: [evaluationTemplateCategories.id],
    }),
  }),
)
