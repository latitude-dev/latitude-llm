import { Commit, ModifiedDocumentType } from '@latitude-data/core/browser'
import { ChangedDocument } from '@latitude-data/core/repositories'
import {
  Button,
  cn,
  colors,
  Icon,
  IconName,
  Skeleton,
  Text,
  TruncatedTooltip,
  type TextColor,
} from '@latitude-data/web-ui'
import useDocumentVersion from '$/stores/useDocumentVersion'
import { useCommitsChanges } from '$/stores/commitChanges'

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

function Change({
  change,
  isSelected,
  onSelect,
  isDimmed,
}: {
  change: ChangedDocument
  isSelected: boolean
  onSelect: () => void
  isDimmed?: boolean
}) {
  const icon = MODIFICATION_ICONS[change.changeType]
  const color: TextColor = MODIFICATION_COLORS[change.changeType]
  const dimmedClass = isDimmed ? 'opacity-60' : undefined

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
        className={cn('min-h-8 rounded-md', {
          'hover:bg-secondary': !isSelected,
          'bg-accent': isSelected,
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
            {prevDocument && (
              <>
                <TruncatedTooltip
                  content={prevDocument.path}
                  className={dimmedClass}
                >
                  <Text.H5M color={color} ellipsis noWrap>
                    {prevDocument.path}
                  </Text.H5M>
                </TruncatedTooltip>
                <Icon
                  name='arrowRight'
                  className={cn('min-w-4 h-4', dimmedClass)}
                  color={color}
                />
              </>
            )}
            <TruncatedTooltip content={change.path} className={dimmedClass}>
              <Text.H5M color={color} ellipsis noWrap>
                {change.path}
              </Text.H5M>
            </TruncatedTooltip>
          </div>
          <Icon
            name={icon}
            className={cn(
              'flex-shrink-0 w-4 h-4',
              colors.textColors[color],
              dimmedClass,
            )}
          />
        </div>
      </Button>
    </li>
  )
}

export function CommitChangesList({
  commit,
  selectedDocumentUuid,
  selectDocumentUuid,
  currentDocumentUuid,
}: {
  commit: Commit
  selectedDocumentUuid?: string
  selectDocumentUuid: (documentUuid: string) => void
  currentDocumentUuid?: string
}) {
  const { data: changes, isLoading } = useCommitsChanges(commit)

  if (!commit) {
    return (
      <div className='w-full h-full flex flex-col items-center justify-center '>
        <Text.H5M color='foregroundMuted'>No commit selected</Text.H5M>
      </div>
    )
  }

  return (
    <div className='w-full h-full overflow-hidden'>
      <ul className='flex flex-col custom-scrollbar gap-1'>
        {isLoading ? (
          <>
            <LoadingFile width={62} changeType={ModifiedDocumentType.Deleted} />
            <LoadingFile width={87} changeType={ModifiedDocumentType.Updated} />
            <LoadingFile width={23} changeType={ModifiedDocumentType.Created} />
            <LoadingFile width={67} changeType={ModifiedDocumentType.Updated} />
          </>
        ) : (
          <>
            {changes.length ? (
              changes.map((change) => (
                <Change
                  key={change.documentUuid}
                  change={change}
                  isSelected={selectedDocumentUuid === change.documentUuid}
                  onSelect={() => selectDocumentUuid(change.documentUuid)}
                  isDimmed={
                    currentDocumentUuid !== undefined &&
                    currentDocumentUuid !== change.documentUuid
                  }
                />
              ))
            ) : (
              <div className='w-full h-full flex flex-col items-center justify-center p-4'>
                <Text.H5 color='foregroundMuted'>
                  This draft has no changes yet
                </Text.H5>
              </div>
            )}
          </>
        )}
      </ul>
    </div>
  )
}
