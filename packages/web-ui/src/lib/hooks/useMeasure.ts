'use client'

import { useLayoutEffect, useMemo, useState } from 'react'

type PaddingAttributes = {
  paddingBottom: number
  paddingLeft: number
  paddingRight: number
  paddingTop: number
  paddingX: number
  paddingY: number
  padding: number
}
export type UseMeasureRect = Pick<
  DOMRectReadOnly,
  'x' | 'y' | 'top' | 'left' | 'right' | 'bottom' | 'height' | 'width'
> &
  PaddingAttributes
export type UseMeasureRef<E extends Element = Element> = (element: E) => void
export type UseMeasureResult<E extends Element = Element> = [
  UseMeasureRef<E>,
  UseMeasureRect,
  E,
]

const DEFAULT_PADDING: PaddingAttributes = {
  paddingBottom: 0,
  paddingLeft: 0,
  paddingRight: 0,
  paddingTop: 0,
  paddingX: 0,
  paddingY: 0,
  padding: 0,
}
const DEFAULT_MEASUREMENT: UseMeasureRect = {
  ...DEFAULT_PADDING,
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  top: 0,
  left: 0,
  bottom: 0,
  right: 0,
}

function getPadding(element: ResizeObserverEntry): PaddingAttributes {
  if (typeof window === 'undefined') return DEFAULT_MEASUREMENT

  const style = window.getComputedStyle(element.target)
  const paddingTop = parseFloat(style.getPropertyValue('padding-top'))
  const paddingRight = parseFloat(style.getPropertyValue('padding-right'))
  const paddingBottom = parseFloat(style.getPropertyValue('padding-bottom'))
  const paddingLeft = parseFloat(style.getPropertyValue('padding-left'))
  const paddingX = paddingLeft + paddingRight
  const paddingY = paddingTop + paddingBottom
  const padding = parseFloat(style.getPropertyValue('padding'))
  return {
    paddingTop,
    paddingRight,
    paddingBottom,
    paddingLeft,
    paddingX,
    paddingY,
    padding,
  }
}

function buildRect(element: ResizeObserverEntry): UseMeasureRect {
  const box = element.contentRect
  const { x, y, width, height, top, left, bottom, right } = box
  return {
    ...getPadding(element),
    x,
    y,
    width,
    height,
    top,
    left,
    bottom,
    right,
  }
}

function useMeasure<E extends Element = Element>(): UseMeasureResult<E> {
  const [element, ref] = useState<E | null>()
  const [rect, setRect] = useState<UseMeasureRect>(DEFAULT_MEASUREMENT)

  const observer = useMemo(
    () =>
      typeof window !== 'undefined'
        ? new window.ResizeObserver((entries) => {
            const entry = entries[0]
            if (!entry) return

            setRect(buildRect(entry))
          })
        : undefined,
    [],
  )

  useLayoutEffect(() => {
    if (!element || !observer) return

    observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [observer, element])

  // @ts-expect-error - Some element related type error
  return [ref, rect, element]
}

export default useMeasure
