import { and, eq } from 'drizzle-orm'
import { DocumentSuggestion, User, Workspace } from '../../browser'
import { database, Database } from '../../client'
import { publisher } from '../../events/publisher'
import { Result, Transaction } from '../../lib'
import { documentSuggestions } from '../../schema'

export async function discardDocumentSuggestion(
  {
    suggestion,
    workspace,
    user,
  }: {
    suggestion: DocumentSuggestion
    workspace: Workspace
    user: User
  },
  db: Database = database,
) {
  return Transaction.call(async (tx) => {
    await tx
      .delete(documentSuggestions)
      .where(
        and(
          eq(documentSuggestions.workspaceId, workspace.id),
          eq(documentSuggestions.id, suggestion.id),
        ),
      )

    publisher.publishLater({
      type: 'documentSuggestionDiscarded',
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        suggestion: suggestion,
      },
    })

    return Result.ok({ suggestion })
  }, db)
}
