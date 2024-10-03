'use client'

import { useEffect, useState } from 'react'

import { Text } from '../../atoms'

const loadingTexts = [
  'Convincing AI to work overtime...',
  'Feeding hamsters to power the servers...',
  'Bribing data elves for more creativity...',
  'Untangling spaghetti code...',
  'Polishing each data point to a shine...',
  'Negotiating with stubborn algorithms...',
  'Herding cats... I mean, data points...',
]

export function LoadingText() {
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
      className={`flex flex-row justify-end transition-opacity duration-500 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <Text.H6 animate>{loadingTexts[currentTextIndex]}</Text.H6>
    </div>
  )
}
