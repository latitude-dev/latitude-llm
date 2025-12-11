import { cn } from '@latitude-data/web-ui/utils'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  MODIFICATION_BACKGROUNDS,
  MODIFICATION_BACKGROUNDS_HOVER,
  MODIFICATION_COLORS,
  MODIFICATION_ICONS,
  MODIFICATION_LABELS,
} from '@latitude-data/web-ui/molecules/DocumentChange'
import { ModifiedDocumentType } from '@latitude-data/constants'
import { ReactNode, useMemo } from 'react'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { useHover } from '@latitude-data/web-ui/browser'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import Link from 'next/link'
import { TextColor } from '@latitude-data/web-ui/tokens'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'

export function ChangeItemSkeleton() {
  const maxWidth = useMemo(() => {
    const sizes = [
      'max-w-full',
      'max-w-[80%]',
      'max-w-[75%]',
      'max-w-[60%]',
      'max-w-[50%]',
    ]
    return sizes[Math.floor(Math.random() * sizes.length)]
  }, [])

  return (
    <div className='flex flex-row items-center justify-between gap-1 min-h-8 px-2 rounded-md'>
      <Skeleton className='w-4 h-4' />
      <div className='flex-grow'>
        <Skeleton height='h5' className={cn('flex-grow', maxWidth)} />
      </div>
      <Skeleton className='w-4 h-4 rounded-sm' />
    </div>
  )
}

export function ListItem({
  icon,
  label,
  hasIssues,
  changeType,
  href,
  selected,
  onSelect,
  className,
}: {
  icon: IconName | ReactNode
  label: string
  hasIssues?: boolean
  changeType: ModifiedDocumentType | undefined
  selected?: boolean
  onSelect?: () => void
  className?: string
  href?: string
}) {
  const [ref, isHovered] = useHover<HTMLLIElement>()
  const canSelect = onSelect !== undefined

  const foregroundColor = useMemo<TextColor>(() => {
    if (hasIssues) return 'destructive'
    if (changeType) return MODIFICATION_COLORS[changeType]
    return 'foregroundMuted'
  }, [hasIssues, changeType])

  const selectedBackgroundColor = useMemo<string>(() => {
    if (hasIssues) return 'bg-destructive-muted'
    if (changeType) return MODIFICATION_BACKGROUNDS[changeType]
    return 'bg-secondary'
  }, [hasIssues, changeType])

  const hoverBackgroundColor = useMemo<string>(() => {
    if (hasIssues) return 'hover:bg-destructive-muted'
    if (changeType) return MODIFICATION_BACKGROUNDS_HOVER[changeType]
    return 'hover:bg-secondary'
  }, [hasIssues, changeType])

  return (
    <li
      className={cn(
        'flex flex-row items-center justify-between gap-1 min-h-8 px-2 rounded-md flex-grow min-w-0',
        {
          'cursor-pointer': canSelect,
          [hoverBackgroundColor]: canSelect && !selected,
          [selectedBackgroundColor]: selected,
        },
        className,
      )}
      ref={ref}
      onClick={onSelect}
    >
      {typeof icon === 'string' ? (
        <Icon
          name={icon as IconName}
          color={foregroundColor}
          className='flex-shrink-0 w-4 h-4'
        />
      ) : (
        icon
      )}
      <div className='flex-grow truncate'>
        <Text.H5 color={foregroundColor} ellipsis noWrap>
          {label}
        </Text.H5>
      </div>
      {isHovered && href && changeType !== ModifiedDocumentType.Deleted && (
        <Link href={href}>
          <Button
            variant='ghost'
            size='small'
            iconProps={{ name: 'externalLink', color: foregroundColor }}
            className='p-0'
          />
        </Link>
      )}
      {hasIssues ? (
        <Tooltip
          trigger={
            <Icon
              name='alertTriangle'
              color='destructive'
              className='flex-shrink-0 w-4 h-4'
            />
          }
          side='right'
          align='end'
        >
          Fix all errors to publish this change.
        </Tooltip>
      ) : (
        changeType && (
          <Tooltip
            trigger={
              <Icon
                name={MODIFICATION_ICONS[changeType]}
                color={MODIFICATION_COLORS[changeType]}
                className='flex-shrink-0 w-4 h-4'
              />
            }
            side='right'
          >
            {MODIFICATION_LABELS[changeType]}
          </Tooltip>
        )
      )}
    </li>
  )
}
