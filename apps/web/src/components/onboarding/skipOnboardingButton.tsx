'use client'

import React from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { ROUTES } from '$/services/routes'
import { completeOnboardingAction } from '$/actions/workspaceOnboarding/complete'
import useLatitudeAction from '$/hooks/useLatitudeAction'
import { useNavigate } from '$/hooks/useNavigate'
import { useFormAction } from '$/hooks/useFormAction'

export function SkipOnboardingButton() {
  const navigate = useNavigate()
  const { execute: completeOnboarding } = useLatitudeAction(
    completeOnboardingAction,
    {
      onSuccess: () => {
        navigate.push(ROUTES.root)
      },
    },
  )
  const { action } = useFormAction(completeOnboarding)

  return (
    <div className='mt-auto flex justify-center'>
      <form action={action}>
        <Button
          variant='nope'
          className='text-muted-foreground underline text-xs'
          type='submit'
        >
          Skip onboarding {'->'}
        </Button>
      </form>
    </div>
  )
}
