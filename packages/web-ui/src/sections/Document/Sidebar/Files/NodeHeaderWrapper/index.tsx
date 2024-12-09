'use client'

import { ReactNode, useEffect, useRef, useState } from 'react'

import { Button, Tooltip } from '../../../../../ds/atoms'
import { MenuOption } from '../../../../../ds/atoms/DropdownMenu'
import { Input } from '../../../../../ds/atoms/Input'
import Text from '../../../../../ds/atoms/Text'
import { cn } from '../../../../../lib/utils'
import { useNodeValidator } from './useNodeValidator'

export const ICON_CLASS = 'text-muted-foreground'
export type IndentType = { isLast: boolean }
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
          <div className='relative w-6 h-full flex justify-center'>
            {hasChildren || !showBorder ? (
              <div className='-ml-px bg-border w-px h-8 -mt-1' />
            ) : (
              <div className='-ml-px relative -mt-1'>
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

type Props = {
  open: boolean
  name: string | undefined
  hasChildren?: boolean
  isFile?: boolean
  selected?: boolean
  isEditing: boolean
  setIsEditing: (isEditing: boolean) => void
  onClick?: () => void
  actions?: MenuOption[]
  icons: ReactNode
  indentation: IndentType[]
  onSaveValue: (args: { path: string }) => void
  onSaveValueAndTab?: (args: { path: string }) => void
  onLeaveWithoutSave?: () => void
}

function NodeHeaderWrapper({
  name,
  open,
  hasChildren = false,
  isFile = false,
  isEditing,
  setIsEditing,
  onSaveValue,
  onSaveValueAndTab,
  onLeaveWithoutSave,
  selected = false,
  onClick,
  icons,
  indentation,
  actions,
}: Props) {
  const [tmpName, setTmpName] = useState(name)
  const inputRef = useRef<HTMLInputElement>(null)
  const nodeRef = useRef<HTMLDivElement>(null)
  const { error, inputValue, onInputChange, onInputKeyDown } = useNodeValidator(
    {
      name,
      nodeRef,
      inputRef,
      isEditing,
      setIsEditing,
      saveValue: ({ path }) => {
        setTmpName(path)
        onSaveValue({ path })
      },
      saveAndAddOther: onSaveValueAndTab,
      leaveWithoutSave: onLeaveWithoutSave,
    },
  )
  // Litle trick to focus the input after the component is mounted
  // We wait some time to focus the input to avoid the focus being stolen
  // by the click event in the menu item that created this node.
  useEffect(() => {
    const timeout = setTimeout(() => {
      inputRef.current?.focus(), 100
    })

    return () => {
      clearTimeout(timeout)
    }
  }, [inputRef])
  const showActions = !isEditing && actions && actions.length > 0
  return (
    <div
      tabIndex={0}
      ref={nodeRef}
      className={cn(
        'max-w-full group/row flex flex-row my-0.5 cursor-pointer',
        {
          'hover:bg-muted': !selected,
          'bg-accent': selected,
        },
      )}
    >
      <div
        onClick={onClick}
        className='min-w-0 flex-grow flex flex-row items-center py-0.5'
      >
        <IndentationBar
          indentation={indentation}
          hasChildren={open && hasChildren}
        />
        <div className='flex flex-row items-center gap-x-1 mr-1'>{icons}</div>
        {isEditing ? (
          <div className='pr-1 flex items-center'>
            <Input
              tabIndex={0}
              ref={inputRef}
              autoFocus
              value={inputValue?.trim()}
              onKeyDown={onInputKeyDown}
              onChange={onInputChange}
              errors={error ? [error] : undefined}
              placeholder={
                onSaveValueAndTab
                  ? 'Tab to create another folder'
                  : isFile
                    ? 'File name'
                    : 'Folder name'
              }
              name='filename'
              data-1p-ignore
              type='text'
              size='small'
              errorStyle='tooltip'
            />
          </div>
        ) : (
          <div className='flex-grow flex-shrink truncate'>
            <Text.H5M
              ellipsis
              noWrap
              userSelect={false}
              color={selected ? 'accentForeground' : 'foreground'}
            >
              {name && name !== ' ' ? name : tmpName}
            </Text.H5M>
          </div>
        )}
      </div>
      {showActions ? (
        <div
          className={cn(
            'flex items-center gap-x-2 pr-4 opacity-0 group-hover/row:opacity-100',
          )}
        >
          {actions.map((action, index) => (
            <Tooltip
              key={index}
              asChild
              trigger={
                <Button
                  variant='ghost'
                  size='none'
                  lookDisabled={action.lookDisabled}
                  disabled={action.disabled}
                  onClick={action.onClick}
                  iconProps={{
                    color: selected ? 'accentForeground' : 'foregroundMuted',
                    name: action.iconProps?.name!,
                  }}
                />
              }
            >
              {action.label}
            </Tooltip>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default NodeHeaderWrapper
