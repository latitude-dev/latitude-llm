import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'

export function KeysetTablePaginationFooter({
  hasNext,
  hasPrev,
  setNext,
  setPrev,
  count,
}: {
  setNext: () => void
  setPrev: () => void
  hasNext: boolean
  hasPrev: boolean
  count: number | null
}) {
  return (
    <div className='w-full flex justify-between items-center'>
      <Text.H5M color='foregroundMuted'>
        {count ? `${count} traces` : ''}
      </Text.H5M>
      <div className='flex items-center'>
        <Button
          size='default'
          variant='ghost'
          disabled={!hasPrev}
          iconProps={{ name: 'chevronLeft' }}
          onClick={setPrev}
        />
        <Button
          size='default'
          variant='ghost'
          disabled={!hasNext}
          iconProps={{ name: 'chevronRight' }}
          onClick={setNext}
        />
      </div>
    </div>
  )
}
