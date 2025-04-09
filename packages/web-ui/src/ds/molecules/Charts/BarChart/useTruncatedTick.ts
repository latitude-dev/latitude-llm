import { useMemo } from 'react'

let canvasContext: CanvasRenderingContext2D

function getCanvasContext(font = '12px sans-serif') {
  if (!canvasContext) {
    const canvas = document.createElement('canvas')
    canvasContext = canvas.getContext('2d')!
  }

  canvasContext.font = font
  return canvasContext
}

function getTextWidth(text: string) {
  const font = window.getComputedStyle(document.body).font
  const context = getCanvasContext(font)
  return context.measureText(text).width
}

export function truncateToWidth(text: string, maxWidth: number) {
  if (getTextWidth(text) <= maxWidth) return text

  let truncated = ''
  for (let i = 0; i < text.length; i++) {
    const candidate = text.slice(0, i + 1) + '…'
    if (getTextWidth(candidate) > maxWidth) break
    truncated = candidate
  }

  return truncated
}

export function useTruncatedTick({
  text,
  availableWidth,
}: {
  text: string
  availableWidth: number
}) {
  return useMemo(() => {
    const originalText = text
    const truncatedText = truncateToWidth(originalText, availableWidth)
    return {
      originalText,
      truncatedText,
    }
  }, [text, availableWidth])
}
