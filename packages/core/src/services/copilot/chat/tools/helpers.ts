import { Message, MessageRole } from '@latitude-data/compiler'
import {
  LatteDocument,
  LatteSuggestion,
  LatteTool,
} from '@latitude-data/constants/latte'
import { ForbiddenError, LatitudeError } from '../../../../lib/errors'
import { ErrorResult, Result, TypedResult } from '../../../../lib/Result'
import { generateUUIDIdentifier } from '../../../../lib/generateUUID'
import { Commit, Workspace } from '../../../../browser'
import { PromisedResult } from '../../../../lib/Transaction'
import { DocumentVersionsRepository } from '../../../../repositories'

export async function listDocumentsAndSuggestions({
  workspace,
  commit,
  messages,
}: {
  workspace: Workspace
  commit: Commit
  messages: Message[]
}): PromisedResult<
  {
    documents: LatteDocument[]
    suggestions: LatteSuggestion[]
  },
  LatitudeError
> {
  /**
   * Returns a list of LatteDocuments and LatteSuggestions based on the current project and commit, updated with all the suggestions
   */

  // Get the current document list from the workspace
  const docsScope = new DocumentVersionsRepository(workspace.id)
  const docs = await docsScope
    .getDocumentsAtCommit(commit)
    .then((r) => r.unwrap())

  const latteDocuments = docs.map((doc) => ({
    uuid: doc.documentUuid,
    path: doc.path,
    content: doc.content,
  })) as LatteDocument[]

  // Get all suggestion requests from the messages
  const suggestionsFromChat = messages
    .map((message) => {
      if (message.role !== MessageRole.assistant) return undefined
      const toolCall = message.toolCalls?.find(
        // Only the first suggestion call per message is considered
        (call) => call.name === LatteTool.addSuggestions,
      )
      if (!toolCall) return undefined
      return toolCall.arguments.suggestions as LatteSuggestion[]
    })
    .filter((s) => s !== undefined)
    .flat()

  // Apply each suggestion to the current document list
  let updatedDocuments = latteDocuments
  for (const suggestion of suggestionsFromChat) {
    const result = applySuggestionToDocumentList(updatedDocuments, suggestion)
    if (!result.ok) return result as ErrorResult<LatitudeError>
    updatedDocuments = result.unwrap()
  }

  // TODO: It will probably be useful to scan the updated documents and return a list of errors, for Latte to handle them properly

  // Precompute the change suggestions by comparing the original documents with the updated ones
  const updatedSuggestions = getChanges(latteDocuments, updatedDocuments)

  return Result.ok({
    documents: updatedDocuments,
    suggestions: updatedSuggestions,
  })
}

function applySuggestionToDocumentList(
  documents: LatteDocument[],
  suggestion: LatteSuggestion,
): TypedResult<LatteDocument[], LatitudeError> {
  if (suggestion.type === 'create') {
    // Check there is no document with the same path
    if (documents.some((d) => d.path === suggestion.path)) {
      return Result.error(
        new ForbiddenError(
          `A document with the path '${suggestion.path}' already exists. Cannot create a new document with the same path.`,
        ),
      )
    }

    return Result.ok([
      ...documents,
      {
        uuid: generateUUIDIdentifier(),
        path: suggestion.path,
        content: suggestion.content,
      },
    ])
  }

  if (suggestion.type === 'update') {
    // Find the document to update
    const docIndex = documents.findIndex((d) => d.path === suggestion.path)
    if (docIndex === -1) {
      return Result.error(
        new ForbiddenError(
          `Cannot update document with uuid '${suggestion.uuid}' because it does not exist.`,
        ),
      )
    }

    // Update the document content
    const originalDocument = documents[docIndex]!
    const updatedDocument = {
      ...originalDocument,
      content: suggestion.content ?? originalDocument.content,
      path: suggestion.path ?? originalDocument.path,
    }

    return Result.ok([
      ...documents.slice(0, docIndex),
      updatedDocument,
      ...documents.slice(docIndex + 1),
    ])
  }

  if (suggestion.type === 'delete') {
    // Find the document to delete
    const docIndex = documents.findIndex((d) => d.uuid === suggestion.uuid)
    if (docIndex === -1) {
      return Result.error(
        new ForbiddenError(
          `Cannot delete document with uuid '${suggestion.uuid}' because it does not exist.`,
        ),
      )
    }

    // Remove the document
    return Result.ok([
      ...documents.slice(0, docIndex),
      ...documents.slice(docIndex + 1),
    ])
  }

  return Result.error(
    new LatitudeError(
      `Unknown suggestion type '${(suggestion as LatteSuggestion).type}'`,
    ),
  )
}

function getChanges(
  original: LatteDocument[],
  updated: LatteDocument[],
): LatteSuggestion[] {
  const changes: LatteSuggestion[] = []

  // 1) build O(1) lookups
  const origMap = new Map(original.map((doc) => [doc.uuid, doc]))
  const updMap = new Map(updated.map((doc) => [doc.uuid, doc]))

  // 2) detect creates & updates
  for (const [uuid, updatedDoc] of updMap) {
    const origDoc = origMap.get(uuid)
    if (origDoc) {
      const contentChanged = updatedDoc.content !== origDoc.content
      const pathChanged = updatedDoc.path !== origDoc.path
      if (contentChanged || pathChanged) {
        changes.push({
          type: 'update',
          uuid,
          ...(contentChanged ? { content: updatedDoc.content } : {}),
          ...(pathChanged ? { path: updatedDoc.path } : {}),
        })
      }
    } else {
      changes.push({
        type: 'create',
        path: updatedDoc.path,
        content: updatedDoc.content,
      })
    }
  }

  // 3) detect deletes
  for (const uuid of origMap.keys()) {
    if (!updMap.has(uuid)) {
      changes.push({ type: 'delete', uuid })
    }
  }

  return changes
}
