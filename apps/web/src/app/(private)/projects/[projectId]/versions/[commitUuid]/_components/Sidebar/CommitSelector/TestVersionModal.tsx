'use client'

import { useState, FormEvent } from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { Modal, CloseTrigger } from '@latitude-data/web-ui/atoms/Modal'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { createDeploymentTestAction } from '$/actions/deploymentTests/create'
import { Commit } from '@latitude-data/core/schema/models/types/Commit'
import { StepOne } from '../../../testing/_components/wizard/StepOne'
import { StepThree } from '../../../testing/_components/wizard/StepThree'
import type { WizardState } from '../../../testing/_components/CreateTestWizard'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'

interface TestVersionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: number
  currentCommit: Commit
  headCommit?: Commit
}

export function TestVersionModal({
  open,
  onOpenChange,
  projectId,
  currentCommit,
  headCommit,
}: TestVersionModalProps) {
  const { toast } = useToast()
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(1)
  const [state, setState] = useState<WizardState>({
    testType: null,
    baselineCommitUuid: headCommit?.uuid ?? null,
    challengerCommitUuid: currentCommit.uuid,
    name: '',
    description: '',
    trafficPercentage: 50,
  })

  const handleNext = () => {
    if (currentStep < 2) {
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
    onOpenChange(false)
    setCurrentStep(1)
    setState({
      testType: null,
      baselineCommitUuid: headCommit?.uuid ?? null,
      challengerCommitUuid: currentCommit.uuid,
      name: '',
      description: '',
      trafficPercentage: 50,
    })
  }

  const { execute: createTest, isPending: isCreating } = useLatitudeAction(
    createDeploymentTestAction,
    {
      onSuccess: () => {
        toast({
          title: 'Success',
          description: 'Deployment test created successfully',
        })
        navigate.push(
          ROUTES.projects
            .detail({ id: projectId })
            .commits.detail({ uuid: currentCommit.uuid }).testing.root,
        )
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

    if (!state.baselineCommitUuid) {
      toast({
        title: 'Error',
        description: 'No published version found to use as baseline',
        variant: 'destructive',
      })
      return
    }

    if (!state.testType || !state.challengerCommitUuid) {
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

  const canSubmit =
    !isCreating &&
    state.testType &&
    state.baselineCommitUuid &&
    state.challengerCommitUuid

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size='large'
      steps={{
        total: 2,
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
          {currentStep < 2 ? (
            <Button onClick={handleNext} disabled={!state.testType}>
              Next
            </Button>
          ) : (
            <Button
              form='testVersionForm'
              type='submit'
              disabled={!canSubmit}
              isLoading={isCreating}
            >
              Create Test
            </Button>
          )}
        </div>
      }
    >
      <form id='testVersionForm' onSubmit={handleSubmit}>
        <div className='flex-1'>
          {currentStep === 1 && (
            <StepOne state={state} onStateChange={handleStateChange} />
          )}
          {currentStep === 2 && (
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
