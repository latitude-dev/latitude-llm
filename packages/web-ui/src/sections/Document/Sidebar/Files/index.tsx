'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { MenuOption } from '$ui/ds/atoms/DropdownMenu'
import { Icons } from '$ui/ds/atoms/Icons'
import { cn } from '$ui/lib/utils'

import { FileTreeProvider, useFileTreeContext } from './FilesProvider'
import NodeHeaderWrapper, {
  ICON_CLASS,
  type IndentType,
} from './NodeHeaderWrapper'
import { useNodeValidator } from './useNodeValidator'
import { useOpenPaths } from './useOpenPaths'
import { useTempNodes } from './useTempNodes'
import { Node, SidebarDocument, useTree } from './useTree'

function FolderHeader({
  node,
  open,
  indentation,
  onToggleOpen,
}: {
  node: Node
  open: boolean
  indentation: IndentType[]
  onToggleOpen: () => void
}) {
  const { onDeleteFolder } = useFileTreeContext()
  const inputRef = useRef<HTMLInputElement>(null)
  const nodeRef = useRef<HTMLDivElement>(null)
  const { isEditing, error, onInputChange, onInputKeyDown } = useNodeValidator({
    node,
    nodeRef,
    inputRef,
    saveValue: async ({ path }: { path: string }) => {
      return updateFolder({ path, id: node.id })
    },
    leaveWithoutSave: () => {
      deleteTmpFolder({ id: node.id })
    },
  })
  const { openPaths, togglePath } = useOpenPaths((state) => ({
    togglePath: state.togglePath,
    openPaths: state.openPaths,
  }))
  const { addFolder, updateFolder, deleteTmpFolder } = useTempNodes(
    (state) => ({
      addFolder: state.addFolder,
      updateFolder: state.updateFolder,
      deleteTmpFolder: state.deleteTmpFolder,
    }),
  )
  const onAddNode = useCallback(
    ({ isFile }: { isFile: boolean }) =>
      () => {
        if (!open) {
          togglePath(node.path)
        }
        addFolder({ parentPath: node.path, parentId: node.id, isFile })
      },
    [node.path, togglePath, open],
  )
  const FolderIcon = open ? Icons.folderOpen : Icons.folderClose
  const ChevronIcon = open ? Icons.chevronDown : Icons.chevronRight
  const actions = useMemo<MenuOption[]>(
    () => [
      { label: 'New folder', onClick: onAddNode({ isFile: false }) },
      { label: 'New Prompt', onClick: onAddNode({ isFile: true }) },
      {
        label: 'Delete folder',
        type: 'destructive',
        onClick: () => {
          if (node.isPersisted) {
            onDeleteFolder(node.path)
          } else {
            deleteTmpFolder({ id: node.id })
          }
        },
      },
    ],
    [
      addFolder,
      onDeleteFolder,
      deleteTmpFolder,
      node.path,
      node.isPersisted,
      openPaths,
      togglePath,
    ],
  )
  return (
    <NodeHeaderWrapper
      ref={nodeRef}
      inputRef={inputRef}
      isEditing={isEditing}
      onClick={onToggleOpen}
      node={node}
      open={open}
      actions={actions}
      indentation={indentation}
      error={error}
      onChangeInput={onInputChange}
      onKeyDownInput={onInputKeyDown}
      icons={
        <>
          <div className='min-w-6 h-6 flex items-center justify-center'>
            <ChevronIcon className={cn(ICON_CLASS, 'h-4 w-4')} />
          </div>
          <FolderIcon className={ICON_CLASS} />
        </>
      }
    />
  )
}

function FileHeader({
  open,
  selected,
  node,
  indentation,
}: {
  open: boolean
  selected: boolean
  node: Node
  indentation: IndentType[]
}) {
  const { onNavigateToDocument, onDeleteFile, onCreateFile } =
    useFileTreeContext()
  const { deleteTmpFolder, reset } = useTempNodes((state) => ({
    reset: state.reset,
    deleteTmpFolder: state.deleteTmpFolder,
  }))
  const nodeRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { isEditing, error, onInputChange, onInputKeyDown } = useNodeValidator({
    node,
    nodeRef,
    inputRef,
    saveValue: async ({ path }: { path: string }) => {
      const parentPath = node.path.split('/').slice(0, -1).join('/')
      await onCreateFile(`${parentPath}/${path}`)
      reset()
    },
    leaveWithoutSave: () => {
      deleteTmpFolder({ id: node.id })
    },
  })
  const handleClick = useCallback(() => {
    if (selected) return
    if (!node.isPersisted) return

    onNavigateToDocument(node.doc!.documentUuid)
  }, [node.doc!.documentUuid, selected, node.isPersisted])
  const actions = useMemo<MenuOption[]>(
    () => [
      {
        label: 'Delete file',
        type: 'destructive',
        onClick: () => {
          onDeleteFile(node.doc!.documentUuid)
        },
      },
    ],
    [node.doc!.documentUuid, onDeleteFile],
  )
  return (
    <NodeHeaderWrapper
      inputRef={inputRef}
      ref={nodeRef}
      open={open}
      node={node}
      actions={actions}
      selected={selected}
      indentation={indentation}
      onClick={handleClick}
      onKeyDownInput={onInputKeyDown}
      onChangeInput={onInputChange}
      isEditing={isEditing}
      error={error}
      icons={
        <Icons.file
          className={cn(ICON_CLASS, {
            'text-accent-foreground': selected,
          })}
        />
      }
    />
  )
}

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
      <FileHeader
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

export function FilesTree({
  currentPath,
  documents,
  navigateToDocument,
  createFile,
  destroyFile,
}: {
  createFile: (args: { path: string }) => Promise<void>
  destroyFile: (documentUuid: string) => Promise<void>
  documents: SidebarDocument[]
  currentPath: string | undefined
  navigateToDocument: (documentUuid: string) => void
}) {
  const togglePath = useOpenPaths((state) => state.togglePath)
  const rootNode = useTree({ documents })

  useEffect(() => {
    if (currentPath) {
      togglePath(currentPath)
    }
  }, [currentPath, togglePath])

  return (
    <FileTreeProvider
      currentPath={currentPath}
      onNavigateToDocument={navigateToDocument}
      onCreateFile={async (path) => {
        createFile({ path })
      }}
      onDeleteFile={destroyFile}
      onDeleteFolder={async (path) => {
        console.log('onDeleteFolder', path)
      }}
    >
      <FileNode node={rootNode} />
    </FileTreeProvider>
  )
}
