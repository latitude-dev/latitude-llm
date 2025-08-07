'use client'
import {
  type DataRef,
  DndContext,
  type DragOverEvent,
  MouseSensor,
  restrictToFirstScrollableAncestor,
  useSensor,
  useSensors,
} from '@latitude-data/web-ui/hooks/useDnD'

import { createContext, ReactNode, useCallback, useContext } from 'react'

import { ClientOnly } from '@latitude-data/web-ui/atoms/ClientOnly'
import { type SidebarLinkContext } from '../index'
import { useOpenPaths } from '../useOpenPaths'
import { Node } from '../useTree'
import {
  DraggableAndDroppableData,
  DraggableOverlayNode,
} from './DragOverlayNode'
import { useDragEndFile } from './useDragEndFile'

type IFilesContext = {
  isLoading: boolean
  isMerged: boolean
  onCreateFile: (path: string) => void
  onCreateAgent: (path: string) => void
  onUploadFile: (args: { path: string; file: File }) => void
  onRenameFile: (args: { node: Node; path: string }) => void
  onDeleteFile: (args: { node: Node; documentUuid: string }) => void
  onMergeCommitClick: () => void
  currentUuid?: string
  onDeleteFolder: (args: { node: Node; path: string }) => void
  sidebarLinkContext: SidebarLinkContext
}

const FileTreeContext = createContext({} as IFilesContext)

const FileTreeProvider = ({
  isLoading,
  isMerged,
  onMergeCommitClick,
  children,
  currentUuid,
  onCreateFile,
  onCreateAgent,
  onUploadFile,
  onRenameFile,
  renamePaths,
  onDeleteFile,
  onDeleteFolder,
  sidebarLinkContext,
}: IFilesContext & {
  children: ReactNode
  renamePaths: (args: { oldPath: string; newPath: string }) => Promise<void>
}) => {
  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: {
      distance: 5,
    },
  })
  const sensors = useSensors(mouseSensor)
  const { openPaths, togglePath } = useOpenPaths((state) => ({
    openPaths: state.openPaths,
    togglePath: state.togglePath,
  }))
  const { onDragEnd } = useDragEndFile({ renamePaths })
  const onDragOver = useCallback(
    (event: DragOverEvent) => {
      const { over } = event
      const overData = over?.data?.current
        ? (over.data as DataRef<DraggableAndDroppableData>).current
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
      sensors={sensors}
      modifiers={[restrictToFirstScrollableAncestor]}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      <FileTreeContext.Provider
        value={{
          isLoading,
          isMerged,
          onMergeCommitClick,
          currentUuid,
          onCreateFile,
          onCreateAgent,
          onUploadFile,
          onRenameFile,
          onDeleteFile,
          onDeleteFolder,
          sidebarLinkContext,
        }}
      >
        {children}
      </FileTreeContext.Provider>
      <ClientOnly>
        <DraggableOverlayNode />
      </ClientOnly>
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
