'use client'
import { useDraggable } from '@dnd-kit/core'
import { RefObject, useEffect, useRef, useState } from 'react'

import { Button } from '../../../../../ds/atoms/Button'
import { Icon, IconName } from '../../../../../ds/atoms/Icons'
import { Tooltip } from '../../../../../ds/atoms/Tooltip'
import { MenuOption } from '../../../../../ds/atoms/DropdownMenu'
import { Input } from '../../../../../ds/atoms/Input'
import { Text } from '../../../../../ds/atoms/Text'
import { cn } from '../../../../../lib/utils'
import { useNodeValidator } from './useNodeValidator'
import { ModifiedDocumentType } from '@latitude-data/core/browser'
import {
  MODIFICATION_BACKGROUNDS,
  MODIFICATION_COLORS,
  MODIFICATION_ICONS,
} from '../../../../../ds/molecules/DocumentChange/colors'
import { useHover } from '../../../../../browser'
import { TruncatedTooltip } from '../../../../../ds/molecules/TruncatedTooltip'

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

const MODIFICATION_LABELS: Record<ModifiedDocumentType, string> = {
  [ModifiedDocumentType.Created]: 'Created',
  [ModifiedDocumentType.Updated]: 'Updated',
  [ModifiedDocumentType.UpdatedPath]: 'Renamed',
  [ModifiedDocumentType.Deleted]: 'Deleted',
}
type DraggableProps = ReturnType<typeof useDraggable>
export type NodeHeaderWrapperProps = {
  open: boolean
  name: string | undefined
  canDrag: boolean
  draggble: DraggableProps | undefined
  hasChildren?: boolean
  isFile?: boolean
  selected?: boolean
  isEditing: boolean
  changeType?: ModifiedDocumentType
  setIsEditing: (isEditing: boolean) => void
  onClick?: () => void
  actions?: MenuOption[]
  icons: IconName[]
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
  changeType,
  canDrag,
  draggble,
}: NodeHeaderWrapperProps) {
  const [tmpName, setTmpName] = useState(name)
  const inputRef = useRef<HTMLInputElement>(null)
  const [nodeRef, isHovered] = useHover()
  const { error, inputValue, onInputChange, onInputKeyDown } = useNodeValidator(
    {
      name,
      nodeRef: nodeRef as RefObject<HTMLDivElement>,
      inputRef: inputRef as RefObject<HTMLInputElement>,
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

  const color = changeType ? MODIFICATION_COLORS[changeType] : 'foreground'
  const selectedBackgroundColor = changeType
    ? MODIFICATION_BACKGROUNDS[changeType]
    : 'bg-accent'
  const changeIcon = changeType ? MODIFICATION_ICONS[changeType] : undefined
  return (
    <div
      tabIndex={0}
      ref={nodeRef as RefObject<HTMLDivElement>}
      className={cn(
        'max-w-full group/row flex flex-row my-0.5 cursor-pointer items-center gap-2',
        {
          'hover:bg-muted': !selected,
          [selectedBackgroundColor]: selected,
          'pr-2': showActions || !!changeIcon,
        },
      )}
    >
      <div
        onClick={onClick}
        className={cn(
          'relative min-w-0 flex-grow flex flex-row items-center py-0.5',
          {
            'cursor-pointer': !draggble?.isDragging,
            'cursor-grab': canDrag && draggble?.isDragging,
          },
        )}
        ref={draggble?.setNodeRef}
        {...(draggble ? draggble.listeners : {})}
        {...(draggble ? draggble.attributes : {})}
      >
        {canDrag ? (
          <div className='absolute left-1 top-0 bottom-0 w-4 flex items-center transition opacity-0 group-hover/row:opacity-100'>
            <Icon name='gridVertical' color='foregroundMuted' />
          </div>
        ) : null}
        <IndentationBar
          indentation={indentation}
          hasChildren={open && hasChildren}
        />
        <div className='flex flex-row items-center gap-x-1 mr-1'>
          {icons.map((icon, index) => (
            <Icon key={index} name={icon} color={color} />
          ))}
        </div>
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
            <TruncatedTooltip content={name}>
              <Text.H5M ellipsis noWrap userSelect={false} color={color}>
                {name && name !== ' ' ? name : tmpName}
              </Text.H5M>
            </TruncatedTooltip>
          </div>
        )}
      </div>
      {showActions && isHovered ? (
        <div className={cn('flex items-center gap-x-2')}>
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
                    color: 'foregroundMuted',
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
      {changeIcon && (
        <Tooltip trigger={<Icon name={changeIcon} color={color} />}>
          {MODIFICATION_LABELS[changeType!]}
        </Tooltip>
      )}
    </div>
  )
}

export default NodeHeaderWrapper
