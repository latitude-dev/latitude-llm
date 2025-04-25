'use client'

import { memo, ReactNode, useEffect, useMemo, useState } from 'react'

import {
  ContentType,
  FileContent,
  ImageContent,
  MessageContent,
  type MessageRole,
  PromptlSourceRef,
  TextContent,
  ToolContent,
} from '@latitude-data/compiler'

import { cn } from '../../../../lib/utils'
import { Badge, BadgeProps } from '../../../atoms/Badge'
import { CodeBlock } from '../../../atoms/CodeBlock'
import { Icon, IconName } from '../../../atoms/Icons'
import { Image } from '../../../atoms/Image'
import { Skeleton } from '../../../atoms/Skeleton'
import { Text } from '../../../atoms/Text'
import { Tooltip } from '../../../atoms/Tooltip'
import { colors, font, TextColor } from '../../../tokens'
import { roleVariant } from '..'
import { isAgentToolResponse, roleToString } from './helpers'
import { ToolCallContent } from './ToolCall'
import { UnresolvedToolResultContent } from './ToolResult'
import { AgentToolsMap } from '@latitude-data/constants'
import { Button } from '../../../atoms/Button'

export { roleToString, roleVariant } from './helpers'

export type MessageProps = {
  role: string
  content: MessageContent[] | string
  className?: string
  size?: 'default' | 'small'
  animatePulse?: boolean
  parameters?: string[]
  collapseParameters?: boolean
  agentToolsMap?: AgentToolsMap
  toolContentMap?: Record<string, ToolContent>
}

export function MessageItem({
  children,
  badgeLabel,
  badgeVariant,
  badgeIcon,
  animatePulse = false,
}: {
  children: (renderProps: { collapsedMessage: boolean }) => ReactNode
  badgeLabel: string
  badgeVariant: BadgeProps['variant']
  badgeIcon?: IconName
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
        <Badge variant={badgeVariant}>
          {badgeIcon && <Icon name={badgeIcon} size='small' className='mr-2' />}
          {badgeLabel}
        </Badge>
      </div>
      <div className='flex w-full flex-row items-stretch gap-4 pl-4'>
        <div
          className='flex-shrink-0 bg-muted w-1 rounded-lg cursor-pointer hover:bg-primary transition-colors'
          onClick={() => setCollapseMessage(!collapsedMessage)}
        />
        <div className='flex flex-grow flex-col gap-1 overflow-x-auto'>
          {children({ collapsedMessage })}
        </div>
      </div>
    </div>
  )
}

export const Message = memo(
  ({
    role,
    content,
    animatePulse = false,
    size = 'default',
    parameters = [],
    collapseParameters = false,
    agentToolsMap,
    toolContentMap,
  }: MessageProps) => {
    if (isAgentToolResponse({ role: role as MessageRole, content })) {
      return null
    }
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
            agentToolsMap={agentToolsMap}
            toolContentMap={toolContentMap}
          />
        )}
      </MessageItem>
    )
  },
)

