import { Button } from '@latitude-data/web-ui'
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
    <div className='h-screen flex items-center justify-center'>
      <ErrorComponent
        type='gray'
        message={message}
        submit={
          <Link href={route}>
            <Button fancy variant='outline'>
              {label}
            </Button>
          </Link>
        }
      />
    </div>
  )
}
