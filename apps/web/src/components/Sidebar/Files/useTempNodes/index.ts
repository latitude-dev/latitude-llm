import { create } from 'zustand'
import {
  addNode,
  addRootFolder,
  deleteBranch,
  deleteNode,
  updateFolderAndAddOther,
  updateNodePath,
} from './reducers'
import { TmpFoldersState } from './types'

export type {
  TempFileNode,
  TempFolderNode,
  TempNode,
  TmpFoldersMap,
  TmpFoldersState,
} from './types'

/**
 * Temporary sidebar node store.
 *
 * Keeps draft folders/files that are not persisted yet and exposes immutable
 * mutation actions used by the sidebar tree UI.
 */
export const useTempNodes = create<TmpFoldersState>((set) => ({
  tmpFolders: {},
  reset: () => {
    set({ tmpFolders: {} })
  },
  addToRootFolder: ({ path }) => {
    set((state) => ({
      tmpFolders: addRootFolder(state.tmpFolders, { path }),
    }))
  },
  addFolder: ({ parentPath, parentId, parentDepth, isFile }) => {
    set((state) => ({
      tmpFolders: addNode(state.tmpFolders, {
        parentPath,
        parentId,
        parentDepth,
        isFile,
      }),
    }))
  },
  updateFolder: ({ id, path }) => {
    set((state) => ({
      tmpFolders: updateNodePath(state.tmpFolders, { id, path }),
    }))
  },
  updateFolderAndAddOther: ({ id, onNodeUpdated, path }) => {
    let updatedPath = path
    set((state) => {
      const result = updateFolderAndAddOther(state.tmpFolders, { id, path })
      updatedPath = result.updatedPath
      return { tmpFolders: result.tmpFolders }
    })
    onNodeUpdated(updatedPath)
  },
  deleteTmpFolder: ({ id }) => {
    set((state) => ({
      tmpFolders: deleteNode(state.tmpFolders, { id }),
    }))
  },
  deleteTmpBranch: ({ id }) => {
    set((state) => ({
      tmpFolders: deleteBranch(state.tmpFolders, { id }),
    }))
  },
}))
