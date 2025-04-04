import { useCallback, useMemo, useState } from 'react'

import { DocumentType } from '@latitude-data/core/browser'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { MenuOption } from '@latitude-data/web-ui/atoms/DropdownMenu'
import { useFileTreeContext } from '../FilesProvider'
import NodeHeaderWrapper, {
  IndentType,
  NodeHeaderWrapperProps,
} from '../NodeHeaderWrapper'
import { useTempNodes } from '../useTempNodes'
import { Node } from '../useTree'
import { ROUTES } from '$/services/routes'

export default function DocumentHeader({
  open,
  selected,
  node,
  indentation,
  draggble,
  canDrag,
}: {
  open: boolean
  selected: boolean
  node: Node
  indentation: IndentType[]
  draggble: NodeHeaderWrapperProps['draggble']
  canDrag: boolean
}) {
  const {
    isLoading,
    isMerged,
    onMergeCommitClick,
    onDeleteFile,
    onCreateFile,
    onRenameFile,
    sidebarLinkContext,
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
  const url = useMemo(() => {
    if (selected) return undefined
    if (!node.isPersisted) return undefined
    if (!node.doc?.documentUuid) return undefined

    return ROUTES.projects
      .detail({ id: sidebarLinkContext.projectId })
      .commits.detail({ uuid: sidebarLinkContext.commitUuid })
      .documents.detail({ uuid: node.doc.documentUuid }).root
  }, [node.doc!.documentUuid, selected, node.isPersisted, sidebarLinkContext])
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
      url={url}
      open={open}
      name={node.name}
      canDrag={canDrag}
      draggble={draggble}
      isEditing={isEditing}
      setIsEditing={setIsEditing}
      hasChildren={false}
      actions={actions}
      selected={selected}
      changeType={node.changeType}
      indentation={indentation}
      onSaveValue={onSaveValue}
      onLeaveWithoutSave={() => deleteTmpFolder({ id: node.id })}
      icons={[icon]}
    />
  )
}
