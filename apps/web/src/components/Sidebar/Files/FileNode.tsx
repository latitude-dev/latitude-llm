import { memo, useCallback, useState } from 'react'
import { cn } from '@latitude-data/web-ui/utils'
import NodeHeaderWrapper from './NodeHeaderWrapper'
import DocumentHeader from './DocumentHeader'
import { useFileTreeContext } from './FilesProvider'
import FolderHeader from './FolderHeader'
import { useOpenPaths } from './useOpenPaths'
import { TempNode, useTempNodes } from './useTempNodes'
import { Node, useTreeNode } from './useTree'
import { type ParamValue } from 'next/dist/server/request/params'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { useScrollSelectedFileNodeIntoView as useScrollIntoView } from './useScrollSelectedFileNodeIntoView'
import { useDocumentVersionActions } from '$/stores/actions/documentVersionActions'

export type FileNodeProps = {
  nodeId: string
  currentUuid: string | undefined
  currentEvaluationUuid: ParamValue
  promptManagement: boolean
}

export const FileNode = memo(function FileNode({
  nodeId,
  currentUuid,
  currentEvaluationUuid,
  promptManagement,
}: FileNodeProps) {
  const node = useTreeNode(nodeId)
  const open = !!useOpenPaths((state) => state.openPaths[node?.path ?? ''])
  const togglePath = useOpenPaths((state) => state.togglePath)
  const onToggleOpen = useCallback(() => {
    if (!node?.path) return
    togglePath(node.path)
  }, [node?.path, togglePath])
  const documentUuid = node?.documentUuid
  const selected = !!currentUuid && currentUuid === documentUuid
  const hasChildren = (node?.children.length ?? 0) > 0
  const nodeRef = useScrollIntoView({
    selected,
    isFile: !!node?.isFile,
    nodeId,
  })

  if (!node) return null

  return (
    <div ref={nodeRef} className='flex-1 w-full'>
      <NodeHeader
        open={open}
        node={node}
        selected={selected}
        hasChildren={hasChildren}
        onToggleOpen={onToggleOpen}
        currentEvaluationUuid={currentEvaluationUuid}
        promptManagement={promptManagement}
      />

      {node.isFile ? null : (
        <ul
          className={cn('flex flex-col', {
            hidden: !open,
          })}
        >
          <TempFolderChildren
            parentPath={node.path}
            promptManagement={promptManagement}
          />
          {node.children.map((childId) => (
            <li key={childId} className='cursor-pointer'>
              <FileNode
                nodeId={childId}
                currentUuid={currentUuid}
                currentEvaluationUuid={currentEvaluationUuid}
                promptManagement={promptManagement}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
})

function NodeHeader({
  selected,
  open,
  onToggleOpen,
  node,
  hasChildren,
  currentEvaluationUuid,
  promptManagement,
}: {
  selected: boolean
  open: boolean
  node: Node
  hasChildren: boolean
  onToggleOpen: () => void
  currentEvaluationUuid: ParamValue
  promptManagement: boolean
}) {
  if (node.isFile) {
    return (
      <DocumentHeader
        open={open}
        selected={selected}
        node={node}
        currentEvaluationUuid={currentEvaluationUuid}
        promptManagement={promptManagement}
      />
    )
  }

  return (
    <FolderHeader
      node={node}
      open={open}
      hasChildren={hasChildren}
      onToggleOpen={onToggleOpen}
      promptManagement={promptManagement}
    />
  )
}

export function TempFolderChildren({
  parentPath,
  promptManagement,
}: {
  parentPath: string
  promptManagement: boolean
}) {
  const selector = useCallback(
    (state: { tmpFolders: Record<string, TempNode[]> }) =>
      state.tmpFolders[parentPath] ?? [],
    [parentPath],
  )
  const tempNodes = useTempNodes(selector)

  return tempNodes.map((node) => (
    <li key={node.id} className='cursor-pointer'>
      <TempFolderTreeNode node={node} promptManagement={promptManagement} />
    </li>
  ))
}

const TempFolderTreeNode = memo(function TempFolderTreeNode({
  node,
  promptManagement,
}: {
  node: TempNode
  promptManagement: boolean
}) {
  const openPaths = useOpenPaths((state) => state.openPaths)
  const togglePath = useOpenPaths((state) => state.togglePath)
  const open = !!openPaths[node.path]
  const onToggleOpen = useCallback(() => {
    if (!node.path) return
    togglePath(node.path)
  }, [node.path, togglePath])
  const hasChildren = node.children.length > 0

  if (node.isFile) return <TempFileNode node={node} />

  return (
    <div className='flex-1 w-full'>
      <FolderHeader
        node={node}
        open={open}
        hasChildren={hasChildren}
        onToggleOpen={onToggleOpen}
        promptManagement={promptManagement}
      />
      <ul
        className={cn('flex flex-col', {
          hidden: !open,
        })}
      >
        {node.children.map((childNode) => (
          <li key={childNode.id} className='cursor-pointer'>
            <TempFolderTreeNode
              node={childNode}
              promptManagement={promptManagement}
            />
          </li>
        ))}
      </ul>
    </div>
  )
})

const TempFileNode = memo(function TempFileNode({ node }: { node: TempNode }) {
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const { onMergeCommitClick } = useFileTreeContext()
  const { createFile } = useDocumentVersionActions({
    commitUuid: commit.uuid,
    projectId: project.id,
  })
  const { deleteTmpFolder, deleteTmpBranch } = useTempNodes((state) => ({
    deleteTmpFolder: state.deleteTmpFolder,
    deleteTmpBranch: state.deleteTmpBranch,
  }))
  const [isEditing, setIsEditing] = useState(node.name === ' ')

  if (!node.isFile) return null

  return (
    <div className='flex min-w-0'>
      <div className='w-4 shrink-0' />
      <div className='flex-1 min-w-0'>
        <NodeHeaderWrapper
          isFile
          depth={node.depth}
          open={false}
          hasChildren={false}
          name={node.name}
          isEditing={isEditing}
          setIsEditing={setIsEditing}
          icons={['file']}
          changeType={node.changeType}
          onSaveValue={async ({ path }) => {
            if (commit.mergedAt) {
              onMergeCommitClick()
              return
            }

            const parentPath = node.path.split('/').slice(0, -1).join('/')
            const nextPath = parentPath ? `${parentPath}/${path}` : path
            const created = await createFile({ path: nextPath, agent: false })
            if (created) {
              deleteTmpBranch({ id: node.id })
            }
          }}
          onLeaveWithoutSave={() => deleteTmpFolder({ id: node.id })}
        />
      </div>
    </div>
  )
})
