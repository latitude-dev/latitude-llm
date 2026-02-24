import { EvaluationList } from '$/components/Sidebar/Files/EvaluationList'
import { DocumentRoutes, ROUTES } from '$/services/routes'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { MenuOption } from '@latitude-data/web-ui/atoms/DropdownMenu'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { type ParamValue } from 'next/dist/server/request/params'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useMemo, useState } from 'react'
import { Node } from '../useTree'
import { useSidebarDocumentVersions } from '../useSidebarDocumentVersions'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useCommits } from '$/stores/commitsStore'
import { HEAD_COMMIT } from '@latitude-data/core/constants'
import NodeHeaderWrapper from '../NodeHeaderWrapper'

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
  currentEvaluationUuid,
}: {
  open: boolean
  selected: boolean
  node: Node
  currentEvaluationUuid: ParamValue
}) {
  const { commit, isHead } = useCurrentCommit()
  const { document: currentDocument } = useCurrentDocument()
  const { project } = useCurrentProject()
  const router = useRouter()
  const { setCommitMainDocument } = useCommits()
  const { renamePaths, destroyFile, isLoading } = useSidebarDocumentVersions()
  const isMerged = !!commit.mergedAt
  const mainDocumentUuid = commit.mainDocumentUuid ?? undefined
  const onSaveValue = useCallback(
    async ({ path }: { path: string }) => {
      const parentPathParts = node.path.split('/').slice(0, -1)
      const newPathParts = path.split('/')
      const newPath = [...parentPathParts, ...newPathParts].join('/')
      const oldPath = node.path + (node.isFile ? '' : '/')
      const pathWithTypeSuffix = newPath + (node.isFile ? '' : '/')
      await renamePaths({ oldPath, newPath: pathWithTypeSuffix })
    },
    [renamePaths, node],
  )
  const setMainDocument = useCallback(
    (asMainDocument: boolean) => {
      setCommitMainDocument({
        projectId: project.id,
        commitId: commit.id,
        documentUuid: asMainDocument ? node.documentUuid : undefined,
      })
    },
    [setCommitMainDocument, project.id, commit.id, node.documentUuid],
  )
  const documentUuid = node.documentUuid!
  const pathname = usePathname()
  const currentPageType = useMemo(
    () => getDocumentPageType(pathname),
    [pathname],
  )
  const url = useMemo(() => {
    if (!documentUuid) return undefined
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
    currentEvaluationUuid,
    currentPageType,
    project.id,
    isHead,
    commit.uuid,
  ])
  const [isEditingState, setIsEditing] = useState(false)
  const isEditing = isEditingState
  const evaluationDocument = useMemo(
    () => ({ documentUuid, commitId: commit.id }) as DocumentVersion,
    [documentUuid, commit.id],
  )
  const actions = useMemo<MenuOption[]>(() => {
    return [
      {
        label: 'Rename file',
        lookDisabled: isMerged,
        disabled: isLoading,
        iconProps: { name: 'pencil' },
        onClick: () => {
          if (isMerged) return

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
            // do nothing
          } else {
            destroyFile(documentUuid, {
              onSuccess: () => {
                if (currentDocument?.documentUuid !== documentUuid) return

                router.push(
                  ROUTES.projects.detail({ id: project.id }).commits.detail({
                    uuid: isHead ? HEAD_COMMIT : commit.uuid,
                  }).documents.root,
                )
              },
            })
          }
        },
      },
    ]
  }, [
    documentUuid,
    destroyFile,
    isLoading,
    isMerged,
    currentDocument?.documentUuid,
    router,
    project.id,
    isHead,
    commit.uuid,
  ])
  const icon = useMemo<IconName>(() => {
    const docName = node.name
    if (docName === 'README') return 'info'
    return 'file'
  }, [node.name])
  const icons = useMemo(() => [icon], [icon])

  return (
    <NodeHeaderWrapper
      isFile
      depth={node.depth}
      url={url}
      open={open}
      name={node.name}
      isEditing={isEditing}
      setIsEditing={setIsEditing}
      isMainDocument={mainDocumentUuid === documentUuid}
      setMainDocument={setMainDocument}
      hasChildren={false}
      actions={actions}
      selected={selected}
      changeType={node.changeType}
      onSaveValue={onSaveValue}
      icons={icons}
      childrenSelected={!!currentEvaluationUuid}
    >
      {selected && (
        <EvaluationList
          changeType={node.changeType}
          depth={node.depth + 2}
          document={evaluationDocument}
          currentEvaluationUuid={currentEvaluationUuid}
        />
      )}
    </NodeHeaderWrapper>
  )
}
