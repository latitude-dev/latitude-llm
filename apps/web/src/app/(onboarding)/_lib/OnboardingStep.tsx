import { ReactNode } from 'react'

function OnboardingStepRoot({ children }: { children: ReactNode }) {
  return (
    <div className='flex flex-col h-full w-full items-center p-16 gap-10'>
      {children}
    </div>
  )
}

function OnboardingStepBody({ children }: { children: ReactNode }) {
  return (
    <div className='flex flex-col items-center gap-10 h-full w-full'>
      {children}
    </div>
  )
}

function OnboardingStepHeader({ children }: { children: ReactNode }) {
  return <div className='flex flex-col items-center gap-2'>{children}</div>
}

export const OnboardingStep = {
  Root: OnboardingStepRoot,
  Body: OnboardingStepBody,
  Header: OnboardingStepHeader,
}

export const DatasetOnboardingStepRoot = ({
  children,
}: {
  children: ReactNode
}) => {
  return (
    <div className='flex flex-col h-full max-w-[912px] mx-auto items-center gap-18 pt-20'>
      {children}
    </div>
  )
}
