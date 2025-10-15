import { EvaluationList } from '$/components/Sidebar/Files/EvaluationList'
import { ROUTES } from '$/services/routes'
import { MenuOption } from '@latitude-data/web-ui/atoms/DropdownMenu'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { type ParamValue } from 'next/dist/server/request/params'
import { useCallback, useMemo, useState } from 'react'
import { useFileTreeContext } from '../FilesProvider'
import NodeHeaderWrapper, {
  IndentType,
  NodeHeaderWrapperProps,
} from '../NodeHeaderWrapper'
import { useTempNodes } from '../useTempNodes'
import { Node } from '../useTree'
import { DocumentType } from '@latitude-data/core/constants'

import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
export default function DocumentHeader({
  open,
  selected,
  node,
  indentation,
  draggble,
  canDrag,
  currentEvaluationUuid,
}: {
  open: boolean
  selected: boolean
  node: Node
  indentation: IndentType[]
  draggble: NodeHeaderWrapperProps['draggble']
  currentEvaluationUuid: ParamValue
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
    mainDocumentUuid,
    setMainDocumentUuid,
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
    [reset, onCreateFile, onRenameFile, node],
  )
  const setMainDocument = useCallback(
    (asMainDocument: boolean) => {
      setMainDocumentUuid(asMainDocument ? node.doc!.documentUuid : undefined)
    },
    [setMainDocumentUuid, node.doc],
  )
  const documentUuid = node.doc!.documentUuid
  const url = useMemo(() => {
    if (!documentUuid) return undefined
    if (!node.isPersisted) return undefined
    if (
      selected &&
      !currentEvaluationUuid &&
      window.location.pathname.endsWith(documentUuid)
    ) {
      return undefined
    }

    return ROUTES.projects
      .detail({ id: sidebarLinkContext.projectId })
      .commits.detail({ uuid: sidebarLinkContext.commitUuid })
      .documents.detail({ uuid: documentUuid }).root
  }, [
    documentUuid,
    selected,
    node.isPersisted,
    sidebarLinkContext,
    currentEvaluationUuid,
  ])
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
            onDeleteFile({ node, documentUuid })
          }
        },
      },
    ],
    [node, documentUuid, onDeleteFile, isLoading, isMerged, onMergeCommitClick],
  )
  const icon = useMemo<IconName>(() => {
    const docName = node.name
    const docType = node.doc?.documentType
    if (docType === DocumentType.Agent) return 'bot'
    if (docName === 'README') return 'info'
    return 'file'
  }, [node.doc?.documentType, node.name])

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
      isMainDocument={mainDocumentUuid === documentUuid}
      setMainDocument={setMainDocument}
      hasChildren={false}
      actions={actions}
      selected={selected}
      changeType={node.changeType}
      indentation={indentation}
      onSaveValue={onSaveValue}
      onLeaveWithoutSave={() => deleteTmpFolder({ id: node.id })}
      icons={[icon]}
      childrenSelected={!!currentEvaluationUuid}
    >
      {selected && (
        <EvaluationList
          changeType={node.changeType}
          indentation={indentation}
          document={node.doc! as DocumentVersion}
          currentEvaluationUuid={currentEvaluationUuid}
        />
      )}
    </NodeHeaderWrapper>
  )
}
