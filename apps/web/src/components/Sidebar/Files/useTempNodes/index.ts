import { create } from 'zustand'

import { defaultGenerateNodeUuid, Node } from '../useTree'
import { ModifiedDocumentType } from '@latitude-data/core/constants'

type TmpFoldersState = {
  tmpFolders: Record<string, Node[]>
  addToRootFolder: (args: { path: string }) => void
  addFolder: (args: {
    parentPath: string
    parentId: string
    isFile: boolean
  }) => void
  updateFolder: (args: { id: string; path: string }) => void
  updateFolderAndAddOther: (args: {
    id: string
    path: string
    onNodeUpdated: (path: string) => void
  }) => void
  deleteTmpFolder: (args: { id: string }) => void
  reset: () => void
}

function nodeAndChildren(node: Node): Node[] {
  return [node, ...node.children.flatMap(nodeAndChildren)]
}

function allTmpNodes(tmpFolders: TmpFoldersState['tmpFolders']) {
  return Object.values(tmpFolders)
    .flatMap((nodes) => nodes.map(nodeAndChildren))
    .flat()
}

function createEmptyNode({
  name,
  parentPath,
  parent,
  isFile,
}: {
  name?: string
  parentPath?: string
  isFile: boolean
  parent: Node | undefined
}) {
  const emptyName = ' '
  const nodePath = name ? name : `${parentPath}/${emptyName}`
  return new Node({
    id: defaultGenerateNodeUuid(),
    name: name ?? emptyName,
    path: nodePath,
    isPersisted: false,
    doc: isFile
      ? {
          path: nodePath,
          documentUuid: defaultGenerateNodeUuid(),
          content: '',
        }
      : undefined,
    isFile,
    parent,
    changeType: ModifiedDocumentType.Created,
  })
}

function findRootParent(node: Node) {
  if (!node.parent) return node

  return findRootParent(node.parent)
}

function insertItemInTheirPosition(list: Node[], item: Node) {
  const idx = list.findIndex((n) => n.id === item.id)!
  const before = list.slice(0, idx)
  const after = list.slice(idx + 1) ?? []

  return [...before, item, ...after]
}

function cloneNode(node: Node) {
  const clonedNode = new Node({
    id: node.id,
    name: node.name,
    path: node.path,
    parent: node.parent,
    isFile: node.isFile,
    isPersisted: node.isPersisted,
  })
  return clonedNode
}

function findAndReplaceParentNodeInRootNode(
  rootNode: Node,
  node: Node,
  replaceNode: Node,
) {
  if (rootNode.id === node.id) return replaceNode

  const children = rootNode.children.map((child) =>
    findAndReplaceParentNodeInRootNode(child, node, replaceNode),
  )

  rootNode.children = children
  return rootNode
}

export const useTempNodes = create<TmpFoldersState>((set, get) => ({
  tmpFolders: {},
  reset: () => {
    set({
      tmpFolders: {},
    })
  },
  addToRootFolder: ({ path }) => {
    set((state) => {
      const existingNodes = state.tmpFolders[''] || []
      const node = createEmptyNode({
        name: path,
        parent: undefined,
        isFile: false,
      })
      return {
        tmpFolders: {
          ...state.tmpFolders,
          ['']: [node, ...existingNodes],
        },
      }
    })
  },
  addFolder: ({ parentPath, parentId, isFile }) => {
    set((state) => {
      const allNodes = allTmpNodes(state.tmpFolders)
      const parentNode = allNodes.find((node) => node.id === parentId)
      const node = createEmptyNode({
        parentPath: parentNode ? parentNode.path : parentPath,
        parent: parentNode,
        isFile,
      })

      // When adding to an existing tmp node we
      // clone parent node and replace it in the root node
      // in their right position in the tree
      if (parentNode) {
        const parentClone = cloneNode(parentNode)
        node.parent = parentClone
        parentClone.children = [node, ...(parentNode.children || [])]
        const rootParent = findRootParent(node)
        const newRootNode = findAndReplaceParentNodeInRootNode(
          rootParent,
          parentNode,
          parentClone,
        )

        const rootParentPath = newRootNode.path
          .split('/')
          .slice(0, -1)
          .join('/')
        const rootTmpFolder = state.tmpFolders[rootParentPath]!

        return {
          tmpFolders: {
            ...state.tmpFolders,
            [rootParentPath]: insertItemInTheirPosition(
              rootTmpFolder,
              newRootNode,
            ),
          },
        }
      }

      const prevNodes = state.tmpFolders[parentPath]
      const newState = {
        tmpFolders: {
          ...state.tmpFolders,
          [parentPath]: prevNodes ? [node, ...prevNodes] : [node],
        },
      }
      return newState
    })
  },
  updateFolder: ({ id, path }) => {
    set((state) => {
      const allNodes = allTmpNodes(state.tmpFolders)
      const node = allNodes.find((node) => node.id === id)
      if (!node) return state

      const parentPathParts = node.path.split('/').slice(0, -1)
      const newPathParts = path.split('/')
      const newPath = [...parentPathParts, ...newPathParts].join('/')

      node.path = newPath
      node.name = newPathParts.pop()!

      // TODO: Create in-between folders when new path contains nested paths.

      return state
    })
  },
  updateFolderAndAddOther: ({ id, path, onNodeUpdated }) => {
    set((state) => {
      state.updateFolder({ id, path })
      const allNodes = allTmpNodes(state.tmpFolders)
      const parentNode = allNodes.find((node) => node.id === id)

      onNodeUpdated(parentNode!.path)

      state.addFolder({
        parentPath: path,
        parentId: id,
        isFile: false,
      })

      return get()
    })
  },
  deleteTmpFolder: ({ id }) => {
    set((state) => {
      const allNodes = allTmpNodes(state.tmpFolders)
      const node = allNodes.find((node) => node.id === id)
      if (!node) return state

      // When no parent it means is a root tmp node
      if (!node.parent) {
        const parentPath = node.path.split('/').slice(0, -1).join('/')
        const parent = state.tmpFolders[parentPath]
        if (!parent) return state

        const idx = parent.findIndex((n) => n.id === id)
        return {
          tmpFolders: {
            ...state.tmpFolders,
            [parentPath]: [...parent.slice(0, idx), ...parent.slice(idx + 1)],
          },
        }
      }

      const parentNode = node.parent
      const parentClone = cloneNode(parentNode)
      const idx = parentClone.children.findIndex((n) => n.id === node.id)

      // Remove node from children
      parentClone.children = [
        ...parentClone.children.slice(0, idx),
        ...(parentClone.children.slice(idx + 1) ?? []),
      ]
      const rootParent = findRootParent(node)
      const newRootNode = findAndReplaceParentNodeInRootNode(
        rootParent,
        parentNode,
        parentClone,
      )

      const rootParentPath = newRootNode.path.split('/').slice(0, -1).join('/')
      const rootTmpFolder = state.tmpFolders[rootParentPath]!

      return {
        tmpFolders: {
          ...state.tmpFolders,
          [rootParentPath]: insertItemInTheirPosition(
            rootTmpFolder,
            newRootNode,
          ),
        },
      }
    })
  },
}))
