import { Button, Text } from '@latitude-data/web-ui'

const INDEX_ZERO_LIST = 1
export function ParametersPaginationNav({
  currentIndex,
  totalCount,
  onNextPage,
  onPrevPage,
  label,
  zeroIndex = false,
  disabled = false,
}: {
  label: string
  currentIndex: number | undefined
  totalCount: number | undefined
  onNextPage: (index: number) => void
  onPrevPage: (index: number) => void
  zeroIndex?: boolean
  disabled?: boolean
}) {
  if (currentIndex === undefined || totalCount === undefined) return null

  return (
    <div className='flex items-center min-w-0'>
      <Button
        size='default'
        variant='ghost'
        disabled={zeroIndex ? currentIndex <= 0 : currentIndex <= 1 || disabled}
        iconProps={{
          name: 'chevronLeft',
        }}
        onClick={() => onPrevPage(currentIndex)}
      />
      <div className='flex flex-row justify-center items-center flex-grow min-w-0'>
        <Text.H5M color='foregroundMuted' ellipsis noWrap>
          {zeroIndex ? currentIndex + INDEX_ZERO_LIST : currentIndex} of{' '}
          {totalCount} {label}
        </Text.H5M>
      </div>
      <Button
        size='default'
        variant='ghost'
        disabled={
          disabled ||
          currentIndex >=
            (zeroIndex ? totalCount - INDEX_ZERO_LIST : totalCount)
        }
        iconProps={{
          name: 'chevronRight',
        }}
        onClick={() => onNextPage(currentIndex)}
      />
    </div>
  )
}
