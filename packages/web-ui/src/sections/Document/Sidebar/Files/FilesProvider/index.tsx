import { createContext, ReactNode, useContext } from 'react'

type IFilesContext = {
  currentPath?: string
  onCreateFile: (path: string) => void
  onDeleteFile: (documentUuid: string) => void
  onDeleteFolder: (path: string) => void
  onNavigateToDocument: (documentUuid: string) => void
}
const FileTreeContext = createContext({} as IFilesContext)

const FileTreeProvider = ({
  children,
  currentPath,
  onCreateFile,
  onDeleteFile,
  onDeleteFolder,
  onNavigateToDocument,
}: { children: ReactNode } & IFilesContext) => {
  return (
    <FileTreeContext.Provider
      value={{
        currentPath,
        onCreateFile,
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
