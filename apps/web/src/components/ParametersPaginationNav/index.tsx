import { Button } from '@latitude-data/web-ui/atoms/Button'

export function ParametersPaginationNav({
  onNextPage,
  onPrevPage,
  disabled = false,
}: {
  label: string
  onNextPage: () => void
  onPrevPage: () => void
  disabled?: boolean
}) {
  return (
    <div className='flex items-center min-w-0'>
      <Button
        size='icon'
        variant='ghost'
        disabled={!!onPrevPage}
        iconProps={{
          name: 'chevronLeft',
        }}
        onClick={(e) => {
          e.stopPropagation()
          onPrevPage()
        }}
      />
      <Button
        size='icon'
        variant='ghost'
        disabled={disabled || !onNextPage}
        iconProps={{
          name: 'chevronRight',
        }}
        onClick={(e) => {
          e.stopPropagation()
          onNextPage()
        }}
      />
    </div>
  )
}
