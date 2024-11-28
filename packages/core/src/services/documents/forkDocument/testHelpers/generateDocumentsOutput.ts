import { eq } from 'drizzle-orm'

import { Project } from '../../../../browser'
import { database } from '../../../../client'
import { commits, documentVersions } from '../../../../schema'
import { getDocumentMetadata } from '../../scan'

export async function generateDocumentsOutput({
  project,
}: {
  project: Project
}) {
  const allCommits = await database.query.commits.findMany({
    where: eq(commits.projectId, project.id),
  })
  const firstCommit = allCommits[0]!
  const allDocs = await database.query.documentVersions.findMany({
    where: eq(documentVersions.commitId, firstCommit.id),
  })

  const documents = await Promise.all(
    allDocs.map(async (doc) => {
      const meta = await getDocumentMetadata({
        document: doc,
        getDocumentByPath: (path) => allDocs.find((d) => d.path === path),
      })
      return {
        path: doc.path,
        provider: meta.config.provider,
        model: meta.config.model,
      }
    }),
  )

  return {
    commitCount: allCommits.length,
    documents: documents.sort(
      (a, b) => a.path.length - b.path.length || a.path.localeCompare(b.path),
    ),
  }
}
