import { env } from '@latitude-data/env'
import { eq } from 'drizzle-orm'

import { type Commit } from '../../schema/models/types/Commit'
import { type DocumentVersion } from '../../schema/models/types/DocumentVersion'
import { type Project } from '../../schema/models/types/Project'
import { type User } from '../../schema/models/types/User'
import { type Workspace } from '../../schema/models/types/Workspace'
import { NotFoundError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { DocumentVersionsRepository } from '../../repositories'
import { projects } from '../../schema/models/projects'
import { createNewDocument } from '../documents'
import { createProject } from './create'

export async function importOnboardingProject(
  {
    workspace,
    user,
  }: {
    workspace: Workspace
    user: User
  },
  transaction = new Transaction(),
) {
  return transaction.call<{
    project: Project
    commit: Commit
    documents: DocumentVersion[]
  }>(async (tx) => {
    const defaultProject = await tx
      .select()
      .from(projects)
      .where(eq(projects.id, env.DEFAULT_PROJECT_ID ?? -1))
      .limit(1)
      .then((rows) => rows[0])
    if (!defaultProject) {
      return Result.error(new NotFoundError('Default project not found'))
    }

    const defaultProjectDocumentsScope = new DocumentVersionsRepository(
      defaultProject!.workspaceId,
      tx,
    )

    const defaultDocuments = await defaultProjectDocumentsScope
      .getDocumentsFromMergedCommits({
        projectId: defaultProject!.id,
      })
      .then((r) => r.unwrap())

    const { project, commit } = await createProject(
      {
        workspace,
        user,
        name: defaultProject!.name,
      },
      transaction,
    ).then((r) => r.unwrap())

    const results = await Promise.all(
      defaultDocuments.map(async (document) =>
        createNewDocument(
          {
            workspace,
            user,
            commit,
            path: document.path,
            content: document.content,
          },
          transaction,
        ),
      ),
    )

    const result = Result.findError(results)
    if (result) return result

    return Result.ok({
      project,
      commit,
      documents: results.map((r) => r.unwrap()),
    })
  })
}
