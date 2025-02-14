'use client'
import { ContentCard, ContentCardContainer } from '../ContentCard'
import { Button, Markdown, Text } from '../../../../atoms'
import type {
  ExtractToolArgs,
  ExtractToolResult,
} from '@latitude-data/core/services/latitudeTools/webExtract/types'
import { useEffect, useRef, useState } from 'react'

export function WebExtractLatitudeToolCallContent({
  toolCallId,
  args,
}: {
  toolCallId: string
  args: ExtractToolArgs
}) {
  return (
    <ContentCard
      label='Read webpage'
      icon='globe'
      bgColor='bg-success'
      fgColor='successForeground'
      info={toolCallId}
    >
      <ContentCardContainer copy={args.url}>
        <div className='w-full'>
          <Text.H5>{args.url}</Text.H5>
        </div>
      </ContentCardContainer>
    </ContentCard>
  )
}

const MAX_CLOSED_HEIGHT = 300

export function WebExtractLatitudeToolResponseContent({
  toolCallId,
  response,
}: {
  toolCallId: string
  response: ExtractToolResult
}) {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const [displayOpenButton, setDisplayOpenButton] = useState(false)

  useEffect(() => {
    if (!ref.current) return

    const observer = new ResizeObserver(() => {
      const { height } = ref.current!.getBoundingClientRect()
      setDisplayOpenButton(height > MAX_CLOSED_HEIGHT)
    })

    observer.observe(ref.current)

    return () => {
      observer.disconnect()
    }
  }, [])

  return (
    <ContentCard
      label={response.url}
      icon='globe'
      bgColor='bg-muted'
      fgColor='foregroundMuted'
      info={toolCallId}
    >
      <ContentCardContainer>
        <div
          className='w-full overflow-hidden relative'
          style={{ maxHeight: isOpen ? 'none' : MAX_CLOSED_HEIGHT }}
        >
          <Markdown ref={ref}>{response.content}</Markdown>
          {displayOpenButton && (
            <>
              {!isOpen && (
                <div className='absolute top-0 left-0 w-full h-full bg-gradient-to-b from-transparent to-backgroundCode pointer-events-none' />
              )}
              <div className='absolute bottom-0 right-0 z-10'>
                <Button
                  variant='outline'
                  onClick={() => setIsOpen((prev) => !prev)}
                  className='rounded-full'
                  iconProps={{
                    name: isOpen ? 'minimize' : 'maximize',
                    className: 'my-1.5',
                  }}
                />
              </div>
            </>
          )}
        </div>
      </ContentCardContainer>
    </ContentCard>
  )
}
