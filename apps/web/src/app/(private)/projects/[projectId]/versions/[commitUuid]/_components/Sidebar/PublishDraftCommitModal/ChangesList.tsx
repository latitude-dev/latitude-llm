import { Commit, ModifiedDocumentType } from '@latitude-data/core/browser'
import { ChangedDocument } from '@latitude-data/core/repositories'
import {
  Button,
  cn,
  colors,
  Icon,
  IconName,
  ReactStateDispatch,
  Skeleton,
  Text,
  type TextProps,
  Tooltip,
  type TextColor,
} from '@latitude-data/web-ui'
import { useCurrentTheme } from '$/hooks/useCurrentTheme'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import useDocumentVersion from '$/stores/useDocumentVersion'

const MODIFICATION_ICONS: Record<ModifiedDocumentType, IconName> = {
  [ModifiedDocumentType.Created]: 'addSquare',
  [ModifiedDocumentType.Updated]: 'modification',
  [ModifiedDocumentType.UpdatedPath]: 'squareArrowRight',
  [ModifiedDocumentType.Deleted]: 'deletion',
}
const MODIFICATION_COLORS: Record<ModifiedDocumentType, TextColor> = {
  [ModifiedDocumentType.Created]: 'success',
  [ModifiedDocumentType.Updated]: 'accentForeground',
  [ModifiedDocumentType.UpdatedPath]: 'accentForeground',
  [ModifiedDocumentType.Deleted]: 'destructive',
}
function LoadingFile({
  changeType,
  width,
}: {
  changeType: ModifiedDocumentType
  width: number
}) {
  const icon = MODIFICATION_ICONS[changeType]
  return (
    <li className='w-full flex flex-row items-center gap-x-1 px-2 min-h-8'>
      <Icon
        name={icon as IconName}
        className='flex-shrink-0 w-4 h-4 text-gray-400 animate-pulse'
      />
      <div className='flex-grow h-5'>
        <Skeleton
          className={'h-full bg-muted rounded-full'}
          style={{ width: `${width}%` }}
        />
      </div>
    </li>
  )
}

function ChangePathLabel({
  path,
  ...props
}: {
  path: string
} & Omit<TextProps, 'children'>) {
  const textRef = useRef<HTMLDivElement>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)

  useEffect(() => {
    const checkOverflow = () => {
      if (textRef.current) {
        setIsOverflowing(
          textRef.current.scrollWidth > textRef.current.clientWidth,
        )
      }
    }

    const observer = new ResizeObserver(checkOverflow)
    observer.observe(textRef.current!)

    return () => {
      observer.disconnect()
    }
  }, [])

  return (
    <div className='flex-grow truncate'>
      <Tooltip
        asChild
        className='max-w-full truncate'
        open={isOverflowing ? undefined : false}
        trigger={
          <div className='max-w-full truncate'>
            <Text.H5 ref={textRef} {...props}>
              {path}
            </Text.H5>
          </div>
        }
      >
        {path}
      </Tooltip>
    </div>
  )
}

function ChangeWithErrors({
  change,
  projectId,
  commit,
  onClose,
}: {
  change: ChangedDocument
  commit: Commit | undefined
  projectId: number
  onClose: ReactStateDispatch<number | null>
}) {
  const theme = useCurrentTheme()
  return (
    <li className='w-full flex flex-row items-center justify-between gap-1 min-h-8 px-2'>
      <Icon
        name='alert'
        className='flex-shrink-0 text-destructive-muted-foreground'
      />
      <div className='flex-grow truncate'>
        <Link
          onClick={() => onClose(null)}
          href={
            ROUTES.projects
              .detail({ id: projectId })
              .commits.detail({ uuid: commit?.uuid! })
              .documents.detail({
                uuid: change.documentUuid,
              }).root
          }
        >
          <ChangePathLabel
            path={change.path}
            underline
            display='block'
            ellipsis
            noWrap
            color='destructive'
            darkColor='white'
            theme={theme}
          />
        </Link>
      </div>
    </li>
  )
}

