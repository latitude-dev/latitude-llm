'use client'
import {
  DataRef,
  DndContext,
  DragOverEvent,
  MouseSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'

import { createContext, ReactNode, useCallback, useContext } from 'react'
import { restrictToFirstScrollableAncestor } from '@dnd-kit/modifiers'

import { Node } from '../useTree'
import {
  DraggableAndDroppableData,
  DraggableOverlayNode,
} from './DragOverlayNode'
import { useOpenPaths } from '../useOpenPaths'

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
  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: {
      delay: 200, // ms
      distance: 15,
      tolerance: 15,
    },
  })
  const sensors = useSensors(mouseSensor)
  const { openPaths, togglePath } = useOpenPaths((state) => ({
    openPaths: state.openPaths,
    togglePath: state.togglePath,
  }))
  const onDragOver = useCallback(
    (event: DragOverEvent) => {
      const overData = event.over?.data?.current
        ? (event.over.data as DataRef<DraggableAndDroppableData>).current
        : undefined

      const nodePath = overData ? overData.path : undefined
      if (!nodePath) return

      const open = !!openPaths[nodePath]

      if (open) return

      togglePath(nodePath)
    },
    [openPaths, togglePath],
  )
  return (
    <DndContext
      modifiers={[restrictToFirstScrollableAncestor]}
      sensors={sensors}
      onDragOver={onDragOver}
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
