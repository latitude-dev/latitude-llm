import {
  Card,
  CardContent,
  FocusHeader,
  FocusLayout,
} from '@latitude-data/web-ui'
import AuthFooter from '$/app/(public)/_components/Footer'

import SetupForm from './SetupForm'

export const dynamic = 'force-dynamic'

export default function SetupPage() {
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
          <SetupForm footer={<AuthFooter />} />
        </CardContent>
      </Card>
    </FocusLayout>
  )
}
