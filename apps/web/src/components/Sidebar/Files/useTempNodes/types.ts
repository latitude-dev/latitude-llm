import { ModifiedDocumentType } from '@latitude-data/core/constants'

export type TempFolderNode = {
  id: string
  name: string
  path: string
  depth: number
  isFile: false
  changeType: ModifiedDocumentType.Created
  children: TempNode[]
}

export type TempFileNode = {
  id: string
  name: string
  path: string
  depth: number
  isFile: true
  changeType: ModifiedDocumentType.Created
  children: TempNode[]
}

export type TempNode = TempFolderNode | TempFileNode

export type TmpFoldersMap = Record<string, TempNode[]>

export type TmpFoldersState = {
  tmpFolders: TmpFoldersMap
  addToRootFolder: (args: { path: string }) => void
  addFolder: (args: {
    parentPath: string
    parentId: string
    parentDepth: number
    isFile: boolean
  }) => void
  updateFolder: (args: { id: string; path: string }) => void
  updateFolderAndAddOther: (args: {
    id: string
    path: string
    onNodeUpdated: (path: string) => void
  }) => void
  deleteTmpFolder: (args: { id: string }) => void
  deleteTmpBranch: (args: { id: string }) => void
  reset: () => void
}
