import { and, eq } from 'drizzle-orm'
import type { DocumentSuggestion, User, Workspace } from '../../browser'
import { publisher } from '../../events/publisher'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
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
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
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
  })
}
