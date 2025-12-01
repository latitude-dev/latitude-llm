import { ReactNode, RefObject, useRef } from 'react'
import { usePanelDomRef } from '@latitude-data/web-ui/atoms/SplitPane'
import { useStickyNested } from '$/hooks/useStickyNested'

const DETAILS_OFFSET = { top: 12, bottom: 12 }

/**
 * This component is responsible of all the sticky logic for the Trace view.
 * It uses a beacon (the table header) to calculate the sticky position of its content.
 * It requires a containerRef to calculate the boundaries of the sticky element.
 *
 * If you remove this component, you will do the world uglier.
 */
export function TracePanel({
  children,
  panelContainerRef,
  panelRef,
}: {
  children: (renderProps: {
    ref: RefObject<HTMLDivElement | null>
  }) => ReactNode
  panelContainerRef: RefObject<HTMLDivElement | null>
  panelRef: RefObject<HTMLTableElement | null>
}) {
  const ref = useRef<HTMLDivElement>(null)
  const scrollableArea = usePanelDomRef({ selfRef: ref.current })
  const beacon = panelRef?.current
  useStickyNested({
    scrollableArea,
    beacon,
    target: ref.current,
    targetContainer: panelContainerRef?.current,
    offset: DETAILS_OFFSET,
  })
  return (
    <div ref={panelContainerRef} className='h-full'>
      {children({ ref })}
    </div>
  )
}
