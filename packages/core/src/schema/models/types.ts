import { InferSelectModel } from 'drizzle-orm'

import { commits } from './commits'
import { promptSnapshots } from './promptSnapshots'
import { promptVersions } from './promptVersions'

export type Commit = InferSelectModel<typeof commits> & {
  snapshots: PromptSnapshot[]
}

export type PromptSnapshot = InferSelectModel<typeof promptSnapshots> & {
  commit: Commit
  version: PromptVersion
}

export type PromptVersion = InferSelectModel<typeof promptVersions>
