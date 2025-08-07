import { and, eq, getTableColumns } from 'drizzle-orm'

import { DocumentVersion } from '../browser'
import { database } from '../client'
import { commits, documentVersions, projects } from '../schema'

export function unsafelyFindProject(projectId: number, db = database) {
  return db.query.projects.findFirst({ where: eq(projects.id, projectId) })
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
