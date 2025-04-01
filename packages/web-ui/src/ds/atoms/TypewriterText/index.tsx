'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { cn } from '../../../lib/utils'

interface TypewriterTextProps {
  text: string
  speed?: number
}

export const TypewriterText: React.FC<TypewriterTextProps> = ({
  text,
  speed = 50,
}) => {
  const [displayedText, setDisplayedText] = useState('')
  const [isGenerating, setIsGenerating] = useState(true)

  const typeNextCharacter = useCallback(() => {
    setDisplayedText((prev) => {
      if (prev.length < text.length) {
        return text.slice(0, prev.length + 1)
      }
      setIsGenerating(false)
      return prev
    })
  }, [text])

  useEffect(() => {
    setDisplayedText('') // Reset the text when the input text changes
    setIsGenerating(true)

    const typingInterval = setInterval(() => {
      typeNextCharacter()
    }, speed)

    return () => clearInterval(typingInterval)
  }, [text, speed, typeNextCharacter])

  return (
    <span
      className={cn(
        'whitespace-pre-wrap text-sm font-normal text-foreground',
        isGenerating && 'animate-pulse',
      )}
    >
      {displayedText}
    </span>
  )
}
