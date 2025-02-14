import type {
  SearchToolArgs,
  SearchToolResult,
} from '@latitude-data/core/services/latitudeTools/webSearch/types'
import {
  CardTextContent,
  ContentCard,
  ContentCardContainer,
} from '../ContentCard'
import { Icon, Text } from '../../../../atoms'
import { TruncatedTooltip } from '../../../TruncatedTooltip'

function TopicPill({
  topic,
  days,
}: {
  topic: SearchToolArgs['topic']
  days?: number
}) {
  if (!topic) return null
  if (topic === 'general') return null

  return (
    <div className='rounded-md bg-success opacity-75 inline-block mr-2 top-0.5 relative'>
      <div className='flex px-2 py-1 items-center gap-2'>
        <Icon
          name={topic === 'news' ? 'newspaper' : 'circleDollarSign'}
          size='small'
          color='successForeground'
        />
        <Text.H6 color='successForeground'>
          {topic[0]!.toUpperCase()}
          {topic.slice(1)}
          {topic === 'news' && days ? ` from last ${days} days` : ''}
        </Text.H6>
      </div>
    </div>
  )
}

export function WebSearchLatitudeToolCallContent({
  toolCallId,
  args,
}: {
  toolCallId: string
  args: SearchToolArgs
}) {
  return (
    <ContentCard
      label='Search the web'
      icon='search'
      bgColor='bg-success'
      fgColor='successForeground'
      info={toolCallId}
    >
      <ContentCardContainer copy={args.query}>
        <div className='w-full'>
          <TopicPill topic={args.topic} days={args.days} />
          <Text.H5>{args.query}</Text.H5>
        </div>
      </ContentCardContainer>
    </ContentCard>
  )
}

function WebSearchResult({
  result,
}: {
  result: SearchToolResult['results'][number]
}) {
  return (
    <div className='w-full flex flex-col overflow-hidden'>
      <TruncatedTooltip content={result.title} className='-mb-1'>
        <Text.H6B ellipsis noWrap>
          {result.title}
        </Text.H6B>
      </TruncatedTooltip>
      <a
        href={result.url}
        target='_blank'
        rel='noreferrer'
        className='w-full overflow-hidden nowrap text-nowrap truncate text-primary'
      >
        <Text.H6 color='primary' ellipsis noWrap>
          {result.url}
        </Text.H6>
      </a>
      <Text.H6
        color='foregroundMuted'
        ellipsis
        lineClamp={3}
        wordBreak='breakWord'
      >
        {result.content}
      </Text.H6>
    </div>
  )
}

export function WebSearchLatitudeToolResponseContent({
  toolCallId,
  response,
}: {
  toolCallId: string
  response: SearchToolResult | string
}) {
  return (
    <ContentCard
      label='Search results'
      icon='search'
      bgColor='bg-muted'
      fgColor='foregroundMuted'
      info={toolCallId}
    >
      {typeof response === 'string' ? (
        <CardTextContent value={response} color='foregroundMuted' />
      ) : (
        <ContentCardContainer>
          <div className='w-full flex flex-col gap-4'>
            {response.answer && (
              <Text.H6M color='primary'>{response.answer}</Text.H6M>
            )}
            {response.results.map((result, index) => (
              <WebSearchResult key={index} result={result} />
            ))}
          </div>
        </ContentCardContainer>
      )}
    </ContentCard>
  )
}
