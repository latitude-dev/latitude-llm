import { ChangeEvent, useCallback, useMemo, useRef, useState } from 'react'

import { MenuOption } from '@latitude-data/web-ui/atoms/DropdownMenu'
import NodeHeaderWrapper, {
  IndentType,
  NodeHeaderWrapperProps,
} from '../NodeHeaderWrapper'
import { useFileTreeContext } from '../FilesProvider'
import { useOpenPaths } from '../useOpenPaths'
import { useTempNodes } from '../useTempNodes'
import { Node } from '../useTree'

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
    promptManagement,
    isLoading,
    isMerged,
    onMergeCommitClick,
    onUploadFile,
    onDeleteFolder,
    onRenameFile,
  } = useFileTreeContext()
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
      if (!promptManagement) return

      if (isMerged) {
        onMergeCommitClick()
        return
      }

      if (node.isPersisted) {
        const pathParts = node.path.split('/').slice(0, -1)
        const newPath = [...pathParts, path].join('/')
        onRenameFile({ node, path: newPath })
      } else {
        updateFolder({ id: node.id, path })
      }
    },
    [
      promptManagement,
      node,
      updateFolder,
      isMerged,
      onMergeCommitClick,
      onRenameFile,
    ],
  )

  const fileUploadInputRef = useRef<HTMLInputElement>(null)
  const onClickFileUploadInput = useCallback(() => {
    if (isMerged) onMergeCommitClick()
    else fileUploadInputRef.current?.click()
  }, [isMerged, onMergeCommitClick])
  const onFileUploadChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return

      if (!node.isPersisted) deleteTmpFolder({ id: node.id })

      const filename = file.name.replace(/\.promptl$/, '').replace(/\s+/g, '_')
      onUploadFile({ path: `${node.path}/${filename}`, file })

      event.target.value = ''
    },
    [node, deleteTmpFolder, onUploadFile],
  )

  const [isEditingState, setIsEditing] = useState(node.name === ' ')
  const isEditing = promptManagement && isEditingState
  const actions = useMemo<MenuOption[]>(() => {
    if (!promptManagement) return []

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
        label: 'Upload document',
        lookDisabled: isMerged,
        disabled: isLoading,
        iconProps: { name: 'paperclip' },
        onClick: onClickFileUploadInput,
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
            onDeleteFolder({ node, path: node.path })
          } else {
            deleteTmpFolder({ id: node.id })
          }
        },
      },
    ]
  }, [
    promptManagement,
    node,
    isLoading,
    isMerged,
    onMergeCommitClick,
    onClickFileUploadInput,
    onDeleteFolder,
    deleteTmpFolder,
    setIsEditing,
    onAddNode,
  ])

  return (
    <>
      <input
        ref={fileUploadInputRef}
        type='file'
        multiple={false}
        className='hidden'
        onChange={onFileUploadChange}
      />
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
