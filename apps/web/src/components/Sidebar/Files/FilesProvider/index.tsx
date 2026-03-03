'use client'

import { createContext, useContext } from 'react'

type IFilesContext = {
  onMergeCommitClick: () => void
}

const FileTreeContext = createContext({} as IFilesContext)

const useFileTreeContext = () => {
  const fileTreeContext = useContext(FileTreeContext)
  if (!fileTreeContext) {
    throw new Error('useFileTreeContext must be used within a FileTreeProvider')
  }
  return fileTreeContext
}

export { useFileTreeContext }
