import { cloneElement, type ReactElement } from 'react'

interface StepsProps {
  step: number
  children: ReactElement[]
  className?: string
}

export const Steps = ({ step, className, children }: StepsProps) => {
  return (
    <div className={className}>
      {children[step - 1] && cloneElement(children[step - 1]! as ReactElement, { isActive: true })}
    </div>
  )
}
