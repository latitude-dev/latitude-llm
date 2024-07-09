import {
  LATITUDE_DOCS_URL,
  LATITUDE_EMAIL,
  LATITUDE_SLACK_URL,
} from '@latitude-data/core'
import {
  Button,
  Card,
  CardContent,
  FocusHeader,
  FocusLayout,
  FormWrapper,
  Input,
  Text,
} from '@latitude-data/web-ui'
import { exampleEnqueue } from '$/actions/example-enqueu'

export const dynamic = 'force-dynamic'

export default async function Home() {
  return (
    <FocusLayout
      header={
        <FocusHeader
          title='Create your Latitude account'
          description='Latitude self-hosted version allows only one account for your team to manage prompts, experiments, and analytics.'
        />
      }
    >
      <Card>
        <CardContent standalone>
          <form action={exampleEnqueue}>
            <FormWrapper>
              <Input autoComplete='email' label='Email' placeholder='Email' />
              <Input
                autoComplete='new-password'
                type='password'
                label='Password'
                placeholder='Write a password'
              />
              <Input label='Workspace Name' placeholder='Ex.: My Company' />
              <Button fullWidth>Create account</Button>

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
            </FormWrapper>
          </form>
        </CardContent>
      </Card>
    </FocusLayout>
  )
}
