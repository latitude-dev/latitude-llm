import { sql } from 'drizzle-orm'
import { bigint, boolean, index, text, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'

import { latitudeSchema } from '../db-schema'
import { timestamps } from '../schemaHelpers'
import { projects } from './projects'
import { workspaces } from './workspaces'

export const publishedDocuments = latitudeSchema.table(
  'published_documents',
  {
    uuid: uuid('uuid').primaryKey().notNull().unique().default(sql`gen_random_uuid()`),
    documentUuid: uuid('document_uuid').notNull(),
    title: varchar('title'),
    description: text('description'),
    workspaceId: bigint('workspace_id', { mode: 'number' })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: bigint('project_id', { mode: 'number' })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    isPublished: boolean('is_published').notNull().default(false),
    canFollowConversation: boolean('can_follow_conversation').notNull().default(false),
    displayPromptOnly: boolean('display_prompt_only').notNull().default(false),
    ...timestamps(),
  },
  (table) => ({
    projectWorkspaceIdx: index('published_doc_workspace_idx').on(table.workspaceId),
    uniqueProjectDocumentUuid: uniqueIndex('unique_project_document_uuid_idx').on(
      table.projectId,
      table.documentUuid,
    ),
  }),
)
