'use client'

import { useState } from 'react'
import NocodersNavbar from '../navbar/navbar'
import { SetupIntegrationsStep } from './setupIntegrations'
import { OnboardingStep } from '../../constants'

export function OnboardingClient() {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(
    OnboardingStep.SetupIntegrations,
  )

  console.log('Current Step:', currentStep === OnboardingStep.SetupIntegrations)

  return (
    <div className='flex flex-row flex-1 items-start self-stretch'>
      <NocodersNavbar />
      <div className='flex-row flex-1 h-full'>
        {currentStep === OnboardingStep.SetupIntegrations && (
          <SetupIntegrationsStep setCurrentStep={setCurrentStep} />
        )}
      </div>
    </div>
  )
}
