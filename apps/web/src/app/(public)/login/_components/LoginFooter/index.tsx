'use client'

import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'
import { MouseEvent } from 'react'
import { useFeatureFlags } from '$/contexts/FeatureFlagContext'

export default function LoginFooter({
  onClickSignup,
}: {
  onClickSignup?: (event: MouseEvent<HTMLAnchorElement>) => void
}) {
  const { inviteOnly, isLoading } = useFeatureFlags() // Correctly destructure inviteOnly

  // If feature flags are loading, or if inviteOnly is true, don't show the signup link.
  if (isLoading || inviteOnly) {
    return null
  }

  return (
    <div>
      <Text.H5 color='foregroundMuted'>
        Don't have an account yet?{' '}
        <Link href={ROUTES.auth.setup} onClick={onClickSignup}>
          <Button variant='link' className='p-0'>
            Sign up
            <Icon name='arrowRight' />
          </Button>
        </Link>
      </Text.H5>
    </div>
  )
}
