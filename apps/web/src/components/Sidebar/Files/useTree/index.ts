import { useCallback, useEffect } from 'react'
import { useStore } from 'zustand'
import { buildNextState } from './build-next-state'
import { treeNodesStore } from './stores'
import { compareNodes } from './nodes'
import { SidebarDocument, TreeNodesState } from './types'

export type { Node, SidebarDocument } from './types'

/**
 * Syncs sidebar tree stores from the provided document list.
 *
 * The hook rebuilds a canonical draft tree and applies a granular patch to
 * the node map so unchanged nodes preserve identity.
 */
export function useTree({
  documents,
  liveDocuments,
}: {
  documents: SidebarDocument[]
  liveDocuments?: SidebarDocument[]
}) {
  useEffect(() => {
    const nodesById = treeNodesStore.getState()
    const {
      hasNodeStateChanges,
      removedNodeIds,
      updatedNodesById,
    } = buildNextState({
      prevNodesById: nodesById,
      documents,
      liveDocuments,
    })
    if (!hasNodeStateChanges) return

    treeNodesStore.setState((currentNodesById) => {
      const nextNodesById = new Map(currentNodesById)

      for (const removedNodeId of removedNodeIds) {
        nextNodesById.delete(removedNodeId)
      }

      for (const [nodeId, updatedNode] of updatedNodesById.entries()) {
        nextNodesById.set(nodeId, updatedNode)
      }

      return nextNodesById
    }, true)
  }, [documents, liveDocuments])
}

/**
 * Subscribes to a single node entry in the flat node map.
 */
export function useTreeNode(nodeId: string) {
  const selector = useCallback(
    (state: TreeNodesState) => state.get(nodeId),
    [nodeId],
  )
  return useStore(treeNodesStore, selector)
}

/**
 * Returns all parent-less nodes in sidebar display order.
 */
export function useTreeTopLevelNodeIds() {
  const selector = useCallback((state: TreeNodesState) => {
    const nodes: string[] = []
    for (const [id, node] of state.entries()) {
      if (node.parentId !== undefined) continue
      nodes.push(id)
    }
    nodes.sort((aId, bId) => {
      const a = state.get(aId)
      const b = state.get(bId)
      if (!a || !b) return 0
      return compareNodes(a, b)
    })
    return nodes
  }, [])

  return useStore(treeNodesStore, selector)
}
