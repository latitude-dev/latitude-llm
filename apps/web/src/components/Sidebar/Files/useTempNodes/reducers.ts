import { EMPTY_NAME, createTempFileNode, createTempFolderNode } from './nodes'
import { nodeContainsId, removeNodeById, updateDescendantPaths, updateNodeById } from './tree-ops'
import { TempNode, TmpFoldersMap } from './types'

/**
 * Inserts a root-level temporary folder.
 */
export function addRootFolder(
  tmpFolders: TmpFoldersMap,
  { path }: { path: string },
): TmpFoldersMap {
  const current = tmpFolders[''] ?? []
  const node = createTempFolderNode({ name: path, path, depth: 1 })
  return {
    ...tmpFolders,
    ['']: [node, ...current],
  }
}

/**
 * Inserts a temporary folder or file under either a persisted folder path
 * or a temporary folder node.
 */
export function addNode(
  tmpFolders: TmpFoldersMap,
  {
    parentPath,
    parentId,
    parentDepth,
    isFile,
  }: {
    parentPath: string
    parentId: string
    parentDepth: number
    isFile: boolean
  },
): TmpFoldersMap {
  const placeholderPath = parentPath ? `${parentPath}/${EMPTY_NAME}` : EMPTY_NAME
  const node = isFile
    ? createTempFileNode({
        name: EMPTY_NAME,
        path: placeholderPath,
        depth: parentDepth + 1,
      })
    : createTempFolderNode({
        name: EMPTY_NAME,
        path: placeholderPath,
        depth: parentDepth + 1,
      })

  const isTempParent = parentId.startsWith('tmp:')
  if (!isTempParent) {
    const byParent = tmpFolders[parentPath] ?? []
    return {
      ...tmpFolders,
      [parentPath]: [node, ...byParent],
    }
  }

  return updateFoldersByNodeId(tmpFolders, parentId, (parent) => ({
    ...parent,
    children: parent.isFile ? parent.children : [node, ...parent.children],
  }))
}

/**
 * Renames a temporary node and updates descendant paths.
 */
export function updateNodePath(
  tmpFolders: TmpFoldersMap,
  { id, path }: { id: string; path: string },
): TmpFoldersMap {
  return updateFoldersByNodeId(tmpFolders, id, (node) => {
    const parts = node.path.split('/')
    parts[parts.length - 1] = path
    const nextPath = parts.join('/')
    return {
      ...node,
      name: path,
      path: nextPath,
      children: node.isFile
        ? []
        : updateDescendantPaths(node.children, node.path, nextPath),
    }
  })
}

/**
 * Renames a temporary folder and inserts a new empty child folder in it.
 */
export function updateFolderAndAddOther(
  tmpFolders: TmpFoldersMap,
  { id, path }: { id: string; path: string },
): { tmpFolders: TmpFoldersMap; updatedPath: string } {
  let updatedPath = path
  const nextTmpFolders = updateFoldersByNodeId(tmpFolders, id, (node) => {
    if (node.isFile) return node

    const parts = node.path.split('/')
    parts[parts.length - 1] = path
    updatedPath = parts.join('/')
    const child = createTempFolderNode({
      name: EMPTY_NAME,
      path: `${updatedPath}/${EMPTY_NAME}`,
      depth: node.depth + 1,
    })

    return {
      ...node,
      name: path,
      path: updatedPath,
      children: [
        child,
        ...updateDescendantPaths(node.children, node.path, updatedPath),
      ],
    }
  })

  return { tmpFolders: nextTmpFolders, updatedPath }
}

/**
 * Removes a single temporary node subtree by id.
 */
export function deleteNode(
  tmpFolders: TmpFoldersMap,
  { id }: { id: string },
): TmpFoldersMap {
  let changed = false
  const nextTmpFolders = { ...tmpFolders }
  for (const key of Object.keys(tmpFolders)) {
    const current = tmpFolders[key]!
    const next = removeNodeById(current, id)
    if (next === current) continue
    changed = true
    nextTmpFolders[key] = next
    break
  }

  return changed ? nextTmpFolders : tmpFolders
}

/**
 * Removes the top-level temporary branch containing the given node id.
 */
export function deleteBranch(
  tmpFolders: TmpFoldersMap,
  { id }: { id: string },
): TmpFoldersMap {
  let changed = false
  const nextTmpFolders = { ...tmpFolders }
  for (const key of Object.keys(tmpFolders)) {
    const current = tmpFolders[key]!
    const next = current.filter((node) => !nodeContainsId(node, id))
    if (next.length === current.length) continue
    changed = true
    nextTmpFolders[key] = next
    break
  }

  return changed ? nextTmpFolders : tmpFolders
}

function updateFoldersByNodeId(
  tmpFolders: TmpFoldersMap,
  id: string,
  updater: (node: TempNode) => TempNode,
): TmpFoldersMap {
  let changed = false
  const nextTmpFolders = { ...tmpFolders }
  for (const key of Object.keys(tmpFolders)) {
    const current = tmpFolders[key]!
    const next = updateNodeById(current, id, updater)
    if (next === current) continue
    changed = true
    nextTmpFolders[key] = next
    break
  }

  return changed ? nextTmpFolders : tmpFolders
}
