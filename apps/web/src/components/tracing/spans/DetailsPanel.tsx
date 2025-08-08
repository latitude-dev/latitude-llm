import { formatDuration } from '$/app/_lib/formatUtils'
import { MetadataItem } from '$/components/MetadataItem'
import { SpanKind, SpanStatus, SpanType } from '@latitude-data/core/browser'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextArea } from '@latitude-data/web-ui/atoms/TextArea'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { ClickToCopy } from '@latitude-data/web-ui/molecules/ClickToCopy'
import { CollapsibleBox } from '@latitude-data/web-ui/molecules/CollapsibleBox'
import { format } from 'date-fns'
import { useState } from 'react'
import {
  DetailsPanelProps,
  SPAN_KIND_DETAILS,
  SPAN_STATUS_DETAILS,
} from './shared'
import { SPAN_SPECIFICATIONS } from './specifications'

function TypeBadge({ type }: { type: SpanType }) {
  const specification = SPAN_SPECIFICATIONS[type]
  if (!specification) return null

  return (
    <Tooltip
      asChild
      trigger={
        <Badge variant={specification.color.badge.filled}>
          <span className='w-full flex flex-row items-center gap-x-2'>
            <Icon
              name={specification.icon}
              size='xnormal'
              className='flex-shrink-0'
            />
            {specification.name}
          </span>
        </Badge>
      }
    >
      {specification.description}
    </Tooltip>
  )
}

function KindBadge({ kind }: { kind: SpanKind }) {
  const details = SPAN_KIND_DETAILS[kind]
  if (!details) return null

  return (
    <Tooltip asChild trigger={<Badge variant='outline'>{details.name}</Badge>}>
      {details.description}
    </Tooltip>
  )
}

function StatusBadge({
  status,
  message,
}: {
  status: SpanStatus
  message?: string
}) {
  const details = SPAN_STATUS_DETAILS[status]
  if (!details) return null

  return (
    <Tooltip
      asChild
      trigger={
        <Badge variant={details.color.badge.outline}>{details.name}</Badge>
      }
    >
      {details.description}
      {!!message && `: ${message}`}
    </Tooltip>
  )
}

export function DetailsPanel<T extends SpanType>({
  span,
}: DetailsPanelProps<T>) {
  const [isExpanded, setIsExpanded] = useState(false)

  const specification = SPAN_SPECIFICATIONS[span.type]
  if (!specification) return null

  return (
    <div className='flex flex-col gap-8'>
      <div className='w-full flex flex-col items-center gap-2'>
        <span className='w-full truncate'>
          <Text.H5M userSelect={false} noWrap ellipsis>
            {span.name}
          </Text.H5M>
        </span>
        <div className='w-full flex flex-row items-center gap-x-2'>
          <TypeBadge type={span.type} />
          <KindBadge kind={span.kind} />
          <StatusBadge status={span.status} message={span.message} />
        </div>
      </div>
      <div className='w-full flex flex-col gap-4'>
        <MetadataItem label='Event id'>
          <ClickToCopy copyValue={span.id}>
            <Text.H5 align='right' color='foregroundMuted'>
              {span.id.slice(0, 8)}
            </Text.H5>
          </ClickToCopy>
        </MetadataItem>
        <MetadataItem label='Trace id'>
          <ClickToCopy copyValue={span.traceId}>
            <Text.H5 align='right' color='foregroundMuted'>
              {span.traceId.slice(0, 8)}
            </Text.H5>
          </ClickToCopy>
        </MetadataItem>
        <MetadataItem label='Conversation id'>
          <ClickToCopy copyValue={span.conversationId}>
            <Text.H5 align='right' color='foregroundMuted'>
              {span.conversationId.slice(0, 8)}
            </Text.H5>
          </ClickToCopy>
        </MetadataItem>
        <MetadataItem label='Duration' value={formatDuration(span.duration)} />
        <MetadataItem
          label='Timestamp'
          value={format(new Date(span.startedAt), 'PPp')}
        />
        {!!specification.DetailsPanel && (
          <specification.DetailsPanel span={span} />
        )}
      </div>
      {span.status === SpanStatus.Error && (
        <Alert
          variant='destructive'
          showIcon={false}
          title='Event failed'
          description={span.message || 'Unknown error'}
        />
      )}
      {!span.metadata ? (
        span.status !== SpanStatus.Error && (
          <Alert
            variant='warning'
            showIcon={false}
            title='No metadata'
            description='This event is still being processed or has had an error.'
          />
        )
      ) : (
        <CollapsibleBox
          title='Metadata'
          icon='letterText'
          isExpanded={isExpanded}
          onToggle={setIsExpanded}
          scrollable={false}
          expandedContent={
            <div className='w-full flex flex-col gap-y-4'>
              {Object.entries(span.metadata.attributes).map(
                ([key, value], index) => (
                  <div
                    key={index}
                    className='w-full flex flex-col items-start gap-y-1.5'
                  >
                    <span className='w-full flex truncate'>
                      <Text.H6B noWrap ellipsis>
                        {key}
                      </Text.H6B>
                    </span>
                    <div className='w-full min-w-0 flex flex-grow'>
                      <TextArea
                        value={
                          typeof value === 'string'
                            ? value
                            : JSON.stringify(value, null, 2)
                        }
                        minRows={1}
                        maxRows={6}
                        disabled={true}
                      />
                    </div>
                  </div>
                ),
              )}
            </div>
          }
        />
      )}
    </div>
  )
}
