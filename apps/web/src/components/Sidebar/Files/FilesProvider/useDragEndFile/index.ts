import { useCallback } from 'react'
import { useTempNodes } from '../../useTempNodes'
import { DragEndEvent } from '@latitude-data/web-ui/hooks/useDnD'
import { DraggableAndDroppableData } from '../DragOverlayNode'

export function useDragEndFile({
  renamePaths,
}: {
  renamePaths: (args: { oldPath: string; newPath: string }) => Promise<void>
}) {
  const { deleteTmpFolder } = useTempNodes((state) => ({
    deleteTmpFolder: state.deleteTmpFolder,
  }))
  const onDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const dragNodeData = event.active.data.current
      const draggedFolderData = event.over?.data?.current
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
    [renamePaths, deleteTmpFolder],
  )

  return { onDragEnd }
}
