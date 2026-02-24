// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDragEndFile } from './index'
import * as tempNodes from '../../useTempNodes'
import * as sidebarDocumentVersions from '../../useSidebarDocumentVersions'
import type { DragEndEvent } from '@latitude-data/web-ui/hooks/useDnD'
import { DraggableAndDroppableData } from '../DragOverlayNode'

const deleteTmpFolderMock = vi.fn()

vi.spyOn(tempNodes, 'useTempNodes').mockImplementation((selector) => {
  // @ts-expect-error - not a real store
  return selector({ deleteTmpFolder: deleteTmpFolderMock })
})

function createDragEndEvent(
  dragNodeData: DraggableAndDroppableData | undefined,
  destinationFolderData: DraggableAndDroppableData | undefined,
): Partial<DragEndEvent> {
  return {
    active: {
      id: 'active-id',
      data: { current: dragNodeData },
      rect: {} as any,
    },
    over: destinationFolderData
      ? {
          id: 'over-id',
          data: { current: destinationFolderData },
          rect: {} as any,
          disabled: false,
        }
      : null,
    delta: { x: 0, y: 0 },
  }
}

describe('useDragEndFile', () => {
  let renamePathsMock: (args: {
    oldPath: string
    newPath: string
  }) => Promise<void>

  beforeEach(() => {
    renamePathsMock = vi.fn(() => Promise.resolve())
    deleteTmpFolderMock.mockClear()
    vi.spyOn(
      sidebarDocumentVersions,
      'useSidebarDocumentVersions',
    ).mockReturnValue({
      renamePaths: renamePathsMock,
    } as ReturnType<typeof sidebarDocumentVersions.useSidebarDocumentVersions>)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('does nothing if promptManagement is disabled', async () => {
    const { result } = renderHook(() =>
      useDragEndFile({ promptManagement: false }),
    )
    const dragNode: DraggableAndDroppableData = {
      nodeId: 'drag-1',
      name: 'file.txt',
      path: '/path/to/file',
      isFile: true,
      isRoot: false,
    }
    const destinationFolder: DraggableAndDroppableData = {
      nodeId: 'dest-1',
      name: 'Documents',
      path: '/destination',
      isFile: false,
      isRoot: false,
    }
    const event = createDragEndEvent(dragNode, destinationFolder)

    await act(async () => {
      await result.current.onDragEnd(event as DragEndEvent)
    })

    expect(renamePathsMock).not.toHaveBeenCalled()
    expect(deleteTmpFolderMock).not.toHaveBeenCalled()
  })

  it('does nothing if active drag data is missing', async () => {
    const { result } = renderHook(() =>
      useDragEndFile({ promptManagement: true }),
    )
    const event = createDragEndEvent(undefined, {
      nodeId: 'dest-1',
      name: 'Folder',
      path: '/destination',
      isFile: false,
      isRoot: false,
    })

    await act(async () => {
      await result.current.onDragEnd(event as DragEndEvent)
    })

    expect(renamePathsMock).not.toHaveBeenCalled()
    expect(deleteTmpFolderMock).not.toHaveBeenCalled()
  })

  it('does nothing if destination folder data is missing', async () => {
    const { result } = renderHook(() =>
      useDragEndFile({ promptManagement: true }),
    )
    const event = createDragEndEvent(
      {
        nodeId: 'drag-1',
        name: 'file.txt',
        path: '/path',
        isFile: true,
        isRoot: false,
      },
      undefined,
    )

    await act(async () => {
      await result.current.onDragEnd(event as DragEndEvent)
    })

    expect(renamePathsMock).not.toHaveBeenCalled()
    expect(deleteTmpFolderMock).not.toHaveBeenCalled()
  })

  it('does nothing if the computed paths are equal (for folders)', async () => {
    const { result } = renderHook(() =>
      useDragEndFile({ promptManagement: true }),
    )

    const dragNode: DraggableAndDroppableData = {
      nodeId: 'drag-1',
      name: 'folder',
      path: 'folder',
      isFile: false,
      isRoot: false,
    }
    const destinationFolder: DraggableAndDroppableData = {
      nodeId: 'dest-1',
      name: 'irrelevant',
      path: '',
      isFile: false,
      isRoot: true,
    }

    const event = createDragEndEvent(dragNode, destinationFolder)

    await act(async () => {
      await result.current.onDragEnd(event as DragEndEvent)
    })

    expect(renamePathsMock).not.toHaveBeenCalled()
    expect(deleteTmpFolderMock).not.toHaveBeenCalled()
  })

  it('calls renamePaths and deleteTmpFolder for a valid file move', async () => {
    const { result } = renderHook(() =>
      useDragEndFile({ promptManagement: true }),
    )
    const dragNode: DraggableAndDroppableData = {
      nodeId: 'drag-1',
      name: 'file.txt',
      path: '/path/to/file',
      isFile: true,
      isRoot: false,
    }
    const destinationFolder: DraggableAndDroppableData = {
      nodeId: 'dest-1',
      name: 'Documents',
      path: '/destination',
      isFile: false,
      isRoot: false,
    }
    const event = createDragEndEvent(dragNode, destinationFolder)
    await act(async () => {
      await result.current.onDragEnd(event as DragEndEvent)
    })

    expect(renamePathsMock).toHaveBeenCalledWith({
      oldPath: '/path/to/file',
      newPath: '/destination/file.txt',
    })
    expect(deleteTmpFolderMock).toHaveBeenCalledWith({
      id: destinationFolder.nodeId,
    })
  })

  it('calls renamePaths and deleteTmpFolder for a valid folder move', async () => {
    const { result } = renderHook(() =>
      useDragEndFile({ promptManagement: true }),
    )
    const dragNode: DraggableAndDroppableData = {
      nodeId: 'drag-2',
      name: 'myFolder',
      path: '/oldFolder',
      isFile: false,
      isRoot: false,
    }
    const destinationFolder: DraggableAndDroppableData = {
      nodeId: 'dest-2',
      name: 'NewParent',
      path: '/destination',
      isFile: false,
      isRoot: false,
    }
    const event = createDragEndEvent(dragNode, destinationFolder)
    await act(async () => {
      await result.current.onDragEnd(event as DragEndEvent)
    })

    expect(renamePathsMock).toHaveBeenCalledWith({
      oldPath: '/oldFolder/',
      newPath: '/destination/myFolder/',
    })
    expect(deleteTmpFolderMock).toHaveBeenCalledWith({
      id: destinationFolder.nodeId,
    })
  })
})
