import { useCallback, useMemo, useState } from 'react'

import { MenuOption } from '@latitude-data/web-ui/atoms/DropdownMenu'
import NodeHeaderWrapper, {
  IndentType,
  NodeHeaderWrapperProps,
} from '../NodeHeaderWrapper'
import { useFileTreeContext } from '../FilesProvider'
import { useOpenPaths } from '../useOpenPaths'
import { useTempNodes } from '../useTempNodes'
import { Node } from '../useTree'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useSidebarDocumentVersions } from '../useSidebarDocumentVersions'

export default function FolderHeader({
  node,
  open,
  indentation,
  onToggleOpen,
  canDrag,
  draggble,
  isRunning,
  runningCount,
}: {
  node: Node
  open: boolean
  indentation: IndentType[]
  onToggleOpen: () => void
  canDrag: boolean
  draggble: NodeHeaderWrapperProps['draggble']
  isRunning?: boolean
  runningCount?: number
}) {
  const {
    onMergeCommitClick,
  } = useFileTreeContext()
  const { commit } = useCurrentCommit()
  const { renamePaths, destroyFolder, isLoading } = useSidebarDocumentVersions()
  const isMerged = !!commit.mergedAt
  const { togglePath } = useOpenPaths((state) => ({
    togglePath: state.togglePath,
    openPaths: state.openPaths,
  }))
  const { addFolder, updateFolder, updateFolderAndAddOther, deleteTmpFolder } =
    useTempNodes((state) => ({
      addFolder: state.addFolder,
      updateFolder: state.updateFolder,
      updateFolderAndAddOther: state.updateFolderAndAddOther,
      deleteTmpFolder: state.deleteTmpFolder,
    }))
  const onUpdateFolderAndAddOther = useCallback(
    ({ path, id }: { path: string; id: string }) => {
      updateFolderAndAddOther({
        id,
        path,
        onNodeUpdated: (updatedPath) => {
          togglePath(updatedPath)
        },
      })
    },
    [updateFolderAndAddOther, togglePath],
  )

  const onAddNode = useCallback(
    ({ isFile }: { isFile: boolean }) =>
      () => {
        if (isMerged) {
          onMergeCommitClick()
          return
        }

        if (!open) {
          togglePath(node.path)
        }
        addFolder({ parentPath: node.path, parentId: node.id, isFile })
      },
    [
      node.path,
      node.id,
      togglePath,
      open,
      isMerged,
      onMergeCommitClick,
      addFolder,
    ],
  )

  const onSaveValue = useCallback(
    ({ path }: { path: string }) => {
      if (isMerged) {
        onMergeCommitClick()
        return
      }

      if (node.isPersisted) {
        const pathParts = node.path.split('/').slice(0, -1)
        const newPath = [...pathParts, path].join('/')
        const oldPath = node.path + (node.isFile ? '' : '/')
        const pathWithTypeSuffix = newPath + (node.isFile ? '' : '/')
        renamePaths({ oldPath, newPath: pathWithTypeSuffix })
      } else {
        updateFolder({ id: node.id, path })
      }
    },
    [
      node,
      updateFolder,
      isMerged,
      onMergeCommitClick,
      renamePaths,
    ],
  )

  const [isEditingState, setIsEditing] = useState(node.name === ' ')
  const isEditing = isEditingState
  const actions = useMemo<MenuOption[]>(() => {
    return [
      {
        label: 'Rename folder',
        lookDisabled: isMerged,
        disabled: isLoading,
        iconProps: { name: 'pencil' },
        onClick: () => {
          if (isMerged) {
            onMergeCommitClick()
            return
          }

          setIsEditing(true)
        },
      },
      {
        label: 'New folder',
        lookDisabled: isMerged,
        disabled: isLoading,
        iconProps: { name: 'folderPlus' },
        onClick: onAddNode({ isFile: false }),
      },
      {
        label: 'New prompt',
        lookDisabled: isMerged,
        disabled: isLoading,
        iconProps: { name: 'filePlus' },
        onClick: onAddNode({ isFile: true }),
      },
      {
        label: 'Delete folder',
        type: 'destructive',
        lookDisabled: isMerged,
        disabled: isLoading,
        iconProps: { name: 'trash' },
        onClick: () => {
          if (isMerged) {
            onMergeCommitClick()
            return
          }

          if (node.isPersisted) {
            destroyFolder(node.path)
          } else {
            deleteTmpFolder({ id: node.id })
          }
        },
      },
    ]
  }, [
    node,
    isLoading,
    isMerged,
    onMergeCommitClick,
    destroyFolder,
    deleteTmpFolder,
    setIsEditing,
    onAddNode,
  ])

  return (
    <>
      <NodeHeaderWrapper
        name={node.name}
        canDrag={canDrag}
        draggble={draggble}
        isEditing={isEditing}
        setIsEditing={setIsEditing}
        hasChildren={node.children.length > 0}
        onClick={onToggleOpen}
        onSaveValue={({ path }) => onSaveValue({ path })}
        onSaveValueAndTab={({ path }) =>
          onUpdateFolderAndAddOther({ id: node.id, path })
        }
        onLeaveWithoutSave={() => deleteTmpFolder({ id: node.id })}
        open={open}
        actions={actions}
        indentation={indentation}
        icons={
          open ? ['chevronDown', 'folderOpen'] : ['chevronRight', 'folderClose']
        }
        changeType={node.changeType}
        isRunning={isRunning}
        runningCount={runningCount}
      />
    </>
  )
}