function Change({
  change,
  isSelected,
  onSelect,
  hasErrors,
}: {
  change: ChangedDocument
  isSelected: boolean
  onSelect: () => void
  hasErrors: boolean
}) {
  const icon = MODIFICATION_ICONS[change.changeType]
  const color: TextColor = hasErrors
    ? 'foreground'
    : MODIFICATION_COLORS[change.changeType]

  const { data: prevDocument } = useDocumentVersion(
    change.changeType === ModifiedDocumentType.UpdatedPath
      ? change.documentUuid
      : null,
  )

  return (
    <li>
      <Button
        fullWidth
        variant='ghost'
        onClick={onSelect}
        className={cn('min-h-8 rounded-none', {
          'opacity-100': !hasErrors,
          'opacity-50': hasErrors,
          'hover:bg-secondary': !isSelected,
          'bg-accent': isSelected,
        })}
      >
        <div className='flex-grow overflow-hidden flex flex-row items-center justify-start gap-x-1'>
          <Icon
            name='file'
            className={cn('flex-shrink-0 w-4 h-4', colors.textColors[color])}
          />
          <div className='flex flex-row flex-grow truncate items-center justify-start'>
            {prevDocument && (
              <>
                <ChangePathLabel
                  path={prevDocument.path}
                  display='block'
                  ellipsis
                  noWrap
                  color={color}
                />
                <Icon
                  name='arrowRight'
                  className='min-w-4 h-4 mr-1'
                  color={color}
                />
              </>
            )}
            <ChangePathLabel
              path={change.path}
              display='block'
              ellipsis
              noWrap
              color={color}
            />
          </div>
          <Icon
            name={icon}
            className={cn('flex-shrink-0 w-4 h-4', colors.textColors[color])}
          />
        </div>
      </Button>
    </li>
  )
}

export type GroupedChanges = Record<'errors' | 'clean', ChangedDocument[]>
export function ChangesList({
  anyChanges,
  selected,
  onSelect,
  commit,
  projectId,
  isLoading,
  groups,
  hasErrors,
  onClose,
}: {
  anyChanges: boolean
  selected?: ChangedDocument
  onSelect: ReactStateDispatch<ChangedDocument | undefined>
  commit: Commit | undefined
  projectId: number
  isLoading: boolean
  groups: GroupedChanges
  hasErrors: boolean
  onClose: ReactStateDispatch<number | null>
}) {
  const bothGroups = groups.errors.length > 0 && groups.clean.length > 0
  return (
    <div
      className={cn('overflow-hidden h-full', {
        'flex flex-col gap-y-1': !isLoading && anyChanges,
        hidden: !isLoading && !anyChanges,
      })}
    >
      <Text.H5M>Changes</Text.H5M>
      <ul
        className={cn(
          'min-w-0 flex flex-col border rounded-md custom-scrollbar h-56',
          {
            'border-border': !hasErrors,
            'border-destructive dark:border-foreground': hasErrors,
          },
        )}
      >
        {isLoading ? (
          <>
            <LoadingFile width={62} changeType={ModifiedDocumentType.Deleted} />
            <LoadingFile width={87} changeType={ModifiedDocumentType.Updated} />
            <LoadingFile width={23} changeType={ModifiedDocumentType.Created} />
            <LoadingFile width={67} changeType={ModifiedDocumentType.Updated} />
          </>
        ) : (
          <>
            {groups.errors.map((c) => (
              <ChangeWithErrors
                key={c.documentUuid}
                change={c}
                projectId={projectId}
                commit={commit}
                onClose={onClose}
              />
            ))}

            {bothGroups ? (
              <div className='py-2 h-px w-full flex items-center'>
                <div className='w-full h-px bg-border' />
              </div>
            ) : null}

            {groups.clean.map((c) => (
              <Change
                key={c.documentUuid}
                hasErrors={hasErrors}
                change={c}
                isSelected={selected?.documentUuid === c.documentUuid}
                onSelect={() => onSelect(c)}
              />
            ))}
          </>
        )}
      </ul>
    </div>
  )
}
