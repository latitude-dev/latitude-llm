'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { ConfirmModal } from '$ui/ds/atoms'
import { cn } from '$ui/lib/utils'
import DocumentHeader from '$ui/sections/Document/Sidebar/Files/DocumentHeader'
import FolderHeader from '$ui/sections/Document/Sidebar/Files/FolderHeader'

import { FileTreeProvider, useFileTreeContext } from './FilesProvider'
import { type IndentType } from './NodeHeaderWrapper'
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
  const { currentPath } = useFileTreeContext()
  const [selected, setSelected] = useState(currentPath === node.path)
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
    setSelected(currentPath === node.path)
  }, [currentPath])

  return (
    <div className='w-full'>
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
              <li key={node.id}>
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
  currentPath,
  documents,
  navigateToDocument,
  createFile,
  destroyFile,
  destroyFolder,
  isDestroying,
}: {
  createFile: (args: { path: string }) => Promise<void>
  destroyFile: (documentUuid: string) => Promise<void>
  destroyFolder: (path: string) => Promise<void>
  documents: SidebarDocument[]
  currentPath: string | undefined
  navigateToDocument: (documentUuid: string) => void
  isDestroying: boolean
}) {
  const togglePath = useOpenPaths((state) => state.togglePath)
  const rootNode = useTree({ documents })
  const [deletableNode, setDeletable] =
    useState<DeletableElement<DeletableType> | null>(null)

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
        currentPath={currentPath}
        onNavigateToDocument={navigateToDocument}
        onCreateFile={async (path) => {
          createFile({ path })
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
        <FileNode node={rootNode} />
      </FileTreeProvider>
      {deletableNode ? (
        <ConfirmModal
          type='destructive'
          open
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
            description: `Deleting this ${deletingFolder ? 'folder' : 'prompt'} will also delete all the prompts it contains. This action cannot be undone.`,
          }}
        />
      ) : null}
    </>
  )
}
