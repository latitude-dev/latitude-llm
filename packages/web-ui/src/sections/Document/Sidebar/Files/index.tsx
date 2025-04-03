'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useDraggable, useDroppable } from '@dnd-kit/core'
import { ClientOnly } from '../../../../ds/atoms/ClientOnly'
import { ConfirmModal } from '../../../../ds/atoms/Modal'
import { cn } from '../../../../lib/utils'
import DocumentHeader from './DocumentHeader'
import { FileTreeProvider, useFileTreeContext } from './FilesProvider'
import FolderHeader from './FolderHeader'
import { type IndentType } from './NodeHeaderWrapper'
import { TreeToolbar } from './TreeToolbar'
import { useOpenPaths } from './useOpenPaths'
import { useTempNodes } from './useTempNodes'
import { Node, SidebarDocument, useTree } from './useTree'

function NodeHeader({
  selected,
  open,
  onToggleOpen,
  node,
  indentation,
  canDrag,
}: {
  selected: boolean
  open: boolean
  node: Node
  indentation: IndentType[]
  onToggleOpen: () => void
  canDrag: boolean
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
    />
  )
}

export type FileNodeProps = {
  isMerged: boolean
  node: Node
  indentation?: IndentType[]
  onRenameFile: (args: { node: Node; path: string }) => Promise<void>
}

