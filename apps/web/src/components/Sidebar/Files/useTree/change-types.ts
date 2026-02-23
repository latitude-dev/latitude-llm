import { ModifiedDocumentType } from '@latitude-data/core/constants'
import { Node, SidebarDocument } from './types'

/**
 * Resolves a file change type by comparing the draft document against the live document.
 */
export function getDocumentChangeType({
  document,
  liveDocumentsByUuid,
}: {
  document: SidebarDocument
  liveDocumentsByUuid?: Map<string, SidebarDocument>
}) {
  if (!liveDocumentsByUuid) return undefined

  const liveDoc = liveDocumentsByUuid.get(document.documentUuid)
  if (!liveDoc) return ModifiedDocumentType.Created
  if (liveDoc.path !== document.path) return ModifiedDocumentType.UpdatedPath
  if (liveDoc.contentHash !== document.contentHash)
    return ModifiedDocumentType.Updated
  if (!liveDoc.contentHash) return ModifiedDocumentType.Updated

  return undefined
}

/**
 * Aggregates child changes into a folder-level change type.
 */
export function getFolderChangeType({
  folderId,
  childrenById,
  nodesById,
}: {
  folderId: string
  childrenById: Map<string, string[]>
  nodesById: Map<string, Node>
}): ModifiedDocumentType | undefined {
  const node = nodesById.get(folderId)
  if (!node) return undefined
  if (node.isFile || node.changeType) return node.changeType

  let hasNewDocs = false
  let hasUneditedDocs = false

  const childIds = childrenById.get(folderId) ?? []
  for (const childId of childIds) {
    const childChange = getFolderChangeType({
      folderId: childId,
      childrenById,
      nodesById,
    })
    if (childChange === ModifiedDocumentType.Created) hasNewDocs = true
    if (childChange) return ModifiedDocumentType.Updated
    hasUneditedDocs = true
  }

  if (!hasUneditedDocs && hasNewDocs) return ModifiedDocumentType.Created
  return undefined
}
