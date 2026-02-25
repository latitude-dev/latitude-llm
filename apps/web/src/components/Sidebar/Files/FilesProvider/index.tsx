'use client'

import { createContext, ReactNode, useContext } from 'react'
import { DraggableOverlayNode } from './DragOverlayNode'
import { ClientOnly } from '@latitude-data/web-ui/atoms/ClientOnly'

type IFilesContext = {
  onMergeCommitClick: () => void
}

const FileTreeContext = createContext({} as IFilesContext)
const FileTreeProvider = ({
  onMergeCommitClick,
  children,
}: IFilesContext & {
  children: ReactNode
}) => {
  return (
    <>
      <FileTreeContext.Provider
        value={{
          onMergeCommitClick,
        }}
      >
        {children}
      </FileTreeContext.Provider>
      <ClientOnly>
        <DraggableOverlayNode />
      </ClientOnly>
    </>
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
