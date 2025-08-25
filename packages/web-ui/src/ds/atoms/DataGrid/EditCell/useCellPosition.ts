import { useCallback, useState } from 'react'

const OUTLINE_BORDER = 1
type CellPosition = {
  handleEl: HTMLElement
  top: number
  left: number
  width: number
  container: HTMLElement
}
type ReturnType =
  | {
      showCell: true
      position: CellPosition
      handleRef: (el: HTMLDivElement | null) => void
    }
  | {
      showCell: false
      position: null
      handleRef: (el: HTMLDivElement | null) => void
    }
export function useCellPosition(): ReturnType {
  const [position, setPosition] = useState<CellPosition | null>(null)

  const handleRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return

    const cellRect = el.getBoundingClientRect()
    const gridWrapperEl = el.closest('[role="grid-wrapper"]') as HTMLElement | null

    if (!gridWrapperEl) return

    const preferredWidth = cellRect.width
    const gridScrollLeft = gridWrapperEl.scrollLeft
    const gridScrollTop = gridWrapperEl.scrollTop
    const gridRect = gridWrapperEl.getBoundingClientRect()

    const relativeLeft = cellRect.left - gridRect.left + gridScrollLeft
    const relativeTop = cellRect.top - gridRect.top + gridScrollTop

    setPosition({
      handleEl: el,
      top: relativeTop - OUTLINE_BORDER,
      left: relativeLeft - OUTLINE_BORDER,
      width: preferredWidth,
      container: gridWrapperEl,
    })
  }, [])

  if (!position) return { handleRef, position: null, showCell: false }

  return { handleRef, position, showCell: true }
}
