import { commits } from '../schema/models/commits'
import { documentVersions } from '../schema/models/documentVersions'
import { projects } from '../schema/models/projects'
import { and, eq, getTableColumns } from 'drizzle-orm'

import { database } from '../client'
import { type DocumentVersion } from '../schema/models/types/DocumentVersion'

export function unsafelyFindProject(projectId: number, db = database) {
  return db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1)
    .then((rows) => rows[0])
}

export function findProjectFromDocument(
  document: DocumentVersion,
  db = database,
) {
  return db
    .select(getTableColumns(projects))
    .from(projects)
    .innerJoin(commits, eq(commits.projectId, projects.id))
    .innerJoin(documentVersions, eq(documentVersions.commitId, commits.id))
    .where(
      and(
        eq(documentVersions.documentUuid, document.documentUuid),
        eq(commits.id, document.commitId),
      ),
    )
    .then((r) => r[0])
}
