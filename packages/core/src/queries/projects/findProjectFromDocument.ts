import { and, eq } from 'drizzle-orm'

import { type Project } from '../../schema/models/types/Project'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { commits } from '../../schema/models/commits'
import { documentVersions } from '../../schema/models/documentVersions'
import { projects } from '../../schema/models/projects'
import { unscopedQuery } from '../scope'
import { tt } from './columns'

export const findProjectFromDocument = unscopedQuery(
  async function findProjectFromDocument(
    { document }: { document: DocumentVersion },
    db,
  ): Promise<Project | undefined> {
    const result = await db
      .select(tt)
      .from(projects)
      .innerJoin(commits, eq(commits.projectId, projects.id))
      .innerJoin(documentVersions, eq(documentVersions.commitId, commits.id))
      .where(
        and(
          eq(documentVersions.documentUuid, document.documentUuid),
          eq(commits.id, document.commitId),
        ),
      )
      .limit(1)

    return result[0] as Project | undefined
  },
)
