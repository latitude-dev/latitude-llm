'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { ConfirmModal } from '../../../../ds/atoms'
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
}: {
  selected: boolean
  open: boolean
  node: Node
  indentation: IndentType[]
  onToggleOpen: () => void
}) {
  if (node.isRoot) return null

  if (node.isFile) {
    return (
      <DocumentHeader
        open={open}
        selected={selected}
        node={node}
        indentation={indentation}
      />
    )
  }

  return (
    <FolderHeader
      node={node}
      open={open}
      indentation={indentation}
      onToggleOpen={onToggleOpen}
    />
  )
}

function FileNode({
  node,
  indentation = [],
}: {
  node: Node
  indentation?: IndentType[]
}) {
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
    <div className='flex-1 w-full'>
      <NodeHeader
        indentation={indentation}
        node={node}
        selected={selected}
        open={open}
        onToggleOpen={onToggleOpen}
      />

      {node.isFile ? null : (
        <ul
          className={cn('flex flex-col', {
            hidden: !open && !node.isRoot,
          })}
        >
          {allNodes.map((node, idx) => {
            return (
              <li key={node.id} className='cursor-pointer'>
                <FileNode
                  indentation={[...indentation, { isLast: idx === lastIdx }]}
                  node={node}
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

export function FilesTree({
  isMerged,
  currentUuid,
  documents,
  onMergeCommitClick,
  navigateToDocument,
  createFile,
  renamePaths,
  destroyFile,
  destroyFolder,
  isDestroying,
}: {
  isMerged: boolean
  createFile: (args: { path: string }) => Promise<void>
  renamePaths: (args: { oldPath: string; newPath: string }) => Promise<void>
  destroyFile: (documentUuid: string) => Promise<void>
  onMergeCommitClick: () => void
  destroyFolder: (path: string) => Promise<void>
  documents: SidebarDocument[]
  currentUuid: string | undefined
  navigateToDocument: (documentUuid: string) => void
  isDestroying: boolean
}) {
  const togglePath = useOpenPaths((state) => state.togglePath)
  const rootNode = useTree({ documents })
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
    if (currentPath) {
      togglePath(currentPath)
    }
  }, [currentPath, togglePath])

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
  return (
    <>
      <FileTreeProvider
        isMerged={isMerged}
        onMergeCommitClick={onMergeCommitClick}
        currentUuid={currentUuid}
        onNavigateToDocument={navigateToDocument}
        onCreateFile={(path) => {
          createFile({ path })
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
        <TreeToolbar />
        <FileNode node={rootNode} />
      </FileTreeProvider>

      {deletableNode ? (
        <ConfirmModal
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
    </>
  )
}
