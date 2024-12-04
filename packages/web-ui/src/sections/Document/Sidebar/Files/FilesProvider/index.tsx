'use client'

import { createContext, ReactNode, useContext } from 'react'

import { Node } from '../useTree'

type IFilesContext = {
  isLoading: boolean
  isMerged: boolean
  onCreateFile: (path: string) => void
  onUploadFile: (args: { path: string; file: File }) => void
  onRenameFile: (args: { node: Node; path: string }) => void
  onDeleteFile: (args: { node: Node; documentUuid: string }) => void
  onMergeCommitClick: () => void
  currentUuid?: string
  onDeleteFolder: (args: { node: Node; path: string }) => void
  onNavigateToDocument: (documentUuid: string) => void
}
const FileTreeContext = createContext({} as IFilesContext)

const FileTreeProvider = ({
  isLoading,
  isMerged,
  onMergeCommitClick,
  children,
  currentUuid,
  onCreateFile,
  onUploadFile,
  onRenameFile,
  onDeleteFile,
  onDeleteFolder,
  onNavigateToDocument,
}: { children: ReactNode } & IFilesContext) => {
  return (
    <FileTreeContext.Provider
      value={{
        isLoading,
        isMerged,
        onMergeCommitClick,
        currentUuid,
        onCreateFile,
        onUploadFile,
        onRenameFile,
        onDeleteFile,
        onDeleteFolder,
        onNavigateToDocument,
      }}
    >
      {children}
    </FileTreeContext.Provider>
  )
}

const useFileTreeContext = () => {
  const fileTreeContext = useContext(FileTreeContext)
  if (!fileTreeContext) {
    throw new Error('useFileTreeContext must be used within a FileTreeProvider')
  }
  return fileTreeContext
}

export { FileTreeProvider, useFileTreeContext }
