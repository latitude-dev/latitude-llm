import { useCallback } from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'

export function ThumbsUpDownInput({
  thumbsUp,
  onThumbsClick,
  isSubmitting = false,
  hasPassed,
}: {
  thumbsUp: boolean | null
  onThumbsClick: (thumbsUp: boolean) => void
  onChange?: (_value: boolean | null) => void
  isSubmitting?: boolean
  hasPassed?: boolean
}) {
  const onThumbsUpClick = useCallback(() => {
    onThumbsClick(true)
  }, [onThumbsClick])

  const onThumbsDownClick = useCallback(() => {
    onThumbsClick(false)
  }, [onThumbsClick])

  const thumbsUpVariant =
    thumbsUp !== true
      ? 'ghost'
      : isSubmitting
        ? 'secondary'
        : hasPassed
          ? 'successMuted'
          : 'destructiveMuted'

  const thumbsDownVariant =
    thumbsUp !== false
      ? 'ghost'
      : isSubmitting
        ? 'secondary'
        : hasPassed
          ? 'successMuted'
          : 'destructiveMuted'

  return (
    <div className='flex gap-x-2'>
      <Button
        type='button'
        size='small'
        variant={thumbsUpVariant}
        iconProps={{ name: 'thumbsUp' }}
        onClick={onThumbsUpClick}
      />
      <Button
        size='small'
        type='button'
        variant={thumbsDownVariant}
        iconProps={{ name: 'thumbsDown' }}
        onClick={onThumbsDownClick}
      />
    </div>
  )
}
