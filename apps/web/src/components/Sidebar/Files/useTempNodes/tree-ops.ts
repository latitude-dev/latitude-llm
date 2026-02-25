import { TempNode } from './types'

/**
 * Rewrites child paths when a parent node path changes.
 */
export function updateDescendantPaths(
  children: TempNode[],
  oldPath: string,
  newPath: string,
): TempNode[] {
  if (children.length === 0) return children

  return children.map((child) => {
    const nextPath = child.path.startsWith(`${oldPath}/`)
      ? `${newPath}${child.path.slice(oldPath.length)}`
      : child.path

    return {
      ...child,
      path: nextPath,
      children: child.isFile
        ? []
        : updateDescendantPaths(child.children, child.path, nextPath),
    }
  })
}

/**
 * Applies an immutable node update by id in a tree.
 */
export function updateNodeById(
  nodes: TempNode[],
  id: string,
  updater: (node: TempNode) => TempNode,
): TempNode[] {
  let changed = false
  const next = nodes.map((node) => {
    if (node.id === id) {
      changed = true
      return updater(node)
    }

    const nextChildren = updateNodeById(node.children, id, updater)
    if (nextChildren === node.children) return node
    changed = true
    return { ...node, children: nextChildren }
  })

  return changed ? next : nodes
}

/**
 * Removes a node by id from a tree.
 */
export function removeNodeById(nodes: TempNode[], id: string): TempNode[] {
  let changed = false
  const next: TempNode[] = []

  for (const node of nodes) {
    if (node.id === id) {
      changed = true
      continue
    }

    const nextChildren = removeNodeById(node.children, id)
    if (nextChildren !== node.children) {
      changed = true
      next.push({ ...node, children: nextChildren })
      continue
    }

    next.push(node)
  }

  return changed ? next : nodes
}

/**
 * Checks if a node id exists in a tree branch.
 */
export function nodeContainsId(node: TempNode, id: string): boolean {
  if (node.id === id) return true
  return node.children.some((child) => nodeContainsId(child, id))
}
