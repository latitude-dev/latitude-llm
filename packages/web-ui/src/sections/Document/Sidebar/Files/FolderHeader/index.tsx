import { useCallback, useMemo } from 'react'

import { Icon } from '../../../../../ds/atoms'
import { MenuOption } from '../../../../../ds/atoms/DropdownMenu'
import { useFileTreeContext } from '../FilesProvider'
import NodeHeaderWrapper, { ICON_CLASS, IndentType } from '../NodeHeaderWrapper'
import { useOpenPaths } from '../useOpenPaths'
import { useTempNodes } from '../useTempNodes'
import { Node } from '../useTree'

export function FolderIcons({ open }: { open: boolean }) {
  const folderIcon = open ? 'folderOpen' : 'folderClose'
  const chevronIcon = open ? 'chevronDown' : 'chevronRight'
  return (
    <>
      <div className='flex items-center justify-center'>
        <Icon name={chevronIcon} className={ICON_CLASS} />
      </div>
      <Icon name={folderIcon} className={ICON_CLASS} />
    </>
  )
}

export default function FolderHeader({
  node,
  open,
  indentation,
  onToggleOpen,
}: {
  node: Node
  open: boolean
  indentation: IndentType[]
  onToggleOpen: () => void
}) {
  const { isMerged, onMergeCommitClick, onDeleteFolder } = useFileTreeContext()
  const { openPaths, togglePath } = useOpenPaths((state) => ({
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
    [node.path, togglePath, open, isMerged, onMergeCommitClick, addFolder],
  )
  const actions = useMemo<MenuOption[]>(
    () => [
      {
        label: 'New folder',
        disabled: isMerged,
        iconProps: { name: 'folderPlus' },
        onClick: onAddNode({ isFile: false }),
      },
      {
        label: 'New Prompt',
        disabled: isMerged,
        iconProps: { name: 'filePlus' },
        onClick: onAddNode({ isFile: true }),
      },
      {
        label: 'Delete folder',
        type: 'destructive',
        disabled: isMerged,
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
    ],
    [
      isMerged,
      onMergeCommitClick,
      addFolder,
      onDeleteFolder,
      deleteTmpFolder,
      node.path,
      node.isPersisted,
      openPaths,
      togglePath,
    ],
  )
  return (
    <NodeHeaderWrapper
      name={node.name}
      hasChildren={node.children.length > 0}
      onClick={onToggleOpen}
      onSaveValue={({ path }) => updateFolder({ id: node.id, path })}
      onSaveValueAndTab={({ path }) =>
        onUpdateFolderAndAddOther({ id: node.id, path })
      }
      onLeaveWithoutSave={() => deleteTmpFolder({ id: node.id })}
      open={open}
      actions={actions}
      indentation={indentation}
      icons={<FolderIcons open={open} />}
    />
  )
}
