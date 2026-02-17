'use client'
import {
  type DataRef,
  type DragOverEvent,
  MouseSensor,
  DndContext,
  useSensor,
  useSensors,
  restrictToFirstScrollableAncestor,
} from '@latitude-data/web-ui/hooks/useDnD'

import { createContext, ReactNode, useCallback, useContext } from 'react'

import { Node } from '../useTree'
import {
  DraggableAndDroppableData,
  DraggableOverlayNode,
} from './DragOverlayNode'
import { useOpenPaths } from '../useOpenPaths'
import { useDragEndFile } from './useDragEndFile'
import { type SidebarLinkContext } from '../index'
import { ClientOnly } from '@latitude-data/web-ui/atoms/ClientOnly'

type IFilesContext = {
  promptManagement: boolean
  isLoading: boolean
  isMerged: boolean
  mainDocumentUuid: string | undefined
  setMainDocumentUuid: (documentUuid: string | undefined) => void
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
  promptManagement,
  isLoading,
  isMerged,
  onMergeCommitClick,
  mainDocumentUuid,
  setMainDocumentUuid,
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
  const { onDragEnd } = useDragEndFile({ promptManagement, renamePaths })
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
          promptManagement,
          isLoading,
          isMerged,
          onMergeCommitClick,
          currentUuid,
          mainDocumentUuid,
          setMainDocumentUuid,
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
