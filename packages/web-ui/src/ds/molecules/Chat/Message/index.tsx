'use client'

import { ReactNode, useEffect, useMemo, useState } from 'react'

import {
  ContentType,
  FileContent,
  ImageContent,
  MessageContent,
  MessageRole,
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
  Icon,
  IconName,
  Image,
  Skeleton,
  Text,
  Tooltip,
} from '../../../atoms'
import { colors, font, TextColor } from '../../../tokens'
import { roleToString, roleVariant } from './helpers'
import { AGENT_RETURN_TOOL_NAME } from '@latitude-data/core/browser'

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

export function Message({
  role,
  content,
  animatePulse = false,
  size = 'default',
  parameters = [],
  collapseParameters = false,
}: MessageProps) {
  const isAgentReturnResponse =
    role === MessageRole.assistant &&
    Array.isArray(content) &&
    content.some(
      (c) =>
        c.type === ContentType.toolCall &&
        c.toolName === AGENT_RETURN_TOOL_NAME,
    )

  if (isAgentReturnResponse) {
    return (
      <AgentResponseMessage
        role={role}
        content={content}
        animatePulse={animatePulse}
        size={size}
        parameters={parameters}
        collapseParameters={collapseParameters}
      />
    )
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

  switch (value.type) {
    case ContentType.text:
      try {
        const parsedValue = JSON.parse(value.text)
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
            message={value.text}
            parameters={parameters}
            collapseParameters={collapseParameters}
            sourceMap={sourceMap}
          />
        )
      }

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

    case ContentType.file:
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

    case ContentType.toolCall:
      return (
        <div key={`${index}`} className='py-2 w-full'>
          <div className='overflow-hidden rounded-xl w-full'>
            <CodeBlock language='json'>
              {JSON.stringify(value as ToolRequestContent, null, 2)}
            </CodeBlock>
          </div>
        </div>
      )

    case ContentType.toolResult:
      return (
        <div key={`${index}`} className='py-2 w-full'>
          <div className='overflow-hidden rounded-xl w-full'>
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
      key={`${index}-group-${groupIndex}`}
    >
      {group.length > 0
        ? group.map((segment, segmentIndex) => (
            <span key={`${index}-group-${groupIndex}-segment-${segmentIndex}`}>
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
              className='cursor-pointer'
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
          <Image src={reference.content} className='max-h-72 rounded-xl' />
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
  return (
    <a
      href={src}
      target='_blank'
      rel='noopener noreferrer'
      className='h-auto w-auto text-accent-foreground font-semibold bg-muted flex flex-row items-center justify-center gap-2 py-2 px-3 rounded-xl shadow-sm'
    >
      <Icon name='paperclip' size='normal' className='shrink-0' />
      {src.split('/').at(-1)}
    </a>
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
    !URL.canParse(image.toString()) ||
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
}

const ContentFile = ({
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
  if (
    (typeof file !== 'string' && !(file instanceof URL)) ||
    !URL.canParse(file.toString()) ||
    (!file.toString().startsWith('https') &&
      !file.toString().startsWith('http://localhost'))
  ) {
    return (
      <ContentText
        index={index}
        color={color}
        size={size}
        message={'<File preview unavailable>'}
      />
    )
  }

  const TextComponent = size === 'small' ? Text.H6 : Text.H5

  const segment = useMemo(
    () =>
      computeSegments(ContentType.file, file.toString(), sourceMap, parameters),
    [file, sourceMap, parameters],
  )[0]

  if (!segment) return null

  return (
    <TextComponent
      color={color}
      whiteSpace='preWrap'
      wordBreak='breakAll'
      key={`${index}`}
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
}

function AgentResponseMessage({
  content,
  animatePulse = false,
  size = 'default',
  parameters = [],
  collapseParameters = false,
}: MessageProps) {
  const [otherContent, returnTool] = Array.isArray(content)
    ? content.reduce(
        (acc, c) => {
          if (c.toolName === AGENT_RETURN_TOOL_NAME) {
            acc[1] = acc[1] ?? (c as ToolRequestContent)
          } else {
            acc[0].push(c)
          }
          return acc
        },
        [[], undefined] as [MessageContent[], ToolRequestContent | undefined],
      )
    : [content, undefined]

  return (
    <MessageItem
      animatePulse={animatePulse}
      badgeLabel='Agent'
      badgeVariant='default'
      badgeIcon='bot'
    >
      {({ collapsedMessage }) =>
        collapsedMessage ? (
          <Content value='...' color='foregroundMuted' size={size} />
        ) : (
          <>
            <MessageItemContent
              content={otherContent}
              size={size}
              parameters={parameters}
              collapseParameters={collapseParameters}
              collapsedMessage={collapsedMessage}
            />
            <Content
              index={otherContent.length + 1}
              color='accent'
              value={JSON.stringify(returnTool!.args, null, 2)}
              size={size}
              parameters={parameters}
              collapseParameters={collapseParameters}
            />
          </>
        )
      }
    </MessageItem>
  )
}
