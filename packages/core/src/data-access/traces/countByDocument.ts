import { and, countDistinct, eq, inArray } from 'drizzle-orm'
import { database } from '../../client'
import { spans } from '../../schema/models/spans'
import { Workspace } from '../../schema/models/types/Workspace'
import { Commit } from '../../schema/models/types/Commit'
import { CommitsRepository } from '../../repositories'
import { LogSources } from '@latitude-data/constants'

export async function countTracesByDocument(
  {
    workspace,
    commit,
    documentUuid,
    logSources,
  }: {
    workspace: Workspace
    commit: Commit
    documentUuid: string
    logSources?: LogSources[]
  },
  db = database,
) {
  const commitsRepo = new CommitsRepository(workspace.id, db)
  const commits = await commitsRepo.getCommitsHistory({ commit })
  let filters = [
    eq(spans.workspaceId, workspace.id),
    eq(spans.documentUuid, documentUuid),
    inArray(
      spans.commitUuid,
      commits.map((c) => c.uuid),
    ),
  ]

  if (logSources && logSources.length > 0) {
    filters = [...filters, inArray(spans.source, logSources)]
  }

  return db
    .select({ count: countDistinct(spans.traceId) })
    .from(spans)
    .where(and(...filters))
    .then((r) => r[0].count)
}
