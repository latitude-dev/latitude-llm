import { Button } from '@latitude-data/web-ui/atoms/Button'
import { ErrorComponent } from '@latitude-data/web-ui/browser'
import Link from 'next/link'

export async function NotFoundPageComponent({
  route,
  label,
  message,
}: {
  route: string
  message: string
  label: string
}) {
  return (
    <div className='h-full w-full flex items-center justify-center'>
      <ErrorComponent
        type='gray'
        message={message}
        submit={
          <Link href={route}>
            <Button
              variant='link'
              iconProps={{ name: 'arrowRight', placement: 'right' }}
              className='p-0'
            >
              {label}
            </Button>
          </Link>
        }
      />
    </div>
  )
}
