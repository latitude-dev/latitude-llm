import { ROUTES } from '$/services/routes'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { ErrorComponent } from '@latitude-data/web-ui/browser'
import Link from 'next/link'

export default function NotFound() {
  return (
    <div className='h-screen flex items-center justify-center'>
      <ErrorComponent
        type='gray'
        message='Upps! prompt not found. Check with the person who shared it with you.'
        submit={
          <Link href={ROUTES.root}>
            <Button
              variant='link'
              iconProps={{ name: 'arrowRight', placement: 'right' }}
              className='p-0'
            >
              Go back to the homepage
            </Button>
          </Link>
        }
      />
    </div>
  )
}
