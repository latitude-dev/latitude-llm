'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Card } from '@latitude-data/web-ui/atoms/Card'
import { OnboardingLayout } from './OnboardingLayout'
import { SlideshowSlide } from '../_lib/useOnboardingState'
import { cn } from '@latitude-data/web-ui/utils'

type Props = {
  slide: SlideshowSlide
  slideIndex: number
  totalSlides: number
  isFirstSlide: boolean
  isLastSlide: boolean
  onNext: () => void
  onBack: () => void
}

function StoryProgressBar({
  current,
  total,
}: {
  current: number
  total: number
}) {
  return (
    <div className='flex items-center gap-1 w-full'>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className='flex-1 h-1 rounded-full bg-muted overflow-hidden'
        >
          <div
            className={cn(
              'h-full rounded-full transition-all duration-300 ease-out',
              i < current
                ? 'w-full bg-primary'
                : i === current
                  ? 'w-full bg-primary'
                  : 'w-0 bg-primary',
            )}
          />
        </div>
      ))}
    </div>
  )
}

type AnimationPhase = 'idle' | 'exit' | 'enter-start' | 'enter-end'
type AnimationDirection = 'forward' | 'backward'

export function Step1_ReliabilityLoop({
  slide,
  slideIndex,
  totalSlides,
  onNext,
  onBack,
}: Props) {
  const [phase, setPhase] = useState<AnimationPhase>('idle')
  const [direction, setDirection] = useState<AnimationDirection>('forward')
  const [displayedSlide, setDisplayedSlide] = useState(slide)
  const [prevSlideIndex, setPrevSlideIndex] = useState(slideIndex)

  useEffect(() => {
    if (slide.id !== displayedSlide.id) {
      const isForward = slideIndex > prevSlideIndex
      setDirection(isForward ? 'forward' : 'backward')
      setPhase('exit')

      const exitTimeout = setTimeout(() => {
        setDisplayedSlide(slide)
        setPrevSlideIndex(slideIndex)
        setPhase('enter-start')

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setPhase('enter-end')

            setTimeout(() => {
              setPhase('idle')
            }, 200)
          })
        })
      }, 150)

      return () => clearTimeout(exitTimeout)
    }
  }, [slide, displayedSlide.id, slideIndex, prevSlideIndex])

  const getAnimationStyle = (): CSSProperties => {
    const offset = 24

    switch (phase) {
      case 'exit':
        return {
          opacity: 0,
          transform: `translateX(${direction === 'forward' ? -offset : offset}px)`,
        }
      case 'enter-start':
        return {
          opacity: 0,
          transform: `translateX(${direction === 'forward' ? offset : -offset}px)`,
          transition: 'none',
        }
      case 'enter-end':
        return {
          opacity: 1,
          transform: 'translateX(0)',
        }
      default:
        return {
          opacity: 1,
          transform: 'translateX(0)',
        }
    }
  }

  const animationStyle = getAnimationStyle()
  const transitionClass = phase === 'enter-start' ? '' : 'transition-all duration-150 ease-out'

  return (
    <OnboardingLayout>
      <Card className='w-full max-w-lg p-8 overflow-hidden'>
        <div className='flex flex-col items-center gap-6 text-center'>
          <StoryProgressBar current={slideIndex} total={totalSlides} />

          <div
            className={cn(
              'w-full aspect-video rounded-lg bg-muted flex items-center justify-center overflow-hidden',
              transitionClass,
            )}
            style={animationStyle}
          >
            {displayedSlide.image ? (
              <img
                key={displayedSlide.id}
                src={displayedSlide.image}
                alt={displayedSlide.headline}
                className='w-full h-full object-cover object-left-top'
              />
            ) : (
              <Text.H6 color='foregroundMuted'>Image</Text.H6>
            )}
          </div>

          <div
            className={cn(
              'flex flex-col items-center gap-2',
              transitionClass,
            )}
            style={animationStyle}
          >
            <Text.H3M color='foreground' centered>
              {displayedSlide.headline}
            </Text.H3M>
            <Text.H5 color='foregroundMuted' centered>
              {displayedSlide.body}
            </Text.H5>
          </div>

          <div className='flex items-center justify-center gap-3'>
            <Button
              variant='outline'
              fancy
              onClick={onBack}
              iconProps={{ name: 'chevronLeft', placement: 'left' }}
            >
              Back
            </Button>
            <Button variant='default' fancy onClick={onNext}>
              Continue
            </Button>
          </div>
        </div>
      </Card>
    </OnboardingLayout>
  )
}

