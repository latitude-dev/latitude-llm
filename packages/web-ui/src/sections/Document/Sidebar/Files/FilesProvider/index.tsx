'use client'
import {
  DndContext,
  DragOverlay,
  DragStartEvent,
  UniqueIdentifier,
} from '@dnd-kit/core'

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useState,
} from 'react'
import { restrictToFirstScrollableAncestor } from '@dnd-kit/modifiers'

import { Node } from '../useTree'
import { DraggableOverlayNode } from './DragOverlayNode'

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
  const [draggingNodeId, setDraggingNodeId] = useState<UniqueIdentifier | null>(
    null,
  )
  const handleDragStart = useCallback((event: DragStartEvent) => {
    console.log("DRAG_START", event.active.data)
    setDraggingNodeId(event.active.id)
  }, [])
  const handleDragEnd = useCallback(() => {
    console.log("DRAG_END")
    setDraggingNodeId(null)
  }, [])
  return (
    <DndContext
      modifiers={[restrictToFirstScrollableAncestor]}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
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
      <DraggableOverlayNode />
    </DndContext>
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
