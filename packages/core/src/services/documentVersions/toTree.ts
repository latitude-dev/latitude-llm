import { DocumentVersion } from '@latitude-data/core'

export class Node {
  public doc?: DocumentVersion
  public children: Node[] = []
  public isRoot: boolean = false

  constructor(
    doc?: DocumentVersion,
    children: Node[] = [],
    isRoot: boolean = false,
  ) {
    this.doc = doc
    this.children = children
    this.isRoot = isRoot
  }
}

export function toTree(docs: DocumentVersion[]) {
  function iterate(node: Node) {
    let children
    if (node.isRoot) {
      children = Object.values(docs)
        .filter((doc) => !doc.parentId)
        .map((doc) => new Node(doc))
    } else {
      children = docs
        .filter((doc) => doc.parentId === node.doc!.id)
        .map((doc) => new Node(doc))
    }

    node.children = children
    node.children.forEach(iterate)

    return node
  }

  return iterate(new Node(undefined, [], true))
}
