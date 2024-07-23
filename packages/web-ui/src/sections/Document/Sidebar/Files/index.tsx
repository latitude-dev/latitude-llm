'use client'

import { ReactNode, useCallback, useEffect, useState } from 'react'

import { Icons } from '$ui/ds/atoms/Icons'
import Text from '$ui/ds/atoms/Text'
import { cn } from '$ui/lib/utils'

import { useOpenPaths } from './useOpenPaths'
import { Node, SidebarDocument, useTree } from './useTree'

const ICON_CLASS = 'w-6 h-6 text-muted-foreground'

type IndentType = { isLast: boolean }
function IndentationBar({
  indentation,
  open,
}: {
  open: boolean
  indentation: IndentType[]
}) {
  return indentation.map((indent, index) => {
    const anyNextIndentIsNotLast = !!indentation
      .slice(index)
      .find((i) => !i.isLast)
    const showBorder = anyNextIndentIsNotLast ? false : indent.isLast
    return (
      <div key={index} className='h-6 w-6'>
        {index > 0 ? (
          <div className='-ml-px relative w-6 h-full flex justify-center'>
            {!open && showBorder ? (
              <div className='relative -mt-1'>
                <div className='border-l h-3' />
                <div className='absolute top-3 border-l border-b h-2 w-2 rounded-bl-sm' />
              </div>
            ) : (
              <div className='bg-border w-px h-8 -mt-1' />
            )}
          </div>
        ) : null}
      </div>
    )
  })
}

function NodeHeaderWrapper({
  open,
  selected = false,
  children,
  indentation,
}: {
  open: boolean
  selected?: boolean
  children: ReactNode
  indentation: IndentType[]
}) {
  return (
    <div
      className={cn('flex flex-row my-0.5 cursor-pointer', {
        'hover:bg-muted': !selected,
        'bg-accent': selected,
      })}
    >
      <IndentationBar indentation={indentation} open={open} />
      {children}
    </div>
  )
}

function FolderHeader({
  node,
  open,
  indentation,
}: {
  isLast: boolean
  node: Node
  open: boolean
  indentation: IndentType[]
}) {
  const togglePath = useOpenPaths((state) => state.togglePath)
  const FolderIcon = open ? Icons.folderOpen : Icons.folderClose
  const ChevronIcon = open ? Icons.chevronDown : Icons.chevronRight
  const onTooglePath = useCallback(() => {
    togglePath(node.path)
  }, [togglePath, node.path])
  return (
    <NodeHeaderWrapper open={open} indentation={indentation}>
      <div
        onClick={onTooglePath}
        className='flex flex-row items-center gap-x-1'
      >
        <div className='w-6 flex justify-center'>
          <ChevronIcon className={cn(ICON_CLASS, 'h-4 w-4')} />
        </div>
        <FolderIcon className={ICON_CLASS} />
        <Text.H5M userSelect={false}>{node.name}</Text.H5M>
      </div>
    </NodeHeaderWrapper>
  )
}

function FileHeader({
  open,
  selected,
  node,
  indentation,
  navigateToDocument,
}: {
  open: boolean
  selected: boolean
  node: Node
  indentation: IndentType[]
  navigateToDocument: (documentUuid: string) => void
}) {
  const handleClick = useCallback(() => {
    if (selected) return

    navigateToDocument(node.doc!.documentUuid)
  }, [node.doc!.documentUuid, selected])
  return (
    <NodeHeaderWrapper
      open={open}
      selected={selected}
      indentation={indentation}
    >
      <div
        className='flex flex-row items-center gap-x-1 py-0.5'
        onClick={handleClick}
      >
        <Icons.file
          className={cn(ICON_CLASS, {
            'text-accent-foreground': selected,
          })}
        />
        <Text.H5M
          userSelect={false}
          color={selected ? 'accentForeground' : 'foreground'}
        >
          {node.name}
        </Text.H5M>
      </div>
    </NodeHeaderWrapper>
  )
}

function NodeHeader({
  isLast,
  selected,
  node,
  open,
  indentation,
  navigateToDocument,
}: {
  isLast: boolean
  selected: boolean
  node: Node
  open: boolean
  indentation: IndentType[]
  navigateToDocument: (documentUuid: string) => void
}) {
  if (node.isRoot) return null
  if (node.isFile) {
    return (
      <FileHeader
        open={open}
        selected={selected}
        node={node}
        indentation={indentation}
        navigateToDocument={navigateToDocument}
      />
    )
  }

  return (
    <FolderHeader
      isLast={isLast}
      node={node}
      open={open}
      indentation={indentation}
    />
  )
}

function FileNode({
  isLast = false,
  node,
  currentPath,
  indentation = [],
  navigateToDocument,
}: {
  node: Node
  currentPath: string | undefined
  isLast?: boolean
  indentation?: IndentType[]
  navigateToDocument: (documentUuid: string) => void
}) {
  const [selected, setSelected] = useState(currentPath === node.path)
  const openPaths = useOpenPaths((state) => state.openPaths)
  const open = node.isRoot || openPaths.includes(node.path)
  const lastIdx = node.children.length - 1
  useEffect(() => {
    setSelected(currentPath === node.path)
  }, [currentPath])
  return (
    <div className='w-full'>
      <NodeHeader
        isLast={isLast}
        indentation={indentation}
        node={node}
        selected={selected}
        open={open}
        navigateToDocument={navigateToDocument}
      />

      {node.isFile ? null : (
        <ul
          className={cn('flex flex-col', {
            hidden: !open && !node.isRoot,
          })}
        >
          {node.children.map((node, idx) => (
            <li key={node.id}>
              <FileNode
                currentPath={currentPath}
                indentation={[...indentation, { isLast: idx === lastIdx }]}
                node={node}
                isLast={idx === lastIdx}
                navigateToDocument={navigateToDocument}
              />
            </li>
          ))}
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
    <FileNode
      currentPath={currentPath}
      node={rootNode}
      navigateToDocument={navigateToDocument}
    />
  )
}
