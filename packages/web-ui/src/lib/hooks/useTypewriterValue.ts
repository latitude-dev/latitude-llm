'use client'
import { useEffect, useState } from 'react'

export function useTypeWriterValue(
  values: string[],
  options?: {
    prefix?: string
    typeTime?: number
    eraseTime?: number
    pauseTime?: number
  },
) {
  const prefix = options?.prefix ?? ''
  const typeTime = options?.typeTime ?? 15
  const eraseTime = options?.eraseTime ?? 5
  const pauseTime = options?.pauseTime ?? 2500

  const [currentText, setCurrentText] = useState('')
  const [currentValueIndex, setCurrentValueIndex] = useState(0)
  const [phase, setPhase] = useState<'typing' | 'erasing'>('typing')

  useEffect(() => {
    if (!values || values.length === 0) return
    let timeout: ReturnType<typeof setTimeout>
    const fullText = values[currentValueIndex]!

    if (phase === 'typing') {
      if (currentText.length < fullText.length) {
        timeout = setTimeout(() => {
          setCurrentText(fullText.slice(0, currentText.length + 1))
        }, typeTime)
      } else {
        // Full text is displayed, so wait before starting to erase
        timeout = setTimeout(() => {
          setPhase('erasing')
        }, pauseTime)
      }
    } else if (phase === 'erasing') {
      if (currentText.length > 0) {
        timeout = setTimeout(() => {
          setCurrentText(currentText.slice(0, -1))
        }, eraseTime)
      } else {
        // After fully erasing, move to the next value and start typing again
        timeout = setTimeout(() => {
          setCurrentValueIndex((prev) => (prev + 1) % values.length)
          setPhase('typing')
        }, typeTime)
      }
    }
    return () => clearTimeout(timeout)
  }, [
    currentText,
    phase,
    currentValueIndex,
    values,
    typeTime,
    eraseTime,
    pauseTime,
  ])

  // Always return at least a space to prevent layout collapse
  const displayedText = currentText || '\u00A0'
  return prefix + displayedText
}
