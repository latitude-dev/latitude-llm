'use client'
import { ModifiedDocumentType } from '@latitude-data/constants'
import { Button } from '../../atoms/Button'
import { DropdownMenu, MenuOption } from '../../atoms/DropdownMenu'
import { Icon } from '../../atoms/Icons'
import { Text } from '../../atoms/Text'
import { colors } from '../../tokens'
import { useHover } from '../../../browser'
import { RefObject, useState } from 'react'
import { cn } from '../../../lib/utils'
import { TruncatedTooltip } from '../TruncatedTooltip'
import {
  MODIFICATION_BACKGROUNDS,
  MODIFICATION_COLORS,
  MODIFICATION_ICONS,
} from './colors'

export function DocumentChange({
  path,
  changeType,
  oldPath,
  isSelected,
  onClick,
  options,
  isDimmed,
  hoverBgColor = 'bg-secondary',
}: {
  path: string
  changeType: ModifiedDocumentType | undefined
  oldPath?: string
  isSelected: boolean
  onClick?: () => void
  options?: MenuOption[]
  isDimmed?: boolean
  hoverBgColor?: string
}) {
  const icon = changeType ? MODIFICATION_ICONS[changeType] : undefined
  const color = changeType ? MODIFICATION_COLORS[changeType] : 'foregroundMuted'
  const selectedBackground = changeType
    ? MODIFICATION_BACKGROUNDS[changeType]
    : undefined
  const dimmedClass = isDimmed ? 'opacity-60' : undefined

  const [ref, isHovered] = useHover()
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  return (
    <Button
      ref={ref as RefObject<HTMLButtonElement>}
      fullWidth
      variant='ghost'
      onClick={onClick}
      className={cn('min-h-10 rounded-md', {
        [hoverBgColor]: !isSelected && (isHovered || isMenuOpen),
        [selectedBackground!]: !!selectedBackground && isSelected,
      })}
    >
      <div className='flex-grow overflow-hidden flex flex-row items-center justify-start gap-x-1'>
        <Icon
          name='file'
          className={cn(
            'flex-shrink-0 w-4 h-4',
            colors.textColors[color],
            dimmedClass,
          )}
        />
        <div className='flex flex-row flex-grow truncate items-center justify-start gap-1'>
          {oldPath && (
            <>
              <TruncatedTooltip content={oldPath} className={dimmedClass}>
                <Text.H5M color={color} ellipsis noWrap>
                  {oldPath}
                </Text.H5M>
              </TruncatedTooltip>
              <Icon
                name='arrowRight'
                className={cn('min-w-4 h-4', dimmedClass)}
                color={color}
              />
            </>
          )}
          <TruncatedTooltip content={path} className={dimmedClass}>
            <Text.H5M color={color} ellipsis noWrap>
              {path}
            </Text.H5M>
          </TruncatedTooltip>
        </div>
        {options && (isHovered || isMenuOpen) && (
          <DropdownMenu
            onOpenChange={(open: boolean) => {
              onClick?.()
              setIsMenuOpen(open)
            }}
            triggerButtonProps={{
              variant: 'ghost',
              size: 'small',
              iconProps: {
                name: 'ellipsisVertical',
                color,
              },
              className: 'p-0 w-fit',
            }}
            options={options}
          />
        )}
        {icon && (
          <Icon
            name={icon}
            className={cn(
              'flex-shrink-0 w-4 h-4',
              colors.textColors[color],
              dimmedClass,
            )}
          />
        )}
      </div>
    </Button>
  )
}
