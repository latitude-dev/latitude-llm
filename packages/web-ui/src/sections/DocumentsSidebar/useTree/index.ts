import { useMemo } from 'react'

export type SidebarDocument = {
  path: string
  doumentUuid: string
}

export class Node {
  public id: string
  public name: string
  public isRoot: boolean = false
  public children: Node[] = []
  public doc?: SidebarDocument

  constructor({
    id,
    doc,
    children = [],
    isRoot = false,
    name = '',
  }: {
    id: string
    doc?: SidebarDocument
    children?: Node[]
    isRoot?: boolean
    name?: string
  }) {
    this.id = id
    this.name = isRoot ? 'root' : name
    this.isRoot = isRoot
    this.children = children
    this.doc = doc
  }

  toJSON(): object {
    return {
      id: this.id,
      name: this.name,
      isRoot: this.isRoot,
      children: this.children.map((child) => child.toJSON()),
      doc: this.doc,
    }
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
    const segments = doc.path.split('/')
    let path = ''

    segments.forEach((segment, index) => {
      const isFile = index === segments.length - 1
      path = path ? `${path}/${segment}` : segment

      if (!nodeMap.has(path)) {
        const file = isFile ? doc : undefined
        const uuid = isFile ? doc.doumentUuid : undefined
        const node = new Node({
          id: generateNodeId({ uuid }),
          doc: file,
          name: segment,
        })
        nodeMap.set(path, node)

        const parentPath = path.split('/').slice(0, -1).join('/')

        // We force TypeScript to check that the parentPath is not empty
        // We pre-sorted documents by path depth, so we know
        // that the parent node exists
        const parent = nodeMap.get(parentPath)!
        parent.children.push(node)
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
    const root = new Node({ id: generateNodeId(), children: [], isRoot: true })
    const nodeMap = new Map<string, Node>()
    nodeMap.set('', root)
    const sorted = documents.slice().sort(sortByPathDepth)

    const tree = buildTree({ root, nodeMap, documents: sorted, generateNodeId })
    return tree
  }, [documents])
}
