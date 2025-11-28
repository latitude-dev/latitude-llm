import { ComponentType, useState } from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'
import { AnnotationsProgressIcon } from '..'

type Step = 'what' | 'why' | 'passAnnotation' | 'failAnnotation' | 'moreInfo'

const STEPS_ORDER: Step[] = [
  'what',
  'why',
  'passAnnotation',
  'failAnnotation',
  'moreInfo',
]

function StepIndicators({
  currentStep,
  onStepClick,
}: {
  currentStep: Step
  onStepClick: (step: Step) => void
}) {
  const currentIndex = STEPS_ORDER.indexOf(currentStep)

  return (
    <div className='flex items-center gap-1.5'>
      {STEPS_ORDER.map((step, index) => (
        <button
          key={step}
          onClick={() => onStepClick(step)}
          className={cn(
            'w-1.5 h-1.5 rounded-full transition-all duration-300',
            {
              'bg-primary scale-125': index === currentIndex,
              'bg-muted-foreground/30 hover:bg-muted-foreground/50':
                index !== currentIndex,
            },
          )}
        />
      ))}
    </div>
  )
}

function WhatStep() {
  return (
    <div className='flex flex-col gap-y-2'>
      <div className='flex items-center gap-2'>
        <div className='flex items-center justify-center h-8 w-8 rounded-lg bg-accent'>
          <Icon name='chat' color='accentForeground' />
        </div>
        <Text.H4B>What is an annotation?</Text.H4B>
      </div>
      <Text.H5 color='foregroundMuted'>
        An annotation is your feedback on an AI response. You mark it as good or
        bad to help improve future results.
      </Text.H5>
    </div>
  )
}

function WhyStep() {
  return (
    <div className='flex flex-col gap-y-2'>
      <div className='flex items-center gap-2'>
        <AnnotationsProgressIcon isCompleted />
        <Text.H4B>Why annotate logs?</Text.H4B>
      </div>
      <Text.H5 color='foregroundMuted'>
        Annotating logs helps improve accuracy by providing valuable feedback.
        Identifying errors helps us refine algorithms and deliver better
        results.
      </Text.H5>
    </div>
  )
}

function PassAnnotationStep() {
  return (
    <div className='flex flex-col gap-y-2'>
      <div className='flex items-center gap-2'>
        <div className='flex items-center justify-center h-8 w-8 rounded-lg bg-success-muted'>
          <Icon name='thumbsUp' color='successMutedForeground' />
        </div>
        <Text.H4B>Pass annotation</Text.H4B>
      </div>
      <Text.H5 color='foregroundMuted'>
        Mark a response as "pass" when the AI gave a helpful, accurate, and
        appropriate answer. This reinforces good patterns.
      </Text.H5>
    </div>
  )
}

function FailAnnotationStep() {
  return (
    <div className='flex flex-col gap-y-2'>
      <div className='flex items-center gap-2'>
        <div className='flex items-center justify-center h-8 w-8 rounded-lg bg-destructive-muted'>
          <Icon name='thumbsDown' color='destructiveMutedForeground' />
        </div>
        <Text.H4B>Fail annotation</Text.H4B>
      </div>
      <Text.H5 color='foregroundMuted'>
        Mark a response as "fail" when the AI made an error, gave incorrect
        information, or the response was unhelpful. This helps identify issues.
      </Text.H5>
    </div>
  )
}

function MoreInfoStep({ onClickMoreInfo }: { onClickMoreInfo: () => void }) {
  return (
    <div className='flex flex-col gap-y-2'>
      <div className='flex items-center gap-2'>
        <div className='flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10'>
          <Icon name='shieldAlert' color='primary' />
        </div>
        <Text.H4B>Discover issues</Text.H4B>
      </div>
      <Text.H5 color='foregroundMuted'>
        Reach the monthly annotation goal to unlock automatic issue discovery.
        Latitude will analyze patterns and surface problems in your prompts.
      </Text.H5>
      <Button fancy variant='outline' onClick={onClickMoreInfo}>
        Learn more
      </Button>
    </div>
  )
}

const STEP_COMPONENTS: Record<
  Step,
  ComponentType<{ onClickMoreInfo: () => void }>
> = {
  what: WhatStep,
  why: WhyStep,
  passAnnotation: PassAnnotationStep,
  failAnnotation: FailAnnotationStep,
  moreInfo: MoreInfoStep,
}

function getTranslateClass(stepIndex: number): string {
  switch (stepIndex) {
    case 0:
      return 'translate-x-0'
    case 1:
      return '-translate-x-[20%]'
    case 2:
      return '-translate-x-[40%]'
    case 3:
      return '-translate-x-[60%]'
    case 4:
      return '-translate-x-[80%]'
    default:
      return 'translate-x-0'
  }
}

export function AnnotationExplanation({
  onClose,
  onClickMoreInfo,
}: {
  onClose: () => void
  onClickMoreInfo: () => void
}) {
  const [currentStep, setCurrentStep] = useState<Step>('what')
  const currentIndex = STEPS_ORDER.indexOf(currentStep)
  const isFirstStep = currentIndex === 0
  const isLastStep = currentIndex === STEPS_ORDER.length - 1

  const handleNext = () => {
    if (!isLastStep) {
      setCurrentStep(STEPS_ORDER[currentIndex + 1]!)
    }
  }

  const handlePrevious = () => {
    if (!isFirstStep) {
      setCurrentStep(STEPS_ORDER[currentIndex - 1]!)
    }
  }

  return (
    <div className='flex flex-col gap-y-3 w-72 overflow-hidden'>
      {/* Header with navigation */}
      <div className='flex justify-between items-center px-1'>
        <Button
          variant='ghost'
          size='small'
          disabled={isFirstStep}
          onClick={handlePrevious}
          iconProps={{ name: 'chevronLeft' }}
          className={cn('transition-opacity', {
            'opacity-0 pointer-events-none': isFirstStep,
          })}
        >
          Back
        </Button>

        <StepIndicators
          currentStep={currentStep}
          onStepClick={setCurrentStep}
        />

        {isLastStep ? (
          <Button
            fancy
            variant='outline'
            size='small'
            iconProps={{ name: 'check', placement: 'right' }}
            onClick={onClose}
          >
            Done
          </Button>
        ) : (
          <Button
            fancy
            variant='outline'
            size='small'
            onClick={handleNext}
            iconProps={{ name: 'chevronRight', placement: 'right' }}
          >
            Next
          </Button>
        )}
      </div>

      {/* Sliding panel wrapper */}
      <div className='relative w-full overflow-hidden'>
        <div
          className={cn(
            'grid grid-cols-5 w-[500%]',
            'transition-transform duration-300 ease-out',
            getTranslateClass(currentIndex),
          )}
        >
          {STEPS_ORDER.map((step) => {
            const StepComponent = STEP_COMPONENTS[step]
            const stepIndex = STEPS_ORDER.indexOf(step)
            const isActive = stepIndex === currentIndex

            return (
              <div
                key={step}
                className={cn(
                  'w-full px-4 pb-4 transition-opacity duration-300',
                  {
                    'opacity-100': isActive,
                    'opacity-0': !isActive,
                  },
                )}
              >
                <StepComponent onClickMoreInfo={onClickMoreInfo} />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
