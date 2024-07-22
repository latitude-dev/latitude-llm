'use client'

import { ReactNode, useState } from 'react'

import { Icons } from '$ui/ds/atoms/Icons'
import Text from '$ui/ds/atoms/Text'
import { ReactStateDispatch } from '$ui/lib/commonTypes'
import { cn } from '$ui/lib/utils'

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
  node,
  children,
  indentation,
}: {
  open: boolean
  children: ReactNode
  node: Node
  indentation: IndentType[]
}) {
  return (
    <div
      className={cn('flex flex-row my-0.5 cursor-pointer', {
        'hover:bg-muted': !node.selected,
        'bg-accent': node.selected,
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
  onClick,
  indentation,
}: {
  isLast: boolean
  node: Node
  open: boolean
  onClick: ReactStateDispatch<boolean>
  indentation: IndentType[]
}) {
  const FolderIcon = open ? Icons.folderOpen : Icons.folderClose
  const ChevronIcon = open ? Icons.chevronDown : Icons.chevronRight
  return (
    <NodeHeaderWrapper open={open} node={node} indentation={indentation}>
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
  open,
  node,
  indentation,
}: {
  open: boolean
  node: Node
  indentation: IndentType[]
}) {
  return (
    <NodeHeaderWrapper open={open} node={node} indentation={indentation}>
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
  onClick,
  indentation,
}: {
  isLast: boolean
  node: Node
  open: boolean
  onClick: ReactStateDispatch<boolean>
  indentation: IndentType[]
}) {
  if (node.isRoot) return null
  if (node.isFile) {
    return <FileHeader open={open} node={node} indentation={indentation} />
  }

  return (
    <FolderHeader
      isLast={isLast}
      node={node}
      open={open}
      onClick={onClick}
      indentation={indentation}
    />
  )
}

function FileNode({
  isLast = false,
  node,
  indentation = [],
}: {
  node: Node
  isLast?: boolean
  indentation?: IndentType[]
}) {
  const [open, setOpen] = useState(node.containsSelected)
  const lastIdx = node.children.length - 1
  return (
    <div className='w-full'>
      <NodeHeader
        isLast={isLast}
        indentation={indentation}
        node={node}
        open={open}
        onClick={setOpen}
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
                indentation={[...indentation, { isLast: idx === lastIdx }]}
                node={node}
                isLast={idx === lastIdx}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
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