function FileNode({
  isMerged,
  node,
  indentation = [],
  onRenameFile,
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
  const tmpNodes = allTmpFolders[node.path] ?? []
  const { currentUuid } = useFileTreeContext()
  const [selected, setSelected] = useState(
    !!currentUuid && currentUuid === node.doc?.documentUuid,
  )
  const allNodes = useMemo(
    () => [...tmpNodes, ...node.children],
    [tmpNodes, node.children],
  )
  const lastIdx = allNodes.length - 1
  const { togglePath, openPaths } = useOpenPaths((state) => ({
    openPaths: state.openPaths,
    togglePath: state.togglePath,
  }))
  const open = !!openPaths[node.path]

  const onToggleOpen = useCallback(() => {
    const lastSegment = node.path.split('/').pop()
    if (lastSegment === '' || lastSegment === ' ') return

    togglePath(node.path)
  }, [togglePath, node.path, node.isPersisted])

  useEffect(() => {
    setSelected(!!currentUuid && currentUuid === node.doc?.documentUuid)
  }, [currentUuid])
  return (
    <div
      ref={droppable.setNodeRef}
      className={cn('flex-1 w-full', {
        'bg-accent/50': droppable.isOver,
      })}
    >
      <NodeHeader
        indentation={indentation}
        node={node}
        selected={selected}
        open={open}
        onToggleOpen={onToggleOpen}
        canDrag={!isMerged && !node.isRoot}
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
                  indentation={[...indentation, { isLast: idx === lastIdx }]}
                  node={node}
                  onRenameFile={onRenameFile}
                  isMerged={isMerged}
                />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

enum DeletableType {
  File = 'file',
  Folder = 'folder',
}
type DeletableElement<T extends DeletableType> = T extends DeletableType.File
  ? {
      type: T
      documentUuid: string
      name: string
    }
  : {
      type: T
      path: string
      name: string
    }

function thereisOnlyOneFolder(rootNode: Node) {
  const onlyOne = rootNode.children.length === 1
  const node = rootNode.children[0]

  return onlyOne && node && !node.isFile ? node : undefined
}

export function FilesTree({
  isLoading,
  isMerged,
  currentUuid,
  documents,
  liveDocuments,
  onMergeCommitClick,
  navigateToDocument,
  createFile,
  uploadFile,
  renamePaths,
  destroyFile,
  destroyFolder,
  isDestroying,
}: {
  isLoading: boolean
  isMerged: boolean
  createFile: (args: { path: string }) => Promise<void>
  uploadFile: (args: { path: string; file: File }) => Promise<void>
  renamePaths: (args: { oldPath: string; newPath: string }) => Promise<void>
  destroyFile: (documentUuid: string) => Promise<void>
  onMergeCommitClick: () => void
  destroyFolder: (path: string) => Promise<void>
  documents: SidebarDocument[]
  liveDocuments?: SidebarDocument[]
  currentUuid: string | undefined
  navigateToDocument: (documentUuid: string) => void
  isDestroying: boolean
}) {
  const isMount = useRef(false)
  const togglePath = useOpenPaths((state) => state.togglePath)
  const rootNode = useTree({ documents, liveDocuments })
  const [deletableNode, setDeletable] =
    useState<DeletableElement<DeletableType> | null>(null)

  const currentPath = useMemo(() => {
    if (!currentUuid) return undefined

    const currentDocument = documents.find(
      (d) => d.documentUuid === currentUuid,
    )
    return currentDocument?.path
  }, [currentUuid, documents])

  useEffect(() => {
    if (!isMount.current) {

      const oneFolder = thereisOnlyOneFolder(rootNode)
      if (!oneFolder) return

      togglePath(oneFolder.path)
      isMount.current = true
      return
    }

    if (currentPath) {
      togglePath(currentPath)
    }
  }, [currentPath, togglePath, rootNode])

  const onConfirmDelete = useCallback(
    async <T extends DeletableType>(deletable: DeletableElement<T>) => {
      if (deletable.type === DeletableType.File) {
        await destroyFile(deletable.documentUuid)
      } else if (deletable.type === DeletableType.Folder) {
        await destroyFolder(deletable.path)
      }

      setDeletable(null)
    },
    [destroyFile, destroyFolder, deletableNode, setDeletable],
  )

  const deletingFolder = deletableNode?.type === 'folder'
  const onRenameFile = useCallback(
    async ({ node, path }: { node: Node; path: string }) => {
      await renamePaths({ oldPath: node.path, newPath: path })
    },
    [renamePaths],
  )
  return (
    <ClientOnly>
      <FileTreeProvider
        isLoading={isLoading}
        isMerged={isMerged}
        onMergeCommitClick={onMergeCommitClick}
        currentUuid={currentUuid}
        onNavigateToDocument={navigateToDocument}
        renamePaths={renamePaths}
        onCreateFile={(path) => {
          createFile({ path })
        }}
        onUploadFile={({ path, file }) => {
          uploadFile({ path, file })
        }}
        onRenameFile={({ node, path }) => {
          const oldPath = node.path + (node.isFile ? '' : '/')
          const newPath = path + (node.isFile ? '' : '/')
          renamePaths({ oldPath, newPath })
        }}
        onDeleteFile={({ node, documentUuid }) => {
          setDeletable({
            type: DeletableType.File,
            documentUuid,
            name: node.name,
          })
        }}
        onDeleteFolder={async ({ node, path }) => {
          setDeletable({ type: DeletableType.Folder, path, name: node.name })
        }}
      >
        <div className='flex flex-col gap-2'>
          <TreeToolbar />
          <FileNode
            node={rootNode}
            onRenameFile={onRenameFile}
            isMerged={isMerged}
          />
        </div>
      </FileTreeProvider>

      {deletableNode ? (
        <ConfirmModal
          dismissible={!isDestroying}
          type='destructive'
          open={!!deletableNode}
          onConfirm={() => onConfirmDelete(deletableNode)}
          onOpenChange={(open) => {
            if (!open) {
              setDeletable(null)
            }
          }}
          title='Are you sure?'
          description={
            deletingFolder
              ? `You're deleting ${deletableNode?.name} folder`
              : `You're deleting ${deletableNode?.name} prompt`
          }
          confirm={{
            isConfirming: isDestroying,
            label: deletingFolder ? 'Delete folder' : 'Delete prompt',
            description: deletingFolder
              ? 'Deleting this folder will also delete all the prompts it contains. This action cannot be undone.'
              : 'Deleting this prompt might affect your production app and other prompts referencing it. This action cannot be undone.',
          }}
        />
      ) : null}
    </ClientOnly>
  )
}
