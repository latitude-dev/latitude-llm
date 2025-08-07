import { ROUTES } from '$/services/routes'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import Link from 'next/link'
import { MouseEvent } from 'react'

export default function SignupFooter({
  onClickLogin,
}: {
  onClickLogin?: (event: MouseEvent<HTMLAnchorElement>) => void
}) {
  return (
    <Text.H5 color='foregroundMuted' display='block'>
      Already have an account?{' '}
      <Link href={ROUTES.auth.login} onClick={onClickLogin}>
        <Button variant='link' className='p-0'>
          Log in
          <Icon name='arrowRight' />
        </Button>
      </Link>
    </Text.H5>
  )
}
