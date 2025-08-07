import { Button } from '@latitude-data/web-ui/atoms/Button'
import {
  DynamicBot,
  type BotEmotion,
} from '@latitude-data/web-ui/molecules/DynamicBot'
import { cn } from '@latitude-data/web-ui/utils'
import { forwardRef, useCallback } from 'react'

const LatteButton = forwardRef<
  HTMLButtonElement,
  {
    emotion: BotEmotion
    setEmotion: (emotion: BotEmotion) => void
    reactWithEmotion: (emotion: BotEmotion, time: number) => void
    isSelected: boolean
    onClick: () => void
  }
>(
  (
    { isSelected, onClick, emotion, setEmotion, reactWithEmotion, ...rest },
    ref,
  ) => {
    const handleMouseEnter = useCallback(() => {
      if (emotion === 'thinking') return
      setEmotion('happy')
    }, [emotion, setEmotion])

    const handleMouseLeave = useCallback(() => {
      if (emotion === 'thinking') return
      setEmotion('normal')
      reactWithEmotion(isSelected ? 'happy' : 'unhappy', 1000)
    }, [emotion, setEmotion, isSelected, reactWithEmotion])

    return (
      <Button
        ref={ref}
        variant='ghost'
        onClick={onClick}
        className={cn('p-0 w-10 h-10', {
          'bg-accent': isSelected,
          'hover:bg-muted': !isSelected,
        })}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...rest}
      >
        <DynamicBot
          emotion={emotion}
          settings={{
            distanceToFollowCursor: 450,
            latteMode: true,
          }}
          color={isSelected ? 'primary' : 'foregroundMuted'}
          className='w-7 h-7'
        />
      </Button>
    )
  },
)

LatteButton.displayName = 'LatteButton'

export default LatteButton
