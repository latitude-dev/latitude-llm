import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'
import { MouseEvent } from 'react'
import { useFeatureFlag } from '$/components/Providers/FeatureFlags'

export default function LoginFooter({
  onClickSignup,
}: {
  onClickSignup?: (event: MouseEvent<HTMLAnchorElement>) => void
}) {
  const { enabled: isInviteOnly } = useFeatureFlag({ featureFlag: 'inviteOnly' })

  // If inviteOnly is true, don't show the signup link.
  if (isInviteOnly) {
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
