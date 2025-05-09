import { useCallback, useMemo, useState } from 'react'
import { StreamMessage } from '$/components/PlaygroundCommon/StreamMessage'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { MessageList } from '@latitude-data/web-ui/molecules/ChatWrapper'
import { cn } from '@latitude-data/web-ui/utils'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { OnboardingStep } from '$/app/(onboarding)/onboarding/_components/OnboardingClient'
import { Message } from '@latitude-data/compiler'
import { ParameterTable } from './ParameterTable'
import { ExperimentVariants } from './ExperimentVariants'
import {
  DocumentVersion,
  Project,
  Commit,
  Dataset,
} from '@latitude-data/core/browser'
import { useExperiments } from '$/stores/experiments'
import { OnboardingDocumentParameterKeys } from '@latitude-data/constants/onboarding'
import { useEvaluationsV2 } from '$/stores/evaluationsV2'
import { ExperimentVariant } from '$/actions/experiments'
import { envClient } from '$/envClient'

const PARAMETERS_MAP: Record<OnboardingDocumentParameterKeys, number> = {
  product_name: 0,
  features: 1,
  target_audience: 2,
  tone: 3,
  word_count: 4,
}

const TEMPERATURE = 1

export type Variants = {
  first: ExperimentVariant
  second: ExperimentVariant
}
export function ExperimentStep({
  project,
  commit,
  dataset,
  document,
  messages,
  currentStep,
  chainLength,
  streamingResponse,
  streamingReasoning,
  onCompleteOnboarding,
}: {
  document: DocumentVersion
  project: Project
  commit: Commit
  dataset: Dataset
  messages: Message[]
  chainLength: number
  currentStep: OnboardingStep
  streamingResponse: string | undefined
  streamingReasoning: string | undefined
  onCompleteOnboarding: ({
    experimentUuids,
  }: {
    experimentUuids: string[]
  }) => Promise<void>
}) {
  const { create, isCreating } = useExperiments(
    {
      projectId: project.id,
      documentUuid: document.documentUuid,
    },
    {
      onCreate: (experiments) => {
        onCompleteOnboarding({
          experimentUuids: experiments.map((exp) => exp.uuid),
        })
      },
    },
  )
  const { data: evaluations } = useEvaluationsV2({
    project,
    commit,
    document,
  })
  const evaluationUuids = useMemo(() => {
    const evaluation = evaluations[0]
    // We asume is the first one. The one created during onboarding.
    // This should not happen
    if (!evaluation) return []

    return [evaluation.uuid]
  }, [evaluations])

  const [variants, setVariants] = useState<Variants>({
    first: {
      name: '#Experiment 1',
      provider: envClient.NEXT_PUBLIC_DEFAULT_PROVIDER_NAME,
      model: 'gpt-4o-mini',
      temperature: TEMPERATURE,
    },
    second: {
      name: '#Experiment 2',
      provider: envClient.NEXT_PUBLIC_DEFAULT_PROVIDER_NAME,
      model: 'gpt-4.1-mini',
      temperature: TEMPERATURE,
    },
  })
  const onRunExperiment = useCallback(async () => {
    create({
      fromRow: 1,
      variants: [variants.first, variants.second],
      projectId: project.id,
      commitUuid: commit.uuid,
      documentUuid: document.documentUuid,
      datasetId: dataset.id,
      parametersMap: PARAMETERS_MAP,
      datasetLabels: {},
      evaluationUuids,
    })
  }, [
    create,
    commit,
    document,
    project.id,
    dataset.id,
    evaluationUuids,
    variants,
  ])
  return (
    <div
      className={cn(
        'absolute inset-x-0 top-0 flex flex-col gap-12 transition-opacity duration-500 ease-in-out',
        {
          'opacity-100':
            currentStep === OnboardingStep.ShowResultsAndExperiment,
          'opacity-0 pointer-events-none invisible':
            currentStep !== OnboardingStep.ShowResultsAndExperiment,
        },
      )}
    >
      {/* Results Display (with reduced opacity) */}
      <div className='relative max-h-40 pointer-events-none overflow-hidden opacity-35 [mask-image:linear-gradient(to_top,transparent,black_50%,black)]'>
        <div className='flex flex-col gap-3 pt-4'>
          <MessageList messages={messages} />
          {streamingResponse && (
            <StreamMessage
              responseStream={streamingResponse}
              reasoningStream={streamingReasoning}
              messages={messages}
              chainLength={chainLength}
            />
          )}
        </div>
      </div>

      {/* Experiment Section */}
      <div className='space-y-6'>
        <div className='space-y-2'>
          <Text.H4B centered display='block'>
            Nice! But something is missing...
          </Text.H4B>
          <Text.H6 centered display='block' color='foregroundMuted'>
            To get the best results from your prompt, it's key to test it with a
            variety of inputs. You can do this by using datasets, which you can
            upload or create yourself. Here's a sample dataset for this prompt.
          </Text.H6>
        </div>
        <ParameterTable />
        <div className='flex flex-col gap-y-2 justify-center'>
          <div className='flex flex-col gap-y-4'>
            <ExperimentVariants
              firstVariant={variants.first}
              secondVariant={variants.second}
              setVariants={setVariants}
            />
            <Button fancy onClick={onRunExperiment} disabled={isCreating}>
              Run experiment
            </Button>
          </div>
          <Text.H6 color='foregroundMuted' centered>
            Experiments test your prompt against several inputs at once.
          </Text.H6>
        </div>
      </div>
    </div>
  )
}
