'use client'

import {
  forwardRef,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { DropdownMenu, MenuOption } from '$ui/ds/atoms/DropdownMenu'
import { Icons } from '$ui/ds/atoms/Icons'
import { Input } from '$ui/ds/atoms/Input'
import Text from '$ui/ds/atoms/Text'
import { cn } from '$ui/lib/utils'
import {
  FileTreeProvider,
  useFileTreeContext,
} from '$ui/sections/Document/Sidebar/Files/FilesProvider'
import { useNodeValidator } from '$ui/sections/Document/Sidebar/Files/useNodeValidator'
import { useTempNodes } from '$ui/sections/Document/Sidebar/Files/useTempNodes'

import { useOpenPaths } from './useOpenPaths'
import { Node, SidebarDocument, useTree } from './useTree'

const ICON_CLASS = 'min-w-6 h-6 text-muted-foreground'

type IndentType = { isLast: boolean }

function IndentationBar({
  indentation,
  hasChildren,
}: {
  hasChildren: boolean
  indentation: IndentType[]
}) {
  return indentation.map((indent, index) => {
    const anyNextIndentIsNotLast = !!indentation
      .slice(index)
      .find((i) => !i.isLast)
    const showBorder = anyNextIndentIsNotLast ? false : indent.isLast
    return (
      <div key={index} className='h-6 min-w-6'>
        {index > 0 ? (
          <div className='-ml-[3px] relative w-6 h-full flex justify-center'>
            {hasChildren || !showBorder ? (
              <div className='bg-border w-px h-8 -mt-1' />
            ) : (
              <div className='relative -mt-1'>
                <div className='border-l h-2.5' />
                <div className='absolute top-2.5 border-l border-b h-2 w-2 rounded-bl-sm' />
              </div>
            )}
          </div>
        ) : null}
      </div>
    )
  })
}

type WrapperProps = {
  open: boolean
  node: Node
  selected?: boolean
  onClick?: () => void
  children: ReactNode
  indentation: IndentType[]
}
const NodeHeaderWrapper = forwardRef<HTMLDivElement, WrapperProps>(function Foo(
  { node, open, selected = false, onClick, children, indentation },
  ref,
) {
  return (
    <div
      ref={ref}
      onClick={onClick}
      className={cn(
        'max-w-full group/row flex flex-row my-0.5 cursor-pointer',
        {
          'hover:bg-muted': !selected,
          'bg-accent': selected,
        },
      )}
    >
      <IndentationBar
        indentation={indentation}
        hasChildren={open && node.children.length > 0}
      />
      {children}
    </div>
  )
})

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
  const inputRef = useRef<HTMLInputElement>(null)
  const nodeRef = useRef<HTMLDivElement>(null)
  const { onDeleteFolder } = useFileTreeContext()
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
  const { isEditing, error, onInputChange, onInputKeyDown, keepFocused } =
    useNodeValidator({
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
  const FolderIcon = open ? Icons.folderOpen : Icons.folderClose
  const ChevronIcon = open ? Icons.chevronDown : Icons.chevronRight
  const options = useMemo<MenuOption[]>(
    () => [
      {
        label: 'New folder',
        onClick: () => {
          if (!open) {
            togglePath(node.path)
          }
          addFolder({ parentPath: node.path, parentId: node.id })
        },
      },
      {
        label: 'New Prompt',
        onClick: () => {},
      },
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
      node={node}
      open={open}
      indentation={indentation}
    >
      <div
        onClick={onToggleOpen}
        className='min-w-0 flex-grow flex flex-row justify-between items-center gap-x-1 py-0.5'
      >
        <div className='min-w-6 h-6 flex items-center justify-center'>
          <ChevronIcon className={cn(ICON_CLASS, 'h-4 w-4')} />
        </div>
        <FolderIcon className={ICON_CLASS} />

        {isEditing ? (
          <div className='pr-1 flex items-center'>
            <Input
              autoFocus
              artificialFocused={keepFocused}
              ref={inputRef}
              name='name'
              type='text'
              size='small'
              onKeyDown={onInputKeyDown}
              onChange={onInputChange}
              errors={error ? [error] : undefined}
              errorStyle='tooltip'
            />
          </div>
        ) : (
          <div className='flex-grow flex-shrink truncate'>
            <Text.H5M ellipsis noWrap userSelect={false}>
              {node.name}
            </Text.H5M>
          </div>
        )}
      </div>

      {!isEditing ? (
        <div className='flex items-center opacity-0 group-hover/row:opacity-100'>
          <DropdownMenu options={options} side='bottom' align='end' />
        </div>
      ) : null}
    </NodeHeaderWrapper>
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
  const { onDeleteFile, onNavigateToDocument } = useFileTreeContext()
  const handleClick = useCallback(() => {
    if (selected) return

    onNavigateToDocument(node.doc!.documentUuid)
  }, [node.doc!.documentUuid, selected])
  const options = useMemo<MenuOption[]>(
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
      open={open}
      node={node}
      selected={selected}
      indentation={indentation}
      onClick={handleClick}
    >
      <div className='min-w-0 flex-grow flex flex-row items-center justify-between gap-x-1 py-0.5'>
        <Icons.file
          className={cn(ICON_CLASS, {
            'text-accent-foreground': selected,
          })}
        />
        <div className='flex-grow flex-shrink truncate'>
          <Text.H5M
            userSelect={false}
            ellipsis
            noWrap
            color={selected ? 'accentForeground' : 'foreground'}
          >
            {node.name}
          </Text.H5M>
        </div>
        <div className='opacity-0 group-hover/row:opacity-100'>
          <DropdownMenu options={options} side='bottom' align='end' />
        </div>
      </div>
    </NodeHeaderWrapper>
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
}: {
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
      onCreateFile={(path) => {
        console.log('onCreateFile', path)
      }}
      onDeleteFile={(documentUuid) => {
        console.log('onDeleteFile', documentUuid)
      }}
      onDeleteFolder={(path) => {
        console.log('onDeleteFolder', path)
      }}
    >
      <FileNode node={rootNode} />
    </FileTreeProvider>
  )
}
