import { DetailsPanel } from '$/components/DetailsPanel'
import PromptPlaygroundChat from '$/components/PlaygroundCommon/PromptPlaygroundChat'
import { RunPanelStats } from '$/components/RunPanelStats'
import { usePlaygroundChat } from '$/hooks/playgroundChat/usePlaygroundChat'
import { useOnce } from '$/hooks/useMount'
import { ActiveDocumentStore } from '$/stores/runs/activeRunsByDocument'
import { ActiveRun } from '@latitude-data/constants'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  AppLocalStorage,
  useLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'
import { Ref, useCallback } from 'react'

type InfoProps = {
  run: ActiveRun
  attachRun: ActiveDocumentStore['attachRun']
  stopRun: ActiveDocumentStore['stopRun']
  isAttachingRun: ActiveDocumentStore['isAttachingRun']
  isStoppingRun: ActiveDocumentStore['isStoppingRun']
}

function RunPanelInfo({
  run,
  attachRun,
  stopRun,
  isAttachingRun,
  isStoppingRun: isAbortingRun,
}: InfoProps) {
  const { value: debugMode, setValue: setDebugMode } = useLocalStorage({
    key: AppLocalStorage.chatDebugMode,
    defaultValue: false,
  })
  const runPromptFn = useCallback(
    () => attachRun({ runUuid: run.uuid }),
    [run, attachRun],
  )

  const playground = usePlaygroundChat({ runPromptFn })
  const abortRunFn = useCallback(() => {
    return stopRun({ runUuid: run.uuid })
  }, [run, stopRun])

  const isWaiting = !run.startedAt && !playground.isLoading
  const isAttaching = isAttachingRun()
  const canAbortRun = isAttaching && playground.isLoading
  const runAborted = !!playground.error

  const tokens =
    (playground.usage.totalTokens ||
      playground.usage.inputTokens ||
      playground.usage.outputTokens ||
      playground.usage.promptTokens ||
      playground.usage.completionTokens) ??
    0

  useOnce(() => playground.start(), !!run.startedAt)

  if (!run.startedAt) {
    return (
      <div className='w-full h-full flex flex-1 justify-center items-center gap-2'>
        <Icon
          name='loader'
          color='foregroundMuted'
          className='animate-spin mt-px stroke-[2.25]'
        />
        <Text.H4M color='foregroundMuted'>
          Waiting run to get started...
        </Text.H4M>
      </div>
    )
  }

  return (
    <>
      <DetailsPanel.Header>
        <RunPanelStats
          tokens={tokens}
          cost={playground.cost ?? 0}
          duration={playground.duration ?? 0}
          error={playground.error?.message ?? undefined}
          isWaiting={isWaiting}
          isRunning={playground.isLoading}
          abortRun={abortRunFn}
          isAbortingRun={isAbortingRun}
          canAbortRun={canAbortRun}
          runAborted={runAborted}
        />
      </DetailsPanel.Header>
      <DetailsPanel.Body>
        <PromptPlaygroundChat
          showHeader={true}
          playground={playground}
          parameters={undefined} // Note: we don't know which version was used
          debugMode={debugMode}
          setDebugMode={setDebugMode}
        />
        {!playground.duration && (
          <div className='mt-6 w-full h-full flex flex-1 justify-center items-center gap-2'>
            <Icon
              name='loader'
              color='foregroundMuted'
              className='animate-spin mt-px stroke-[2.25]'
            />
            <Text.H4M color='foregroundMuted'>
              Waiting for a response...
            </Text.H4M>
          </div>
        )}
      </DetailsPanel.Body>
    </>
  )
}

export function ActiveRunPanel({
  ref,
  ...props
}: InfoProps & {
  ref?: Ref<HTMLDivElement>
}) {
  return (
    <DetailsPanel ref={ref} bordered>
      <RunPanelInfo {...props} />
    </DetailsPanel>
  )
}
