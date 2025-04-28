'use client'

import { Text } from '@latitude-data/web-ui/atoms/Text'
import Link from 'next/link'
import { LATITUDE_DOCS_URL } from '@latitude-data/core/browser'
import { DocumentTextEditor } from '@latitude-data/web-ui/molecules/DocumentTextEditor'
import {
  DocumentVersion,
  Project,
  Commit,
  Dataset,
} from '@latitude-data/core/browser'
import { useCallback, useState } from 'react'
import { MessageList } from '@latitude-data/web-ui/molecules/ChatWrapper'
import { ROUTES } from '$/services/routes'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { usePlaygroundChat } from '$/hooks/playgroundChat/usePlaygroundChat'
import { ParameterTable } from './ParameterTable'
import { cn } from '@latitude-data/web-ui/utils'
import { runDocumentInBatchAction } from '$/actions/documents/runDocumentInBatchAction'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { useNavigate } from '$/hooks/useNavigate'
import { completeOnboardingAction } from '$/actions/workspaceOnboarding/complete'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { useStreamHandler } from '$/hooks/playgrounds/useStreamHandler'
import { StreamMessage } from '$/components/PlaygroundCommon/StreamMessage'

type OnboardingStep1ContentProps = {
  workspaceName: string
  document: DocumentVersion
  project: Project
  commit: Commit
  dataset: Dataset
}

// Enum for steps
enum OnboardingStep {
  ShowPrompt = 1,
  ShowResultsAndExperiment = 2,
}

