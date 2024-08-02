import { useCallback, useMemo } from 'react'

import { Icons } from '$ui/ds/atoms'
import { MenuOption } from '$ui/ds/atoms/DropdownMenu'
import { cn } from '$ui/lib/utils'
import { useFileTreeContext } from '$ui/sections/Document/Sidebar/Files/FilesProvider'
import NodeHeaderWrapper, {
  ICON_CLASS,
  IndentType,
} from '$ui/sections/Document/Sidebar/Files/NodeHeaderWrapper'
import { useOpenPaths } from '$ui/sections/Document/Sidebar/Files/useOpenPaths'
import { useTempNodes } from '$ui/sections/Document/Sidebar/Files/useTempNodes'

import { Node } from '../useTree'

export function FolderIcons({ open }: { open: boolean }) {
  const FolderIcon = open ? Icons.folderOpen : Icons.folderClose
  const ChevronIcon = open ? Icons.chevronDown : Icons.chevronRight
  return (
    <>
      <div className='min-w-6 h-6 flex items-center justify-center'>
        <ChevronIcon className={cn(ICON_CLASS, 'h-4 w-4')} />
      </div>
      <FolderIcon className={ICON_CLASS} />
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
  const { onDeleteFolder } = useFileTreeContext()
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
        if (!open) {
          togglePath(node.path)
        }
        addFolder({ parentPath: node.path, parentId: node.id, isFile })
      },
    [node.path, togglePath, open],
  )
  const actions = useMemo<MenuOption[]>(
    () => [
      {
        label: 'New folder',
        iconProps: { name: 'folderPlus' },
        onClick: onAddNode({ isFile: false }),
      },
      {
        label: 'New Prompt',
        iconProps: { name: 'filePlus' },
        onClick: onAddNode({ isFile: true }),
      },
      {
        label: 'Delete folder',
        type: 'destructive',
        iconProps: { name: 'trash' },
        onClick: () => {
          if (node.isPersisted) {
            onDeleteFolder({ node, path: node.path })
          } else {
            deleteTmpFolder({ id: node.id })
          }
        },
      },
    ],
    [
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
