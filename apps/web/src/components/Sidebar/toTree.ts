import { useMemo } from 'react'

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

export function useTree({ documents }: { documents: DocumentVersion[] }) {
  return useMemo(() => {
    function iterate(node: Node) {
      let children
      if (node.isRoot) {
        children = Object.values(documents)
          .filter((doc) => !doc.parentId)
          .map((doc) => new Node(doc))
      } else {
        children = documents
          .filter((doc) => doc.parentId === node.doc!.id)
          .map((doc) => new Node(doc))
      }

      node.children = children
      node.children.forEach(iterate)

      return node
    }

    return iterate(new Node(undefined, [], true))
  }, [documents])
}
