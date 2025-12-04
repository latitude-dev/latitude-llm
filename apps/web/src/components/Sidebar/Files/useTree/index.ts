import { useMemo } from 'react'
import {
  DocumentType,
  ModifiedDocumentType,
} from '@latitude-data/core/constants'

export type SidebarDocument = {
  path: string
  documentUuid: string
  content: string
  documentType?: DocumentType
}

export class Node {
  public id: string
  public name: string
  public path: string
  public isPersisted: boolean
  public isRoot: boolean = false
  public isFile: boolean = false
  public depth: number = 0
  public children: Node[] = []
  public parent?: Node
  public doc?: SidebarDocument
  public changeType?: ModifiedDocumentType
  public isRunning: boolean = false
  public runningCount: number = 0

  constructor({
    id,
    doc,
    parent,
    isPersisted,
    children = [],
    isRoot = false,
    isFile,
    path,
    name = '',
    changeType,
    isRunning = false,
    runningCount = 0,
  }: {
    id: string
    path: string
    isFile: boolean
    parent?: Node
    isPersisted: boolean
    doc?: SidebarDocument
    children?: Node[]
    isRoot?: boolean
    name?: string
    changeType?: ModifiedDocumentType
    isRunning?: boolean
    runningCount?: number
  }) {
    this.id = id
    this.path = path
    this.parent = parent
    this.isPersisted = isPersisted
    this.name = isRoot ? 'root' : name
    this.isRoot = isRoot
    this.isFile = isFile
    this.children = children
    this.doc = doc
    this.changeType = changeType
    this.isRunning = isRunning
    this.runningCount = runningCount
  }
}

