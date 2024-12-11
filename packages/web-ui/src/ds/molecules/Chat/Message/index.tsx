'use client'

import { ReactNode, useEffect, useMemo, useState } from 'react'

import {
  ContentType,
  ImageContent,
  MessageContent,
  PromptlSourceRef,
  TextContent,
  ToolContent,
  ToolRequestContent,
} from '@latitude-data/compiler'

import { cn } from '../../../../lib/utils'
import {
  Badge,
  BadgeProps,
  CodeBlock,
  Image,
  Skeleton,
  Text,
  Tooltip,
} from '../../../atoms'
import { colors, font, TextColor } from '../../../tokens'
import { roleToString, roleVariant } from './helpers'

export { roleToString, roleVariant } from './helpers'

export type MessageProps = {
  role: string
  content: MessageContent[] | string
  className?: string
  size?: 'default' | 'small'
  animatePulse?: boolean
  parameters?: string[]
  collapseParameters?: boolean
}

export function MessageItem({
  children,
  badgeLabel,
  badgeVariant,
  animatePulse = false,
}: {
  children: (renderProps: { collapsedMessage: boolean }) => ReactNode
  badgeLabel: string
  badgeVariant: BadgeProps['variant']
  animatePulse?: boolean
}) {
  const [collapsedMessage, setCollapseMessage] = useState(false)
  return (
    <div
      className={cn('flex flex-col gap-1 w-full items-start', {
        'animate-pulse': animatePulse,
      })}
    >
      <div>
        <Badge variant={badgeVariant}>{badgeLabel}</Badge>
      </div>
      <div className='flex w-full flex-row items-stretch gap-4 pl-4'>
        <div
          className='flex-shrink-0 bg-muted w-1 rounded-lg cursor-pointer hover:bg-primary transition-colors'
          onClick={() => setCollapseMessage(!collapsedMessage)}
        />
        <div className='flex flex-1 flex-col gap-1'>
          {children({ collapsedMessage })}
        </div>
      </div>
    </div>
  )
}

export function Message({
  role,
  content,
  animatePulse = false,
  size = 'default',
  parameters = [],
  collapseParameters = false,
}: MessageProps) {
  return (
    <MessageItem
      animatePulse={animatePulse}
      badgeLabel={roleToString(role)}
      badgeVariant={roleVariant(role)}
    >
      {({ collapsedMessage }) => (
        <MessageItemContent
          content={content}
          size={size}
          parameters={parameters}
          collapseParameters={collapseParameters}
          collapsedMessage={collapsedMessage}
        />
      )}
    </MessageItem>
  )
}

export function MessageItemContent({
  content,
  size = 'default',
  parameters = [],
  collapseParameters = false,
  collapsedMessage,
}: {
  content: MessageProps['content']
  size?: MessageProps['size']
  parameters?: MessageProps['parameters']
  collapseParameters?: MessageProps['collapseParameters']
  collapsedMessage: boolean
}) {
  if (collapsedMessage)
    return <Content value='...' color='foregroundMuted' size={size} />

  if (typeof content === 'string')
    return <Content value={content} color='foregroundMuted' size={size} />

  return content.map((c, idx) => (
    <Content
      key={idx}
      index={idx}
      color='foregroundMuted'
      value={c}
      size={size}
      parameters={parameters}
      collapseParameters={collapseParameters}
      sourceMap={(c as any)?._promptlSourceMap}
    />
  ))
}

export function MessageSkeleton({ role }: { role: string }) {
  return (
    <div className='flex flex-col gap-1 w-full items-start animate-pulse'>
      <div>
        <Badge variant={roleVariant(role)}>{roleToString(role)}</Badge>
      </div>
      <div className='flex flex-row items-stretch gap-4 pl-4 w-full'>
        <div className='flex-shrink-0 bg-muted w-1 rounded-lg' />
        <div className='flex flex-col gap-1 flex-grow min-w-0'>
          <Skeleton height='h5' className='w-1/2' />
          <Skeleton height='h5' className='w-3/4' />
        </div>
      </div>
    </div>
  )
}

