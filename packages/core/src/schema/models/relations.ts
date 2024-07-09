import { relations } from 'drizzle-orm'

import { commits } from './commits'
import { promptSnapshots } from './promptSnapshots'
import { promptVersions } from './promptVersions'

export const commitRelations = relations(commits, ({ many }) => ({
  snapshots: many(promptSnapshots, { relationName: 'snapshots' }),
}))

export const promptVersionRelations = relations(promptVersions, ({ one }) => ({
  commit: one(commits, {
    fields: [promptVersions.commitId],
    references: [commits.id],
  }),
}))

export const promptSnapshotsRelations = relations(
  promptSnapshots,
  ({ one }) => ({
    commit: one(commits, {
      relationName: 'snapshots',
      fields: [promptSnapshots.commitId],
      references: [commits.id],
    }),
    version: one(promptVersions, {
      fields: [promptSnapshots.promptVersionId],
      references: [promptVersions.id],
    }),
  }),
)
