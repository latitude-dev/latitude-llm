import { DetailsPanel } from '$/components/tracing/spans/DetailsPanel'
import { useTrace } from '$/stores/traces'
import { CompletionSpanMetadata, SpanType } from '@latitude-data/constants'
import { MetadataInfoTabs } from '../../../_components/MetadataInfoTabs'
import { useSelectedSpan } from './SelectedSpansContext'
import { useSelectedTraceId } from './SelectedTraceIdContext'
import { LoadingText } from '@latitude-data/web-ui/molecules/LoadingText'
import {
  Message as PromptlMessage,
  MessageContent,
  ContentType,
  MessageRole,
} from 'promptl-ai'
import { useSpan } from '$/stores/spans'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { CodeBlock } from '@latitude-data/web-ui/atoms/CodeBlock'
import { Image } from '@latitude-data/web-ui/atoms/Image'

export const DEFAULT_TABS = [
  { label: 'Metadata', value: 'metadata' },
  { label: 'Messages', value: 'messages' },
  { label: 'Evaluations', value: 'evaluations' },
]

export function TracePromptlInfo() {
  return (
    <div className='flex flex-col gap-4'>
      <MetadataInfoTabs tabs={DEFAULT_TABS}>
        {({ selectedTab }) => (
          <>
            {selectedTab === 'metadata' && <TraceMetadata />}
            {selectedTab === 'messages' && <TracePromptlMessages />}
            {selectedTab === 'evaluations' && <TraceEvaluations />}
          </>
        )}
      </MetadataInfoTabs>
    </div>
  )
}

function TraceMetadata() {
  const { selectedSpanId } = useSelectedSpan()
  const { selectedTraceId } = useSelectedTraceId()
  const { data: span } = useSpan({
    spanId: selectedSpanId,
    traceId: selectedTraceId,
  })
  if (!span) return null

  return <DetailsPanel span={span} />
}

function TracePromptlMessages() {
  const { selectedTraceId } = useSelectedTraceId()
  const { data: trace } = useTrace({ traceId: selectedTraceId! })
  const spanId = trace?.children.find(
    (span) => span.type === SpanType.Completion,
  )?.id
  const { data: span, isLoading } = useSpan({
    spanId: spanId,
    traceId: selectedTraceId!,
  })
  if (isLoading) return <LoadingText alignX='center' />
  if (!span) return null

  const messages = (span.metadata as CompletionSpanMetadata).input
  return <PromptlMessageList messages={messages} />
}

function TraceEvaluations() {
  return null
}

interface PromptlMessageListProps {
  messages: PromptlMessage[]
  parameters?: string[]
  collapseParameters?: boolean
}

export function PromptlMessageList({ messages }: PromptlMessageListProps) {
  return (
    <div className='flex flex-col gap-4'>
      {messages.map((message, index) => (
        <PromptlMessageComponent key={index} message={message} />
      ))}
    </div>
  )
}

interface PromptlMessageComponentProps {
  message: PromptlMessage
}

function roleToString(role: MessageRole): string {
  switch (role) {
    case MessageRole.system:
      return 'System'
    case MessageRole.developer:
      return 'Developer'
    case MessageRole.user:
      return 'User'
    case MessageRole.assistant:
      return 'Assistant'
    case MessageRole.tool:
      return 'Tool'
    default:
      return role
  }
}

function roleVariant(role: MessageRole) {
  switch (role) {
    case MessageRole.system:
    case MessageRole.developer:
      return 'accent'
    case MessageRole.user:
      return 'default'
    case MessageRole.assistant:
      return 'secondary'
    case MessageRole.tool:
      return 'outline'
    default:
      return 'default'
  }
}

function PromptlMessageComponent({ message }: PromptlMessageComponentProps) {
  return (
    <div className='flex flex-col gap-1 w-full items-start'>
      <div>
        <Badge variant={roleVariant(message.role)}>
          {roleToString(message.role)}
        </Badge>
      </div>
      <div className='flex w-full flex-row items-stretch gap-4 pl-4'>
        <div className='flex-shrink-0 bg-muted w-1 rounded-lg' />
        <div className='flex flex-grow flex-col gap-1 overflow-x-auto'>
          <PromptlMessageContent content={message.content} />
        </div>
      </div>
    </div>
  )
}

interface PromptlMessageContentProps {
  content: MessageContent[]
}

function PromptlMessageContent({ content }: PromptlMessageContentProps) {
  return (
    <>
      {content.map((c, idx) => (
        <PromptlContent key={idx} content={c} />
      ))}
    </>
  )
}

interface PromptlContentProps {
  content: MessageContent
}

function PromptlContent({ content }: PromptlContentProps) {
  switch (content.type) {
    case ContentType.text:
      return <PromptlTextContent text={content.text} />

    case ContentType.image:
      return <PromptlImageContent image={content.image} />

    case ContentType.file:
      return (
        <PromptlFileContent file={content.file} _mimeType={content.mimeType} />
      )

    case ContentType.toolCall:
      return <PromptlToolCallContent toolCall={content} />

    default:
      return <PromptlTextContent text={String(content)} />
  }
}

function PromptlTextContent({ text }: { text: string }) {
  try {
    const json = JSON.parse(text)
    return (
      <div className='py-2 max-w-full'>
        <div className='overflow-hidden rounded-xl w-full'>
          <CodeBlock language='json'>{JSON.stringify(json, null, 2)}</CodeBlock>
        </div>
      </div>
    )
  } catch (_) {
    return (
      <Text.H5
        color='foregroundMuted'
        whiteSpace='preWrap'
        wordBreak='breakAll'
      >
        {text}
      </Text.H5>
    )
  }
}

function PromptlImageContent({
  image,
}: {
  image: string | Uint8Array | Buffer | ArrayBuffer | URL
}) {
  const imageSrc = image.toString()

  return (
    <Image
      src={imageSrc}
      className='max-h-72 rounded-xl w-fit object-contain'
    />
  )
}

function PromptlFileContent({
  file,
}: {
  file: string | Uint8Array | Buffer | ArrayBuffer | URL
  _mimeType: string
}) {
  const fileSrc = file.toString()
  const fileName = fileSrc.split('/').at(-1) || 'Unnamed file'

  return (
    <a
      href={fileSrc}
      target='_blank'
      rel='noopener noreferrer'
      className='flex flex-row p-4 gap-2 rounded-xl w-fit items-center text-muted-foreground hover:text-accent-foreground transition-colors bg-muted hover:bg-accent'
    >
      <Icon name='file' color='foregroundMuted' />
      <Text.H5
        color='foregroundMuted'
        whiteSpace='preWrap'
        wordBreak='breakAll'
      >
        {fileName}
      </Text.H5>
    </a>
  )
}

function PromptlToolCallContent({
  toolCall,
}: {
  toolCall: {
    toolCallId: string
    toolName: string
    toolArguments: Record<string, unknown>
  }
}) {
  return (
    <div className='flex flex-col gap-2 p-4 bg-muted rounded-xl'>
      <div className='flex flex-row items-center gap-2'>
        <Icon name='settings' color='foregroundMuted' />
        <Text.H5 color='foregroundMuted'>{toolCall.toolName}</Text.H5>
      </div>
      <CodeBlock language='json'>
        {JSON.stringify(toolCall.toolArguments, null, 2)}
      </CodeBlock>
    </div>
  )
}
