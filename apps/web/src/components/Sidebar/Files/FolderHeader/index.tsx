import { useCallback, useMemo, useState } from 'react'

import { MenuOption } from '@latitude-data/web-ui/atoms/DropdownMenu'
import NodeHeaderWrapper from '../NodeHeaderWrapper'
import { useOpenPaths } from '../useOpenPaths'
import { Node } from '../useTree'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { TempNode, useTempNodes } from '../useTempNodes'
import { useDocumentVersionActions } from '$/stores/actions/documentVersionActions'

export default function FolderHeader({
  node,
  open,
  hasChildren,
  onToggleOpen,
}: {
  node: Node | TempNode
  open: boolean
  hasChildren: boolean
  onToggleOpen?: () => void
}) {
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const { renamePaths, destroyFolder, isLoading } = useDocumentVersionActions({
    commitUuid: commit.uuid,
    projectId: project.id,
  })
  const { addFolder, updateFolder, updateFolderAndAddOther, deleteTmpFolder } =
    useTempNodes((state) => ({
      addFolder: state.addFolder,
      updateFolder: state.updateFolder,
      updateFolderAndAddOther: state.updateFolderAndAddOther,
      deleteTmpFolder: state.deleteTmpFolder,
    }))
  const isMerged = !!commit.mergedAt
  const isTemporary = node.id.startsWith('tmp:')
  const togglePath = useOpenPaths((state) => state.togglePath)
  const onAddNode = useCallback(
    ({ isFile }: { isFile: boolean }) =>
      async () => {
        if (isMerged) {
          return
        }

        if (!open) {
          togglePath(node.path)
        }

        if (!isFile) {
          addFolder({
            parentPath: node.path,
            parentId: node.id,
            parentDepth: node.depth,
            isFile: false,
          })
          return
        }

        addFolder({
          parentPath: node.path,
          parentId: node.id,
          parentDepth: node.depth,
          isFile: true,
        })
      },
    [node.path, node.id, node.depth, togglePath, open, isMerged, addFolder],
  )

  const onSaveValue = useCallback(
    ({ path }: { path: string }) => {
      if (isMerged) {
        return
      }

      if (isTemporary) {
        updateFolder({ id: node.id, path })
        return
      }

      const pathParts = node.path.split('/').slice(0, -1)
      const newPath = [...pathParts, path].join('/')
      const oldPath = node.path + (node.isFile ? '' : '/')
      const pathWithTypeSuffix = newPath + (node.isFile ? '' : '/')
      renamePaths({ oldPath, newPath: pathWithTypeSuffix })
    },
    [node, isMerged, isTemporary, renamePaths, updateFolder],
  )

  const onSaveValueAndTab = useCallback(
    ({ path }: { path: string }) => {
      if (!isTemporary) return
      updateFolderAndAddOther({
        id: node.id,
        path,
        onNodeUpdated: (updatedPath) => {
          togglePath(updatedPath)
        },
      })
    },
    [isTemporary, node.id, togglePath, updateFolderAndAddOther],
  )

  const [isEditingState, setIsEditing] = useState(
    isTemporary && node.name === ' ',
  )
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
            return
          }

          if (isTemporary) {
            deleteTmpFolder({ id: node.id })
          } else {
            destroyFolder(node.path)
          }
        },
      },
    ]
  }, [
    node,
    isTemporary,
    isLoading,
    isMerged,
    destroyFolder,
    deleteTmpFolder,
    setIsEditing,
    onAddNode,
  ])

  return (
    <>
      <NodeHeaderWrapper
        depth={node.depth}
        name={node.name}
        isEditing={isEditing}
        setIsEditing={setIsEditing}
        hasChildren={hasChildren}
        onClick={onToggleOpen}
        onSaveValue={({ path }) => onSaveValue({ path })}
        onSaveValueAndTab={onSaveValueAndTab}
        onLeaveWithoutSave={
          isTemporary ? () => deleteTmpFolder({ id: node.id }) : undefined
        }
        open={open}
        actions={actions}
        icons={
          open ? ['chevronDown', 'folderOpen'] : ['chevronRight', 'folderClose']
        }
        changeType={node.changeType}
      />
    </>
  )
}
