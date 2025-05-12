import Link from 'next/link'
import { LATITUDE_DOCS_URL } from '@latitude-data/core/browser'
import { cn } from '@latitude-data/web-ui/utils'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { DocumentTextEditor } from '@latitude-data/web-ui/molecules/DocumentTextEditor'
import { DocumentVersion } from '@latitude-data/core/browser'
import { OnboardingStep } from '../index'
import { MessageList } from '@latitude-data/web-ui/molecules/ChatWrapper'
import { StreamMessage } from '$/components/PlaygroundCommon/StreamMessage'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Message } from '@latitude-data/compiler'

export function OnboardingPromptStep({
  document,
  start,
  activeStream,
  currentStep,
  messages,
  streamingResponse,
  streamingReasoning,
  chainLength,
}: {
  start: () => Promise<void>
  activeStream: boolean
  document: DocumentVersion
  currentStep: OnboardingStep
  messages: Message[]
  streamingResponse: string | undefined
  streamingReasoning: string | undefined
  chainLength: number
}) {
  const promptStep = currentStep === OnboardingStep.ShowPrompt
  const showPrompt = promptStep && !activeStream
  const showMessages = promptStep && activeStream
  return (
    <>
      <div
        className={cn(
          'absolute inset-x-0 top-0 flex flex-col gap-4 transition-opacity duration-500 ease-in-out',
          {
            'opacity-100': showPrompt,
            'opacity-0 pointer-events-none invisible': !showPrompt,
          },
        )}
      >
        <div className='space-y-2'>
          <Text.H4B centered display='block'>
            This is a prompt in Latitude
          </Text.H4B>
          <Text.H6 centered display='block' color='foregroundMuted'>
            It uses{' '}
            <Link
              className='underline'
              href={`${LATITUDE_DOCS_URL}/guides/prompt-manager/overview`}
            >
              PromptL
            </Link>
            , our custom template syntax that gives superpowers to your prompts.
            Notice the configuration frontmatter and the parameter
            interpolations.
          </Text.H6>
        </div>
        <div className='h-[340px]'>
          <DocumentTextEditor
            readOnlyMessage=' ' //
            value={document.content}
            path={document.path}
            isSaved={true}
            actionButtons={[]}
          />
        </div>

        <div className='flex flex-col gap-2 justify-center pt-4'>
          <Button fancy onClick={start} disabled={activeStream}>
            Run prompt
          </Button>
          <Text.H6 color='foregroundMuted' centered>
            We'll use mock values for the parameters this time
          </Text.H6>
        </div>
      </div>

      <div
        className={cn(
          'absolute inset-x-0 top-0 flex flex-col gap-3 transition-opacity duration-500 ease-in-out',
          {
            'opacity-100': showMessages,
            'opacity-0 pointer-events-none invisible': !showMessages,
          },
        )}
      >
        <MessageList messages={messages} />
        <StreamMessage
          responseStream={streamingResponse}
          reasoningStream={streamingReasoning}
          messages={messages}
          chainLength={chainLength}
        />
      </div>
    </>
  )
}
