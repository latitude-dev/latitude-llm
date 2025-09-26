'use client'

import { useState } from 'react'
import NocodersNavbar from '../navbar/navbar'
import { SetupIntegrationsStep } from './setupIntegrations'
import { OnboardingStep } from '../../constants'
import { Project } from '@latitude-data/core/browser'
import { NavbarTabName } from '../../constants'

export function OnboardingClient({ project }: { project: Project }) {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(
    OnboardingStep.SetupIntegrations,
  )
  const [currentTab] = useState<NavbarTabName>(NavbarTabName.SetupIntegrations)

  return (
    <div className='flex flex-row flex-1 items-start self-stretch'>
      <NocodersNavbar project={project} currentTab={currentTab} />
      <div className='flex-row flex-1 h-full'>
        {currentStep === OnboardingStep.SetupIntegrations && (
          <SetupIntegrationsStep setCurrentStep={setCurrentStep} />
        )}
      </div>
    </div>
  )
}
