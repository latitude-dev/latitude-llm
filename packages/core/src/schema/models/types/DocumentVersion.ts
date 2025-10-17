import { type InferSelectModel } from 'drizzle-orm'

import { documentVersions } from '../documentVersions'

export type DocumentVersion = InferSelectModel<typeof documentVersions>
