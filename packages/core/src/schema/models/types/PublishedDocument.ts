import { type InferSelectModel } from 'drizzle-orm'

import { publishedDocuments } from '../publishedDocuments'

export type PublishedDocument = InferSelectModel<typeof publishedDocuments>
