import { ReactNode, useRef } from 'react'

import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { ErrorMessage, Message } from '$/components/ChatWrapper'
import { ToolBarWrapper } from '$/components/ChatWrapper/ChatTextArea/ToolBar'
import Actions, {
  type ActionsState,
} from '$/components/PlaygroundCommon/Actions'
import { usePreviewConversation } from '$/hooks/playgrounds/usePreviewConversation'
import { ResolvedMetadata } from '$/workers/readMetadata'
import {
  AppliedRules,
  LATITUDE_DOCS_URL,
  ProviderRules,
} from '@latitude-data/core/browser'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { useAutoScroll } from '@latitude-data/web-ui/hooks/useAutoScroll'
import { cn } from '@latitude-data/web-ui/utils'
import Link from 'next/link'

function WarningLink({ providerRule }: { providerRule: ProviderRules }) {
  const docPath = providerRule.startsWith('vertex') ? 'vertex' : providerRule
  return (
    <Link
      target='_blank'
      href={`${LATITUDE_DOCS_URL}/guides/prompt-manager/provider-rules/${docPath}`}
      className='flex-nowrap'
    >
      <Text.H5B underline noWrap color='warningMutedForeground'>
        Learn more
      </Text.H5B>
    </Link>
  )
}

function Warnings({ warnings }: { warnings: AppliedRules }) {
  const rules = warnings.rules
  if (!rules.length) return null

  return rules.map((rule, index) => (
    <Alert
      key={index}
      variant='warning'
      description={rule.ruleMessage}
      cta={<WarningLink providerRule={rule.rule} />}
    />
  ))
}

export default function PreviewPrompt({
  metadata,
  parameters,
  runPrompt,
  expandParameters,
  setExpandParameters,
  actions,
  showHeader,
}: {
  metadata: ResolvedMetadata | undefined
  parameters: Record<string, unknown> | undefined
  runPrompt: () => void
  showHeader: boolean
  actions?: ReactNode
} & ActionsState) {
  const { document } = useCurrentDocument()
  const containerRef = useRef<HTMLDivElement>(null)
  useAutoScroll(containerRef, { startAtBottom: true })
  const preview = usePreviewConversation({
    parameters,
    metadata,
    promptlVersion: document.promptlVersion,
  })
  return (
    <div className='flex flex-col flex-1 gap-2 h-full overflow-hidden'>
      {preview.warningRule ? <Warnings warnings={preview.warningRule} /> : null}
      {showHeader ? (
        <div className='flex flex-row items-center justify-between w-full'>
          <Text.H6M>Preview</Text.H6M>
          <Actions
            expandParameters={expandParameters}
            setExpandParameters={setExpandParameters}
          />
        </div>
      ) : null}
      <div
        ref={containerRef}
        className={cn(
          'flex flex-col gap-3 flex-grow flex-shrink',
          'min-h-0 custom-scrollbar scrollable-indicator pb-20',
        )}
      >
        <div className='flex flex-col gap-2'>
          {preview.fixedMessages.map((message, index) => (
            <Message
              key={index}
              role={message.role}
              content={message.content}
              parameters={Object.keys(parameters ?? {})}
              collapseParameters={!expandParameters}
            />
          ))}
        </div>
        {preview.error !== undefined && <ErrorMessage error={preview.error} />}
        {!preview.completed && metadata?.isChain && (
          <div className='w-full py-1 px-4 bg-secondary rounded-lg'>
            <Text.H6 color='foregroundMuted'>
              Showing the first step. Other steps will show after running.
            </Text.H6>
          </div>
        )}
      </div>

      <div className='absolute left-0 right-0 bottom-3 flex flex-row items-center justify-center'>
        <ToolBarWrapper>
          {preview.error || (metadata?.errors.length ?? 0) > 0 ? (
            <Tooltip
              side='bottom'
              asChild
              trigger={
                <Button iconProps={{ name: 'play' }} fancy disabled>
                  Run
                </Button>
              }
            >
              There are errors in your prompt. Please fix them before running.
            </Tooltip>
          ) : (
            <Button iconProps={{ name: 'play' }} fancy onClick={runPrompt}>
              Run
            </Button>
          )}
          {actions}
        </ToolBarWrapper>
      </div>
    </div>
  )
}
