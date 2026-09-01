import { LATITUDE_EMAIL, LATITUDE_V2_URL } from '@latitude-data/core/constants'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { Text } from '@latitude-data/web-ui/atoms/Text'

export function ShutdownBanner() {
  return (
    <Alert
      variant='warning'
      className='shrink-0 rounded-none border-x-0 border-t-0'
      title='Latitude v1 is shutting down'
      description={
        <span>
          Latitude v1 will shut down on October 31, 2026. Please{' '}
          <Text.H5 asChild underline color='warningMutedForeground'>
            <a href={LATITUDE_V2_URL} target='_blank' rel='noreferrer'>
              migrate to Latitude v2
            </a>
          </Text.H5>
          , or{' '}
          <Text.H5 asChild underline color='warningMutedForeground'>
            <a href={`mailto:${LATITUDE_EMAIL}`}>contact support</a>
          </Text.H5>{' '}
          for more information.
        </span>
      }
    />
  )
}
