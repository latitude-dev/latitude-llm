import { ROOT_PATH } from './constants'
import { getDocumentChangeType, getFolderChangeType } from './change-types'
import { areNodesEqual, compareNodes, createNode } from './nodes'
import { BuildNextStateResult, Node, SidebarDocument } from './types'

/**
 * Rebuilds the canonical tree from documents and returns a minimal node patch
 * relative to the previous node map.
 */
export function buildNextState({
  prevNodesById,
  documents,
  liveDocuments,
}: {
  prevNodesById: Map<string, Node>
  documents: SidebarDocument[]
  liveDocuments?: SidebarDocument[]
}): BuildNextStateResult {
  const liveDocumentsByUuid = liveDocuments
    ? new Map(liveDocuments.map((doc) => [doc.documentUuid, doc]))
    : undefined

  const nodesDraft = new Map<string, Node>()
  const childrenDraft = new Map<string, string[]>()
  const folderDepthByPath = new Map<string, number>([[ROOT_PATH, 0]])

  const ensureFolder = (path: string): string | undefined => {
    if (!path) return undefined

    const folderId = `folder:${path}`
    if (nodesDraft.has(folderId)) return folderId

    const parts = path.split('/')
    const parentPath = parts.slice(0, -1).join('/')
    const parentId = ensureFolder(parentPath)
    const parentDepth = folderDepthByPath.get(parentPath) ?? 0
    const depth = parentDepth + 1
    folderDepthByPath.set(path, depth)

    nodesDraft.set(
      folderId,
      createNode({
        id: folderId,
        parentId,
        name: parts[parts.length - 1] || '',
        path,
        isFile: false,
        depth,
      }),
    )
    childrenDraft.set(folderId, [])
    if (parentId) {
      const parentChildren = childrenDraft.get(parentId) ?? []
      parentChildren.push(folderId)
      childrenDraft.set(parentId, parentChildren)
    }

    return folderId
  }

  for (const document of documents) {
    const segments = document.path.split('/')
    const fileName = segments[segments.length - 1] || ''
    const folderPath = segments.slice(0, -1).join('/')
    const parentId = ensureFolder(folderPath)
    const parentDepth = folderDepthByPath.get(folderPath) ?? 0

    const fileNode = createNode({
      id: document.documentUuid,
      parentId,
      name: fileName,
      path: document.path,
      isFile: true,
      depth: parentDepth + 1,
      documentUuid: document.documentUuid,
      contentHash: document.contentHash,
      documentType: document.documentType,
      changeType: getDocumentChangeType({ document, liveDocumentsByUuid }),
    })
    nodesDraft.set(fileNode.id, fileNode)

    if (parentId) {
      const parentChildren = childrenDraft.get(parentId) ?? []
      parentChildren.push(fileNode.id)
      childrenDraft.set(parentId, parentChildren)
    }
  }

  for (const [id, children] of childrenDraft.entries()) {
    const nextChildren = [...children]
    nextChildren.sort((aId, bId) => {
      const a = nodesDraft.get(aId)
      const b = nodesDraft.get(bId)
      if (!a || !b) return 0
      return compareNodes(a, b)
    })
    childrenDraft.set(id, nextChildren)
  }

  for (const [id, node] of nodesDraft.entries()) {
    const children = childrenDraft.get(id) ?? []
    nodesDraft.set(id, createNode({ ...node, children }))
  }

  for (const [id, node] of nodesDraft.entries()) {
    if (node.isFile) continue
    const nextChangeType = getFolderChangeType({
      folderId: id,
      childrenById: childrenDraft,
      nodesById: nodesDraft,
    })
    nodesDraft.set(id, createNode({ ...node, changeType: nextChangeType }))
  }

  const updatedNodesById = new Map<string, Node>()
  for (const [id, node] of nodesDraft.entries()) {
    const prevNode = prevNodesById.get(id)
    if (areNodesEqual(prevNode, node)) continue
    updatedNodesById.set(id, node)
  }

  const removedNodeIds: string[] = []
  for (const id of prevNodesById.keys()) {
    if (!nodesDraft.has(id)) removedNodeIds.push(id)
  }

  return {
    hasNodeStateChanges: updatedNodesById.size > 0 || removedNodeIds.length > 0,
    updatedNodesById,
    removedNodeIds,
  }
}
