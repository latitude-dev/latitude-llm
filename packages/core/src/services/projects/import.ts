import { env } from '@latitude-data/env'
import { eq } from 'drizzle-orm'

import { Project, User, Workspace } from '../../browser'
import { database } from '../../client'
import { NotFoundError, Result, Transaction } from '../../lib'
import { DocumentVersionsRepository } from '../../repositories'
import { projects } from '../../schema'
import { createNewDocument } from '../documents'
import { createProject } from './create'

export async function importDefaultProject(
  {
    workspace,
    user,
  }: {
    workspace: Workspace
    user: User
  },
  db = database,
) {
  const defaultProject = await db.query.projects.findFirst({
    where: eq(projects.id, env.DEFAULT_PROJECT_ID),
  })
  if (!defaultProject) {
    return Result.error(new NotFoundError('Default project not found'))
  }

  const defaultProjectDocumentsScope = new DocumentVersionsRepository(
    defaultProject!.workspaceId,
    db,
  )

  const defaultDocuments =
    await defaultProjectDocumentsScope.getDocumentsFromMergedCommits({
      projectId: defaultProject!.id,
    })

  if (defaultDocuments.error) return defaultDocuments

  return Transaction.call<Project>(async (tx) => {
    const { project, commit } = await createProject(
      {
        workspace,
        user,
        name: defaultProject!.name,
      },
      tx,
    ).then((r) => r.unwrap())

    const results = await Promise.all(
      defaultDocuments.value.map(async (document) =>
        createNewDocument(
          {
            commit,
            path: document.path,
            content: document.content,
          },
          tx,
        ),
      ),
    )

    const result = Result.findError(results)
    if (result) return result

    return Result.ok(project)
  }, db)
}
