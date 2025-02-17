import { eq } from 'drizzle-orm'
import { DocumentSuggestion, Project, User, Workspace } from '../../browser'
import { database, Database } from '../../client'
import { publisher } from '../../events/publisher'
import { Result, Transaction } from '../../lib'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '../../repositories'
import { documentSuggestions } from '../../schema'
import { createCommit } from '../commits/create'
import { updateDocument } from '../documents/update'

export async function applyDocumentSuggestion(
  {
    suggestion,
    workspace,
    project,
    user,
  }: {
    suggestion: DocumentSuggestion
    workspace: Workspace
    project: Project
    user: User
  },
  db: Database = database,
) {
  return Transaction.call(async (tx) => {
    const commitsRepository = new CommitsRepository(workspace.id, tx)
    const documentVersionsRepository = new DocumentVersionsRepository(
      workspace.id,
      tx,
    )

    let draft
    const commit = await commitsRepository
      .getCommitById(suggestion.commitId)
      .then((r) => r.unwrap())
    if (commit.mergedAt) {
      const document = await documentVersionsRepository
        .getDocumentAtCommit({
          projectId: project.id,
          commitUuid: commit.uuid,
          documentUuid: suggestion.documentUuid,
        })
        .then((r) => r.unwrap())

      draft = await createCommit({
        project: project,
        user: user,
        data: {
          title: `Refined '${document.path.split('/').pop()}'`,
          description: 'Created by a suggestion.',
        },
        db: tx,
      }).then((r) => r.unwrap())

      await updateDocument(
        {
          commit: draft,
          document: document,
          content: suggestion.prompt,
        },
        tx,
      ).then((r) => r.unwrap())
    }

    await tx
      .delete(documentSuggestions)
      .where(eq(documentSuggestions.id, suggestion.id))

    publisher.publishLater({
      type: 'documentSuggestionApplied',
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        suggestion: suggestion,
      },
    })

    return Result.ok({ suggestion, draft })
  }, db)
}
