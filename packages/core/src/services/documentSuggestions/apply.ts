import { and, eq } from 'drizzle-orm'
import {
  Commit,
  DocumentSuggestion,
  Project,
  User,
  Workspace,
} from '../../browser'
import { database, Database } from '../../client'
import { publisher } from '../../events/publisher'
import { Result, Transaction } from '../../lib'
import { DocumentVersionsRepository } from '../../repositories'
import { documentSuggestions } from '../../schema'
import { createCommit } from '../commits/create'
import { updateDocument } from '../documents/update'

export async function applyDocumentSuggestion(
  {
    suggestion,
    commit,
    prompt,
    workspace,
    project,
    user,
  }: {
    suggestion: DocumentSuggestion
    commit: Commit
    prompt?: string
    workspace: Workspace
    project: Project
    user: User
  },
  db: Database = database,
) {
  prompt = prompt ?? suggestion.newPrompt! // TODO: Delete '!' when migration is done

  return Transaction.call(async (tx) => {
    const documentsRepository = new DocumentVersionsRepository(workspace.id, tx)
    const document = await documentsRepository
      .getDocumentByCompositedId({
        commitId: suggestion.commitId,
        documentUuid: suggestion.documentUuid,
      })
      .then((r) => r.unwrap())

    // Note: delete suggestion first so that the possible
    // draft does not inherit this suggestion again
    await tx
      .delete(documentSuggestions)
      .where(
        and(
          eq(documentSuggestions.workspaceId, workspace.id),
          eq(documentSuggestions.id, suggestion.id),
        ),
      )

    let draft
    if (commit.mergedAt) {
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
          content: prompt,
        },
        tx,
      ).then((r) => r.unwrap())
    }

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
