import { ReactNode, useEffect, useRef, useState } from 'react'

import { Button } from '$ui/ds/atoms'
import { MenuOption } from '$ui/ds/atoms/DropdownMenu'
import { Input } from '$ui/ds/atoms/Input'
import Text from '$ui/ds/atoms/Text'
import { cn } from '$ui/lib/utils'
import { useNodeValidator } from '$ui/sections/Document/Sidebar/Files/NodeHeaderWrapper/useNodeValidator'

export const ICON_CLASS = 'min-w-6 h-6 text-muted-foreground'
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
  const { isEditing, error, onInputChange, onInputKeyDown } = useNodeValidator({
    name,
    nodeRef,
    inputRef,
    saveValue: ({ path }) => {
      setTmpName(path)
      onSaveValue({ path })
    },
    saveAndAddOther: onSaveValueAndTab,
    leaveWithoutSave: onLeaveWithoutSave,
  })
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
              name='name'
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
            <Button
              key={index}
              variant='ghost'
              size='none'
              onClick={action.onClick}
              iconProps={{
                color: selected ? 'accentForeground' : 'foregroundMuted',
                name: action.iconProps?.name!,
                size: 16,
                widthClass: 'w-4',
                heightClass: 'h-4',
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default NodeHeaderWrapper
