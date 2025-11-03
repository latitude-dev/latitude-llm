import { ROUTES } from '$/services/routes'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import Link from 'next/link'
import { MouseEvent } from 'react'

export default function LoginFooter({
  returnTo,
  onClickSignup,
}: {
  returnTo?: string
  onClickSignup?: (event: MouseEvent<HTMLAnchorElement>) => void
}) {
  return (
    <div>
      <Text.H5 color='foregroundMuted'>
        Don't have an account yet?{' '}
        <Link
          href={
            ROUTES.auth.setup +
            (returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : '')
          }
          onClick={onClickSignup}
        >
          <Button variant='link' className='p-0'>
            Sign up
            <Icon name='arrowRight' />
          </Button>
        </Link>
      </Text.H5>
    </div>
  )
}
