'use client'

import { useEffect, useState } from 'react'

import { cn } from '../../../lib/utils'
import { Text } from '../../atoms/Text'

const loadingTexts = [
  'Convincing AI to work overtime...',
  'Feeding hamsters to power the servers...',
  'Bribing data elves for more creativity...',
  'Untangling spaghetti code...',
  'Polishing each data point to a shine...',
  'Negotiating with stubborn algorithms...',
  'Herding cats... I mean, data points...',
]

export function LoadingText({
  alignX = 'right',
}: {
  alignX?: 'left' | 'center' | 'right'
}) {
  const [currentTextIndex, setCurrentTextIndex] = useState(0)
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    const intervalId = setInterval(() => {
      setIsVisible(false)
      setTimeout(() => {
        setCurrentTextIndex(
          (prevIndex) => (prevIndex + 1) % loadingTexts.length,
        )
        setIsVisible(true)
      }, 500)
    }, 3000)

    return () => clearInterval(intervalId)
  }, [])

  return (
    <div
      className={cn(
        'flex flex-row justify-end transition-opacity duration-500',
        {
          'justify-start': alignX === 'left',
          'justify-center': alignX === 'center',
          'justify-end': alignX === 'right',
          'opacity-0': !isVisible,
          'opacity-100': isVisible,
        },
      )}
    >
      <Text.H6 animate>{loadingTexts[currentTextIndex]}</Text.H6>
    </div>
  )
}
