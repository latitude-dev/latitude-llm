import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { ErrorMessage, Message } from '$/components/ChatWrapper'
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
import { Text } from '@latitude-data/web-ui/atoms/Text'
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
  expandParameters,
  setExpandParameters,
  showHeader,
}: {
  metadata: ResolvedMetadata | undefined
  parameters: Record<string, unknown> | undefined
  showHeader: boolean
} & ActionsState) {
  const { document } = useCurrentDocument()
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
        className={cn(
          'flex flex-col gap-3 flex-grow flex-shrink',
          'min-h-0 custom-scrollbar scrollable-indicator',
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
    </div>
  )
}