const Content = ({
  index = 0,
  color,
  value,
  size,
  parameters = [],
  collapseParameters = false,
  sourceMap = [],
}: {
  index?: number
  color: TextColor
  value: string | MessageContent
  size?: 'default' | 'small'
  parameters?: string[]
  collapseParameters?: boolean
  sourceMap?: PromptlSourceRef[]
}) => {
  if (typeof value === 'string') {
    return (
      <ContentText
        index={index}
        color={color}
        size={size}
        message={value}
        parameters={parameters}
        collapseParameters={collapseParameters}
        sourceMap={sourceMap}
      />
    )
  }

  switch (value.type) {
    case ContentType.text:
      return (
        <ContentText
          index={index}
          color={color}
          size={size}
          message={value.text}
          parameters={parameters}
          collapseParameters={collapseParameters}
          sourceMap={sourceMap}
        />
      )

    case ContentType.image:
      return (
        <ContentImage
          index={index}
          color={color}
          size={size}
          image={value.image}
          parameters={parameters}
          collapseParameters={collapseParameters}
          sourceMap={sourceMap}
        />
      )

    case ContentType.toolCall:
      return (
        <div key={`${index}`} className='pt-2 w-full'>
          <div className='overflow-hidden rounded-lg w-full'>
            <CodeBlock language='json'>
              {JSON.stringify(value as ToolRequestContent, null, 2)}
            </CodeBlock>
          </div>
        </div>
      )

    case ContentType.toolResult:
      return (
        <div key={`${index}`} className='pt-2 w-full'>
          <div className='overflow-hidden rounded-lg w-full'>
            <CodeBlock language='json'>
              {JSON.stringify(value as ToolContent, null, 2)}
            </CodeBlock>
          </div>
        </div>
      )

    default:
      return (
        <ContentText
          index={index}
          color={color}
          size={size}
          message={'<Content type not supported>'}
        />
      )
  }
}

type Reference = {
  identifier?: string
  content: string
  type: ContentType
}
type Segment = string | Reference

const ContentText = ({
  index = 0,
  color,
  size,
  message,
  parameters = [],
  collapseParameters = false,
  sourceMap = [],
}: {
  index?: number
  color: TextColor
  size?: 'default' | 'small'
  message: TextContent['text']
  parameters?: string[]
  collapseParameters?: boolean
  sourceMap?: PromptlSourceRef[]
}) => {
  const TextComponent = size === 'small' ? Text.H6 : Text.H5

  const segments = useMemo(
    () => computeSegments(ContentType.text, message, sourceMap, parameters),
    [message, sourceMap, parameters],
  )
  const groups = useMemo(() => groupSegments(segments), [segments])

  return groups.map((group, groupIndex) => (
    <TextComponent
      color={color}
      whiteSpace='preWrap'
      wordBreak='breakAll'
      key={`${index}-group-${groupIndex}`}
    >
      {group.length > 0
        ? group.map((segment, segmentIndex) => (
            <span key={`${index}-group-${groupIndex}-segment-${segmentIndex}`}>
              <SegmentComponent
                segment={segment}
                collapseParameters={collapseParameters}
              />
            </span>
          ))
        : '\n'}
    </TextComponent>
  ))
}

function SegmentComponent({
  segment,
  collapseParameters,
}: {
  segment: Segment
  collapseParameters: boolean
}) {
  if (typeof segment === 'string') {
    return segment
  }

  if (segment.identifier) {
    return IdentifierSegment(segment, collapseParameters)
  }

  return DynamicSegment(segment, collapseParameters)
}

function IdentifierSegment(segment: Reference, collapseParameters: boolean) {
  const [collapseSegment, setCollapseSegment] = useState(collapseParameters)
  useEffect(() => {
    setCollapseSegment(collapseParameters)
  }, [collapseParameters])

  if (collapseSegment) {
    return (
      <Tooltip
        asChild
        variant={segment.type === ContentType.image ? 'ghost' : 'inverse'}
        trigger={
          <Badge
            variant='accent'
            className='cursor-pointer'
            onClick={() => setCollapseSegment(!collapseSegment)}
          >
            &#123;&#123;{segment.identifier}&#125;&#125;
          </Badge>
        }
      >
        {segment.type === ContentType.text && (
          <div className='line-clamp-6'>{segment.content}</div>
        )}
        {segment.type === ContentType.image && (
          <Image src={segment.content} className='max-h-72 rounded-xl' />
        )}
      </Tooltip>
    )
  }

  return (
    <Tooltip
      asChild
      trigger={
        <span
          className={cn(
            colors.textColors.accentForeground,
            font.weight.semibold,
            'cursor-pointer',
            {
              inline: segment.type === ContentType.text,
              'inline-flex py-2': segment.type === ContentType.image,
            },
          )}
          onClick={() => setCollapseSegment(!collapseSegment)}
        >
          {segment.type === ContentType.text && <>{segment.content}</>}
          {segment.type === ContentType.image && (
            <Image src={segment.content} className='max-h-72 rounded-xl' />
          )}
        </span>
      }
    >
      <div className='line-clamp-6'>{segment.identifier}</div>
    </Tooltip>
  )
}

