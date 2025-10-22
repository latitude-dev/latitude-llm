import { formatCostInMillicents } from '$/app/_lib/formatUtils'
import {
  Message as MessageComponent,
  MessageList,
} from '$/components/ChatWrapper'
import { MetadataItem } from '$/components/MetadataItem'
import { Message } from '@latitude-data/constants/legacyCompiler'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { CodeBlock } from '@latitude-data/web-ui/atoms/CodeBlock'
import { IconName } from '@latitude-data/web-ui/atoms/Icons'
import { LineSeparator } from '@latitude-data/web-ui/atoms/LineSeparator'
import { Modal } from '@latitude-data/web-ui/atoms/Modal'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { useState } from 'react'
import { DetailsPanelProps, SPAN_COLORS } from './shared'
import {
  FINISH_REASON_DETAILS,
  SPAN_SPECIFICATIONS,
  SpanType,
} from '@latitude-data/core/constants'

const specification = SPAN_SPECIFICATIONS[SpanType.Completion]
export default {
  ...specification,
  icon: 'brain' as IconName,
  color: SPAN_COLORS.blue,
  DetailsPanel: DetailsPanel,
}

function MessagesDetails({
  input,
  output,
}: {
  input: Message[]
  output: Message[]
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className='flex flex-col gap-y-2'>
      <div className='flex flex-row items-center justify-between'>
        <Text.H5M color='foreground'>Messages</Text.H5M>
        <Tooltip
          asChild
          trigger={
            <Button
              onClick={() => setExpanded(true)}
              iconProps={{
                name: 'expand',
                widthClass: 'w-4',
                heightClass: 'h-4',
                placement: 'right',
              }}
              variant='link'
              size='none'
              containerClassName='rounded-xl pointer-events-auto'
              className='rounded-xl'
            >
              See
            </Button>
          }
        >
          Showing preview, expand to see more.
        </Tooltip>
      </div>
      <div className='w-full flex flex-col gap-y-2.5'>
        {input.length > 0 && (
          <MessageComponent
            role={input.at(0)!.role}
            content={input.at(0)!.content}
          />
        )}
        {(input.length > 1 || output.length > 1) && (
          <Button
            onClick={() => setExpanded(true)}
            variant='ghost'
            size='none'
            className='w-full flex items-center justify-center py-1 px-4 bg-secondary rounded-lg hover:bg-secondary/80'
          >
            <Text.H6 color='foregroundMuted'>
              ...Preview, expand to see more...
            </Text.H6>
          </Button>
        )}
        {output.length > 0 && (
          <MessageComponent
            role={output.at(-1)!.role}
            content={output.at(-1)!.content}
          />
        )}
      </div>
      <Modal
        title='Messages'
        description='Showing all messages for this completion. Tool calls could be unanswered at this point.'
        open={expanded}
        onOpenChange={setExpanded}
        size='medium'
        dismissible
      >
        <div className='flex flex-col gap-y-2.5'>
          <MessageList messages={input} />
          <LineSeparator text='Output' />
          <MessageList messages={output} />
        </div>
      </Modal>
    </div>
  )
}

function DetailsPanel({ span }: DetailsPanelProps<SpanType.Completion>) {
  return (
    <>
      {!!span.metadata && (
        <>
          <MetadataItem label='Provider' value={span.metadata.provider} />
          <MetadataItem label='Model' value={span.metadata.model} />
          {!!span.metadata.tokens && (
            <MetadataItem
              label='Tokens'
              value={(
                span.metadata.tokens.prompt +
                span.metadata.tokens.cached +
                span.metadata.tokens.reasoning +
                span.metadata.tokens.completion
              ).toString()}
              tooltip={
                <div className='w-full flex flex-col justify-between'>
                  <div className='w-full flex flex-row justify-between items-center gap-4'>
                    <Text.H6B color='background'>Prompt</Text.H6B>
                    <Text.H6 color='background'>
                      {span.metadata.tokens.prompt}
                    </Text.H6>
                  </div>
                  <div className='w-full flex flex-row justify-between items-center gap-4'>
                    <Text.H6B color='background'>Cached</Text.H6B>
                    <Text.H6 color='background'>
                      {span.metadata.tokens.cached}
                    </Text.H6>
                  </div>
                  <div className='w-full flex flex-row justify-between items-center gap-4'>
                    <Text.H6B color='background'>Reasoning</Text.H6B>
                    <Text.H6 color='background'>
                      {span.metadata.tokens.reasoning}
                    </Text.H6>
                  </div>
                  <div className='w-full flex flex-row justify-between items-center gap-4'>
                    <Text.H6B color='background'>Completion</Text.H6B>
                    <Text.H6 color='background'>
                      {span.metadata.tokens.completion}
                    </Text.H6>
                  </div>
                </div>
              }
            />
          )}
          {!!span.metadata.cost && (
            <MetadataItem
              label='Cost'
              value={formatCostInMillicents(span.metadata.cost)}
              tooltip="We estimate the cost based on the token usage and your provider's pricing. Actual cost may vary."
            />
          )}
          {!!span.metadata.finishReason && (
            <MetadataItem
              label='Finish reason'
              value={FINISH_REASON_DETAILS[span.metadata.finishReason].name}
              tooltip={
                FINISH_REASON_DETAILS[span.metadata.finishReason].description
              }
            />
          )}
          <MetadataItem label='Configuration' contentClassName='pt-2' stacked>
            <div className='w-full max-h-32 overflow-y-auto custom-scrollbar scrollable-indicator rounded-xl bg-backgroundCode'>
              <CodeBlock language='json'>
                {JSON.stringify(span.metadata.configuration, null, 2)}
              </CodeBlock>
            </div>
          </MetadataItem>
          <MessagesDetails
            input={(span.metadata.input ?? []) as unknown as Message[]}
            output={(span.metadata.output ?? []) as unknown as Message[]}
          />
        </>
      )}
    </>
  )
}
