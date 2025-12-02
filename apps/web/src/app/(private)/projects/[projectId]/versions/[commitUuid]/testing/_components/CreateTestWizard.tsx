'use client'

import { FormEvent, useState } from 'react'
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
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { createDeploymentTestAction } from '$/actions/deploymentTests/create'

type TestType = 'shadow' | 'ab'

export interface WizardState {
  testType: TestType | null
  baselineCommitUuid: string | null
  challengerCommitUuid: string | null
  name: string
  description: string
  trafficPercentage: number
}

interface CreateTestWizardProps {
  projectId: number
  commitUuid: string
  availableCommits: Commit[]
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

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
    name: '',
    description: '',
    trafficPercentage: 50,
  })

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

  const handleStateChange = (updates: Partial<WizardState>) => {
    setState((prev) => ({ ...prev, ...updates }))
  }

  const handleClose = () => {
    navigate.push(
      ROUTES.projects
        .detail({ id: projectId })
        .commits.detail({ uuid: commit.uuid }).testing.root,
    )
  }

  const { execute: createTest, isPending: isCreating } = useLatitudeAction(
    createDeploymentTestAction,
    {
      onSuccess: () => {
        toast({
          title: 'Success',
          description: 'Deployment test created successfully',
        })
        handleClose()
      },
      onError: () => {
        toast({
          title: 'Error',
          description: 'Failed to create deployment test',
          variant: 'destructive',
        })
      },
    },
  )

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (
      !state.baselineCommitUuid ||
      !state.challengerCommitUuid ||
      !state.testType
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
      name: state.name,
      description: state.description,
      trafficPercentage: state.trafficPercentage,
    })
  }

  return (
    <Modal
      open
      size='large'
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
            <Button onClick={handleNext}>Next</Button>
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
            <StepOne state={state} onStateChange={handleStateChange} />
          )}
          {currentStep === 2 && (
            <StepTwo
              state={state}
              onStateChange={handleStateChange}
              availableCommits={availableCommits}
              projectId={projectId}
            />
          )}
          {currentStep === 3 && (
            <StepThree
              state={state}
              onStateChange={handleStateChange}
              projectId={projectId}
            />
          )}
        </div>
      </form>
    </Modal>
  )
}
