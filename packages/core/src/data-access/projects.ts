import { commits } from '../schema/models/commits'
import { documentVersions } from '../schema/models/documentVersions'
import { projects } from '../schema/models/projects'
import { and, eq, getTableColumns } from 'drizzle-orm'

import { database } from '../client'
import { DocumentVersion } from '../schema/types'

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
