import { useCallback, useEffect, useState } from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'

export function ThumbsUpDownInput({
  thumbsUp,
  onThumbsClick,
}: {
  thumbsUp: boolean | null
  onThumbsClick: (thumbsUp: boolean) => void
  onChange?: (_value: boolean | null) => void
}) {
  const [isThumbsUp, setIsThumbsUp] = useState<boolean | null>(thumbsUp)

  const onThumbsUpClick = useCallback(() => {
    setIsThumbsUp(true)
    onThumbsClick(true)
  }, [onThumbsClick])

  const onThumbsDownClick = useCallback(() => {
    setIsThumbsUp(false)
    onThumbsClick(false)
  }, [onThumbsClick])

  useEffect(() => {
    setIsThumbsUp(thumbsUp)
  }, [thumbsUp])

  return (
    <div className='flex gap-x-2'>
      <Button
        type='button'
        size='small'
        variant={isThumbsUp === true ? 'successMuted' : 'ghost'}
        iconProps={{ name: 'thumbsUp' }}
        onClick={onThumbsUpClick}
      />
      <Button
        size='small'
        type='button'
        variant={isThumbsUp === false ? 'destructiveMuted' : 'ghost'}
        iconProps={{ name: 'thumbsDown' }}
        onClick={onThumbsDownClick}
      />
    </div>
  )
}
