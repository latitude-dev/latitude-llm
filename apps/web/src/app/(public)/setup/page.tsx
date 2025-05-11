'use client'

import { useSearchParams } from 'next/navigation'
import { Card, CardContent } from '@latitude-data/web-ui/atoms/Card'
import { FocusHeader } from '@latitude-data/web-ui/molecules/FocusHeader'
import AuthFooter from '$/app/(public)/_components/Footer'
import SignupFooter from '$/app/(public)/setup/_components/SignupFooter'
import { FocusLayout } from '$/components/layouts'
import { useFeatureFlag } from '$/components/Providers/FeatureFlags'
// import { useEffect, useState } from 'react' // No longer needed

import SetupForm from './SetupForm'


export default function SetupPage() {
  const searchParamsHook = useSearchParams()
  const { enabled: isInviteOnly } = useFeatureFlag({ featureFlag: 'inviteOnly' })

  // Extract params once searchParamsHook is available
  const email = searchParamsHook?.get('email') ?? undefined
  const name = searchParamsHook?.get('name') ?? undefined
  const companyName = searchParamsHook?.get('companyName') ?? undefined
  const invitationToken = searchParamsHook?.get('invitation_token') ?? undefined
  
  // Logic simplified as inviteOnly flag is available server-side
  // No need for isLoadingFeatureFlags or canRenderForm state for this specific flag

  if (isInviteOnly && !invitationToken) {
     return (
      <FocusLayout
        header={
          <FocusHeader
            title='Invite Only'
            description='This workspace is currently invite-only.'
          />
        }
        footer={<SignupFooter />}
      >
        <Card background='light'>
          <CardContent standalone className="p-6 text-center"> {/* Added padding and centering */}
            <h3 className="font-semibold mb-2">Access Restricted</h3>
            <p className="text-sm text-gray-600">
              This workspace is currently invite-only. To create an account, you need a valid invitation link.
            </p>
            <p className="text-sm text-gray-600 mt-1">
              If you believe this is an error, please contact support.
            </p>
          </CardContent>
        </Card>
      </FocusLayout>
    );
  }


  return (
    <FocusLayout
      header={
        <FocusHeader
          title='Create your Latitude account'
          description='Join us today and start improve the way you work with LLMs!'
        />
      }
      footer={<SignupFooter />}
    >
      <Card background='light'>
        <CardContent standalone>
          <SetupForm
            email={email}
            name={name}
            companyName={companyName}
            invitationToken={invitationToken} // Pass token to form
            footer={<AuthFooter />}
          />
        </CardContent>
      </Card>
    </FocusLayout>
  )
}