export function OnboardingClient({
  workspaceName,
  document,
  project,
  commit,
  dataset,
}: OnboardingStep1ContentProps) {
  const { createStreamHandler, hasActiveStream } = useStreamHandler()
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(
    OnboardingStep.ShowPrompt,
  )
  const navigate = useNavigate()
  const { toast } = useToast()

  const { execute: completeOnboarding } = useLatitudeAction(
    completeOnboardingAction,
    {
      onSuccess: () => {
        toast({
          title: 'Experiment started!',
          description:
            "Welcome onboard! Let's check out the results of your experiment",
        })

        setTimeout(async () => {
          navigate.push(
            ROUTES.projects
              .detail({ id: project.id })
              .commits.detail({ uuid: commit.uuid })
              .documents.detail({ uuid: document.documentUuid }).logs.root,
          )
        }, 1000)
      },
    },
  )

  const { execute: run, isPending: isRunning } = useLatitudeAction(
    runDocumentInBatchAction,
    {
      onSuccess: async () => {
        // This action now directly leads to showing the completion step via its own onSuccess
        await completeOnboarding()
      },
    },
  )

  const runExperiment = useCallback(async () => {
    await run({
      projectId: Number(project.id),
      commitUuid: commit.uuid,
      datasetId: dataset?.id,
      documentUuid: document.documentUuid,
      parameters: {
        product_name: 0,
        features: 1,
        target_audience: 2,
        tone: 3,
        word_count: 4,
      },
      autoRespondToolCalls: false,
    })
  }, [document, dataset, project, commit, run])

  const runDocument = useCallback(async () => {
    try {
      const response = await fetch(
        ROUTES.api.documents.detail(document.documentUuid).run,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            path: document.path,
            parameters: {
              product_name: 'Smart Home Assistant',
              features:
                'Voice control, Smart home integration, AI-powered recommendations',
              target_audience: 'Tech-savvy homeowners',
              tone: 'Professional but friendly',
              word_count: 150,
            },
            commitUuid: commit.uuid,
            projectId: project.id,
            stream: true,
          }),
        },
      )

      return createStreamHandler(response)
    } catch (error) {
      console.error('Error running prompt:', error)
      // Consider user-facing error handling here
      throw error
    }
  }, [document, createStreamHandler, project.id, commit.uuid])

  const {
    start,
    streamingResponse,
    streamingReasoning,
    messages,
    chainLength,
  } = usePlaygroundChat({
    runPromptFn: () => {
      return runDocument()
    },
    onPromptRan: () => {
      setTimeout(() => {
        setCurrentStep(OnboardingStep.ShowResultsAndExperiment)
      }, 2000)
    },
  })

  // Sample parameter values for the table
  const sampleParameters = [
    {
      product_name: 'Smart Home Assistant',
      features:
        'Voice control, Smart home integration, AI-powered recommendations',
      target_audience: 'Tech-savvy homeowners',
      tone: 'Professional but friendly',
      word_count: 150,
    },
    {
      product_name: 'Fitness Tracker Pro',
      features: 'Heart rate monitoring, Sleep tracking, Workout suggestions',
      target_audience: 'Health-conscious millennials',
      tone: 'Motivational and energetic',
      word_count: 200,
    },
    {
      product_name: 'Eco-Friendly Water Bottle',
      features: 'Temperature control, Filtration system, Durability',
      target_audience: 'Environmentally conscious consumers',
      tone: 'Casual and informative',
      word_count: 120,
    },
  ]

  return (
    <div className='space-y-16'>
      {/* Top Welcome Section (Always Visible) - Adjusted spacing */}
      <div className='space-y-2'>
        <Text.H2B centered display='block'>
          Welcome to Latitude!
        </Text.H2B>
        <Text.H5 centered display='block' color='foregroundMuted'>
          Hello {workspaceName || 'there'}! Let's cover some Latitude basics.
        </Text.H5>
      </div>

      {/* Stepped Content */}
      <div className='space-y-6'>
        {/* Container for Step Content with Transitions */}
        <div className='relative min-h-[450px]'>
          {/* Step 1: Show Prompt Editor, Explanation, and Run Button */}
          <div
            className={cn(
              'absolute inset-x-0 top-0 flex flex-col gap-4 transition-opacity duration-500 ease-in-out',
              {
                'opacity-100':
                  currentStep === OnboardingStep.ShowPrompt &&
                  !hasActiveStream(),
                'opacity-0 pointer-events-none invisible':
                  currentStep !== OnboardingStep.ShowPrompt ||
                  hasActiveStream(),
              },
            )}
          >
            {/* Prompt Section (Moved inside Step 1) */}
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
                , our custom template syntax that gives superpowers to your
                prompts. Notice the configuration frontmatter and the parameter
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

            {/* Run Button Section */}
            <div className='flex flex-col gap-2 justify-center pt-4'>
              <Button
                fancy
                onClick={start} // Directly call start
                disabled={hasActiveStream()}
              >
                Run prompt
              </Button>
              <Text.H6 color='foregroundMuted' centered>
                We'll use mock values for the parameters this time
              </Text.H6>
            </div>
          </div>

          {/* Intermediate Step: Show Streaming Content */}
          <div
            className={cn(
              'absolute inset-x-0 top-0 flex flex-col gap-3 transition-opacity duration-500 ease-in-out',
              {
                'opacity-100':
                  currentStep === OnboardingStep.ShowPrompt &&
                  hasActiveStream(),
                'opacity-0 pointer-events-none invisible':
                  currentStep !== OnboardingStep.ShowPrompt ||
                  !hasActiveStream(),
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

          {/* Step 2: Show Results and Experiment Button */}
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
            <div className='relative max-h-40 overflow-y-auto opacity-35 [mask-image:linear-gradient(to_top,transparent,black_50%,black)]'>
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
                  To get the best results from your prompt, it's key to test it
                  with a variety of inputs. You can do this by using datasets,
                  which you can upload or create yourself. Here's a sample
                  dataset for this prompt.
                </Text.H6>
              </div>
              <ParameterTable values={sampleParameters} />
              <div className='flex flex-col gap-2 justify-center'>
                <Button fancy onClick={runExperiment} disabled={isRunning}>
                  Run experiment
                </Button>
                <Text.H6 color='foregroundMuted' centered>
                  Experiments test your prompt against several inputs at once.
                </Text.H6>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
