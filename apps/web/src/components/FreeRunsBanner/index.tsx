import Link from 'next/link'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ROUTES } from '$/services/routes'

const NewProviderLink = () => (
  <Link
    href={ROUTES.settings.providerApiKeys.new.root}
    className='flex-noWrap inline-block text-accent-foreground'
  >
    <Text.H5M color='primary'>
      Set up new provider{' '}
      <Icon name='arrowRight' color='accentForeground' className='inline' />
    </Text.H5M>
  </Link>
)

export function FreeRunsBanner({
  freeRunsCount,
  isLatitudeProvider,
}: {
  isLatitudeProvider?: boolean
  freeRunsCount?: number
}) {
  if (!isLatitudeProvider) return null

  const sentence =
    freeRunsCount !== undefined
      ? 'You have consumed '
      : 'This provider has a limit of'

  return (
    <div className='flex flex-col gap-y-2'>
      <Text.H5 color='foregroundMuted'>
        {sentence}{' '}
        <Tooltip
          trigger={
            <Text.H5M color='accentForeground'>
              {freeRunsCount} of 100 daily free runs.
            </Text.H5M>
          }
        >
          We include the Latitude provider by default with 100 free runs to
          allow you to test the product.
        </Tooltip>{' '}
        We highly recommend switching to your own provider.
      </Text.H5>
      <NewProviderLink />
    </div>
  )
}
