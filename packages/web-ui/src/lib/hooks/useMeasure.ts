import { useLayoutEffect, useMemo, useState } from 'react'

export type UseMeasureRect = Pick<
  DOMRectReadOnly,
  'x' | 'y' | 'top' | 'left' | 'right' | 'bottom' | 'height' | 'width'
>
export type UseMeasureRef<E extends Element = Element> = (element: E) => void
export type UseMeasureResult<E extends Element = Element> = [
  UseMeasureRef<E>,
  UseMeasureRect,
  E,
]

const DEFAULT_MEASUREMENT: UseMeasureRect = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  top: 0,
  left: 0,
  bottom: 0,
  right: 0,
}

function useMeasure<E extends Element = Element>(): UseMeasureResult<E> {
  const [element, ref] = useState<E | null>()
  const [rect, setRect] = useState<UseMeasureRect>(DEFAULT_MEASUREMENT)

  const observer = useMemo(
    () =>
      new window.ResizeObserver((entries) => {
        if (!entries[0]) return

        const box = entries[0].contentRect
        const { x, y, width, height, top, left, bottom, right } = box
        setRect({ x, y, width, height, top, left, bottom, right })
      }),
    [],
  )

  useLayoutEffect(() => {
    if (!element) return

    observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [observer, element])

  // @ts-expect-error - Some element related type error
  return [ref, rect, element]
}

export default useMeasure
