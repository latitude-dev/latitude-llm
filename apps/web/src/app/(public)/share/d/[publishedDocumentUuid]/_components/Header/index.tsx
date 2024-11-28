import { PublishedDocument } from '@latitude-data/core/browser'
import { Icon, Text } from '@latitude-data/web-ui'
import { AppHeaderWrapper } from '$/components/layouts/AppLayout/Header'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'

import { Container } from '../Container'
import { ForkButton } from '../ForkButton'

export function PromptHeader({ shared }: { shared: PublishedDocument }) {
  return (
    <>
      <AppHeaderWrapper xPadding='none'>
        <Container>
          <div className='w-full flex flex-row items-center justify-between'>
            <ForkButton />
            <Link
              href={ROUTES.dashboard.root}
              className='flex flex-row items-center gap-x-4'
            >
              <div className='hidden sm:block'>
                <Text.H5 color='foregroundMuted'>Made with Latitude</Text.H5>
              </div>
              <Icon name='logo' size='large' />
            </Link>
          </div>
        </Container>
      </AppHeaderWrapper>
      <Container className='flex flex-col gap-y-8'>
        <div className='w-full flex flex-row justify-center'>
          <div className='flex flex-col gap-y-1 sm:w-modal'>
            <Text.H3 asChild>
              <h1>{shared.title}</h1>
            </Text.H3>
            <Text.H4 asChild color='foregroundMuted'>
              <p>{shared.description}</p>
            </Text.H4>
          </div>
        </div>
      </Container>
    </>
  )
}
