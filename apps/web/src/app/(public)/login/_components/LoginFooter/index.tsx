import { Button, Icon, Text } from '@latitude-data/web-ui'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'
import { MouseEvent } from 'react'

export default function LoginFooter({
  onClickSignup,
}: {
  onClickSignup?: (event: MouseEvent<HTMLAnchorElement>) => void
}) {
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