function DynamicSegment(segment: Reference, collapseParameters: boolean) {
  const [collapseSegment, setCollapseSegment] = useState(collapseParameters)
  useEffect(() => {
    setCollapseSegment(collapseParameters)
  }, [collapseParameters])

  if (collapseSegment) {
    return (
      <Tooltip
        asChild
        variant={segment.type === ContentType.image ? 'ghost' : 'inverse'}
        trigger={
          <span
            className={cn(colors.textColors.accentForeground, 'cursor-pointer')}
            onClick={() => setCollapseSegment(!collapseSegment)}
          >
            (...)
          </span>
        }
      >
        {segment.type === ContentType.text && (
          <div className='line-clamp-6'>{segment.content}</div>
        )}
        {segment.type === ContentType.image && (
          <Image src={segment.content} className='max-h-72 rounded-xl' />
        )}
      </Tooltip>
    )
  }

  return (
    <Tooltip
      asChild
      trigger={
        <span
          className={cn(colors.textColors.accentForeground, 'cursor-pointer', {
            inline: segment.type === ContentType.text,
            'inline-flex py-2': segment.type === ContentType.image,
          })}
          onClick={() => setCollapseSegment(!collapseSegment)}
        >
          {segment.type === ContentType.text && <>{segment.content}</>}
          {segment.type === ContentType.image && (
            <Image src={segment.content} className='max-h-72 rounded-xl' />
          )}
        </span>
      }
    >
      <div className='line-clamp-6'>dynamic</div>
    </Tooltip>
  )
}

function computeSegments(
  type: ContentType,
  source: string,
  sourceMap: PromptlSourceRef[],
  parameters: string[],
): Segment[] {
  let segments: Segment[] = []

  // Filter source map references without value
  sourceMap = sourceMap.filter(
    (ref) => source.slice(ref.start, ref.end).trim().length > 0,
  )

  // Sort source map to ensure references are ordered
  sourceMap = sourceMap.sort((a, b) => a.start - b.start)

  const firstSegment = source.slice(0, sourceMap[0]?.start ?? source.length)
  if (firstSegment.length > 0) segments.push(firstSegment)

  for (let i = 0; i < sourceMap.length; i++) {
    segments.push({
      identifier:
        sourceMap[i]!.identifier &&
        parameters.includes(sourceMap[i]!.identifier!)
          ? sourceMap[i]!.identifier!
          : undefined,
      content: source.slice(sourceMap[i]!.start, sourceMap[i]!.end),
      type: type,
    })

    const nextSegment = source.slice(
      sourceMap[i]!.end,
      sourceMap[i + 1]?.start ?? source.length,
    )
    if (nextSegment.length > 0) segments.push(nextSegment)
  }

  return segments
}

function groupSegments(segments: Segment[]) {
  let groups: Segment[][] = []
  let currentGroup: Segment[] = []

  for (const segment of segments) {
    if (typeof segment === 'string') {
      const subsegments = segment.split('\n')
      for (let i = 0; i < subsegments.length; i++) {
        if (subsegments[i]!.length > 0) currentGroup.push(subsegments[i]!)
        if (i < subsegments.length - 1) {
          groups.push(currentGroup)
          currentGroup = []
        }
      }
    } else {
      currentGroup.push(segment)
    }
  }

  if (currentGroup.length > 0) groups.push(currentGroup)

  return groups
}

const ContentImage = ({
  index = 0,
  color,
  size,
  image,
  parameters = [],
  collapseParameters = false,
  sourceMap = [],
}: {
  index?: number
  color: TextColor
  size?: 'default' | 'small'
  image: ImageContent['image']
  parameters?: string[]
  collapseParameters?: boolean
  sourceMap?: PromptlSourceRef[]
}) => {
  if (
    (typeof image !== 'string' && !(image instanceof URL)) ||
    (!image.toString().startsWith('https') &&
      !image.toString().startsWith('http://localhost'))
  ) {
    return (
      <ContentText
        index={index}
        color={color}
        size={size}
        message={'<Image preview unavailable>'}
      />
    )
  }

  const TextComponent = size === 'small' ? Text.H6 : Text.H5

  const segment = useMemo(
    () =>
      computeSegments(
        ContentType.image,
        image.toString(),
        sourceMap,
        parameters,
      ),
    [image, sourceMap, parameters],
  )[0]

  if (!segment) return null

  return (
    <TextComponent
      color={color}
      whiteSpace='preWrap'
      wordBreak='breakAll'
      key={`${index}`}
    >
      <SegmentComponent
        segment={segment}
        collapseParameters={collapseParameters}
      />
    </TextComponent>
  )
}
