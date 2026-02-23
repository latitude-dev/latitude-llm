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

import {
  DraggableAndDroppableData,
  DraggableOverlayNode,
} from './DragOverlayNode'
import { useOpenPaths } from '../useOpenPaths'
import { useDragEndFile } from './useDragEndFile'
import { ClientOnly } from '@latitude-data/web-ui/atoms/ClientOnly'

type IFilesContext = {
  onMergeCommitClick: () => void
}

const FileTreeContext = createContext({} as IFilesContext)

const FileTreeProvider = ({
  promptManagement,
  onMergeCommitClick,
  children,
}: IFilesContext & {
  promptManagement: boolean
  children: ReactNode
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
  const { onDragEnd } = useDragEndFile({ promptManagement })
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
          onMergeCommitClick,
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