export function MessageItemContent({
  content,
  size = 'default',
  parameters = [],
  collapseParameters = false,
  collapsedMessage,
  agentToolsMap,
  toolContentMap,
}: {
  content: MessageProps['content']
  size?: MessageProps['size']
  parameters?: MessageProps['parameters']
  collapseParameters?: MessageProps['collapseParameters']
  collapsedMessage: boolean
  agentToolsMap?: AgentToolsMap
  toolContentMap?: Record<string, ToolContent>
}) {
  if (collapsedMessage)
    return (
      <Content
        value='...'
        color='foregroundMuted'
        size={size}
        agentToolsMap={agentToolsMap}
      />
    )

  if (typeof content === 'string')
    return (
      <Content
        value={content}
        color='foregroundMuted'
        size={size}
        agentToolsMap={agentToolsMap}
      />
    )

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
      agentToolsMap={agentToolsMap}
      toolContentMap={toolContentMap}
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
  agentToolsMap,
  toolContentMap,
}: {
  index?: number
  color: TextColor
  value: string | MessageContent
  size?: 'default' | 'small'
  parameters?: string[]
  collapseParameters?: boolean
  sourceMap?: PromptlSourceRef[]
  agentToolsMap?: AgentToolsMap
  toolContentMap?: Record<string, ToolContent>
}) => {
  if (typeof value === 'string') {
    try {
      const parsedValue = JSON.parse(value)
      return (
        <div key={`${index}`} className='py-2 max-w-full'>
          <div className='overflow-hidden rounded-xl w-full'>
            <CodeBlock language='json'>
              {JSON.stringify(parsedValue, null, 2)}
            </CodeBlock>
          </div>
        </div>
      )
    } catch (_) {
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
  }

  if (value.type === ContentType.text) {
    try {
      const parsedValue = JSON.parse(value.text || '')
      return (
        <div key={`${index}`} className='py-2 max-w-full'>
          <div className='overflow-hidden rounded-xl w-full'>
            <CodeBlock language='json'>
              {JSON.stringify(parsedValue, null, 2)}
            </CodeBlock>
          </div>
        </div>
      )
    } catch (_) {
      return (
        <ContentText
          index={index}
          color={color}
          size={size}
          reasoning={value.reasoning}
          isReasoning={value.isReasoning}
          message={value.text}
          parameters={parameters}
          collapseParameters={collapseParameters}
          sourceMap={sourceMap}
        />
      )
    }
  }

  if (value.type === ContentType.image) {
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
  }

  if (value.type === ContentType.file) {
    return (
      <ContentFile
        index={index}
        color={color}
        size={size}
        file={value.file}
        parameters={parameters}
        collapseParameters={collapseParameters}
        sourceMap={sourceMap}
      />
    )
  }

  if (value.type === ContentType.toolCall) {
    return (
      <ToolCallContent
        value={value}
        agentToolsMap={agentToolsMap}
        toolContentMap={toolContentMap}
      />
    )
  }

  if (value.type === ContentType.toolResult) {
    return <UnresolvedToolResultContent value={value} />
  }

  return (
    <ContentText
      index={index}
      color={color}
      size={size}
      message={'<Content type not supported>'}
    />
  )
}

type Reference = {
  identifier?: string
  content: string
  type: ContentType
}
type Segment = string | Reference

const ContentText = memo(
  ({
    index = 0,
    color,
    size,
    message,
    reasoning,
    isReasoning,
    parameters = [],
    collapseParameters = false,
    sourceMap = [],
  }: {
    index?: number
    color: TextColor
    size?: 'default' | 'small'
    message: TextContent['text']
    reasoning?: TextContent['reasoning']
    isReasoning?: boolean
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
    const messagesList = groups.map((group, groupIndex) => (
      <TextComponent
        color={color}
        whiteSpace='preWrap'
        key={`${index}-group-${groupIndex}`}
      >
        {group.length > 0
          ? group.map((segment, segmentIndex) => (
              <span
                key={`${index}-group-${groupIndex}-segment-${segmentIndex}`}
              >
                {typeof segment === 'string' ? (
                  segment
                ) : (
                  <ReferenceComponent
                    reference={segment}
                    collapseParameters={collapseParameters}
                  />
                )}
              </span>
            ))
          : '\n'}
      </TextComponent>
    ))

    return (
      <div className='flex flex-col gap-4'>
        <Reasoning reasoning={reasoning} isReasoning={isReasoning} />
        {messagesList}
      </div>
    )
  },
)

function Reasoning({
  reasoning,
  isReasoning = false,
}: {
  reasoning?: string
  isReasoning?: boolean
}) {
  const [collapsed, setCollapsed] = useState(true)

  if (!reasoning) return null

  return (
    <div className='flex flex-col gap-2'>
      <Button
        variant='nope'
        onClick={() => setCollapsed(!collapsed)}
        className='flex flex-row justify-start'
      >
        <div className='flex flex-row gap-2 items-center'>
          <div className={cn({ 'opacity-50': !isReasoning })}>
            <Text.H6 animate={isReasoning} color='foregroundMuted'>
              {isReasoning ? 'Thinking...' : 'Thought for a while'}
            </Text.H6>
          </div>
          <div className='opacity-50'>
            <Icon
              name={collapsed ? 'chevronDown' : 'chevronUp'}
              color='foregroundMuted'
            />
          </div>
        </div>
      </Button>
      {!collapsed && (
        <div className='opacity-50 text-left'>
          <Text.H6 color='foregroundMuted'>{reasoning}</Text.H6>
        </div>
      )}
    </div>
  )
}

function ReferenceComponent({
  reference,
  collapseParameters,
}: {
  reference: Reference
  collapseParameters: boolean
}) {
  const [collapseReference, setCollapseReference] = useState(collapseParameters)
  useEffect(() => {
    setCollapseReference(collapseParameters)
  }, [collapseParameters])

  if (collapseReference) {
    return (
      <Tooltip
        asChild
        variant={reference.type === ContentType.text ? 'inverse' : 'ghost'}
        trigger={
          reference.identifier ? (
            <Badge
              variant='accent'
              className='cursor-pointer inline-flex'
              onClick={() => setCollapseReference(!collapseReference)}
            >
              &#123;&#123;{reference.identifier}&#125;&#125;
            </Badge>
          ) : (
            <span
              className={cn(
                colors.textColors.accentForeground,
                'cursor-pointer',
              )}
              onClick={() => setCollapseReference(!collapseReference)}
            >
              (...)
            </span>
          )
        }
      >
        {reference.type === ContentType.text && (
          <div className='line-clamp-6'>{reference.content}</div>
        )}
        {reference.type === ContentType.image && (
          <Image
            src={reference.content}
            className='max-h-72 rounded-xl w-fit object-contain'
          />
        )}
        {reference.type === ContentType.file && (
          <FileComponent src={reference.content} />
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
            [font.weight.semibold]: !!reference.identifier,
            inline: reference.type === ContentType.text,
            'inline-flex py-2': reference.type !== ContentType.text,
          })}
          onClick={() => setCollapseReference(!collapseReference)}
        >
          {reference.type === ContentType.text && <>{reference.content}</>}
          {reference.type === ContentType.image && (
            <Image src={reference.content} className='max-h-72 rounded-xl' />
          )}
          {reference.type === ContentType.file && (
            <FileComponent src={reference.content} />
          )}
        </span>
      }
    >
      <div className='line-clamp-6'>{reference.identifier || 'dynamic'}</div>
    </Tooltip>
  )
}

function FileComponent({ src }: { src: string }) {
  const [isHovering, setIsHovering] = useState(false)

  return (
    <a
      href={src}
      target='_blank'
      rel='noopener noreferrer'
      className={cn(
        'flex flex-row p-4 gap-2 rounded-xl w-fit items-center',
        'text-muted-foreground hover:text-accent-foreground transition-colors',
        'bg-muted hover:bg-accent',
      )}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <Icon
        name={isHovering ? 'fileDown' : 'file'}
        color={isHovering ? 'accentForeground' : 'foregroundMuted'}
      />
      <Text.H5
        whiteSpace='preWrap'
        wordBreak='breakAll'
        color={isHovering ? 'accentForeground' : 'foregroundMuted'}
      >
        {src.split('/').at(-1)}
      </Text.H5>
    </a>
  )
}

function computeSegments(
  type: ContentType,
  source: string | undefined,
  sourceMap: PromptlSourceRef[],
  parameters: string[],
): Segment[] {
  let segments: Segment[] = []
  if (!source) return segments

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

function isValidUrl(url: unknown) {
  const isUrl =
    url instanceof URL || (typeof url === 'string' && URL.canParse(url))
  if (!isUrl) return false

  if (url.toString().startsWith('https')) return true
  if (url.toString().startsWith('http://localhost')) return true

  return false
}

const ContentImage = memo(
  ({
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

    if (!isValidUrl(image)) {
      const TextComponent = size === 'small' ? Text.H6 : Text.H5

      return (
        <div className='flex flex-row p-4 gap-2 bg-muted rounded-xl w-fit items-center'>
          <Icon name='imageOff' color='foregroundMuted' />
          <TextComponent
            color={color}
            whiteSpace='preWrap'
            wordBreak='breakAll'
          >
            {'<Image preview unavailable>'}
          </TextComponent>
        </div>
      )
    }

    const TextComponent = size === 'small' ? Text.H6 : Text.H5

    if (!segment || typeof segment === 'string') {
      return (
        <Image
          src={image.toString()}
          className='max-h-72 rounded-xl w-fit object-contain'
        />
      )
    }

    return (
      <TextComponent
        key={index}
        color={color}
        whiteSpace='preWrap'
        wordBreak='breakAll'
      >
        {typeof segment === 'string' ? (
          segment
        ) : (
          <ReferenceComponent
            reference={segment}
            collapseParameters={collapseParameters}
          />
        )}
      </TextComponent>
    )
  },
)

const ContentFile = memo(
  ({
    index = 0,
    color,
    size,
    file,
    parameters = [],
    collapseParameters = false,
    sourceMap = [],
  }: {
    index?: number
    color: TextColor
    size?: 'default' | 'small'
    file: FileContent['file']
    parameters?: string[]
    collapseParameters?: boolean
    sourceMap?: PromptlSourceRef[]
  }) => {
    const segment = useMemo(
      () =>
        computeSegments(
          ContentType.file,
          file.toString(),
          sourceMap,
          parameters,
        ),
      [file, sourceMap, parameters],
    )[0]

    if (!isValidUrl(file)) {
      return (
        <div className='flex flex-row p-4 gap-2 bg-muted rounded-xl w-fit items-center'>
          <Icon name='fileOff' color='foregroundMuted' />
          <Text.H5 color={color} whiteSpace='preWrap' wordBreak='breakAll'>
            {'<File preview unavailable>'}
          </Text.H5>
        </div>
      )
    }

    const TextComponent = size === 'small' ? Text.H6 : Text.H5

    if (!segment || typeof segment === 'string') {
      return <FileComponent src={file.toString()} />
    }

    return (
      <TextComponent
        color={color}
        whiteSpace='preWrap'
        wordBreak='breakAll'
        key={`${index}`}
      >
        <ReferenceComponent
          reference={segment}
          collapseParameters={collapseParameters}
        />
      </TextComponent>
    )
  },
)
