'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { TracesPane } from './TracesPane'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { SplitPane } from '@latitude-data/web-ui/atoms/SplitPane'

const LEFT_PANE_WIDTH = 300
const RIGHT_PANE_WIDTH = 400
const MIN_MIDDLE_WIDTH = 650
const HIDE_LEFT_BREAKPOINT = LEFT_PANE_WIDTH + MIN_MIDDLE_WIDTH + RIGHT_PANE_WIDTH

function useLeftPaneVisibility(
  containerRef: React.RefObject<HTMLDivElement | null>,
) {
  const [showLeftPane, setShowLeftPane] = useState<boolean | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      setShowLeftPane((prev) => {
        if (prev !== null) return prev
        return entry.contentRect.width >= HIDE_LEFT_BREAKPOINT
      })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [containerRef])

  return [showLeftPane ?? true, setShowLeftPane] as const
}

export function AnnotationQueueItemView({
  queueId,
  itemId,
}: {
  queueId: number
  itemId: string
}) {
  const { project } = useCurrentProject()
  const containerRef = useRef<HTMLDivElement>(null)
  const [showLeftPane, setShowLeftPane] = useLeftPaneVisibility(containerRef)

  const handleLeftPaneDragStop = useCallback((size: number) => {
    if (size <= LEFT_PANE_WIDTH) {
      setShowLeftPane(false)
    }
  }, [])

  return (
    <div ref={containerRef} className='flex flex-col h-full w-full'>
      <div className='flex flex-row flex-1 min-h-0'>
        {!showLeftPane && (
          <div className='flex-shrink-0 border-r border-border'>
            <Tooltip
              asChild
              side='right'
              trigger={
                <button
                  type='button'
                  className='flex items-center justify-center w-8 h-full hover:bg-secondary transition-colors'
                  onClick={() => setShowLeftPane(true)}
                >
                  <Icon
                    name='chevronsRight'
                    size='small'
                    color='foregroundMuted'
                  />
                </button>
              }
            >
              Show trace details
            </Tooltip>
          </div>
        )}
        <div className='flex-1 min-w-0 h-full'>
          <SplitPane
            direction='horizontal'
            initialSize={LEFT_PANE_WIDTH}
            minSize={LEFT_PANE_WIDTH}
            dragDisabled={!showLeftPane}
            forcedSize={showLeftPane ? undefined : 0}
            onDragStop={handleLeftPaneDragStop}
            firstPane={
              <SplitPane.Pane>
                <div className='h-full overflow-y-auto p-4'>
                  <TracesPane traceId={itemId} projectId={project.id} />
                </div>
              </SplitPane.Pane>
            }
            secondPane={
              <SplitPane.Pane>
                <SplitPane
                  direction='horizontal'
                  reversed
                  initialSize={RIGHT_PANE_WIDTH}
                  minSize={RIGHT_PANE_WIDTH}
                  firstPane={
                    <SplitPane.Pane>
                      <div className='h-full overflow-y-auto p-4'>
                        <Text.H5 color='foregroundMuted'>Messages</Text.H5>
                      </div>
                    </SplitPane.Pane>
                  }
                  secondPane={
                    <SplitPane.Pane>
                      <div className='h-full overflow-y-auto p-4'>
                        <Text.H5 color='foregroundMuted'>Annotations</Text.H5>
                      </div>
                    </SplitPane.Pane>
                  }
                />
              </SplitPane.Pane>
            }
          />
        </div>
      </div>

      <div className='flex-shrink-0 border-t border-border px-4 py-3 flex items-center justify-between'>
        <Text.H5 color='foregroundMuted'>Footer</Text.H5>
      </div>
    </div>
  )
}
