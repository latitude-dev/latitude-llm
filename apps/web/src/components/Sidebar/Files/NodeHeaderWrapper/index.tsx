'use client'
import { useModifiedColors } from '$/components/Sidebar/Files/useModifiedColors'
import { ModifiedDocumentType } from '@latitude-data/constants'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { MenuOption } from '@latitude-data/web-ui/atoms/DropdownMenu'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { useHover } from '@latitude-data/web-ui/browser'
import { MODIFICATION_ICONS } from '@latitude-data/web-ui/molecules/DocumentChange'
import { colors } from '@latitude-data/web-ui/tokens'
import { cn } from '@latitude-data/web-ui/utils'
import Link from 'next/link'
import {
  ReactNode,
  RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useNodeValidator } from './useNodeValidator'
import { MainPromptIcon } from './MainPromptIcon'

export type IndentType = { isLast: boolean; invisible?: boolean }

const MODIFICATION_LABELS: Record<ModifiedDocumentType, string> = {
  [ModifiedDocumentType.Created]: 'Created',
  [ModifiedDocumentType.Updated]: 'Updated',
  [ModifiedDocumentType.UpdatedPath]: 'Renamed',
  [ModifiedDocumentType.Deleted]: 'Deleted',
}
export type NodeHeaderWrapperProps = {
  depth: number
  open: boolean
  name: string | undefined
  hasChildren?: boolean
  isFile?: boolean
  isAgent?: boolean
  isMainDocument?: boolean
  setMainDocument?: (isMainDocument: boolean) => void
  selected?: boolean
  childrenSelected?: boolean
  isEditing: boolean
  changeType?: ModifiedDocumentType
  setIsEditing: (isEditing: boolean) => void
  actions?: MenuOption[]
  icons: IconName[]
  url?: string | undefined
  onClick?: () => void
  onSaveValue: (args: { path: string }) => void
  onSaveValueAndTab?: (args: { path: string }) => void
  onLeaveWithoutSave?: () => void
  children?: ReactNode
}

function NodeHeaderWrapper({
  depth,
  name,
  isFile = false,
  isAgent = false,
  isEditing,
  isMainDocument,
  setMainDocument,
  setIsEditing,
  onSaveValue,
  onSaveValueAndTab,
  onLeaveWithoutSave,
  selected = false,
  icons,
  actions,
  changeType,
  url,
  onClick,
  children,
  childrenSelected,
}: NodeHeaderWrapperProps) {
  const [tmpName, setTmpName] = useState(name)
  const inputRef = useRef<HTMLInputElement>(null)
  const [nodeRef, isHovered] = useHover()
  const { error, inputValue, onInputChange, onInputKeyDown } = useNodeValidator(
    {
      name,
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
      inputRef.current?.focus()
    }, 100)

    return () => {
      clearTimeout(timeout)
    }
  }, [inputRef])
  const showActions = !isEditing && actions && actions.length > 0
  const { color, selectedBackgroundColor, selectedBackgroundColorHover } =
    useModifiedColors({ changeType })
  const changeIcon = changeType ? MODIFICATION_ICONS[changeType] : undefined
  const ItemComponent = url ? Link : 'div'
  const itemSelected = selected && !childrenSelected
  const indentationStyle = useMemo(
    () => ({ width: `${Math.max(0, depth) * 8}px` }),
    [depth],
  )
  return (
    <div
      tabIndex={0}
      ref={nodeRef as RefObject<HTMLDivElement>}
      className={cn(
        'max-w-full group/row flex flex-col my-0.5 cursor-pointer',
        {
          [selectedBackgroundColor]: selected,
        },
      )}
    >
      <div
        className={cn('w-full flex flex-row gap-x-2 items-center', {
          'pr-2': showActions || !!changeIcon,
          [selectedBackgroundColorHover]: !itemSelected,
          [selectedBackgroundColor]: itemSelected,
        })}
      >
        <ItemComponent
          href={url ?? '#'}
          onClick={onClick}
          className={cn(
            'relative min-w-0 flex-grow flex flex-row items-center py-0.5',
          )}
        >
          <div className='flex flex-row items-center gap-x-1 mr-2'>
            <div className='h-6 shrink-0' style={indentationStyle} />

            <MainPromptIcon
              isHovered={isHovered}
              isFile={isFile}
              isMainDocument={isMainDocument}
              setMainDocument={setMainDocument}
            />

            {icons.map((icon, index) => (
              <Icon key={index} name={icon} color={color} className='w-4 h-4' />
            ))}
          </div>
          <div className='flex flex-col min-w-0'>
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
                      : isAgent
                        ? 'Agent name'
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
              <div
                className={cn(
                  'flex-grow flex-shrink truncate',
                  colors.textColors[color],
                )}
              >
                <Text.H5 ellipsis noWrap userSelect={false} color={color}>
                  {name && name !== ' ' ? name : tmpName}
                </Text.H5>
              </div>
            )}
          </div>
        </ItemComponent>
        {showActions && isHovered ? (
          <div className={cn('flex items-center gap-x-2')}>
            {actions.map((action, index) =>
              action.iconProps?.name ? (
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
                        name: action.iconProps?.name,
                      }}
                    />
                  }
                >
                  {action.label}
                </Tooltip>
              ) : null,
            )}
          </div>
        ) : null}
        {changeIcon && (
          <Tooltip trigger={<Icon name={changeIcon} color={color} />}>
            {MODIFICATION_LABELS[changeType!]}
          </Tooltip>
        )}
      </div>
      {children ? children : null}
    </div>
  )
}

export default NodeHeaderWrapper
