'use client'

import { useCallback, useMemo, useState } from 'react'

import { MenuOption } from '../../../../../ds/atoms/DropdownMenu'
import { useFileTreeContext } from '../FilesProvider'
import NodeHeaderWrapper, { IndentType } from '../NodeHeaderWrapper'
import { useTempNodes } from '../useTempNodes'
import { Node } from '../useTree'
import { DocumentType } from '@latitude-data/core/browser'
import { IconName } from '../../../../../ds/atoms'

export default function DocumentHeader({
  open,
  selected,
  node,
  indentation,
}: {
  open: boolean
  selected: boolean
  node: Node
  indentation: IndentType[]
}) {
  const {
    isLoading,
    isMerged,
    onMergeCommitClick,
    onNavigateToDocument,
    onDeleteFile,
    onCreateFile,
    onRenameFile,
  } = useFileTreeContext()
  const { deleteTmpFolder, reset } = useTempNodes((state) => ({
    reset: state.reset,
    deleteTmpFolder: state.deleteTmpFolder,
  }))
  const onSaveValue = useCallback(
    async ({ path }: { path: string }) => {
      const parentPathParts = node.path.split('/').slice(0, -1)
      const newPathParts = path.split('/')
      const newPath = [...parentPathParts, ...newPathParts].join('/')
      if (node.isPersisted) {
        onRenameFile({ node, path: newPath })
      } else {
        onCreateFile(newPath)
      }
      reset()
    },
    [reset, onCreateFile, onRenameFile, node.path, node.isPersisted],
  )
  const handleClick = useCallback(() => {
    if (selected) return
    if (!node.isPersisted) return

    onNavigateToDocument(node.doc!.documentUuid)
  }, [node.doc!.documentUuid, selected, node.isPersisted, onNavigateToDocument])
  const [isEditing, setIsEditing] = useState(node.name === ' ')
  const actions = useMemo<MenuOption[]>(
    () => [
      {
        label: 'Rename file',
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
        label: 'Delete file',
        type: 'destructive',
        lookDisabled: isMerged,
        disabled: isLoading,
        iconProps: { name: 'trash' },
        onClick: () => {
          if (isMerged) {
            onMergeCommitClick()
          } else {
            onDeleteFile({ node, documentUuid: node.doc!.documentUuid })
          }
        },
      },
    ],
    [
      node.doc!.documentUuid,
      onDeleteFile,
      isLoading,
      isMerged,
      onMergeCommitClick,
    ],
  )
  const icon = useMemo<IconName>(() => {
    const docType = node.doc?.documentType
    if (!docType) return 'file'

    if (docType === DocumentType.Agent) return 'bot'
    return 'file'
  }, [node.doc?.documentType])
  return (
    <NodeHeaderWrapper
      isFile
      open={open}
      name={node.name}
      isEditing={isEditing}
      setIsEditing={setIsEditing}
      hasChildren={false}
      actions={actions}
      selected={selected}
      changeType={node.changeType}
      indentation={indentation}
      onClick={handleClick}
      onSaveValue={onSaveValue}
      onLeaveWithoutSave={() => deleteTmpFolder({ id: node.id })}
      icons={[icon]}
    />
  )
}
