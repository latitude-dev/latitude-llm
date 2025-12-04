import { EvaluationList } from '$/components/Sidebar/Files/EvaluationList'
import { DocumentRoutes, ROUTES } from '$/services/routes'
import { DocumentType } from '@latitude-data/core/constants'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { MenuOption } from '@latitude-data/web-ui/atoms/DropdownMenu'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { type ParamValue } from 'next/dist/server/request/params'
import { usePathname } from 'next/navigation'
import { useCallback, useMemo, useState } from 'react'
import { useFileTreeContext } from '../FilesProvider'
import NodeHeaderWrapper, {
  IndentType,
  NodeHeaderWrapperProps,
} from '../NodeHeaderWrapper'
import { useTempNodes } from '../useTempNodes'
import { Node } from '../useTree'

/**
 * Detects the current document page type from the pathname.
 * The URL structure is: /projects/[id]/versions/[uuid]/documents/[uuid]/[pageType]
 * Where pageType can be: evaluations, experiments, traces, logs, or nothing (editor)
 */
function getDocumentPageType(pathname: string): DocumentRoutes | null {
  // Match the segment after /documents/[uuid]/
  const match = pathname.match(/\/documents\/[^/]+\/([^/]+)/)
  if (!match) return null

  const segment = match[1]
  if (Object.values(DocumentRoutes).includes(segment as DocumentRoutes)) {
    return segment as DocumentRoutes
  }
  return null
}
export default function DocumentHeader({
  open,
  selected,
  node,
  indentation,
  draggble,
  canDrag,
  currentEvaluationUuid,
  isRunning,
  runningCount,
}: {
  open: boolean
  selected: boolean
  node: Node
  indentation: IndentType[]
  draggble: NodeHeaderWrapperProps['draggble']
  currentEvaluationUuid: ParamValue
  canDrag: boolean
  isRunning?: boolean
  runningCount?: number
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
  const pathname = usePathname()
  const currentPageType = useMemo(
    () => getDocumentPageType(pathname),
    [pathname],
  )
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

    const documentDetails = ROUTES.projects
      .detail({ id: sidebarLinkContext.projectId })
      .commits.detail({ uuid: sidebarLinkContext.commitUuid })
      .documents.detail({ uuid: documentUuid })

    if (isRunning) {
      return documentDetails.traces.root
    }

    // Preserve the current page type when navigating to another document
    // But always go to the list page, not specific items (evaluationUuid, etc.)
    switch (currentPageType) {
      case DocumentRoutes.evaluations:
        return documentDetails.evaluations.root
      case DocumentRoutes.experiments:
        return documentDetails.experiments.root
      case DocumentRoutes.traces:
        return documentDetails.traces.root
      case DocumentRoutes.logs:
        return documentDetails.logs.root
      default:
        return documentDetails.root
    }
  }, [
    documentUuid,
    selected,
    node.isPersisted,
    sidebarLinkContext,
    currentEvaluationUuid,
    currentPageType,
    isRunning,
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
      isRunning={isRunning}
      runningCount={runningCount}
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
