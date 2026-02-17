import { useCallback } from 'react'
import { useTempNodes } from '../../useTempNodes'
import { DragEndEvent } from '@latitude-data/web-ui/hooks/useDnD'
import { DraggableAndDroppableData } from '../DragOverlayNode'

export function useDragEndFile({
  promptManagement,
  renamePaths,
}: {
  promptManagement: boolean
  renamePaths: (args: { oldPath: string; newPath: string }) => Promise<void>
}) {
  const { deleteTmpFolder } = useTempNodes((state) => ({
    deleteTmpFolder: state.deleteTmpFolder,
  }))
  const onDragEnd = useCallback(
    async (event: DragEndEvent) => {
      if (!promptManagement) return

      const { active, over } = event

      // Skip if the drag is over itself
      if (over && active.id === over.id) return

      const dragNodeData = active.data.current
      const draggedFolderData = over?.data?.current
      if (!dragNodeData || !draggedFolderData) return

      const dragNode = dragNodeData as DraggableAndDroppableData
      const destinationFolder = draggedFolderData as DraggableAndDroppableData

      const dragSufix = dragNode.isFile ? '' : '/'
      const oldPath = `${dragNode.path}${dragSufix}`
      const separator = destinationFolder.isRoot ? '' : '/'
      const newPath = `${destinationFolder.path}${separator}${dragNode.name}${dragSufix}`

      if (oldPath === newPath) return
      await renamePaths({ oldPath, newPath })
      deleteTmpFolder({ id: draggedFolderData.nodeId })
    },
    [promptManagement, renamePaths, deleteTmpFolder],
  )

  return { onDragEnd }
}
