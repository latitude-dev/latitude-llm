import type {
  SearchToolArgs,
  SearchToolResult,
} from '@latitude-data/core/services/latitudeTools/webSearch/types'
import {
  ToolContent,
  ToolRequestContent,
} from '@latitude-data/constants/legacyCompiler'
import { useMemo, useState } from 'react'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TruncatedTooltip } from '@latitude-data/web-ui/molecules/TruncatedTooltip'
import {
  ToolCardIcon,
  ToolCardText,
  ToolCardWrapper,
} from '../_components/ToolCard'
import { ToolCardHeader } from '../_components/ToolCard/Header'
import {
  ToolCardContentWrapper,
  ToolCardOutput,
} from '../_components/ToolCard/Content'

function topicText({
  topic,
  days,
}: {
  topic: SearchToolArgs['topic']
  days?: number
}) {
  if (!topic) return undefined
  if (topic === 'general') return undefined

  const uppercaseTopic = topic[0]!.toUpperCase() + topic.slice(1)
  if (!days) return uppercaseTopic

  const daysText = days === 1 ? 'from last day' : `from last ${days} days`
  return `${uppercaseTopic} ${daysText}`
}

function TopicPill({
  topic,
  days,
}: {
  topic: SearchToolArgs['topic']
  days?: number
}) {
  const pillText = useMemo(() => topicText({ topic, days }), [topic, days])
  if (!pillText) return null

  return (
    <div className='rounded-md bg-success opacity-75 inline-block top-0.5 relative'>
      <div className='flex px-2 py-1 items-center gap-2'>
        <Icon
          name={topic === 'news' ? 'newspaper' : 'circleDollarSign'}
          size='small'
          color='successForeground'
        />
        <Text.H6 color='successForeground' noWrap>
          {pillText}
        </Text.H6>
      </div>
    </div>
  )
}

function WebSearchResult({
  result,
}: {
  result: SearchToolResult['results'][number]
}) {
  return (
    <div className='w-full flex flex-col overflow-hidden'>
      <div className='flex flex-col'>
        <TruncatedTooltip content={result.title} className='-mb-1'>
          <Text.H6B ellipsis noWrap>
            {result.title}
          </Text.H6B>
        </TruncatedTooltip>
        <a
          href={result.url}
          target='_blank'
          rel='noreferrer'
          className='w-full nowrap text-nowrap truncate text-primary'
        >
          <Text.H6 color='primary' ellipsis noWrap>
            {result.url}
          </Text.H6>
        </a>
      </div>
      <Text.H6 color='foregroundMuted' ellipsis wordBreak='breakWord'>
        {result.content}
      </Text.H6>
    </div>
  )
}

const isExpectedOutput = (toolResponse: ToolContent | undefined) => {
  // Returns false if the tool response does not contain the expected output
  if (!toolResponse) return false
  if (toolResponse.isError) return false

  if (typeof toolResponse.result !== 'object' || toolResponse.result === null) {
    return false
  }

  if (!('results' in toolResponse.result)) return false
  const results = toolResponse.result.results

  if (!Array.isArray(results)) return false
  if (results.length === 0) return true

  if (
    results.some(
      (result) =>
        typeof result !== 'object' ||
        result === null ||
        !('title' in result) ||
        typeof result.title !== 'string' ||
        !('url' in result) ||
        typeof result.url !== 'string' ||
        !('content' in result) ||
        typeof result.content !== 'string',
    )
  ) {
    return false
  }

  return true
}

function WebSearchOutput({
  toolResponse,
  simulated,
}: {
  toolResponse: ToolContent | undefined
  simulated?: boolean
}) {
  const isExpectedResponse = useMemo(
    () => isExpectedOutput(toolResponse),
    [toolResponse],
  )

  const searchResults = useMemo(() => {
    if (!isExpectedResponse) return []
    return (toolResponse!.result as SearchToolResult).results
  }, [toolResponse, isExpectedResponse])

  if (!toolResponse) {
    return (
      <ToolCardContentWrapper>
        <div className='flex flex-row gap-2 items-center justify-center pb-3'>
          <Icon name='loader' color='foregroundMuted' spin />
          <Text.H5 color='foregroundMuted'>Searching...</Text.H5>
        </div>
      </ToolCardContentWrapper>
    )
  }

  if (!isExpectedResponse) {
    return <ToolCardOutput toolResponse={toolResponse} simulated={simulated} />
  }

  return (
    <ToolCardContentWrapper>
      <div className='flex flex-col gap-4'>
        {searchResults.length ? (
          searchResults.map((result, index) => (
            <WebSearchResult key={index} result={result} />
          ))
        ) : (
          <Text.H5 color='foregroundMuted'>No results found</Text.H5>
        )}
      </div>
    </ToolCardContentWrapper>
  )
}

export function WebSearchLatitudeToolCard({
  toolRequest,
  toolResponse,
  status,
  messageIndex,
  contentBlockIndex,
}: {
  toolRequest: ToolRequestContent
  toolResponse: ToolContent | undefined
  status: 'pending' | 'success' | 'error'
  messageIndex?: number
  contentBlockIndex?: number
}) {
  const [isOpen, setIsOpen] = useState(false)
  const args = toolRequest.args as SearchToolArgs

  return (
    <ToolCardWrapper
      messageIndex={messageIndex}
      contentBlockIndex={contentBlockIndex}
    >
      <ToolCardHeader
        icon={<ToolCardIcon status={status} name='search' />}
        label={
          <div className='flex flex-row flex-grow items-center gap-2'>
            <TopicPill topic={args.topic} days={args.days} />
            <ToolCardText color='foregroundMuted'>"{args.query}"</ToolCardText>
          </div>
        }
        status={status}
        isOpen={isOpen}
        onToggle={() => setIsOpen(!isOpen)}
        simulated={toolRequest._sourceData?.simulated}
      />
      {isOpen && (
        <WebSearchOutput
          toolResponse={toolResponse}
          simulated={toolRequest._sourceData?.simulated}
        />
      )}
    </ToolCardWrapper>
  )
}
