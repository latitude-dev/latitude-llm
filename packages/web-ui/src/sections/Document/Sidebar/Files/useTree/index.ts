import { useMemo } from 'react'

export type SidebarDocument = {
  path: string
  documentUuid: string
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

function buildTree({
  root,
  nodeMap,
  documents,
  generateNodeId,
}: {
  root: Node
  nodeMap: Map<string, Node>
  documents: SidebarDocument[]
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

  return root
}

export function useTree({
  documents,
  generateNodeId = defaultGenerateNodeUuid,
}: {
  documents: SidebarDocument[]
  generateNodeId?: typeof defaultGenerateNodeUuid
}) {
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
      generateNodeId,
    })
    return tree
  }, [documents])
}
