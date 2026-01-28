import Link from 'next/link'

import { ROUTES } from '$/services/routes'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ClientErrorButton } from './_components/ClientErrorButton'

export default function ErrorTestsPage() {
  return (
    <div className='container flex flex-col gap-y-8'>
      <section className='flex flex-col gap-y-4'>
        <Text.H1>Error tests</Text.H1>
        <Text.H4 color='foregroundMuted'>
          Trigger client and server errors to verify production sourcemaps.
        </Text.H4>
      </section>

      <section className='flex flex-col gap-y-3'>
        <Text.H5>Client-side</Text.H5>
        <ClientErrorButton />
      </section>

      <section className='flex flex-col gap-y-3'>
        <Text.H5>Server-side</Text.H5>
        <Link href={ROUTES.backoffice.errorTests.server}>
          <Button variant='outline'>Trigger server render error</Button>
        </Link>
      </section>
    </div>
  )
}
