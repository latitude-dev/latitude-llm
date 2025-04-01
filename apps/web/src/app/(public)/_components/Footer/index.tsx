import {
  LATITUDE_DOCS_URL,
  LATITUDE_EMAIL,
  LATITUDE_SLACK_URL,
} from '@latitude-data/core/browser'
import { Text } from '@latitude-data/web-ui/atoms/Text'

export default function AuthFooter() {
  return (
    <div>
      <Text.H5 color='foregroundMuted'>
        If you have any problem or suggestion{' '}
        <Text.H5 asChild underline color='accentForeground'>
          <a href={LATITUDE_DOCS_URL} target='_blank'>
            check our documentation
          </a>
        </Text.H5>{' '}
        or contact us via{' '}
        <Text.H5 asChild underline color='accentForeground'>
          <a href={LATITUDE_EMAIL} target='_blank'>
            email
          </a>
        </Text.H5>{' '}
        or{' '}
        <Text.H5 asChild underline color='accentForeground'>
          <a href={LATITUDE_SLACK_URL} target='_blank'>
            Slack
          </a>
        </Text.H5>
        .
      </Text.H5>
    </div>
  )
}
