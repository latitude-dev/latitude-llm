'use client'

import { FormEvent, useEffect, useState } from 'react'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { CloseTrigger, Modal } from '@latitude-data/web-ui/atoms/Modal'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { StepOne } from './wizard/StepOne'
import { StepTwo } from './wizard/StepTwo'
import { StepThree } from './wizard/StepThree'
import { ROUTES } from '$/services/routes'
import { useNavigate } from '$/hooks/useNavigate'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import useDeploymentTests from '$/stores/deploymentTests'

type TestType = 'shadow' | 'ab'

export interface WizardState {
  testType: TestType | null
  baselineCommitUuid: string | null
  challengerCommitUuid: string | null
  testName: string
  testDescription: string
  trafficPercentage: number
}

interface CreateTestWizardProps {
  projectId: number
  commitUuid: string
  availableCommits: Commit[]
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const STEP_CONFIG = {
  1: {
    title: 'Deployment test',
    description: 'Choose the type of deployment test',
  },
  2: {
    title: 'Select Versions',
    description: 'Choose which versions to test',
  },
  3: {
    title: 'Configure Test',
    description: 'Set name and description',
  },
} as const

export function CreateTestWizard({
  projectId,
  availableCommits,
}: CreateTestWizardProps) {
  const { commit } = useCurrentCommit()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [currentStep, setCurrentStep] = useState(1)
  const [state, setState] = useState<WizardState>({
    testType: null,
    baselineCommitUuid: null,
    challengerCommitUuid: null,
    testName: '',
    testDescription: '',
    trafficPercentage: 50,
  })

  useEffect(() => {
    const mergedCommits = availableCommits
      .filter((c) => c.mergedAt !== null)
      .sort((a, b) => {
        const aDate = new Date(a.mergedAt!).getTime()
        const bDate = new Date(b.mergedAt!).getTime()
        return bDate - aDate
      })
    const headCommit = mergedCommits[0]

    if (headCommit && !state.baselineCommitUuid) {
      setState((prev) => ({
        ...prev,
        baselineCommitUuid: headCommit.uuid,
      }))
    }
  }, [availableCommits])

  const handleStateChange = (updates: Partial<WizardState>) => {
    setState((prev) => ({ ...prev, ...updates }))
  }

  const isStep2Valid = () => {
    return !!state.baselineCommitUuid && !!state.challengerCommitUuid
  }

  const handleNext = () => {
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleClose = () => {
    navigate.push(
      ROUTES.projects
        .detail({ id: projectId })
        .commits.detail({ uuid: commit.uuid }).testing.root,
    )
  }

  const deploymentTests = useDeploymentTests(
    { projectId },
    {
      onSuccessCreate: () => {
        handleClose()
      },
    },
  )
  const createTest = deploymentTests.create.execute
  const isCreating = deploymentTests.create.isPending

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (currentStep !== 3) {
      return
    }

    if (
      !state.testType ||
      !state.baselineCommitUuid ||
      !state.challengerCommitUuid
    ) {
      toast({
        title: 'Error',
        description: 'Please complete all required fields',
        variant: 'destructive',
      })
      return
    }

    await createTest({
      projectId,
      baselineCommitUuid: state.baselineCommitUuid,
      challengerCommitUuid: state.challengerCommitUuid,
      testType: state.testType,
      name: state.testName,
      description: state.testDescription,
      trafficPercentage: state.trafficPercentage,
    })
  }

  const currentStepConfig = STEP_CONFIG[currentStep as keyof typeof STEP_CONFIG]

  return (
    <Modal
      open
      size='large'
      title={currentStepConfig.title}
      description={currentStepConfig.description}
      steps={{
        total: 3,
        current: currentStep,
      }}
      footer={
        <div className='flex flex-row gap-2 justify-end'>
          <CloseTrigger>
            <Button variant='secondary' onClick={handleClose}>
              Cancel
            </Button>
          </CloseTrigger>
          <Button
            onClick={handleBack}
            variant='secondary'
            disabled={currentStep === 1}
          >
            Back
          </Button>
          {currentStep < 3 ? (
            <Button
              onClick={handleNext}
              disabled={currentStep === 2 && !isStep2Valid()}
            >
              Next
            </Button>
          ) : (
            <Button
              form='createTestForm'
              type='submit'
              disabled={isCreating}
              isLoading={isCreating}
            >
              Create Test
            </Button>
          )}
        </div>
      }
    >
      <form id='createTestForm' onSubmit={handleSubmit}>
        <div className='flex-1'>
          {currentStep === 1 && (
            <StepOne
              testType={state.testType}
              onTestTypeChange={(testType) =>
                setState((prev) => ({ ...prev, testType }))
              }
            />
          )}
          {currentStep === 2 && (
            <StepTwo
              availableCommits={availableCommits}
              baselineCommitUuid={state.baselineCommitUuid}
              challengerCommitUuid={state.challengerCommitUuid}
              onBaselineChange={(uuid) =>
                handleStateChange({ baselineCommitUuid: uuid || null })
              }
              onChallengerChange={(uuid) =>
                handleStateChange({ challengerCommitUuid: uuid || null })
              }
            />
          )}
          {currentStep === 3 && (
            <StepThree
              testType={state.testType}
              trafficPercentage={state.trafficPercentage}
              testName={state.testName}
              testDescription={state.testDescription}
              onTrafficPercentageChange={(trafficPercentage) =>
                handleStateChange({ trafficPercentage })
              }
              onTestNameChange={(testName) => handleStateChange({ testName })}
              onTestDescriptionChange={(testDescription) =>
                handleStateChange({ testDescription })
              }
            />
          )}
        </div>
      </form>
    </Modal>
  )
}