function sortByPathDepth(a: SidebarDocument, b: SidebarDocument) {
  const depth1 = (a.path.match(/\//g) || []).length
  const depth2 = (b.path.match(/\//g) || []).length
  return depth1 - depth2
}

export function defaultGenerateNodeUuid({ uuid }: { uuid?: string } = {}) {
  if (uuid) return uuid

  return Math.random().toString(36).substring(2, 15)
}

/**
 * Find the index of a child node in a list of nodes
 * If node is a folder it goes before the file nodes
 * if both are folders it's ordered by name
 */
function findChildrenIndex(node: Node, children: Node[]) {
  const isFolder = !node.doc

  return children.findIndex((child) => {
    if (isFolder && child.doc) return true
    if (!isFolder && !child.doc) return false

    // Compare alphabetically
    return child.name > node.name
  })
}

function getChangeType(
  doc: SidebarDocument,
  liveDocuments?: SidebarDocument[],
): ModifiedDocumentType | undefined {
  if (!liveDocuments) return undefined

  const liveDoc = liveDocuments.find(
    (liveDoc) => liveDoc.documentUuid === doc.documentUuid,
  )

  if (!liveDoc) return ModifiedDocumentType.Created
  if (liveDoc.path !== doc.path) return ModifiedDocumentType.UpdatedPath
  if (liveDoc.content !== doc.content) return ModifiedDocumentType.Updated
  return undefined
}

function getFolderChangeType(node: Node) {
  if (!node.isPersisted) return ModifiedDocumentType.Created
  if (node.isFile || node.changeType) return node.changeType

  let hasNewDocs = false
  let hasUneditedDocs = false

  for (const child of node.children) {
    const changeType = getFolderChangeType(child)
    if (changeType === ModifiedDocumentType.Created) hasNewDocs = true
    if (changeType) return ModifiedDocumentType.Updated
    hasUneditedDocs = true
  }

  if (!hasUneditedDocs && hasNewDocs) return ModifiedDocumentType.Created
  return undefined
}

/**
 * Marks nodes as running based on the map of running document UUIDs to counts.
 * Only marks:
 * - Files that are actually running (with their count)
 * - Top-level folders (direct children of root) that contain running documents (with total count)
 */
function markRunningNodes(
  node: Node,
  runningDocumentsMap: Map<string, number>,
  isTopLevel: boolean = false,
): number {
  if (node.isFile) {
    const documentUuid = node.doc?.documentUuid
    const count = documentUuid ? runningDocumentsMap.get(documentUuid) || 0 : 0
    node.isRunning = count > 0
    node.runningCount = count
    return count
  }

  // For folders, sum up all running descendants
  let totalRunningCount = 0
  for (const child of node.children) {
    totalRunningCount += markRunningNodes(child, runningDocumentsMap, false)
  }

  // Only mark top-level folders as running, not nested folders
  node.isRunning = isTopLevel && totalRunningCount > 0
  node.runningCount = totalRunningCount
  return totalRunningCount
}

function buildTree({
  root,
  nodeMap,
  documents,
  liveDocuments,
  generateNodeId,
}: {
  root: Node
  nodeMap: Map<string, Node>
  documents: SidebarDocument[]
  liveDocuments?: SidebarDocument[]
  generateNodeId: typeof defaultGenerateNodeUuid
}) {
  documents.forEach((doc) => {
    let currentNode = root
    let cumulativePath = ''
    const segments = doc.path.split('/')

    segments.forEach((segment, index) => {
      const isFile = index === segments.length - 1
      cumulativePath = cumulativePath ? `${cumulativePath}/${segment}` : segment
      const nodeKey = isFile ? `${cumulativePath}_file` : cumulativePath
      const uuid = isFile ? doc.documentUuid : undefined
      const file = isFile ? doc : undefined

      if (!nodeMap.has(nodeKey)) {
        const node = new Node({
          id: generateNodeId({ uuid }),
          isPersisted: true,
          isFile,
          name: segment,
          path: cumulativePath,
          doc: file,
          changeType: getChangeType(doc, liveDocuments),
        })

        node.depth = currentNode.depth + 1

        const childrenIndex = findChildrenIndex(node, currentNode.children)

        if (childrenIndex === -1) {
          currentNode.children.push(node)
        } else {
          currentNode.children.splice(childrenIndex, 0, node)
        }

        nodeMap.set(nodeKey, node)
      } else if (isFile) {
        const existingNode = nodeMap.get(nodeKey)!
        existingNode.id = doc.documentUuid
        existingNode.doc = doc
        existingNode.isFile = true
      }

      if (!isFile) {
        currentNode = nodeMap.get(nodeKey)!
      }
    })
  })

  root.children.forEach((child) => {
    if (!child.isFile) {
      child.changeType = getFolderChangeType(child)
    }
  })

  return root
}

export function useTree({
  documents,
  liveDocuments,
  runningDocumentsMap,
  generateNodeId = defaultGenerateNodeUuid,
}: {
  documents: SidebarDocument[]
  liveDocuments?: SidebarDocument[]
  runningDocumentsMap?: Map<string, number>
  generateNodeId?: typeof defaultGenerateNodeUuid
}) {
  // Convert Map to sorted array of entries for stable dependency
  const runningDocumentsEntries = useMemo(
    () =>
      runningDocumentsMap
        ? Array.from(runningDocumentsMap.entries()).sort((a, b) =>
            a[0].localeCompare(b[0]),
          )
        : [],
    [runningDocumentsMap],
  )

  return useMemo(() => {
    const root = new Node({
      id: generateNodeId(),
      isPersisted: true,
      path: '',
      children: [],
      isRoot: true,
      isFile: false,
    })
    const nodeMap = new Map<string, Node>()
    nodeMap.set('', root)

    const sorted = documents.slice().sort(sortByPathDepth)

    const tree = buildTree({
      root,
      nodeMap,
      documents: sorted,
      liveDocuments,
      generateNodeId,
    })

    // Mark running nodes after building the tree
    // Pass isTopLevel=true for root's direct children
    if (runningDocumentsEntries.length > 0) {
      const runningMap = new Map(runningDocumentsEntries)
      for (const child of tree.children) {
        markRunningNodes(child, runningMap, true)
      }
    }

    return tree
  }, [documents, liveDocuments, runningDocumentsEntries, generateNodeId])
}
