import { RefObject, useCallback, useEffect, useState } from 'react'

function useDynamicHeight({
  ref,
  paddingBottom,
}: {
  ref: RefObject<HTMLElement>
  paddingBottom?: number
}) {
  const [height, setHeight] = useState<string | number>('auto')

  const calculateHeight = useCallback(
    (element: HTMLElement) => {
      const topPosition = element.getBoundingClientRect().top
      const windowHeight = paddingBottom
        ? window.innerHeight - paddingBottom
        : window.innerHeight
      setHeight(windowHeight - topPosition)
    },
    [setHeight, paddingBottom],
  )

  useEffect(() => {
    const element = ref.current
    if (!element) return

    calculateHeight(element)

    const resizeObserver = new ResizeObserver(() => {
      calculateHeight(element)
    })

    resizeObserver.observe(document.body)
    return () => {
      resizeObserver.disconnect()
    }
  }, [ref])

  return height
}

export default useDynamicHeight
