import { useEffect } from 'react'

function useUpdateWidthOnTargetContainerChange({
  target,
  targetContainer,
}: {
  target: HTMLElement | null
  targetContainer: HTMLElement | null | undefined
}) {
  useEffect(() => {
    const ready = target && targetContainer

    if (!ready) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        if (entry.contentBoxSize) {
          const newWidth = entry.contentRect.width

          target.style.width = `${newWidth}px`
        }
      }
    })

    resizeObserver.observe(targetContainer)

    return () => {
      resizeObserver.unobserve(targetContainer)
    }
  }, [target, targetContainer])
}

export function useStickyNested({
  scrollableArea,
  target,
  targetContainer,
  beacon,
  offset = 0,
}: {
  scrollableArea: HTMLElement | null | undefined
  beacon: HTMLElement | null | undefined
  target: HTMLElement | null
  targetContainer: HTMLElement | null | undefined
  offset?: number
}) {
  useEffect(() => {
    const ready = scrollableArea && target && beacon
    if (!ready) return

    const handleScroll = () => {
      const containerRect = scrollableArea.getBoundingClientRect()
      const beaconRect = beacon.getBoundingClientRect()
      const targetRect = target.getBoundingClientRect()
      const targetWidth = targetRect.width
      const top = containerRect.top + offset

      let constrainedHeight = containerRect.bottom - beaconRect.top - offset

      if (top >= beaconRect.top) {
        constrainedHeight =
          containerRect.bottom - containerRect.top - offset * 2
        target.style.position = 'fixed'
        target.style.top = `${top}px`
        target.style.width = `${targetWidth}px`
      } else if (containerRect.top > 0) {
        target.style.position = 'relative'
        target.style.width = `${targetWidth}px`
        target.style.top = ''
      }
      target.style.maxHeight = `${constrainedHeight}px`
    }

    scrollableArea.addEventListener('scroll', handleScroll)

    handleScroll()

    return () => {
      scrollableArea.removeEventListener('scroll', handleScroll)
    }
  }, [scrollableArea, beacon, target, offset])

  useUpdateWidthOnTargetContainerChange({ target, targetContainer })
}
