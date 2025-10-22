'use client'
import type {
  ExtractToolArgs,
  ExtractToolResult,
} from '@latitude-data/core/services/latitudeTools/webExtract/types'
import { useMemo, useState } from 'react'
import {
  ToolContent,
  ToolRequestContent,
} from '@latitude-data/constants/legacyCompiler'
import { Markdown } from '@latitude-data/web-ui/atoms/Markdown'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  ToolCardIcon,
  ToolCardText,
  ToolCardWrapper,
} from '../_components/ToolCard'
import { ToolCardHeader } from '../_components/ToolCard/Header'
import { ToolCardContentWrapper } from '../_components/ToolCard/Content'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'

export function WebExtractLatitudeToolCard({
  toolRequest,
  toolResponse,
  status,
}: {
  toolRequest: ToolRequestContent
  toolResponse: ToolContent | undefined
  status: 'pending' | 'success' | 'error'
}) {
  const [isOpen, setIsOpen] = useState(false)

  const markdownContent = useMemo(() => {
    if (!toolResponse || toolResponse.isError) return undefined
    return (toolResponse.result as ExtractToolResult).content
  }, [toolResponse])

  const args = toolRequest.args as ExtractToolArgs

  return (
    <ToolCardWrapper>
      <ToolCardHeader
        icon={<ToolCardIcon status={status} name='globe' />}
        label={<ToolCardText color='foregroundMuted'>{args.url}</ToolCardText>}
        status={status}
        isOpen={isOpen}
        onToggle={() => setIsOpen(!isOpen)}
      />
      {isOpen && (
        <ToolCardContentWrapper>
          {toolResponse ? (
            toolResponse.isError ? (
              <div className='w-full pt-3 items-center'>
                <Alert
                  variant='destructive'
                  title='Error'
                  description={JSON.stringify(toolResponse.result, null, 2)}
                />
              </div>
            ) : (
              <div className='flex flex-col gap-4'>
                {markdownContent ? (
                  <Markdown size='sm' color='primary'>
                    {markdownContent}
                  </Markdown>
                ) : (
                  <Text.H5 color='foregroundMuted'>No content</Text.H5>
                )}
              </div>
            )
          ) : (
            <div className='flex flex-row gap-2 items-center justify-center pb-3'>
              <Icon name='loader' color='foregroundMuted' spin />
              <Text.H5 color='foregroundMuted'>Loading page...</Text.H5>
            </div>
          )}
        </ToolCardContentWrapper>
      )}
    </ToolCardWrapper>
  )
}
