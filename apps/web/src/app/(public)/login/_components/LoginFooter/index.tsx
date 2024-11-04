import { Button, Icon, Text } from '@latitude-data/web-ui'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'

export default function LoginFooter() {
  return (
    <div>
      <Text.H5 color='foregroundMuted'>
        Don't have an account yet?{' '}
        <Link href={ROUTES.auth.setup}>
          <Button variant='link' className='p-0'>
            Sign up
            <Icon name='arrowRight' />
          </Button>
        </Link>
      </Text.H5>
    </div>
  )
}
