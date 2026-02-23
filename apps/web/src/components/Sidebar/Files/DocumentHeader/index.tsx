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
import { useSidebarDocumentVersions } from '../useSidebarDocumentVersions'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCommits } from '$/stores/commitsStore'
import { HEAD_COMMIT } from '@latitude-data/core/constants'

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
  const { onMergeCommitClick } = useFileTreeContext()
  const { commit, isHead } = useCurrentCommit()
  const { project } = useCurrentProject()
  const { setCommitMainDocument } = useCommits()
  const { createFile, renamePaths, destroyFile, isLoading } =
    useSidebarDocumentVersions()
  const isMerged = !!commit.mergedAt
  const mainDocumentUuid = commit.mainDocumentUuid ?? undefined
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
        const oldPath = node.path + (node.isFile ? '' : '/')
        const pathWithTypeSuffix = newPath + (node.isFile ? '' : '/')
        await renamePaths({ oldPath, newPath: pathWithTypeSuffix })
      } else {
        await createFile({ path: newPath, agent: false })
      }
      reset()
    },
    [createFile, renamePaths, reset, node],
  )
  const setMainDocument = useCallback(
    (asMainDocument: boolean) => {
      if (isMerged) return onMergeCommitClick()

      setCommitMainDocument({
        projectId: project.id,
        commitId: commit.id,
        documentUuid: asMainDocument ? node.doc!.documentUuid : undefined,
      })
    },
    [
      setCommitMainDocument,
      project.id,
      commit.id,
      node.doc,
      isMerged,
      onMergeCommitClick,
    ],
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
      .detail({ id: project.id })
      .commits.detail({ uuid: isHead ? HEAD_COMMIT : commit.uuid })
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
      default:
        return documentDetails.root
    }
  }, [
    documentUuid,
    selected,
    node.isPersisted,
    currentEvaluationUuid,
    currentPageType,
    isRunning,
    project.id,
    isHead,
    commit.uuid,
  ])
  const [isEditingState, setIsEditing] = useState(node.name === ' ')
  const isEditing = isEditingState
  const actions = useMemo<MenuOption[]>(() => {
    return [
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
            destroyFile(documentUuid)
          }
        },
      },
    ]
  }, [
    node,
    documentUuid,
    destroyFile,
    isLoading,
    isMerged,
    onMergeCommitClick,
  ])
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
      isMainDocument={
        mainDocumentUuid === documentUuid
      }
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
