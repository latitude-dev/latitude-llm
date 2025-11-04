import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'

export function LimitedTablePaginationFooter({
  count,
  countLabel,
  page,
  onPageChange,
  nextPage = false,
  optimistic = false,
}: {
  count?: number
  countLabel?: (count: number) => string
  page: number
  onPageChange: (page: number) => void
  nextPage?: boolean
  optimistic?: boolean
}) {
  return (
    <div className='w-full flex justify-between items-center'>
      {count !== undefined ? (
        <div className='flex flex-row items-center gap-x-1'>
          {!optimistic && (
            <Icon name='equalApproximately' color='foregroundMuted' />
          )}
          <Text.H5M color='foregroundMuted'>
            {countLabel?.(count) ?? `${count} rows`}
          </Text.H5M>
        </div>
      ) : (
        <div />
      )}
      <div className='flex items-center'>
        <Button
          size='default'
          variant='ghost'
          disabled={page <= 1}
          iconProps={{
            name: 'chevronLeft',
          }}
          onClick={() => onPageChange(page - 1)}
        />
        <div className='flex flex-row items-center gap-x-1'>
          <Text.H5M color='foregroundMuted'>{page}</Text.H5M>
        </div>
        <Button
          size='default'
          variant='ghost'
          disabled={!nextPage}
          iconProps={{
            name: 'chevronRight',
          }}
          onClick={() => onPageChange(page + 1)}
        />
      </div>
    </div>
  )
}
