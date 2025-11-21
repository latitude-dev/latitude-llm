import React from 'react'

import { Link, Text } from '@react-email/components'
import ContainerLayoutWithNotificationSettings, {
  NotificiationsLayoutProps,
} from '../_components/ContainerLayoutWithNotificationSettings'

export default function IssueEscalatingMail({
  issueTitle,
  link,
  currentUser,
}: {
  issueTitle: string
  link: string
  currentUser: NotificiationsLayoutProps['currentUser']
}) {
  return (
    <ContainerLayoutWithNotificationSettings
      title='Issue Escalating'
      previewText={`Issue "${issueTitle}" is escalating.`}
      currentUser={currentUser}
    >
      <Text>Hello team</Text>
      <Text>
        We have detected that the issue <strong>"{issueTitle}"</strong> is
        escalating. This means the error frequency has increased significantly
        compared to the previous period.
      </Text>
      <Text>
        You can check more details and take action in the issues dashboard.
      </Text>
      <Link
        href={link}
        target='_blank'
        className='text-blue-500 font-medium text-base mb-4'
      >
        View issue in dashboard
      </Link>
    </ContainerLayoutWithNotificationSettings>
  )
}

IssueEscalatingMail.PreviewProps = {
  issueTitle: 'API timeout error in payment processing',
  link: 'https://example.com',
  membershipId: 1,
}
