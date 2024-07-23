'use client'

import { ReactNode, useRef, useState } from 'react'

import { Icons } from '$ui/ds/atoms/Icons'
import Text from '$ui/ds/atoms/Text'
import { ReactStateDispatch } from '$ui/lib/commonTypes'
import { cn } from '$ui/lib/utils'

import { Node, SidebarDocument, useTree } from './useTree'
import { useTreeNavigation } from '$ui/sections/Document/Sidebar/Files/useTreeNavigation'

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
  isFirstFromRoot,
  open,
  node,
  children,
  indentation,
}: {
  open: boolean
  isFirstFromRoot: boolean
  children: ReactNode
  node: Node
  indentation: IndentType[]
}) {
  const { onKeyDown } = useTreeNavigation()
  return (
    <div
      aria-expanded={open}
      onKeyDown={onKeyDown}
      tabIndex={isFirstFromRoot ? 0 : -1}
      role='treeitem'
      className={cn('flex flex-row my-0.5 cursor-pointer', {
        'hover:bg-muted focus:bg-active': !node.selected,
        'bg-accent': node.selected,
      })}
    >
      <IndentationBar indentation={indentation} open={open} />
      {children}
    </div>
  )
}

function FolderHeader({
  isFirstFromRoot,
  node,
  open,
  onClick,
  indentation,
}: {
  isFirstFromRoot: boolean
  isLast: boolean
  node: Node
  open: boolean
  onClick: ReactStateDispatch<boolean>
  indentation: IndentType[]
}) {
  const FolderIcon = open ? Icons.folderOpen : Icons.folderClose
  const ChevronIcon = open ? Icons.chevronDown : Icons.chevronRight
  return (
    <NodeHeaderWrapper
      isFirstFromRoot={isFirstFromRoot}
      open={open}
      node={node}
      indentation={indentation}
    >
      <div
        onClick={() => onClick(!open)}
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
  isFirstFromRoot,
  open,
  node,
  indentation,
}: {
  isFirstFromRoot: boolean
  open: boolean
  node: Node
  indentation: IndentType[]
}) {
  return (
    <NodeHeaderWrapper
      isFirstFromRoot={isFirstFromRoot}
      open={open}
      node={node}
      indentation={indentation}
    >
      <div className='flex flex-row items-center gap-x-1 py-0.5'>
        <Icons.file
          className={cn(ICON_CLASS, {
            'text-accent-foreground': node.selected,
          })}
        />
        <Text.H5M
          userSelect={false}
          color={node.selected ? 'accentForeground' : 'foreground'}
        >
          {node.name}
        </Text.H5M>
      </div>
    </NodeHeaderWrapper>
  )
}

function NodeHeader({
  isLast,
  node,
  open,
  isFirstFromRoot,
  onClick,
  indentation,
}: {
  isLast: boolean
  node: Node
  open: boolean
  isFirstFromRoot: boolean
  onClick: ReactStateDispatch<boolean>
  indentation: IndentType[]
}) {
  if (node.isRoot) return null
  if (node.isFile) {
    return (
      <FileHeader
        isFirstFromRoot={isFirstFromRoot}
        open={open}
        node={node}
        indentation={indentation}
      />
    )
  }

  return (
    <FolderHeader
      isLast={isLast}
      isFirstFromRoot={isFirstFromRoot}
      node={node}
      open={open}
      onClick={onClick}
      indentation={indentation}
    />
  )
}

function FileNode({
  isLast = false,
  isFirstFromRoot = false,
  node,
  indentation = [],
}: {
  node: Node
  isFirstFromRoot: boolean
  isLast?: boolean
  indentation?: IndentType[]
}) {
  const [open, setOpen] = useState(node.containsSelected)
  const lastIdx = node.children.length - 1
  return (
    <ul className='w-full' role='tree'>
      <li role='none'>
        <NodeHeader
          isLast={isLast}
          isFirstFromRoot={isFirstFromRoot}
          indentation={indentation}
          node={node}
          open={open}
          onClick={setOpen}
        />
      </li>

      {!node.isFile ? (
        <ul
          role='group'
          className={cn('flex flex-col', {
            hidden: !open && !node.isRoot,
          })}
        >
          {node.children.map((node, idx) => (
            <li key={node.id}>
              <FileNode
                indentation={[...indentation, { isLast: idx === lastIdx }]}
                node={node}
                isFirstFromRoot={node.parent?.isRoot && idx === 0}
                isLast={idx === lastIdx}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </ul>
  )
}

export function FilesTree({
  documents,
  currentDocumentUuid,
}: {
  documents: SidebarDocument[]
  currentDocumentUuid: string | undefined
}) {
  const rootNode = useTree({ documents, currentDocumentUuid })

  return <FileNode node={rootNode} />
}
