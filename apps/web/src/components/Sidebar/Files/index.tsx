import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@latitude-data/web-ui/utils'
import { useDraggable, useDroppable } from '@latitude-data/web-ui/hooks/useDnD'
import { ClientOnly } from '@latitude-data/web-ui/atoms/ClientOnly'

import { type IndentType } from './NodeHeaderWrapper'
import DocumentHeader from './DocumentHeader'
import { FileTreeProvider } from './FilesProvider'
import FolderHeader from './FolderHeader'
import { TreeToolbar } from './TreeToolbar'
import { useOpenPaths } from './useOpenPaths'
import { useTempNodes } from './useTempNodes'
import { Node, SidebarDocument, useTree } from './useTree'
import { useParams } from 'next/navigation'
import { type ParamValue } from 'next/dist/server/request/params'
import { useCurrentCommit } from '$/app/providers/CommitProvider'

function NodeHeader({
  selected,
  open,
  onToggleOpen,
  node,
  indentation,
  canDrag,
  currentEvaluationUuid,
}: {
  selected: boolean
  open: boolean
  node: Node
  indentation: IndentType[]
  onToggleOpen: () => void
  canDrag: boolean
  currentEvaluationUuid: ParamValue
}) {
  const draggable = useDraggable({
    id: node.id,
    disabled: !canDrag,
    data: {
      canDrag,
      nodeId: node.id,
      name: node.name,
      path: node.path,
      isFile: node.isFile,
      isRoot: node.isRoot,
    },
  })
  if (node.isRoot) return null

  if (node.isFile) {
    return (
      <DocumentHeader
        open={open}
        selected={selected}
        node={node}
        indentation={indentation}
        canDrag={canDrag}
        draggble={draggable}
        currentEvaluationUuid={currentEvaluationUuid}
        isRunning={node.isRunning}
        runningCount={node.runningCount}
      />
    )
  }

  return (
    <FolderHeader
      node={node}
      open={open}
      indentation={indentation}
      onToggleOpen={onToggleOpen}
      canDrag={canDrag}
      draggble={draggable}
      isRunning={node.isRunning && !open}
      runningCount={node.runningCount}
    />
  )
}

export type FileNodeProps = {
  node: Node
  indentation?: IndentType[]
  currentUuid: string | undefined
  currentEvaluationUuid: ParamValue
}

const EMPTY_TMP_NODES: Node[] = []

function FileNode({
  node,
  indentation = [],
  currentUuid,
  currentEvaluationUuid,
}: FileNodeProps) {
  const droppable = useDroppable({
    id: node.id,
    disabled: node.isFile,
    data: {
      nodeId: node.id,
      name: node.name,
      path: node.path,
      isFile: node.isFile,
      isRoot: node.isRoot,
    },
  })
  const allTmpFolders = useTempNodes((state) => state.tmpFolders)
  const tmpNodes = allTmpFolders[node.path] ?? EMPTY_TMP_NODES
  const documentUuid = node.doc?.documentUuid
  const [selected, setSelected] = useState(
    !!currentUuid && currentUuid === documentUuid,
  )
  const allNodes = useMemo(
    () => [...tmpNodes, ...node.children],
    [tmpNodes, node.children],
  )
  const lastIdx = allNodes.length - 1
  const childIndentations = useMemo(
    () =>
      allNodes.map((_, idx) => [...indentation, { isLast: idx === lastIdx }]),
    [allNodes, indentation, lastIdx],
  )
  const { togglePath, openPaths } = useOpenPaths((state) => ({
    openPaths: state.openPaths,
    togglePath: state.togglePath,
  }))
  const open = !!openPaths[node.path]

  const onToggleOpen = useCallback(() => {
    const lastSegment = node.path.split('/').pop()
    if (lastSegment === '' || lastSegment === ' ') return

    togglePath(node.path)
  }, [togglePath, node.path])

  useEffect(() => {
    setSelected(!!currentUuid && currentUuid === documentUuid)
  }, [currentUuid, documentUuid])

  const { commit } = useCurrentCommit()
  const overMyself =
    droppable.over && droppable.over.id === droppable.active?.id
  const someoneIsOverMe = droppable.isOver && !overMyself
  const canDrag = !commit.mergedAt && !node.isRoot
  return (
    <div
      ref={droppable.setNodeRef}
      className={cn('flex-1 w-full', {
        'bg-accent/50': someoneIsOverMe,
      })}
    >
      <NodeHeader
        indentation={indentation}
        node={node}
        selected={selected}
        open={open}
        onToggleOpen={onToggleOpen}
        canDrag={canDrag}
        currentEvaluationUuid={currentEvaluationUuid}
      />

      {node.isFile ? null : (
        <ul
          className={cn('flex flex-col', {
            hidden: !open && !node.isRoot,
            'pt-1 pb-8': node.isRoot,
            'outline outline-1 outline-primary':
              droppable.isOver && node.isRoot,
          })}
        >
          {allNodes.map((node, idx) => {
            return (
              <li key={node.id} className='cursor-pointer'>
                <FileNode
                  indentation={childIndentations[idx]}
                  node={node}
                  currentUuid={currentUuid}
                  currentEvaluationUuid={currentEvaluationUuid}
                />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function thereisOnlyOneFolder(rootNode: Node) {
  const onlyOne = rootNode.children.length === 1
  const node = rootNode.children[0]

  return onlyOne && node && !node.isFile ? node : undefined
}

export function FilesTree({
  promptManagement,
  currentUuid,
  documents,
  liveDocuments,
  runningDocumentsMap,
  onMergeCommitClick,
}: {
  promptManagement: boolean
  onMergeCommitClick: () => void
  documents: SidebarDocument[]
  liveDocuments?: SidebarDocument[]
  runningDocumentsMap?: Map<string, number>
  currentUuid: string | undefined
}) {
  const { evaluationUuid: currentEvaluationUuid } = useParams()
  const isMount = useRef(false)
  const { togglePath, isOpenThisPath } = useOpenPaths((state) => ({
    isOpenThisPath: state.isOpen,
    togglePath: state.togglePath,
  }))
  const rootNode = useTree({
    documents,
    liveDocuments,
    runningDocumentsMap,
  })

  const currentPath = useMemo(() => {
    if (!currentUuid) return undefined

    const currentDocument = documents.find(
      (d) => d.documentUuid === currentUuid,
    )
    return currentDocument?.path
  }, [currentUuid, documents])

  useEffect(() => {
    if (currentPath) {
      togglePath(currentPath)
    }

    if (!isMount.current) {
      const oneFolder = thereisOnlyOneFolder(rootNode)
      if (!oneFolder) return
      if (isOpenThisPath(oneFolder.path)) return

      togglePath(oneFolder.path)
      isMount.current = true
      return
    }
  }, [currentPath, togglePath, isOpenThisPath, rootNode])

  return (
    <ClientOnly>
      <FileTreeProvider
        promptManagement={promptManagement}
        onMergeCommitClick={onMergeCommitClick}
      >
        <div className='flex flex-col gap-2'>
          <TreeToolbar promptManagement={promptManagement} />
          <FileNode
            node={rootNode}
            currentUuid={currentUuid}
            currentEvaluationUuid={currentEvaluationUuid}
          />
        </div>
      </FileTreeProvider>
    </ClientOnly>
  )
}
